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
