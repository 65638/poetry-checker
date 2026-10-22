import { describe, expect, it } from "vitest";
import type { LibraryWork } from "@poetry/contracts";
import {
  addExcerpt,
  excerptArchive,
  excerptText,
  findExcerptWork,
  mergeExcerpts,
  parseExcerpts,
} from "../src/app/excerpts";

const work: LibraryWork = {
  id: "sample",
  title: "测试诗",
  author: "测试作者",
  dynasty: "",
  paragraphs: ["山中一夜雨，树杪百重泉。", "测试第二段。"],
  source: "测试来源",
  sourceUrl: "https://example.com/poem",
  tags: [],
};
const make = (id = "a", paragraph = 0) =>
  addExcerpt([], work, paragraph, id, "2026-10-23T00:00:00Z")[0]!;
describe("excerpts preserve sources and private notes", () => {
  it("retains exact punctuation and source in a versioned roundtrip", () => {
    const entry = { ...make(), note: "我的感想" };
    expect(parseExcerpts(JSON.stringify(excerptArchive([entry])))).toEqual([
      entry,
    ]);
    expect(entry.text).toBe(work.paragraphs[0]);
    expect(parseExcerpts(null)).toEqual([]);
  });
  it("repeated collection preserves the existing note and ID", () => {
    const entries = [{ ...make(), note: "已有笔记" }];
    expect(addExcerpt(entries, work, 0, "b")).toBe(entries);
    expect(addExcerpt(entries, work, 1, "c")).toHaveLength(2);
  });
  it("keeps distinct editions and never substitutes another source", () => {
    const entry = make();
    const other = { ...work, sourceUrl: "https://example.com/edition2" };
    expect(addExcerpt([entry], other, 0, "b")).toHaveLength(2);
    expect(findExcerptWork(entry, [other])).toBeUndefined();
    expect(
      findExcerptWork(entry, [{ ...work, paragraphs: ["变动的正文"] }]),
    ).toBeUndefined();
    expect(
      findExcerptWork(entry, [
        { ...work, paragraphs: [...work.paragraphs].reverse() },
      ])?.id,
    ).toBe(work.id);
  });
  it("omits private notes from sharing but includes them in text export", () => {
    const entry = { ...make(), note: "私密感想" };
    expect(excerptText(entry)).toContain(work.sourceUrl);
    expect(excerptText(entry)).toContain("测试作者《测试诗》");
    expect(excerptText(entry)).not.toContain(entry.note);
    expect(excerptText(entry, true)).toContain(entry.note);
  });
  it("merges duplicates and preserves independently authored notes", () => {
    const entry = make();
    expect(mergeExcerpts([entry], [{ ...entry, id: "b" }])).toEqual([entry]);
    expect(
      mergeExcerpts([entry], [{ ...entry, id: "b", note: "不同笔记" }]),
    ).toHaveLength(2);
    expect(() => mergeExcerpts([entry], [{ ...entry, note: "冲突" }])).toThrow(
      "笔记或内容不同",
    );
  });
  it("rejects malformed archives and unsafe source URLs", () => {
    for (const value of [
      null,
      {},
      { ...excerptArchive([make()]), version: 2 },
      excerptArchive([make(), make()]),
      excerptArchive([{ ...make(), sourceUrl: "javascript:alert(1)" }]),
      excerptArchive([{ ...make(), note: "字".repeat(1001) }]),
    ]) {
      expect(() => parseExcerpts(JSON.stringify(value))).toThrow(
        "原记录已保留",
      );
    }
  });
  it("refuses overflowing collections without discarding existing entries", () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      ...make(String(i)),
      text: `测试第${i}条`,
    }));
    expect(() => addExcerpt(entries, work, 0)).toThrow("200条");
    expect(() => mergeExcerpts(entries, [make("extra")])).toThrow("200条");
    expect(entries).toHaveLength(200);
    expect(() => addExcerpt([], work, -1)).toThrow("重新摘录");
  });
});
