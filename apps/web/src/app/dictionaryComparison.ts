import type { BookId, LookupResult } from "@poetry/contracts";
import type { CharacterLookup } from "../api/characters";
export type BookComparison =
  | { book: BookId; result: LookupResult; error: null }
  | { book: BookId; result: null; error: string };
export async function compareBooks(
  character: string,
  current: LookupResult,
  lookup: CharacterLookup,
  signal: AbortSignal,
): Promise<BookComparison[]> {
  const books: BookId[] = ["pingshui", "cilin", "xinyun"];
  return Promise.all(
    books.map(async (book): Promise<BookComparison> => {
      try {
        return {
          book,
          result:
            book === current.book
              ? current
              : await lookup(character, book, signal),
          error: null,
        };
      } catch (cause) {
        return {
          book,
          result: null,
          error: signal.aborted
            ? "查询超时，请重试"
            : cause instanceof TypeError
              ? "连接失败，请重试"
              : cause instanceof Error
                ? cause.message
                : "查询失败",
        };
      }
    }),
  );
}
