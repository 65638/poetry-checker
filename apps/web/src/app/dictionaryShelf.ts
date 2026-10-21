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
export const FAVORITES_LIMIT = 24;
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
          valid
            .map((entry) => ({
              character: entry.character.trim(),
              book: entry.book,
            }))
            .map((entry) => [
              shelfId(entry),
              { character: entry.character.trim(), book: entry.book },
            ]),
        ).values(),
      ].slice(0, max);
    };
    return {
      recent: clean(parsed?.recent, 12),
      favorites: clean(parsed?.favorites, FAVORITES_LIMIT),
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
  if (!exists && shelf.favorites.length >= FAVORITES_LIMIT) return shelf;
  return {
    ...shelf,
    favorites: exists
      ? shelf.favorites.filter((item) => shelfId(item) !== shelfId(entry))
      : [entry, ...shelf.favorites],
  };
}
export function extractCharacters(text: string): string[] {
  return [...new Set([...text].filter((c) => /^\p{Script=Han}$/u.test(c)))];
}
/** Portable bookmarks only: no evidence, analysis, or stored lookup snapshots. */
export function shelfBackup(shelf: DictionaryShelf): string {
  return (
    JSON.stringify(
      {
        kind: "poetry-dictionary-shelf",
        version: 1,
        favorites: shelf.favorites,
      },
      null,
      2,
    ) + "\n"
  );
}
export function importShelfBackup(
  raw: string,
  current: DictionaryShelf,
): { shelf: DictionaryShelf; added: number } {
  if (raw.length > 20000)
    throw new Error("字笺文件过大，请选择本工具导出的 JSON 文件。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("无法读取字笺，请选择本工具导出的 JSON 文件。");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("kind" in parsed) ||
    parsed.kind !== "poetry-dictionary-shelf" ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("favorites" in parsed) ||
    !Array.isArray(parsed.favorites) ||
    parsed.favorites.length > FAVORITES_LIMIT ||
    !parsed.favorites.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.character === "string" &&
        !characterInputError(entry.character) &&
        books.includes(entry.book),
    )
  )
    throw new Error("字笺格式或版本不符，现有收藏已保留。");
  const incoming = readShelf(
    JSON.stringify({ favorites: parsed.favorites }),
  ).favorites;
  const favorites = [...current.favorites];
  for (const entry of incoming)
    if (!favorites.some((item) => shelfId(item) === shelfId(entry)))
      favorites.push(entry);
  if (favorites.length > FAVORITES_LIMIT)
    throw new Error(
      `合并后超过 ${FAVORITES_LIMIT} 条，请先移出部分收藏。现有收藏已保留。`,
    );
  return {
    shelf: { ...current, favorites },
    added: favorites.length - current.favorites.length,
  };
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
