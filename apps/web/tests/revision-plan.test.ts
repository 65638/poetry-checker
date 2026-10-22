import { describe, expect, it } from "vitest";
import type {
  AnnotatedPoem,
  AnnotatedToken,
  Revision,
} from "@poetry/contracts";
import { planRevision } from "../src/app/revisionPlan";
import { loadMockScenario } from "./fixtures";

function poem(originalText: string): AnnotatedPoem {
  let offset = 0,
    line = 1,
    column = 0;
  const tokens: AnnotatedToken[] = [];
  for (const text of originalText) {
    if (/\p{Script=Han}|〇/u.test(text)) {
      column++;
      tokens.push({
        ...loadMockScenario("pass").poem.tokens[0]!,
        text,
        tokenId: `l${line}c${column}`,
        line,
        column,
        startUtf16: offset,
        endUtf16: offset + text.length,
      });
    }
    if (text === "\n") {
      line++;
      column = 0;
    }
    offset += text.length;
  }
  return { ...loadMockScenario("pass").poem, originalText, tokens };
}
function edit(
  start: string,
  original: string,
  replacement: string,
  end = start,
): Revision {
  return {
    startTokenId: start,
    endTokenId: end,
    original,
    replacement,
    reason: "受控试读映射测试",
    tradeoff: "非文学建议",
  };
}

describe("whole-line revision previews", () => {
  it("includes earlier length changes and replaces only the same original span", () => {
    const input = poem("山高水远。\n月明。"),
      first = edit("l1c1", "山", "群山");
    const prior = [first];
    const snapshot = structuredClone({ input, prior });
    const next = planRevision(
      input,
      "群山高水远。\n月明。",
      prior,
      edit("l1c4", "远", "长"),
    );
    expect(next).toMatchObject({
      text: "群山高水长。\n月明。",
      beforeLine: "群山高水远",
      afterLine: "群山高水长",
      beforeCount: 5,
      afterCount: 5,
      line: 1,
    });
    const replacement = planRevision(
      input,
      next.text,
      next.edits,
      edit("l1c1", "山", "远山"),
    );
    expect(replacement.text).toBe("远山高水长。\n月明。");
    expect(replacement.edits).toHaveLength(2);
    expect({ input, prior }).toEqual(snapshot);
  });
  it("keeps UTF16 offsets after preceding lines, emoji and supplementary Han", () => {
    const input = poem("🌙山远。\n𠀀月明。"),
      first = edit("l1c1", "山", "万重山");
    const next = planRevision(
      input,
      "🌙万重山远。\n𠀀月明。",
      [first],
      edit("l2c1", "𠀀", "清"),
    );
    expect(next).toMatchObject({
      text: "🌙万重山远。\n清月明。",
      beforeLine: "𠀀月明",
      afterLine: "清月明",
      beforeCount: 3,
      afterCount: 3,
      line: 2,
    });
  });
  it("counts real characters and handles changes at both boundaries", () => {
    const input = poem("山高水远。");
    const next = planRevision(
      input,
      input.originalText,
      [],
      edit("l1c1", "山高水远", "𠀀山长", "l1c4"),
    );
    expect(next).toMatchObject({
      beforeLine: "山高水远",
      afterLine: "𠀀山长",
      beforeCount: 4,
      afterCount: 3,
    });
  });
  it("rejects stale manual drafts, overlapping edits and foreign positions", () => {
    const input = poem("山高水远。"),
      prior = edit("l1c1", "山高", "群山", "l1c2");
    expect(() =>
      planRevision(input, "山低水远。", [], edit("l1c4", "远", "长")),
    ).toThrow("手动改动");
    expect(() =>
      planRevision(input, "群山水远。", [prior], edit("l1c2", "高", "低")),
    ).toThrow("重叠");
    expect(() =>
      planRevision(input, input.originalText, [], edit("l8c1", "远", "长")),
    ).toThrow("原文已变化");
  });
});
