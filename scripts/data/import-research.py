"""Audit supplied research packages; build a reference layer, never approval data.

Only this repository script runs. Supplied acquisition/verification scripts are data.
Upstream pages/PDFs remain in the user's local acquisition packages; frozen structured
inputs are retained here with their original bytes, distinct from upstream originals.
"""
import argparse
import gzip
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data/raw/research-collected-v1'
OUT = ROOT / 'data/research/collected-v1'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def packed(value):
    return gzip.compress(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)


def safe(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f'Path escapes source: {name}')
    return path


def check_file(root, name, digest, size=None):
    data = safe(root, name).read_bytes()
    assert sha(data) == digest, f'Hash mismatch: {name}'
    assert size is None or len(data) == size, f'Size mismatch: {name}'


def han(text):
    return ''.join(re.findall(r'[\u3400-\u9fff\U00020000-\U000323af]', text))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--metadata', type=Path)
    parser.add_argument('--readings', type=Path)
    parser.add_argument('--rules', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    roots = {name: getattr(args, name) for name in ('metadata', 'readings', 'rules')}
    supplied = any(roots.values())
    assert not supplied or all(roots.values()), 'Supply all three source roots'
    audit_path = OUT / 'audit.json'
    if supplied:
        checks = Counter()
        for item in json.loads((roots['metadata'] / 'manifest.json').read_text(encoding='utf-8'))['files']:
            check_file(roots['metadata'], item['path'], item['sha256'], item['bytes'])
            checks['metadata'] += 1
        for line in (roots['readings'] / 'files.sha256').read_text(encoding='utf-8').splitlines():
            digest, name = line.split('  ', 1)
            check_file(roots['readings'], name, digest)
            checks['readings'] += 1
        for source in json.loads((roots['rules'] / 'sources.json').read_text(encoding='utf-8')):
            for item in source['rawFiles']:
                check_file(roots['rules'], item['path'], item['sha256'], item['bytes'])
                checks['rules'] += 1
        audit = {'upstreamFileDigestsChecked': dict(checks), 'inputs': []}
    else:
        audit = json.loads(audit_path.read_text(encoding='utf-8'))
    raw = {}
    for name, filename in [('metadata', 'works.jsonl'), ('readings', 'entries.jsonl'), ('rules', 'rules.jsonl')]:
        for kind, file in [('entries', filename), ('sources', 'sources.json')]:
            key = f'{name}-{kind}'
            target = RAW / f'{key}.gz'
            if supplied:
                data = (roots[name] / file).read_bytes()
                RAW.mkdir(parents=True, exist_ok=True)
                target.write_bytes(gzip.compress(data, mtime=0))
                audit['inputs'].append({'input': f'{name}/{file}', 'file': target.relative_to(ROOT).as_posix(),
                                        'bytes': len(data), 'sha256': sha(data), 'archiveSha256': sha(target.read_bytes())})
            else:
                data = gzip.decompress(target.read_bytes())
                expected = next(x for x in audit['inputs'] if x['input'] == f'{name}/{file}')
                assert sha(data) == expected['sha256'] and sha(target.read_bytes()) == expected['archiveSha256']
            raw[key] = json.loads(data) if kind == 'sources' else [json.loads(line) for line in data.decode('utf-8').splitlines() if line.strip()]
    sources, groups = [], {}
    for name in roots:
        group = raw[f'{name}-sources']
        by_id = {s['sourceId']: s for s in group}
        assert len(by_id) == len(group), f'Duplicate source in {name}'
        groups[name] = by_id
        for s in group:
            url = s.get('fixedUrl') or s.get('canonicalUrl') or s['url']
            revisions = s.get('editionOrRevision')
            if isinstance(revisions, list) and len(revisions) == 1:
                url = revisions[0].get('permanentUrl') or url
            sources.append({'id': f'{name}:{s["sourceId"]}', 'title': s.get('title') or s['sourceId'],
                            'url': url, 'credit': s.get('authorOrEditor') or '原页面所列作者／编者',
                            'license': s.get('licenseOrUse') or s.get('licenseOrUsage') or '',
                            'limitations': s.get('limitations') or s.get('transmission') or '',
                            'rawSha256': s.get('sha256')})
    def sid(name, value):
        assert value in groups[name], f'Unknown source {name}:{value}'
        return f'{name}:{value}'
    readings = []
    numbering_differences = []
    for r in raw['readings-entries']:
        han_offset = None
        if r['lineNumber'] is not None:
            lines = [han(line) for line in re.split(r'[，。！？；、,.!?;\n]+', r['exactText']) if han(line)]
            line = han(r['lineText'])
            start = r['hanColumn'] - 1
            assert line[start:start + len(han(r['targetText']))] == han(r['targetText']), r['id']
            full = han(r['exactText'])
            assert line in full, r['id']
            # Source half-line counts need not follow our punctuation parser.
            # Bind only a unique complete source line, never a title or guessed occurrence.
            if full.count(line) == 1:
                han_offset = full.index(line) + start
            if r['lineNumber'] > len(lines) or lines[r['lineNumber'] - 1] != line:
                numbering_differences.append(r['id'])
        readings.append({'id': r['id'], 'title': r['title'], 'author': r['author'],
                         'text': r['exactText'], 'lineText': r['lineText'], 'target': r['targetText'],
                         'line': r['lineNumber'], 'column': r['hanColumn'], 'hanOffset': han_offset,
                         'modernReading': r['modernReading'], 'historicalTone': r['historicalTone'],
                         'meaning': r['sense'], 'status': r['status'],
                         'scope': r['locator']['evidenceScope'], 'conflictGroup': r.get('conflictGroup'),
                         'sourceId': sid('readings', r['sourceId']), 'quote': r['sourceQuote'],
                         'locator': r['locator'].get('location') or ''})
    works = []
    ids = {r['id'] for r in raw['metadata-entries']}
    for w in raw['metadata-entries']:
        for child in w['containsWorkIds'] or []:
            assert child in ids, f'Missing compilation child: {child}'
        works.append({'id': w['id'], 'title': w['title'], 'author': w['author'], 'text': '\n'.join(w['paragraphs'] or []),
                      'edition': w['editionLabel'], 'collection': w['collectionTitle'],
                      'genre': w['metricalGenre'], 'status': w['status'], 'compilation': w['isCompilation'],
                      'children': w['containsWorkIds'] or [], 'limitations': w['limitations'],
                      'sourceIds': [sid('metadata', s) for s in w['sourceIds']],
                      'notes': [{'term': n['term'], 'lineText': n['lineText'], 'meaning': n['meaning'],
                                 'sourceId': sid('metadata', n['sourceId']), 'quote': n['sourceQuote'],
                                 'locator': n['locator']} for n in w['notes']],
                      'variants': [{'original': v['original'], 'variant': v['variant'], 'lineText': v['lineText'],
                                    'sourceId': sid('metadata', v['sourceId']), 'quote': v['sourceQuote'],
                                    'locator': v['locator']} for v in w['variants']]})
    rules = []
    for r in raw['rules-entries']:
        rules.append({'id': r['id'], 'topic': r['topic'], 'claim': r['claim'], 'status': r['status'],
                      'appliesTo': r['appliesTo'], 'doesNotApplyTo': r['doesNotApplyTo'],
                      'preconditions': r['preconditions'], 'disagreements': r['disagreements'],
                      'examples': [{'title': e['title'], 'text': e['fullRelevantText']} for e in r['examples']],
                      'sourceIds': [sid('rules', s) for s in r['sourceIds']],
                      'quotes': [{'sourceId': sid('rules', q['sourceId']), 'quote': q['quote'],
                                  'locator': q['locator']} for q in r['sourceQuotes']]})
    dataset = {'version': 'collected-v1', 'sources': sources, 'readings': readings, 'works': works, 'rules': rules}
    output = packed(dataset)
    audit.update({'records': {k: len(dataset[k]) for k in ('sources', 'readings', 'works', 'rules')},
                  'statuses': {k: dict(Counter(r['status'] for r in dataset[k])) for k in ('readings', 'works', 'rules')},
                  'compiledSha256': sha(output), 'sourceLineNumberingDifferences': numbering_differences,
                  'integrity': '摘要、字节数、来源外键、正文注音字位、组诗子篇引用通过；不等于内容人审。',
                  'humanReview': '未新增', 'evidenceApproved': '未新增；原记录保持不变',
                  'upstreamRetention': '原始网页/PDF/扫描字节由本地交付包留存；仓库冻结六个结构化输入原字节及摘要，不声称已逐页核对。'})
    if args.check:
        assert (OUT / 'reference.json.gz').read_bytes() == output, 'Derived dataset drift'
        assert json.loads(audit_path.read_text(encoding='utf-8')) == audit, 'Audit drift'
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'reference.json.gz').write_bytes(output)
        audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
