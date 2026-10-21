import { describe, expect, it } from "vitest";
import type { AnnotatedToken } from "@poetry/contracts";
import {
  BUILTIN_WORKS,
  mergeLibrary,
  parseLibraryImport,
  searchLibrary,
  uniqueLibrary,
} from "../src/app/library";
import { applyRevision, changedSpan, parseNotebook } from "../src/app/notebook";

const raw = {
  title: "导入测试",
  author: "测试作者",
  dynasty: "",
  paragraphs: ["江上孤舟。", "夜雨思乡。"],
  sourceUrl: "https://example.org/poem",
};
describe("local classical corpus and revision notebook", () => {
  it("hides identical works and completely covered compilations without deleting source versions or unique text", () => {
    const make = (
      id: string,
      title: string,
      text: string,
      author = "李白",
    ) => ({
      ...BUILTIN_WORKS[0]!,
      id,
      title,
      author,
      dynasty: "唐",
      paragraphs: [text],
    });
    const first = make(
      "one",
      "行路难·其一",
      "金樽清酒斗十千，玉盘珍羞直万钱。停杯投箸不能食。",
    );
    const second = make(
      "two",
      "行路难·其二",
      "大道如青天，我独不得出。羞逐长安社中儿，赤鸡白雉赌梨栗。",
    );
    const group = make(
      "group",
      "行路难二首",
      first.paragraphs.join("") + second.paragraphs.join(""),
    );
    const duplicate = {
      ...first,
      id: "duplicate",
      title: "行路难",
      sourceUrl: "https://example.org/other",
    };
    const incomplete = make(
      "incomplete",
      "行路难三首",
      group.paragraphs.join("") + "额外独有诗句。",
    );
    const otherAuthor = { ...first, id: "other", author: "他人" };
    const variant = {
      ...first,
      id: "variant",
      paragraphs: [first.paragraphs[0]!.replace("羞", "馐")],
    };
    const original = [
      first,
      second,
      group,
      duplicate,
      incomplete,
      otherAuthor,
      variant,
    ];
    const snapshot = JSON.stringify(original);
    const result = uniqueLibrary(original);
    expect(result.works.map((w) => w.id)).toEqual([
      "one",
      "two",
      "incomplete",
      "other",
      "variant",
    ]);
    expect(result.hiddenCount).toBe(2);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
  it("imports JSON and JSONL while preserving glyphs, provenance and variants", async () => {
    const a = await parseLibraryImport(
      JSON.stringify([{ ...raw, paragraphs: ["餘雨未歇。"] }]),
      "poems.json",
    );
    const b = await parseLibraryImport(
      JSON.stringify({ ...raw, paragraphs: ["余雨未歇。"] }) + "\n",
      "poems.jsonl",
    );
    expect(a[0]!.paragraphs).toEqual(["餘雨未歇。"]);
    expect(a[0]!.sourceUrl).toBe(raw.sourceUrl);
    expect(mergeLibrary(a, b).added).toBe(1);
  });
  it("deduplicates equivalent line breaks without rewriting the stored text", async () => {
    const a = await parseLibraryImport(JSON.stringify([raw]), "a.json");
    const b = await parseLibraryImport(
      JSON.stringify({
        works: [
          { ...raw, text: raw.paragraphs.join(""), paragraphs: undefined },
        ],
      }),
      "b.json",
    );
    expect(a[0]!.id).toBe(b[0]!.id);
    const merged = mergeLibrary(a, b);
    expect(merged.duplicates).toBe(1);
    expect(merged.works[0]!.paragraphs).toEqual(raw.paragraphs);
  });
  it("rejects unsafe URLs, malformed content and oversized libraries atomically", async () => {
    for (const value of [
      [],
      [{ ...raw, title: undefined }],
      [{ ...raw, sourceUrl: "javascript:alert(1)" }],
      [raw, { title: "坏记录" }],
    ])
      await expect(
        parseLibraryImport(JSON.stringify(value), "x.json"),
      ).rejects.toThrow();
    expect(() =>
      mergeLibrary(
        Array.from({ length: 10000 }, (_, i) => ({
          ...BUILTIN_WORKS[0]!,
          id: String(i),
          title: String(i),
        })),
        [BUILTIN_WORKS[1]!],
      ),
    ).toThrow();
  });
  it("retrieves original passages by literal and scene keywords and keeps unmatched searches empty", async () => {
    const works = await parseLibraryImport(JSON.stringify([raw]), "poems.json");
    expect(searchLibrary(works, "夜雨")[0]?.excerpt).toBe("夜雨思乡。");
    expect(searchLibrary(works, "江上孤舟", true)[0]?.work.id).toBe(
      works[0]!.id,
    );
    expect(
      searchLibrary(BUILTIN_WORKS, "思乡", true).some(
        (hit) => hit.work.title === "静夜思",
      ),
    ).toBe(true);
    expect(searchLibrary(works, "不存在的题名")).toEqual([]);
  });
  it("restores snapshots including empty original drafts and rejects corrupt history", () => {
    const draft = {
      text: "",
      rhymeBook: "pingshui",
      genreHint: "auto",
      formHint: "auto",
    };
    const row = {
      id: "one",
      at: "2026-10-21T00:00:00Z",
      before: draft,
      after: { ...draft, text: "山月。" },
      note: "首次录入",
    };
    expect(parseNotebook({ version: 1, entries: [row] })[0]?.before.text).toBe(
      "",
    );
    expect(() => parseNotebook({ version: 1, entries: [row, row] })).toThrow();
    expect(() =>
      parseNotebook({ version: 1, entries: [{ ...row, at: "bad" }] }),
    ).toThrow();
  });
  it("applies edits only to matching spans, including astral text offsets", () => {
    const tokens = [
      { tokenId: "l1c1", startUtf16: 2, endUtf16: 3, line: 1 },
    ] as AnnotatedToken[];
    const edit = {
      startTokenId: "l1c1",
      endTokenId: "l1c1",
      original: "月",
      replacement: "江",
      reason: "test",
      tradeoff: "test",
    };
    expect(applyRevision("😀月。", edit, tokens)).toBe("😀江。");
    expect(() => applyRevision("😀山。", edit, tokens)).toThrow();
    expect(changedSpan("山月", "山江")).toEqual({
      prefix: "山",
      removed: "月",
      added: "江",
      suffix: "",
    });
  });
});
