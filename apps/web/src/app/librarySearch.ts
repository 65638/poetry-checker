import type { LibraryWork } from "@poetry/contracts";

type SearchField = "作者" | "题名" | "朝代" | "正文" | "标签";
export interface SearchTerm {
  value: string;
  field?: SearchField;
  excluded: boolean;
}
const normalize = (value: string) => value.normalize("NFKC").toLowerCase();

/** This normalization is for lookup only; returned works and excerpts keep source characters. */
export function parseSearchQuery(query: string): SearchTerm[] {
  const terms: SearchTerm[] = [];
  const tokens = query.matchAll(
    /(-?)(?:(作者|题名|朝代|正文|标签)[:：])?("[^"]*"|“[^”]*”|[^\s]+)/gu,
  );
  for (const token of tokens) {
    const raw = token[3]!;
    const value = normalize(
      /^(?:".*"|“.*”)$/u.test(raw) ? raw.slice(1, -1) : raw,
    ).trim();
    if (value && value !== "-")
      terms.push({
        value,
        ...(token[2] ? { field: token[2] as SearchField } : {}),
        excluded: token[1] === "-",
      });
  }
  return terms;
}

interface SearchDocument {
  fields: Record<SearchField, string>;
  metadata: string;
  all: string;
  sentences: Array<{ original: string; normalized: string }>;
}
// Library entries are immutable React values. Replacing an imported edition builds a new entry.
const documents = new WeakMap<LibraryWork, SearchDocument>();
function documentFor(work: LibraryWork): SearchDocument {
  const cached = documents.get(work);
  if (cached) return cached;
  const fields: Record<SearchField, string> = {
    作者: normalize(work.author),
    题名: normalize(work.title),
    朝代: normalize(work.dynasty),
    标签: normalize(work.tags.join(" ")),
    正文: normalize(work.paragraphs.join("\n")),
  };
  const metadata = [fields.题名, fields.作者, fields.朝代, fields.标签].join(
    "\n",
  );
  const document: SearchDocument = {
    fields,
    metadata,
    all: `${metadata}\n${fields.正文}`,
    sentences: work.paragraphs.flatMap((p) =>
      (p.match(/[^。！？\n]+[。！？]?/gu) ?? [p]).map((original) => ({
        original,
        normalized: normalize(original),
      })),
    ),
  };
  documents.set(work, document);
  return document;
}

export function literalLibrarySearch(works: LibraryWork[], query: string) {
  const terms = parseSearchQuery(query);
  const positive = terms.filter((term) => !term.excluded);
  return works
    .flatMap((work) => {
      if (!terms.length)
        return [
          {
            work,
            score: 0,
            excerpt:
              work.paragraphs[0]?.match(/[^。！？\n]+[。！？]?/u)?.[0] ?? "",
          },
        ];
      const document = documentFor(work);
      const matches = terms.every((term) => {
        const found = (
          term.field ? document.fields[term.field] : document.all
        ).includes(term.value);
        return term.excluded ? !found : found;
      });
      if (!matches) return [];
      let excerpt = document.sentences[0]?.original ?? "";
      let best = 0;
      for (const sentence of document.sentences) {
        const score = positive.reduce(
          (n, term) =>
            n +
            ((!term.field || term.field === "正文") &&
            sentence.normalized.includes(term.value)
              ? Array.from(term.value).length * 8
              : 0),
          0,
        );
        if (score > best) {
          best = score;
          excerpt = sentence.original;
        }
      }
      const score =
        best +
        positive.reduce(
          (n, term) =>
            n +
            (term.field !== "正文" && document.metadata.includes(term.value)
              ? Array.from(term.value).length * 16
              : 0),
          0,
        );
      return [{ work, score, excerpt }];
    })
    .sort((a, b) => b.score - a.score);
}
