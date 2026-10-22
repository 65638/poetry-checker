import { describe, expect, it } from "vitest";
import {
  PoetryAssistantRequestSchema,
  type PoetryAssistantResponse,
} from "@poetry/contracts";
import { sha256Hex } from "../src/utils/sha256";
import {
  createStudyEntry,
  mergeStudyEntries,
  parseStudyArchive,
  studyArchive,
  studyText,
} from "../src/app/studyArchive";

const input = PoetryAssistantRequestSchema.parse({
  task: "critique",
  text: "白日依山尽，黄河入海流。",
  rhymeBook: "pingshui",
  direction: "meaning",
  mode: "writing",
});
const response: PoetryAssistantResponse = {
  task: "critique",
  provider: "deepseek",
  model: "controlled-test",
  inputHash: sha256Hex(JSON.stringify(input)),
  notice: "参考",
  result: {
    overview: "原句气象开阔，保留原意。",
    strengths: ["动静相映。"],
    revisions: [
      {
        startTokenId: "l1c1",
        endTokenId: "l1c1",
        original: "白",
        replacement: "晓",
        reason: "受控示例，非文学结论。",
        tradeoff: "将日暮变为清晨，会改变原意。",
      },
    ],
  },
};
const entry = () =>
  createStudyEntry(input, response, "暮色一篇", "2026-10-23T00:00:00Z");
describe("durable study snapshots and reader-facing sharing", () => {
  it("preserves the exact reader question in saved evidence and share text", () => {
    const asked = PoetryAssistantRequestSchema.parse({
      ...input,
      question: "转折是否自然？",
    });
    const answer = { ...response, inputHash: sha256Hex(JSON.stringify(asked)) };
    const saved = createStudyEntry(asked, answer);
    expect(studyText(saved)).toContain("研读问题\n转折是否自然？");
    expect(
      parseStudyArchive(JSON.stringify(studyArchive([saved])))[0]!.input,
    ).toEqual(asked);
    expect(() =>
      createStudyEntry(
        PoetryAssistantRequestSchema.parse({
          ...asked,
          question: "另外一个问题",
        }),
        answer,
      ),
    ).toThrow("不对应");
  });
  it("keeps formal rule context in a separate share section without swallowing literary advice", () => {
    const saved = createStudyEntry(input, {
      ...response,
      result: {
        ...response.result,
        ruleReview: {
          summary: "格律依据仅作条件比较。",
          reference: "五言四句；平起；首句入韵",
          checks: ["第1句第1字「白」：待确认"],
        },
      },
    });
    const text = studyText(saved);
    expect(text).toContain(`通篇观照\n${response.result.overview}`);
    expect(text).toContain("格律依据\n格律依据仅作条件比较。");
    expect(text).toContain("• 第1句第1字「白」：待确认");
    expect(text).not.toContain("ruleReview");
  });
  it("round-trips the original request and successful response without reinterpreting the poem", () => {
    const saved = entry();
    expect(parseStudyArchive(JSON.stringify(studyArchive([saved])))).toEqual([
      saved,
    ]);
    expect(saved.input).toEqual(input);
    expect(saved.response).toEqual(response);
  });
  it("copies the original, reasons and tradeoffs without internal hashes, token IDs or enum names", () => {
    const text = studyText(entry());
    expect(text).toContain("白日依山尽，黄河入海流。");
    expect(text).toContain("第1句第1字起");
    expect(text).toContain("“白” → “晓”");
    expect(text).toContain("会改变原意");
    expect(text).toContain("平水韵");
    expect(text).not.toMatch(/inputHash|l1c1|pingshui|controlled-test|"task"/u);
  });
  it("rejects a response belonging to different text", () => {
    expect(() =>
      createStudyEntry(
        {
          ...input,
          task: "critique",
          text: "另一首诗",
          rhymeBook: "pingshui",
          direction: "meaning",
          mode: "writing",
        },
        response,
      ),
    ).toThrow("不对应");
  });
  it("rejects a tampered archived result and preserves the caller's original bytes", () => {
    const saved = entry();
    const raw = JSON.stringify(studyArchive([saved])).replace(
      "气象开阔",
      "完全合律",
    );
    expect(() => parseStudyArchive(raw)).toThrow("原记录已保留");
    expect(saved.response).toEqual(response);
  });
  it("deduplicates the same advice saved twice but retains a genuinely different rerun", () => {
    const saved = entry();
    const later = createStudyEntry(
      input,
      response,
      "另一个标题",
      "2026-10-23T00:01:00Z",
    );
    expect(mergeStudyEntries([saved], [later])).toEqual([saved]);
    const changed = createStudyEntry(input, {
      ...response,
      result: { ...response.result, overview: "另一份建议。" },
    });
    expect(mergeStudyEntries([saved], [changed])).toHaveLength(2);
  });
  it("preserves both complete poems in a comparison and rejects mismatched task output", () => {
    const pair = PoetryAssistantRequestSchema.parse({
      task: "compare",
      left: "白日依山尽。",
      right: "海上生明月。",
    });
    const comparison: PoetryAssistantResponse = {
      task: "compare",
      provider: "zhipu",
      model: "controlled",
      inputHash: sha256Hex(JSON.stringify(pair)),
      notice: "参考",
      result: {
        overview: "两首气象不同。",
        aspects: [{ name: "意象", left: "落日", right: "明月" }],
      },
    };
    const text = studyText(createStudyEntry(pair, comparison));
    expect(text).toContain("左诗\n白日依山尽。");
    expect(text).toContain("右诗\n海上生明月。");
    expect(text).toContain("意象\n左诗：落日\n右诗：明月");
    expect(() => createStudyEntry(pair, response)).toThrow("不对应");
  });
  it("refuses overflow instead of silently evicting saved studies", () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      createStudyEntry(input, {
        ...response,
        result: { ...response.result, overview: `第${index}份评议` },
      }),
    );
    expect(() => mergeStudyEntries(rows, [entry()])).toThrow("60份");
    expect(rows).toHaveLength(60);
  });
});
