import { describe, expect, it } from "vitest";
import {
  PoetryAssistantRequestSchema,
  type PoetryAssistantRequest,
} from "@poetry/contracts";
import {
  canKeepStudyAnswer,
  studyContextKey,
} from "../src/app/studyContinuity";
import { buildApp } from "../../api/src/server";
import { buildProsodyContext } from "../src/features/critique";

const input: Extract<PoetryAssistantRequest, { task: "critique" }> = {
  task: "critique",
  text: "空山不见人，但闻人语响。",
  rhymeBook: "pingshui",
  direction: "meaning",
  mode: "reading",
  question: "声音与静寂的关系？",
};
describe("readable prior answers without changed-source leakage", () => {
  it("真实鹿柴非空格律依据经过Schema排序后仍是同一上下文，不清掉旧回答或追问草稿", async () => {
    const app = buildApp({ readingAssistant: { apiKey: "" } });
    try {
      const text = "空山不见人，但闻人语响。返景入深林，复照青苔上。";
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload: {
          text,
          rhymeBook: "pingshui",
          genreHint: "auto",
          formHint: "auto",
          ruleSet: "teaching-v1",
          readingOverrides: [],
        },
      });
      expect(response.statusCode).toBe(200);
      const context = buildProsodyContext(response.json())!;
      expect(context.issues.length).toBeGreaterThan(0);
      const before = { ...input, text, prosodyContext: context };
      const normalized = PoetryAssistantRequestSchema.parse(before);
      if (normalized.task !== "critique") throw new Error("invalid test task");
      expect(before.prosodyContext).toEqual(normalized.prosodyContext);
      expect(JSON.stringify(before.prosodyContext)).not.toBe(
        JSON.stringify(normalized.prosodyContext),
      );
      expect(canKeepStudyAnswer(before, normalized)).toBe(true);
      // StudyFollowUp uses this compound identity, independently of the latest question.
      const identity = (value: typeof before) => [
        value.text,
        value.rhymeBook,
        value.mode,
        value.direction,
        value.prosodyContext,
      ];
      expect(studyContextKey(identity(before))).toBe(
        studyContextKey(
          identity({ ...before, prosodyContext: normalized.prosodyContext! }),
        ),
      );
      const changed = structuredClone(normalized);
      changed.prosodyContext!.issues[0]!.message += "实际依据有变化";
      expect(canKeepStudyAnswer(before, changed)).toBe(false);
      const reordered = structuredClone(normalized);
      reordered.prosodyContext!.issues.reverse();
      expect(canKeepStudyAnswer(before, reordered)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("UI规范键不改变数组顺序，也不修改传入对象", () => {
    const before = {
      right: { title: "右诗", part: 1 },
      left: { part: 2, title: "左诗" },
    };
    const snapshot = JSON.stringify(before);
    expect(studyContextKey(before)).toBe(
      studyContextKey({
        left: { title: "左诗", part: 2 },
        right: { part: 1, title: "右诗" },
      }),
    );
    expect(studyContextKey([1, 2])).not.toBe(studyContextKey([2, 1]));
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(studyContextKey(undefined)).not.toBe(studyContextKey(null));
  });
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
