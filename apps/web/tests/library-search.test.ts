import { describe, expect, it } from "vitest";
import type { LibraryWork } from "@poetry/contracts";
import { searchLibrary, BUILTIN_WORKS } from "../src/app/library";
import { parseSearchQuery } from "../src/app/librarySearch";

const works: LibraryWork[] = [
  {
    id: "a",
    title: "静夜思",
    author: "李白",
    dynasty: "唐",
    paragraphs: ["床前明月光，疑是地上霜。", "举头望明月，低头思故乡。"],
    source: "测试",
    sourceUrl: null,
    tags: ["思乡"],
  },
  {
    id: "b",
    title: "赠汪伦",
    author: "李白",
    dynasty: "唐",
    paragraphs: ["李白乘舟将欲行，忽闻岸上踏歌声。"],
    source: "测试",
    sourceUrl: null,
    tags: ["送别"],
  },
  {
    id: "c",
    title: "山居秋暝",
    author: "王维",
    dynasty: "唐",
    paragraphs: ["明月松间照，清泉石上流。"],
    source: "测试",
    sourceUrl: null,
    tags: ["山林"],
  },
];
describe("library query conditions", () => {
  it("requires every keyword across author, title, and poem", () => {
    expect(searchLibrary(works, "李白 明月").map((h) => h.work.id)).toEqual([
      "a",
    ]);
    expect(searchLibrary(works, "唐 明月").map((h) => h.work.id)).toEqual([
      "a",
      "c",
    ]);
  });
  it("supports explicit fields and exclusions without modifying the corpus", () => {
    expect(
      searchLibrary(works, "作者:李白 -题名:静夜思").map((h) => h.work.id),
    ).toEqual(["b"]);
    expect(searchLibrary(works, "正文:李白").map((h) => h.work.id)).toEqual([
      "b",
    ]);
    expect(
      searchLibrary(works, "标签：山林 朝代:唐").map((h) => h.work.id),
    ).toEqual(["c"]);
    expect(searchLibrary(works, "-作者:李白").map((h) => h.work.id)).toEqual([
      "c",
    ]);
    expect(searchLibrary(works, '题名:"静夜思"')[0]?.work).toBe(works[0]);
  });
  it("keeps quoted phrases intact and unknown prefixes literal", () => {
    expect(
      parseSearchQuery('作者：李白 “明月 光” -题名:"静夜 思" unknown:word'),
    ).toEqual([
      { value: "李白", field: "作者", excluded: false },
      { value: "明月 光", excluded: false },
      { value: "静夜 思", field: "题名", excluded: true },
      { value: "unknown:word", excluded: false },
    ]);
  });
  it("returns original excerpts and refreshes the cache for replaced editions", () => {
    expect(searchLibrary(works, "低头")[0]?.excerpt).toBe(
      "举头望明月，低头思故乡。",
    );
    const edition = { ...works[0]!, paragraphs: ["床前看月光。"] };
    expect(searchLibrary([edition], "明月")).toEqual([]);
    expect(searchLibrary([edition], "看月")[0]?.excerpt).toBe("床前看月光。");
    expect(works[0]!.paragraphs[0]).toBe("床前明月光，疑是地上霜。");
  });
  it("retains empty-query order and semantic scene recall", () => {
    expect(searchLibrary(works, " ").map((h) => h.work.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(searchLibrary([], "月")).toEqual([]);
    expect(searchLibrary(BUILTIN_WORKS, "思乡", true).length).toBeGreaterThan(
      0,
    );
  });
  it("normalizes width and case for search while preserving the returned title", () => {
    const work = { ...works[0]!, title: "Poem Ａ１" };
    expect(searchLibrary([work], '题名:"poem a1"')[0]?.work.title).toBe(
      "Poem Ａ１",
    );
  });
});
