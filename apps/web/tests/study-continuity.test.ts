import { describe, expect, it } from "vitest";
import type { PoetryAssistantRequest } from "@poetry/contracts";
import { canKeepStudyAnswer } from "../src/app/studyContinuity";

const input: Extract<PoetryAssistantRequest, { task: "critique" }> = {
  task: "critique",
  text: "空山不见人，但闻人语响。",
  rhymeBook: "pingshui",
  direction: "meaning",
  mode: "reading",
  question: "声音与静寂的关系？",
};
describe("readable prior answers without changed-source leakage", () => {
  it("keeps comparison answers only for identical left/right sources and version intent", () => {
    const pair = {
      task: "compare" as const,
      left: "空山不见人。",
      right: "白日依山尽。",
      question: "如何写景？",
    };
    expect(canKeepStudyAnswer(pair, { ...pair, question: "结尾如何？" })).toBe(
      true,
    );
    expect(
      canKeepStudyAnswer(pair, { ...pair, left: pair.right, right: pair.left }),
    ).toBe(false);
    expect(canKeepStudyAnswer(pair, { ...pair, right: "黄河入海流。" })).toBe(
      false,
    );
    const revision = {
      beforeLabel: "初稿",
      afterLabel: "二稿",
      intention: "保留原意",
    };
    expect(canKeepStudyAnswer(pair, { ...pair, revision })).toBe(false);
    expect(
      canKeepStudyAnswer(
        { ...pair, revision },
        { ...pair, revision, question: "改得好吗？" },
      ),
    ).toBe(true);
    expect(
      canKeepStudyAnswer(
        { ...pair, revision },
        { ...pair, revision: { ...revision, intention: "改换主题" } },
      ),
    ).toBe(false);
  });
  it("allows another question about the same text and formal context", () => {
    expect(
      canKeepStudyAnswer(input, { ...input, question: "请谈谈意象。" }),
    ).toBe(true);
    expect(
      canKeepStudyAnswer(input, {
        ...input,
        question: "请解释刚才的说法。",
        followUp: {
          textHash: "a".repeat(64),
          rhymeBook: input.rhymeBook,
          mode: input.mode,
          direction: input.direction,
          turns: [{ question: input.question, answer: "旧回答" }],
        },
      }),
    ).toBe(true);
  });
  it("rejects changed poem, mode, book, direction, rule context and other task types", () => {
    for (const next of [
      { ...input, text: "白日依山尽" },
      { ...input, mode: "writing" as const },
      { ...input, rhymeBook: "xinyun" as const },
      { ...input, direction: "sound" as const },
      {
        ...input,
        prosodyContext: { format: "五绝", templateId: null, issues: [] },
      },
      { task: "compare" as const, left: input.text, right: "白日依山尽" },
    ])
      expect(canKeepStudyAnswer(input, next)).toBe(false);
    expect(canKeepStudyAnswer(null, input)).toBe(false);
  });
});
