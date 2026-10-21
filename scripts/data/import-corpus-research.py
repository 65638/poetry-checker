"""Independently validate and freeze full-corpus evidence; never execute supplied code."""
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/research/full-corpus-v1'
RAW = ROOT / 'data/raw/research-full-corpus-v1'
INPUTS = ['data/works.jsonl', 'data/readings.jsonl', 'data/variants.jsonl',
          'data/sources.jsonl', 'coverage.jsonl', 'summary.json']
RANGES = [(0x3400, 0x4dbf), (0x4e00, 0x9fff), (0xf900, 0xfaff),
          (0x20000, 0x323af)]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def is_han(c):
    return c == '〇' or any(a <= ord(c) <= b for a, b in RANGES)


def safe(root, name):
    target = (root / name).resolve()
    assert target.is_relative_to(root.resolve()), name
    return target


def refs(value):
    if isinstance(value, dict):
        for k, v in value.items():
            if k in ('originalRecord', 'original'):
                continue
            if k == 'sourceId' and v:
                yield v
            elif k == 'sourceIds':
                yield from v
            else:
                yield from refs(v)
    elif isinstance(value, list):
        for v in value:
            yield from refs(v)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    assert not (args.source and args.check)
    audit_path = OUT / 'audit.json'
    if args.source:
        source = args.source.resolve()
        manifest = {}
        for line in (source / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
            digest, name = line.split('  ', 1)
            assert name not in manifest
            assert sha(safe(source, name).read_bytes()) == digest, name
            manifest[name] = digest
        actual = {p.relative_to(source).as_posix() for p in source.rglob('*')
                  if p.is_file() and p != source / 'SHA256SUMS.txt' and '__pycache__' not in p.parts}
        assert set(manifest) == actual, {'unlisted': sorted(actual - set(manifest)),
                                        'missing': sorted(set(manifest) - actual)}
        audit = {'packageManifestSha256': sha((source / 'SHA256SUMS.txt').read_bytes()),
                 'packageFilesVerified': len(manifest), 'inputs': []}
        RAW.mkdir(parents=True, exist_ok=True)
        OUT.mkdir(parents=True, exist_ok=True)
        for name in INPUTS:
            data = (source / name).read_bytes()
            target = RAW / (name.replace('/', '-') + '.gz')
            target.write_bytes(gzip.compress(data, mtime=0))
            audit['inputs'].append({'input': name, 'file': target.relative_to(ROOT).as_posix(),
                                    'sha256': sha(data), 'bytes': len(data),
                                    'archiveSha256': sha(target.read_bytes())})
        (RAW / 'upstream-SHA256SUMS.txt.gz').write_bytes(gzip.compress((source / 'SHA256SUMS.txt').read_bytes(), mtime=0))
    else:
        audit = json.loads(audit_path.read_text(encoding='utf-8'))
        source = None
    assert sha(gzip.decompress((RAW / 'upstream-SHA256SUMS.txt.gz').read_bytes())) == audit['packageManifestSha256']
    original = {}
    for entry in audit['inputs']:
        archive = safe(ROOT, entry['file']).read_bytes()
        data = gzip.decompress(archive)
        assert sha(archive) == entry['archiveSha256'] and sha(data) == entry['sha256']
        original[entry['input']] = json.loads(data) if entry['input'].endswith('.json') else [
            json.loads(line) for line in data.decode().splitlines() if line.strip()]
    works = original['data/works.jsonl']
    readings = original['data/readings.jsonl']
    sources = {s['sourceId']: s for s in original['data/sources.jsonl']}
    coverage = {c['id']: c for c in original['coverage.jsonl']}
    catalog = json.loads(gzip.decompress((ROOT / 'data/library/deepseek-v1/catalog.json.gz').read_bytes()))['works']
    by_id = {w['id']: w for w in works}
    assert len(by_id) == len(works) == len(catalog) == len(coverage) == 2022
    assert len(sources) == len(original['data/sources.jsonl'])
    assert set(by_id) == set(coverage) == {w['id'] for w in catalog}
    expected = {}
    offsets = {}
    for w in catalog:
        original_work = by_id[w['id']]
        assert w['paragraphs'] == original_work['paragraphs']
        assert sha('\n'.join(w['paragraphs']).encode()) == original_work['textHash'] == coverage[w['id']]['textHash']
        assert w['title'] == original_work['title'] and w['author'] == original_work['author']
        offset = 0
        for p, line in enumerate(w['paragraphs'], 1):
            for col, c in enumerate(line, 1):
                if is_han(c):
                    key = (w['id'], p, col)
                    expected[key], offsets[key] = c, offset
                    offset += 1
    seen = set()
    counts = defaultdict(Counter)
    grouped = defaultdict(list)
    xpath_count = 0
    trees = {}
    if source:
        from lxml import html
    for r in readings:
        key = (r['workId'], r['paragraphNumber'], r['codepointColumn'])
        assert key not in seen and expected.get(key) == r['character'], key
        seen.add(key)
        assert r['textHash'] == by_id[r['workId']]['textHash']
        assert r['status'] in ('source_attested', 'conflicting', 'unavailable', 'inferred')
        assert r['evidenceScope'] in ('direct_context', 'dictionary_sense_only', 'inference', 'unavailable')
        assert set(refs(r)) <= sources.keys()
        if r['evidenceScope'] == 'unavailable':
            assert r['modernReading'] is None
        if r['status'] == 'conflicting':
            assert r['modernReading'] is None
            assert len({c['modernReading'] for c in r['candidates'] if c.get('modernReading') and
                        c['evidenceScope'] == r['evidenceScope']}) > 1
        if r['modernReading']:
            assert any(c.get('modernReading') == r['modernReading'] for c in r['candidates'])
        for c in r['candidates']:
            locator = c.get('locator') or {}
            if source and isinstance(locator, dict) and 'sourceBodyCodepoint' in locator:
                for sid in c['sourceIds']:
                    src = sources[sid]
                    if sid not in trees:
                        trees[sid] = html.fromstring(safe(source, src['rawPath']).read_bytes().decode('utf-8'))
                    nodes = trees[sid].xpath(locator['xpath'])
                    assert len(nodes) == 1, (key, locator)
                    node = nodes[0]
                    py = ''.join(node.xpath('./span[1]//text()')).strip()
                    char = ''.join(node.xpath('./span[2]//text()')).strip()
                    assert char == r['character'] and py == c['modernReading'], (key, py, char)
                    assert ''.join(node.itertext()).strip() == c['quote'], (key, c['quote'])
                    xpath_count += 1
        counter = counts[r['workId']]
        counter[r['evidenceScope']] += 1
        counter['aligned'] += r['modernReading'] is not None
        counter['conflicting'] += r['status'] == 'conflicting'
        grouped[r['workId']].append({k: v for k, v in r.items() if k not in ('workId', 'textHash')}
                                    | {'hanOffset': offsets[key]})
    assert seen == set(expected)
    for wid, row in coverage.items():
        for field, count in [('directContextCount', 'direct_context'), ('dictionaryOnlyCount', 'dictionary_sense_only'),
                             ('inferenceCount', 'inference'), ('unavailableCount', 'unavailable'),
                             ('alignedReadingCount', 'aligned'), ('conflictingCount', 'conflicting')]:
            assert row[field] == counts[wid][count], (wid, field)
        assert row['hanCount'] == sum(counts[wid][scope] for scope in
                                     ('direct_context', 'dictionary_sense_only', 'inference', 'unavailable'))
    for name in ('data/works.jsonl', 'data/variants.jsonl', 'coverage.jsonl'):
        assert set(refs(original[name])) <= sources.keys(), name
    if source:
        raw_paths = sorted({s['rawPath'] for s in sources.values() if s.get('rawPath')})
        for s in sources.values():
            if s.get('rawPath'):
                assert sha(safe(source, s['rawPath']).read_bytes()) == s['sha256'], s['sourceId']
        assert set(raw_paths) == {p.relative_to(source).as_posix() for p in (source / 'raw').rglob('*') if p.is_file()}
        target = RAW / 'source-snapshots.tar.gz'
        # Keep source bytes offline with stable tar metadata, distinct from parsed inputs.
        with target.open('wb') as stream, gzip.GzipFile(fileobj=stream, mode='wb', filename='', mtime=0) as packed:
            with tarfile.open(fileobj=packed, mode='w|') as tar:
                for name in raw_paths:
                    data = safe(source, name).read_bytes()
                    info = tarfile.TarInfo(name)
                    info.size, info.mtime, info.mode = len(data), 0, 0o644
                    tar.addfile(info, io.BytesIO(data))
        audit.update(rawFilesVerified=len(raw_paths), pinyinXPathPairsVerified=xpath_count,
                     snapshotArchiveSha256=sha(target.read_bytes()))
    else:
        assert sha((RAW / 'source-snapshots.tar.gz').read_bytes()) == audit['snapshotArchiveSha256']
    variants = defaultdict(list)
    for v in original['data/variants.jsonl']:
        assert v['textHash'] == by_id[v['workId']]['textHash']
        variants[v['workId']].append(v)
    compiled_works = []
    for w in works:
        compiled_works.append({k: w[k] for k in ('id', 'title', 'author', 'textHash', 'paragraphs', 'sourceIds', 'formClaims')}
                              | {'coverage': coverage[w['id']], 'readings': grouped[w['id']],
                                 'notes': w.get('notes', []), 'variants': variants[w['id']]})
    # Check the actual upstream note field; silent omission would discard most of the delivery.
    assert sum(len(w['notes']) for w in compiled_works) == original['summary.json']['contextNoteCount']
    compiled_sources = [{'id': s['sourceId'], 'title': s['title'] or s['sourceId'], 'url': s['url'],
                         'credit': s.get('authorOrEditor') or s.get('publisher') or '来源页面所列',
                         'license': s.get('licenseOrTerms') or 'unknown',
                         'limitations': s.get('note') or '', 'rawSha256': s.get('sha256'),
                         'accessedAt': s['accessedAt'], 'rawPath': s.get('rawPath'),
                         'evidenceLevel': s.get('evidenceLevel') or '',
                         'independenceGroup': s.get('independenceGroup') or ''}
                        for s in sources.values()]
    result = {'version': 'full-corpus-v1', 'works': compiled_works,
              'sources': compiled_sources, 'summary': original['summary.json']}
    packed = gzip.compress(encode(result), mtime=0)
    products = {'reference.json.gz': packed}
    index = []
    for batch in range(1, 22):
        selected = [w for w in compiled_works if coverage[w['id']]['batch'] == batch]
        name = f'batch-{batch:02d}.json.gz'
        used = set(refs(selected))
        products[name] = gzip.compress(encode({'works': selected,
            'sources': [s for s in compiled_sources if s['id'] in used]}), mtime=0)
        index.extend({'id': w['id'], 'textHash': w['textHash'], 'batch': name,
                      'han': ''.join(c for c in '\n'.join(w['paragraphs']) if is_han(c))}
                     for w in selected)
    products['index.json.gz'] = gzip.compress(encode(index), mtime=0)
    if args.check:
        for name, data in products.items():
            assert data == (OUT / name).read_bytes(), f'Generated corpus reference drift: {name}'
    else:
        for name, data in products.items():
            (OUT / name).write_bytes(data)
        audit.update(compiledSha256=sha(packed), works=len(works), hanPositions=len(seen),
                     products={name: sha(data) for name, data in products.items()},
                     directContextCount=sum(c['directContextCount'] for c in coverage.values()),
                     conflictingCount=sum(c['conflictingCount'] for c in coverage.values()),
                     unavailableCount=sum(c['unavailableCount'] for c in coverage.values()))
        audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in audit.items() if k != 'inputs'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
