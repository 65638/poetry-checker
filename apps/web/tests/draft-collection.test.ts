import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT } from "../src/app/draftPersistence";
import {
  draftCollectionArchive,
  draftIdentity,
  mergeDraftCollections,
  parseDraftCollection,
  savePoemDraft,
  suggestedDraftTitle,
} from "../src/app/draftCollection";
const draft = { ...EMPTY_DRAFT, text: "夜雨过空山，清泉石上还。" };
const saved = () =>
  savePoemDraft([], draft, "山居初稿", "one", "2026-10-23T00:00:00Z");
describe("named poem drafts", () => {
  it("preserves text and checking preferences across a versioned roundtrip", () => {
    const entries = savePoemDraft([], {
      ...draft,
      rhymeBook: "xinyun",
      formHint: "wujue",
    });
    expect(
      parseDraftCollection(JSON.stringify(draftCollectionArchive(entries))),
    ).toEqual(entries);
    expect(parseDraftCollection(null)).toEqual([]);
    expect(suggestedDraftTitle(draft)).toBe("夜雨过空山");
  });
  it("does not duplicate unchanged drafts but preserves changed settings and text", () => {
    const entries = saved();
    expect(savePoemDraft(entries, draft, "不同标题")).toBe(entries);
    const next = savePoemDraft(entries, { ...draft, rhymeBook: "xinyun" });
    expect(next).toHaveLength(2);
    expect(
      savePoemDraft(next, { ...draft, text: draft.text + "风起。" }),
    ).toHaveLength(3);
  });
  it("never mutates the caller's draft after saving", () => {
    const input = { ...draft };
    const entries = savePoemDraft([], input);
    input.text = "后来修改";
    expect(entries[0]?.draft.text).toBe(draft.text);
  });
  it("rejects empty, oversized and inconsistent form data", () => {
    expect(() => savePoemDraft([], EMPTY_DRAFT)).toThrow("先写几句");
    expect(() => savePoemDraft([], draft, " ")).toThrow("标题");
    expect(() =>
      savePoemDraft([], { ...draft, text: "字".repeat(2001) }),
    ).toThrow("原内容已保留");
    expect(() =>
      savePoemDraft([], { ...draft, genreHint: "ancient", formHint: "qilv" }),
    ).toThrow("原内容已保留");
    expect(() =>
      parseDraftCollection(
        JSON.stringify({ ...draftCollectionArchive(saved()), version: 2 }),
      ),
    ).toThrow("原内容已保留");
  });
  it("merges repeat backups without overwriting conflicting versions", () => {
    const entries = saved();
    expect(mergeDraftCollections(entries, entries)).toEqual(entries);
    expect(
      mergeDraftCollections(entries, [{ ...entries[0]!, id: "two" }]),
    ).toEqual(entries);
    expect(() =>
      mergeDraftCollections(entries, [{ ...entries[0]!, title: "改了标题" }]),
    ).toThrow("内容不同");
    expect(
      mergeDraftCollections(entries, [
        { ...entries[0]!, id: "two", title: "另一份命名" },
      ]),
    ).toHaveLength(2);
  });
  it("refuses overflow and duplicate IDs without removing a draft", () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      ...saved()[0]!,
      id: String(i),
      draft: { ...draft, text: `${draft.text}${i}` },
    }));
    expect(() => savePoemDraft(entries, draft)).toThrow("已满50篇");
    expect(() => mergeDraftCollections(entries, saved())).toThrow("超过50篇");
    expect(entries).toHaveLength(50);
    expect(() =>
      parseDraftCollection(
        JSON.stringify(draftCollectionArchive([...saved(), ...saved()])),
      ),
    ).toThrow("原内容已保留");
    expect(draftIdentity({ ...draft })).toBe(draftIdentity(draft));
  });
});
