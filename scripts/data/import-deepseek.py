"""Build the optional reading corpus and reference layer from frozen user inputs."""
import argparse
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data/raw/deepseek'
OUT = ROOT / 'data/library/deepseek-v1'
FILES = {
    'poems': '古诗注音/data/poems.json',
    'annotations': '古诗注音/data/annotated.json',
    'dictionary': '古诗注音/data/char_dict.json',
    'lexicon': '汉字读音/output/汉字韵书总表.json',
    'supplement': '汉字读音/output/广韵未收字·读音补充.csv',
    'xiaoyun': '汉字读音/raw/SieuxYonh.txt',
    'characters': '汉字读音/raw/Dzih.txt',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def packed(value):
    return gzip.compress(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    raw, provenance = {}, []
    for name, rel in FILES.items():
        target = RAW / (name + '.gz')
        if args.source:
            data = (args.source / rel).read_bytes()
            RAW.mkdir(parents=True, exist_ok=True)
            target.write_bytes(gzip.compress(data, mtime=0))
        else:
            data = gzip.decompress(target.read_bytes())
        raw[name] = data
        provenance.append({'input': rel, 'file': target.relative_to(ROOT).as_posix(),
                           'bytes': len(data), 'sha256': sha(data), 'archiveSha256': sha(target.read_bytes())})
    poems = json.loads(raw['poems'])
    annotations = {p['id']: p for p in json.loads(raw['annotations'])}
    dictionary = json.loads(raw['dictionary'])
    catalog, readings = [], {}
    for poem in poems:
        lines = poem['lines']
        annotated = annotations[poem['id']]['lines']
        assert [''.join(t['c'] for t in line) for line in annotated] == lines, poem['title']
        step = max(1, (len(lines) + 199) // 200)
        paragraphs = ['\n'.join(lines[i:i + step]) for i in range(0, len(lines), step)]
        pairs = []
        for i in range(0, len(annotated), step):
            joined = []
            for j, line in enumerate(annotated[i:i + step]):
                if j:
                    joined.append(None)
                joined.extend(t['p'] for t in line)
            pairs.append(joined)
        assert all(len(text) == len(py) for text, py in zip(paragraphs, pairs))
        wid = 'deepseek:' + poem['id']
        prose = poem['title'] in {'庖丁解牛'}
        catalog.append({'id': wid, 'title': poem['title'], 'author': poem['author'], 'dynasty': poem['dynasty'],
                        'paragraphs': paragraphs, 'kind': 'prose' if prose else 'unknown',
                        'source': '古文岛正文（DeepSeek提供语料）', 'sourceUrl': poem['url'],
                        'tags': list(dict.fromkeys(poem.get('collections', []) + poem.get('tags', []))),
                        'collection': poem['primary']})
        readings[wid] = {'id': wid, 'textHash': sha('\n'.join(paragraphs).encode()), 'lines': pairs,
                         'notice': '现代普通话参考注音；程序生成及提供者校订，不代表古音或格律结论。'}
    original = json.loads(raw['lexicon'])
    entries = {}
    corrections = []
    for ch, value in original['chars'].items():
        rows = []
        for row in value['条目']:
            pronunciation = row['现代读音'] or None
            note = None
            if ch == '乾' and row['反切'] in {'古寒切', '渠焉切'}:
                pronunciation = {'古寒切': 'gān', '渠焉切': 'qián'}[row['反切']]
                note = '订正提供表配反的今音；古寒切属寒韵，渠焉切属仙韵。'
            if ch == '樂':
                pronunciation = None
                note = '原表今音对应不完整，暂不将今音绑定本条反切；上方列字典现代读音。'
            if note:
                corrections.append({'character': ch, 'fanqie': row['反切'], 'original': row['现代读音'], 'value': pronunciation, 'reason': note})
            rows.append({'character': ch, 'pronunciation': pronunciation, 'fanqie': row['反切'] or None,
                         'rhyme': row['广韵韵目'], 'tone': row['声调'], 'initial': row['声母'],
                         'pingshui': row['平水韵部'], 'cilin': row['词林正韵部'], 'note': note})
        entries[ch] = {'readings': dictionary.get(ch) or dictionary.get(value['简体']) or value['读音'], 'entries': rows}
    for row in csv.DictReader(io.StringIO(raw['supplement'].decode('utf-8-sig'))):
        if row['字'] not in entries:
            entries[row['字']] = {'readings': row['现代读音'].split('／'), 'entries': []}
    aliases = {key: [r['字'] for r in value['条目']] for key, value in original['simp'].items()}
    for key, simp in original['alias'].items():
        aliases.setdefault(key, aliases.get(simp, []))
    for key, value in original['simp'].items():
        entries.setdefault(key, {'readings': dictionary.get(key) or value['读音'], 'entries': []})
    products = {'catalog.json.gz': {'version': 'deepseek-v1', 'works': catalog},
                'annotations.json.gz': readings,
                'reference.json.gz': {'entries': entries, 'aliases': aliases}}
    OUT.mkdir(parents=True, exist_ok=True)
    for name, value in products.items():
        data = packed(value)
        target = OUT / name
        if args.check:
            assert target.read_bytes() == data, 'Generated file differs: ' + name
        else:
            target.write_bytes(data)
    manifest = {'version': 'deepseek-v1', 'receivedOn': '2026-10-21', 'works': len(catalog),
                'source': 'User-provided DeepSeek extraction; no independent human approval asserted.',
                'license': 'Upstream text, selection and annotation rights not independently verified; includes modern works.',
                'pronunciationScope': 'Modern Mandarin; not historical pronunciation or approved rhyme-book evidence.',
                'provenance': provenance, 'corrections': corrections,
                'products': [{'file': (OUT / name).relative_to(ROOT).as_posix(), 'sha256': sha(packed(value))} for name, value in products.items()]}
    if not args.check:
        (RAW / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'works': len(catalog), 'referenceHeads': len(entries), 'corrections': len(corrections), 'check': args.check}))


if __name__ == '__main__':
    main()
