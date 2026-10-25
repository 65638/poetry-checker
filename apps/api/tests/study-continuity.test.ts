import { expect, it } from "vitest";
import { PoetryAssistantRequestSchema } from "@poetry/contracts";
import { buildApp } from "../src/server.js";
import { buildProsodyContext } from "../../web/src/features/critique.js";
import {
  canKeepStudyAnswer,
  studyContextKey,
} from "../../web/src/app/studyContinuity.js";
const input = {
  task: "critique" as const,
  rhymeBook: "pingshui" as const,
  direction: "meaning" as const,
  mode: "reading" as const,
  question: "声音与静寂的关系？",
};
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
