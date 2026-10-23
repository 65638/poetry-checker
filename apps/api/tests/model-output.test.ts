import { describe, expect, it } from "vitest";
import { parseModelOutput } from "../src/model-output.js";

const envelope = (content: unknown, finish_reason = "stop") => ({
  choices: [{ finish_reason, message: { content } }],
});
describe("model JSON envelope parsing", () => {
  it.each([
    '{"overview":"江上\\n孤舟"}',
    '\ufeff  {"overview":"江上\\n孤舟"}  ',
    '```json\n{"overview":"江上\\n孤舟"}\n```',
    '```JSON\r\n{"overview":"江上\\n孤舟"}\r\n```',
    '```\n{"overview":"江上\\n孤舟"}\n```',
  ])(
    "preserves complete content with optional surrounding code fences %#",
    (text) => {
      expect(parseModelOutput(envelope(text))).toEqual({
        overview: "江上\n孤舟",
      });
    },
  );
  it.each([
    '解释如下：{"overview":"不应猜取"}',
    '```json\n{"overview":"不完整"}',
    "```json\n{}\n```\n附注",
    "```json\n{}\n```\n```json\n{}\n```",
    '{"overview":"截断',
    '{"overview":"多余逗号",}',
    '<think>推理内容</think>{"overview":"不猜取"}',
  ])(
    "rejects ambiguous, incomplete or malformed output without repairing facts %#",
    (text) => {
      expect(() => parseModelOutput(envelope(text))).toThrow("格式异常");
    },
  );
  it("rejects truncated completions even if their JSON happens to close", () => {
    expect(() => parseModelOutput(envelope("{}", "length"))).toThrow(
      "长度上限",
    );
    expect(() => parseModelOutput(envelope("{}", "content_filter"))).toThrow(
      "没有提供",
    );
  });
  it.each([
    null,
    {},
    { choices: [] },
    { choices: [null] },
    envelope(null),
    envelope(" ".repeat(40001)),
  ])("gives readable incomplete-message errors %#", (value) => {
    expect(() => parseModelOutput(value)).toThrow(/完整/);
  });
});
