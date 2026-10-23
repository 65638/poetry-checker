import { describe, expect, it } from "vitest";
import { type PoetryAssistantResponse } from "@poetry/contracts";
import type { InputDraft } from "../src/view-contract";
import type { NotebookEntry } from "../src/app/notebook";
import {
  draftComparisonChoices,
  buildDraftComparison,
} from "../src/app/draftComparisonRequest";
import {
  createStudyEntry,
  parseStudyArchive,
  studyArchive,
  studyText,
} from "../src/app/studyArchive";
import { PoetryResultCache } from "../src/app/poetryResultCache";
import { sha256Hex } from "../src/utils/sha256";

const draft = (text: string): InputDraft => ({
  text,
  rhymeBook: "pingshui",
  genreHint: "auto",
  formHint: "auto",
});
const before = draft("空山不见人，但闻人语响。");
const after = draft("空山不见人，犹闻人语响。");
const entries: NotebookEntry[] = [
  {
    id: "one",
    at: "2026-10-23T10:00:00Z",
    before,
    after,
    note: "试着保留回声",
  },
];

describe("revision comparison snapshots", () => {
  it("keeps current and saved texts immutable and deduplicates unchanged rule settings", () => {
    const saved = JSON.stringify(entries);
    const choices = draftComparisonChoices(
      { ...after, rhymeBook: "xinyun" },
      entries,
    );
    expect(choices).toHaveLength(2);
    expect(choices[0]!.label).toBe("当前稿");
    const request = buildDraftComparison(
      choices[1]!,
      choices[0]!,
      "  保留回声  ",
    );
    expect(request).toMatchObject({
      task: "compare",
      left: before.text,
      right: after.text,
      revision: { intention: "保留回声" },
    });
    expect(JSON.stringify(entries)).toBe(saved);
    expect(() => buildDraftComparison(choices[0]!, choices[0]!, "")).toThrow(
      "文字相同",
    );
    expect(() =>
      buildDraftComparison(choices[1]!, choices[0]!, "字".repeat(801)),
    ).toThrow();
  });
  it("archives exact versions and intent, separates ordinary comparison caches and shares readable labels", () => {
    const choices = draftComparisonChoices(after, entries);
    const input = buildDraftComparison(choices[1]!, choices[0]!, "保留回声");
    const response: PoetryAssistantResponse = {
      task: "compare",
      provider: "deepseek",
      model: "controlled",
      inputHash: sha256Hex(JSON.stringify(input)),
      notice: "仅测试",
      result: {
        overview: "但闻强调听觉转折，犹闻延续声音。",
        aspects: [{ name: "语气", left: "转折", right: "延续" }],
      },
    };
    const entry = createStudyEntry(input, response);
    expect(entry.title).toBe("改稿对照");
    expect(parseStudyArchive(JSON.stringify(studyArchive([entry])))).toEqual([
      entry,
    ]);
    const share = studyText(entry);
    for (const text of [
      before.text,
      after.text,
      "修改意图",
      "保留回声",
      "旧稿：转折",
      "新稿：延续",
      "不作合律判断",
    ])
      expect(share).toContain(text);
    expect(share).not.toMatch(/两诗对读|inputHash|beforeLabel/);
    const cache = new PoetryResultCache();
    cache.set(input, response);
    expect(
      cache.get({ task: "compare", left: input.left, right: input.right }),
    ).toBeNull();
    expect(
      cache.get({
        ...input,
        revision: { ...input.revision!, intention: "突出转折" },
      }),
    ).toBeNull();
    expect(() =>
      createStudyEntry({ ...input, right: before.text }, response),
    ).toThrow("不对应");
  });
});
