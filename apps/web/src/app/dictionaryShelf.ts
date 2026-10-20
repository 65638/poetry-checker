import type { BookId, LookupResult } from "@poetry/contracts";
import { characterInputError } from "../api/characters";

export interface ShelfEntry {
  character: string;
  book: BookId;
}
export interface DictionaryShelf {
  recent: ShelfEntry[];
  favorites: ShelfEntry[];
}
export const SHELF_KEY = "pc-dictionary-shelf-v1";
export const shelfId = (entry: ShelfEntry): string =>
  `${entry.book}:${entry.character}`;
const books: BookId[] = ["pingshui", "cilin", "xinyun"];
export function readShelf(raw: string | null): DictionaryShelf {
  const empty = { recent: [], favorites: [] };
  try {
    const parsed = JSON.parse(raw ?? "null") as DictionaryShelf | null;
    const clean = (items: unknown, max: number): ShelfEntry[] => {
      if (!Array.isArray(items)) return [];
      const valid = items.filter(
        (entry): entry is ShelfEntry =>
          !!entry &&
          typeof entry === "object" &&
          typeof entry.character === "string" &&
          !characterInputError(entry.character) &&
          books.includes(entry.book),
      );
      return [
        ...new Map(
          valid.map((entry) => [
            shelfId(entry),
            { character: entry.character.trim(), book: entry.book },
          ]),
        ).values(),
      ].slice(0, max);
    };
    return {
      recent: clean(parsed?.recent, 12),
      favorites: clean(parsed?.favorites, 24),
    };
  } catch {
    return empty;
  }
}
export function remember(
  shelf: DictionaryShelf,
  entry: ShelfEntry,
): DictionaryShelf {
  return {
    ...shelf,
    recent: [
      entry,
      ...shelf.recent.filter((item) => shelfId(item) !== shelfId(entry)),
    ].slice(0, 12),
  };
}
export function toggleFavorite(
  shelf: DictionaryShelf,
  entry: ShelfEntry,
): DictionaryShelf {
  const exists = shelf.favorites.some(
    (item) => shelfId(item) === shelfId(entry),
  );
  return {
    ...shelf,
    favorites: exists
      ? shelf.favorites.filter((item) => shelfId(item) !== shelfId(entry))
      : [entry, ...shelf.favorites].slice(0, 24),
  };
}
export function extractCharacters(text: string): string[] {
  return [...new Set([...text].filter((c) => /^\p{Script=Han}$/u.test(c)))];
}
export function readDictionaryLink(hash: string): ShelfEntry | null {
  if (!hash.startsWith("#dictionary?")) return null;
  const params = new URLSearchParams(hash.slice(hash.indexOf("?") + 1));
  const character = params.get("char") ?? "";
  const book = params.get("book") as BookId;
  return !characterInputError(character) && books.includes(book)
    ? { character: character.trim(), book }
    : null;
}
export function dictionaryHash(entry: ShelfEntry): string {
  return `#dictionary?${new URLSearchParams({ char: entry.character, book: entry.book })}`;
}
export function dictionaryText(
  character: string,
  result: LookupResult,
): string {
  const names = { pingshui: "平水韵", cilin: "词林正韵", xinyun: "中华新韵" };
  const toneNames = {
    ping: "平声",
    shang: "上声",
    qu: "去声",
    ru: "入声",
    yinping: "阴平",
    yangping: "阳平",
    neutral: "轻声",
    ze_unspecified: "仄声（未分上去）",
  };
  const candidates = result.entries.flatMap((entry) => entry.candidates);
  return [
    `${character} · ${names[result.book]}`,
    ...candidates.map((c) => {
      const approved = c.evidenceIds.some((id) =>
        result.evidence.some(
          (e) => e.id === id && e.reviewStatus === "approved",
        ),
      );
      return `${toneNames[c.toneClass]} / ${c.groupIds.map((id) => result.groups.find((g) => g.id === id)?.name ?? id).join("、")} / ${approved ? "归部已核" : "待核"}${c.modernReading ? ` / ${c.modernReading.pinyin}` : ""}`;
    }),
    ...(!candidates.length ? ["本书未收录该字形"] : []),
    "查阅记录不替代诗中读音选择。",
    `数据版本：${result.dataVersion}`,
  ].join("\n");
}
