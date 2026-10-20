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
  readDictionaryLink,
  readShelf,
  remember,
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
  it("copied lookup content carries evidence status and version", () => {
    const text = dictionaryText("𠀀", missing);
    expect(text).toContain("未收录");
    expect(text).toContain("数据版本：test-only");
    expect(text).toContain("不替代诗中读音选择");
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
