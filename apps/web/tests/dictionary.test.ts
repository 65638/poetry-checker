import { describe, expect, it } from "vitest";
import type { LookupResult } from "@poetry/contracts";
import {
  characterInputError,
  createCharacterLookup,
} from "../src/api/characters";
import {
  dictionaryHash,
  dictionaryText,
  extractCharacters,
  importShelfBackup,
  readDictionaryLink,
  readShelf,
  remember,
  shelfBackup,
  toggleFavorite,
} from "../src/app/dictionaryShelf";
import { EMPTY_DRAFT, parseSavedDraft } from "../src/app/draftPersistence";

const missing: LookupResult = {
  book: "pingshui",
  dataVersion: "test-only",
  entries: [],
  missing: ["𠀀"],
  groups: [],
  evidence: [],
  sources: [],
};
const fetchResult =
  (value: unknown, status = 200): typeof fetch =>
  async () =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });

describe("dictionary: real transport boundaries", () => {
  it("accepts one Han code point including supplementary characters and preserves original glyphs", () => {
    for (const text of ["𠀀", "月", " 馀 ", "餘"])
      expect(characterInputError(text)).toBeNull();
    for (const text of ["", "明月", "a", "😀", "月\uFE0F"])
      expect(characterInputError(text)).toContain("一个汉字");
    expect(extractCharacters("明月，明月！𠀀 餘余馀abc😀")).toEqual([
      "明",
      "月",
      "𠀀",
      "餘",
      "余",
      "馀",
    ]);
  });
  it("encodes the code point and forwards cancellation; a missing entry is a valid lookup", async () => {
    const signal = new AbortController().signal;
    const calls: Array<{ url: string; signal?: AbortSignal | null }> = [];
    const lookup = createCharacterLookup(
      "https://example.org",
      async (url, init) => {
        calls.push({ url: String(url), signal: init?.signal });
        return new Response(JSON.stringify(missing), { status: 200 });
      },
    );
    const result = await lookup("𠀀", "pingshui", signal);
    expect(calls).toEqual([
      {
        url: `https://example.org/api/v1/characters/${encodeURIComponent("𠀀")}?book=pingshui`,
        signal,
      },
    ]);
    expect(result.missing).toEqual(["𠀀"]);
  });
  it.each([
    { ...missing, book: "cilin" },
    { ...missing, missing: ["月"] },
    { ...missing, missing: [] },
    { ...missing, entries: [{ character: "月", candidates: [] }] },
  ])(
    "rejects a structurally legal result for a different character/book",
    async (value) => {
      await expect(
        createCharacterLookup("", fetchResult(value))(
          "𠀀",
          "pingshui",
          new AbortController().signal,
        ),
      ).rejects.toThrow("不一致");
    },
  );
  it("preserves server failure without displaying a missing-character success", async () => {
    await expect(
      createCharacterLookup(
        "",
        fetchResult({ error: { message: "快照未装载" } }, 503),
      )("月", "pingshui", new AbortController().signal),
    ).rejects.toThrow("快照未装载");
    await expect(
      createCharacterLookup("", fetchResult({ unexpected: true }))(
        "月",
        "pingshui",
        new AbortController().signal,
      ),
    ).rejects.toThrow("格式异常");
  });
});

describe("dictionary shelf and links", () => {
  it("limits recent history, deduplicates by character AND book, and does not store snapshots", () => {
    let shelf = readShelf(null);
    for (const character of "甲乙丙丁戊己庚辛壬癸子丑寅卯")
      shelf = remember(shelf, { character, book: "pingshui" });
    expect(shelf.recent).toHaveLength(12);
    shelf = remember(shelf, { character: "卯", book: "cilin" });
    shelf = remember(shelf, { character: "卯", book: "pingshui" });
    expect(shelf.recent.slice(0, 2)).toEqual([
      { character: "卯", book: "pingshui" },
      { character: "卯", book: "cilin" },
    ]);
    expect(Object.keys(shelf.recent[0]!)).toEqual(["character", "book"]);
  });
  it("favorite toggling is reversible and corrupt storage is discarded", () => {
    const entry = { character: "月", book: "pingshui" as const };
    const shelf = toggleFavorite(readShelf("broken-json"), entry);
    expect(shelf.favorites).toEqual([entry]);
    expect(toggleFavorite(shelf, entry).favorites).toEqual([]);
    expect(
      readShelf(
        JSON.stringify({
          favorites: [
            { character: "明月", book: "pingshui" },
            { character: "月", book: "not-a-book" },
          ],
          recent: null,
        }),
      ),
    ).toEqual({ favorites: [], recent: [] });
  });
  it("round-trips exact Unicode glyph/book links and rejects unrelated or malformed fragments", () => {
    for (const book of ["pingshui", "cilin", "xinyun"] as const) {
      const entry = { character: "𠀀", book };
      expect(readDictionaryLink(dictionaryHash(entry))).toEqual(entry);
    }
    expect(readDictionaryLink("#checker?char=月&book=pingshui")).toBeNull();
    expect(
      readDictionaryLink("#dictionary?char=明月&book=pingshui"),
    ).toBeNull();
    expect(readDictionaryLink("#dictionary?char=月&book=unknown")).toBeNull();
  });
  it("normalizes shelf whitespace before deduplication without merging distinct glyphs", () => {
    const shelf = readShelf(
      JSON.stringify({
        favorites: [
          { character: " 月 ", book: "pingshui" },
          { character: "月", book: "pingshui" },
          { character: "月", book: "cilin" },
          { character: "余", book: "cilin" },
          { character: "餘", book: "cilin" },
        ],
      }),
    );
    expect(shelf.favorites).toHaveLength(4);
    expect(shelf.favorites[0]).toEqual({ character: "月", book: "pingshui" });
  });
  it("keeps all existing favorites at capacity and still permits removal and replacement", () => {
    let shelf = readShelf(null);
    for (const character of "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥乾坤")
      shelf = toggleFavorite(shelf, { character, book: "pingshui" });
    expect(shelf.favorites).toHaveLength(24);
    const full = shelf;
    shelf = toggleFavorite(shelf, { character: "月", book: "cilin" });
    expect(shelf).toBe(full);
    shelf = toggleFavorite(shelf, { character: "甲", book: "pingshui" });
    expect(shelf.favorites).toHaveLength(23);
    shelf = toggleFavorite(shelf, { character: "月", book: "cilin" });
    expect(shelf.favorites).toHaveLength(24);
    expect(shelf.favorites[0]).toEqual({ character: "月", book: "cilin" });
  });
  it("copied lookup content carries evidence status and version", () => {
    const text = dictionaryText("𠀀", missing);
    expect(text).toContain("未收录");
    expect(text).toContain("数据版本：test-only");
    expect(text).toContain("不替代诗中读音选择");
  });
  it("exports portable bookmarks and merges exact entries while preserving current history", () => {
    const current = {
      recent: [{ character: "月", book: "xinyun" as const }],
      favorites: [{ character: "月", book: "pingshui" as const }],
    };
    const raw = shelfBackup({
      recent: [{ character: "私", book: "cilin" }],
      favorites: [
        { character: "月", book: "pingshui" },
        { character: "月", book: "cilin" },
        { character: "餘", book: "cilin" },
        { character: "余", book: "cilin" },
      ],
    });
    expect(JSON.parse(raw)).not.toHaveProperty("recent");
    const imported = importShelfBackup(raw, current);
    expect(imported.added).toBe(3);
    expect(imported.shelf.favorites).toHaveLength(4);
    expect(imported.shelf.recent).toEqual(current.recent);
    expect(importShelfBackup(raw, imported.shelf).added).toBe(0);
  });
  it.each([
    "broken",
    "{}",
    JSON.stringify({
      kind: "poetry-dictionary-shelf",
      version: 2,
      favorites: [],
    }),
    JSON.stringify({
      kind: "poetry-dictionary-shelf",
      version: 1,
      favorites: [{ character: "明月", book: "cilin" }],
    }),
    "x".repeat(20001),
  ])("rejects invalid backups without mutating current shelf", (raw) => {
    const current = readShelf(null);
    expect(() => importShelfBackup(raw, current)).toThrow();
    expect(current).toEqual({ recent: [], favorites: [] });
  });
  it("refuses an import exceeding capacity without dropping old or incoming bookmarks", () => {
    const current = readShelf(
      JSON.stringify({
        favorites: [..."甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥乾坤"].map(
          (character) => ({ character, book: "pingshui" }),
        ),
      }),
    );
    expect(() =>
      importShelfBackup(
        shelfBackup({
          recent: [],
          favorites: [{ character: "月", book: "cilin" }],
        }),
        current,
      ),
    ).toThrow("超过 24");
    expect(current.favorites).toHaveLength(24);
    expect(current.favorites[0]?.character).toBe("甲");
  });
});

describe("local draft restoration", () => {
  it("restores only draft fields, never saved reports/overrides", () => {
    const draft = {
      ...EMPTY_DRAFT,
      text: "明月松间照。",
      rhymeBook: "cilin" as const,
    };
    expect(
      parseSavedDraft(
        JSON.stringify({
          ...draft,
          report: { status: "pass" },
          overrides: ["untrusted"],
        }),
      ),
    ).toEqual(draft);
  });
  it.each([
    "bad",
    JSON.stringify({ ...EMPTY_DRAFT, rhymeBook: "other" }),
    JSON.stringify({ ...EMPTY_DRAFT, text: "月".repeat(2001) }),
    JSON.stringify({ ...EMPTY_DRAFT, genreHint: "ancient", formHint: "wujue" }),
  ])("rejects corrupt, over-limit or incompatible saved input", (raw) => {
    expect(parseSavedDraft(raw)).toEqual(EMPTY_DRAFT);
  });
});
