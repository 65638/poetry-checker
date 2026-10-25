import type { RhymeWordsRequest, RhymeWordsResponse } from "@poetry/contracts";
import { requestRhymeWords } from "./poetry-studio";

const PAGE_SIZE = 120;
const MAX_WORDS = 100_000;
const incomplete = () =>
  new Error("同韵候选尚未完整取得，请重新查找；当前诗文仍保留。");

/** Fetch all pages before publishing a result: a partial list is never “all”. */
export async function requestAllRhymeWords(
  input: Pick<RhymeWordsRequest, "rhymeBook" | "readingId">,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<RhymeWordsResponse> {
  let result: RhymeWordsResponse | undefined;
  const characters = new Set<string>();
  const candidates = new Set<string>();
  const groups = new Map<
    string,
    RhymeWordsResponse["lookup"]["groups"][number]
  >();
  const evidence = new Map<
    string,
    RhymeWordsResponse["lookup"]["evidence"][number]
  >();
  const sources = new Map<
    string,
    RhymeWordsResponse["lookup"]["sources"][number]
  >();
  function merge<T extends { id: string }>(target: Map<string, T>, rows: T[]) {
    for (const row of rows) {
      const previous = target.get(row.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(row))
        throw incomplete();
      target.set(row.id, row);
    }
  }

  do {
    signal?.throwIfAborted();
    const offset = characters.size;
    const page = await requestRhymeWords(
      { ...input, offset, limit: PAGE_SIZE },
      signal,
    );
    // A cancelled transport can still resolve; do not publish or fetch again.
    signal?.throwIfAborted();
    if (
      page.readingId !== input.readingId ||
      page.lookup.book !== input.rhymeBook ||
      page.offset !== offset ||
      page.limit !== PAGE_SIZE ||
      page.total > MAX_WORDS ||
      page.lookup.missing.length ||
      page.lookup.entries.length !== Math.min(PAGE_SIZE, page.total - offset) ||
      (result &&
        (result.total !== page.total ||
          result.lookup.dataVersion !== page.lookup.dataVersion))
    )
      throw incomplete();

    for (const entry of page.lookup.entries) {
      if (characters.has(entry.character) || !entry.candidates.length)
        throw incomplete();
      characters.add(entry.character);
      for (const candidate of entry.candidates) {
        if (
          candidates.has(candidate.id) ||
          candidate.character !== entry.character ||
          candidate.book !== input.rhymeBook
        )
          throw incomplete();
        candidates.add(candidate.id);
      }
    }
    merge(groups, page.lookup.groups);
    merge(evidence, page.lookup.evidence);
    merge(sources, page.lookup.sources);
    if (!result) {
      result = {
        ...page,
        offset: 0,
        limit: Math.max(1, page.total),
        lookup: { ...page.lookup, entries: [...page.lookup.entries] },
      };
    } else result.lookup.entries.push(...page.lookup.entries);
    onProgress?.(characters.size, result.total);
    signal?.throwIfAborted();
  } while (characters.size < result.total);

  return {
    ...result,
    lookup: {
      ...result.lookup,
      groups: [...groups.values()],
      evidence: [...evidence.values()],
      sources: [...sources.values()],
    },
  };
}
