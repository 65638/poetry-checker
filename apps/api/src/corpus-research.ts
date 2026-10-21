import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  CorpusResearchWorkSchema,
  ResearchSourceSchema,
  type CorpusResearchWork,
  type ResearchResponse,
} from "@poetry/contracts";

type IndexRow = { id: string; textHash: string; batch: string; han: string };
let index: IndexRow[] | undefined;
let audit: { products: Record<string, string> } | undefined;
const cache = new Map<
  string,
  {
    work: CorpusResearchWork;
    sources: ResearchResponse["sources"];
  }
>();
const root = new URL("../../../data/research/full-corpus-v1/", import.meta.url);
const hanKey = (text: string) =>
  [...text].filter((c) => /\p{Script=Han}|〇/u.test(c)).join("");

function read(name: string): unknown {
  audit ??= JSON.parse(
    readFileSync(new URL("audit.json", root), "utf8"),
  ) as NonNullable<typeof audit>;
  if (!/^(index|batch-\d{2})\.json\.gz$/u.test(name))
    throw new Error("Unexpected corpus shard name");
  const bytes = readFileSync(new URL(name, root));
  if (createHash("sha256").update(bytes).digest("hex") !== audit.products[name])
    throw new Error("Full corpus reference checksum mismatch");
  return JSON.parse(gunzipSync(bytes).toString("utf8"));
}

function getIndex() {
  index ??= read("index.json.gz") as IndexRow[];
  return index;
}

function loadWork(entry: IndexRow) {
  const previous = cache.get(entry.id);
  if (previous) {
    cache.delete(entry.id);
    cache.set(entry.id, previous);
    return previous;
  }
  const shard = read(entry.batch) as { works: unknown[]; sources: unknown[] };
  const work = CorpusResearchWorkSchema.parse(
    shard.works.find((w) => (w as { id?: string }).id === entry.id),
  );
  if (
    work.textHash !== entry.textHash ||
    hanKey(work.paragraphs.join("\n")) !== entry.han
  )
    throw new Error("Corpus index/body mismatch");
  const used = new Set([
    ...work.sourceIds,
    ...work.readings.flatMap((r) => [
      ...r.sourceIds,
      ...r.candidates.flatMap((c) => c.sourceIds),
    ]),
    ...work.notes.flatMap((n) => n.sourceIds),
    ...work.formClaims.flatMap((f) => f.sourceIds),
    ...work.variants.flatMap((v) => v.sourceIds),
  ]);
  const sources = shard.sources
    .map((s) => ResearchSourceSchema.parse(s))
    .filter((s) => used.has(s.id));
  if (sources.length !== used.size)
    throw new Error("Corpus source reference missing");
  const value = { work, sources };
  cache.set(entry.id, value);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return value;
}

// Full Han sequence only: no fuzzy, title, subset or simplified/traditional binding.
export function corpusResearch(text: string) {
  try {
    const key = hanKey(text);
    const values = getIndex()
      .filter((entry) => entry.han === key)
      .map(loadWork);
    return {
      available: true,
      works: values.map((v) => v.work),
      sources: [
        ...new Map(
          values.flatMap((v) => v.sources).map((s) => [s.id, s]),
        ).values(),
      ],
    };
  } catch {
    return { available: false, works: [], sources: [] };
  }
}

export function fillMissingCorpusReadings(
  id: string,
  textHash: string,
  lines: (string | null)[][],
): { lines: (string | null)[][]; added: number } {
  try {
    const entry = getIndex().find(
      (w) => w.id === id && w.textHash === textHash,
    );
    if (!entry) return { lines, added: 0 };
    const { work } = loadWork(entry);
    const result = lines.map((line) => [...line]);
    let added = 0;
    for (const r of work.readings) {
      const row = result[r.paragraphNumber - 1];
      const col = r.codepointColumn - 1;
      if (
        row &&
        col < row.length &&
        row[col] === null &&
        r.status === "source_attested" &&
        r.evidenceScope === "direct_context" &&
        r.modernReading &&
        r.candidates.some(
          (c) =>
            c.evidenceScope === "direct_context" &&
            c.modernReading === r.modernReading &&
            c.sourceIds.length > 0,
        )
      ) {
        row[col] = r.modernReading;
        added++;
      }
    }
    return { lines: result, added };
  } catch {
    return { lines, added: 0 };
  }
}
