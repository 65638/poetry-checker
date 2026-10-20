import type { BookId, LookupResult } from "@poetry/contracts";
import type { CharacterLookup } from "../api/characters";
import { extractCharacters } from "./dictionaryShelf";
export const PASSAGE_CHARACTER_LIMIT = 96;
export interface PassageRow {
  character: string;
  result: LookupResult | null;
  error: string | null;
}
export interface PassageLookup {
  text: string;
  book: BookId;
  rows: PassageRow[];
}
/** Four real requests at a time; retain failed/missing entries explicitly. */
export async function lookupPassage(
  text: string,
  book: BookId,
  lookup: CharacterLookup,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<PassageLookup> {
  const characters = extractCharacters(text);
  if (!characters.length) throw new Error("请先写下含汉字的诗句。");
  if (characters.length > PASSAGE_CHARACTER_LIMIT)
    throw new Error(
      `每批最多查阅${PASSAGE_CHARACTER_LIMIT}个不同汉字，请分段查阅。`,
    );
  const rows: PassageRow[] = new Array(characters.length);
  let cursor = 0,
    done = 0;
  const run = async () => {
    while (cursor < characters.length) {
      if (signal.aborted) throw new DOMException("查询已取消", "AbortError");
      const index = cursor++;
      const character = characters[index]!;
      try {
        rows[index] = {
          character,
          result: await lookup(character, book, signal),
          error: null,
        };
      } catch (cause) {
        if (signal.aborted) throw cause;
        rows[index] = {
          character,
          result: null,
          error:
            cause instanceof TypeError
              ? "连接失败"
              : cause instanceof Error
                ? cause.message
                : "查询失败",
        };
      }
      onProgress(++done, characters.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, characters.length) }, run),
  );
  const firstVersion = rows.find((row) => row.result)?.result?.dataVersion;
  for (const row of rows)
    if (row.result && row.result.dataVersion !== firstVersion) {
      row.result = null;
      row.error = "查询中数据版本发生变化，请重新查阅。";
    }
  return { text, book, rows };
}
export function passageRowStatus(
  row: PassageRow,
): "error" | "missing" | "backed" | "needs_review" {
  if (row.result === null) return "error";
  const candidates = row.result.entries.flatMap((entry) => entry.candidates);
  if (!candidates.length) return "missing";
  return candidates.every((candidate) =>
    candidate.evidenceIds.some((id) =>
      row.result!.evidence.some(
        (e) => e.id === id && e.reviewStatus === "approved",
      ),
    ),
  )
    ? "backed"
    : "needs_review";
}
