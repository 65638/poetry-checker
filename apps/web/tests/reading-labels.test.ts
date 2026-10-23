import { describe, expect, it } from "vitest";
import {
  formatModernReading,
  readingExplanation,
} from "../src/app/readingLabels";
import { loadMockScenario } from "./fixtures";

describe("reader-facing pronunciation labels", () => {
  it.each([
    ["geng", 1, "gēng"],
    ["geng", 4, "gèng"],
    ["liu", 2, "liú"],
    ["gui", 4, "guì"],
    ["ou", 3, "ǒu"],
    ["lüe", 4, "lüè"],
    ["lv", 3, "lǚ"],
    ["nu:", 3, "nǚ"],
    ["ma", 5, "ma"],
    ["ma0", 5, "ma"],
    ["gèng", 4, "gèng"],
    ["Geng4", 4, "Gèng"],
    ["gēng", 4, "gēng · 第4声"],
    ["chang'an", 2, "chang'an · 第2声"],
    ["māmā", 1, "māmā · 第1声"],
    ["geng3", 4, "geng3 · 第4声"],
  ] as const)(
    "formats %s tone %s without inventing a reading",
    (pinyin, toneNumber, expected) => {
      expect(formatModernReading({ pinyin, toneNumber, evidenceIds: [] })).toBe(
        expected,
      );
    },
  );
  it("explains a locally known tone even when the particular reading is unsettled", () => {
    const token = structuredClone(loadMockScenario("pass").poem.tokens[0]!);
    token.selectionMethod = "unresolved";
    token.effectiveCandidateIds = ["a", "b"];
    token.toneStatus = "resolved";
    token.tone = "P";
    expect(readingExplanation(token)).toBe(
      "有2个候选读音，暂未选定；这些候选都为平声。",
    );
    expect(token.effectiveCandidateIds).toEqual(["a", "b"]);
  });
  it("keeps context meaning while removing internal candidate and rule IDs from the display", () => {
    const token = structuredClone(loadMockScenario("pass").poem.tokens[0]!);
    token.selectionMethod = "context_rule";
    token.reason =
      "命中语境规则 rule-id「更上」（进一步），选定候选 pingshui:更:qu:二十四敬";
    expect(readingExplanation(token)).toBe(
      "依据「更上」的用法（进一步）选择此读音。",
    );
    expect(token.reason).toContain("rule-id");
    token.selectionMethod = "model";
    token.reason = "GLM自动辨音（普通话参考 gèng）：表示进一步。";
    expect(readingExplanation(token)).toBe(
      "AI语境辨音（普通话参考 gèng）：表示进一步。",
    );
  });
});
