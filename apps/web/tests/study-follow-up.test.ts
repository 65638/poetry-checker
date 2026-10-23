import { describe, expect, it } from "vitest";
import {
  PoetryAssistantRequestSchema,
  type PoetryAssistantResponse,
} from "@poetry/contracts";
import { buildStudyFollowUp } from "../src/app/followUpRequest";
import { sha256Hex } from "../src/utils/sha256";
import {
  createStudyEntry,
  parseStudyArchive,
  studyArchive,
  studyText,
} from "../src/app/studyArchive";
import { PoetryResultCache } from "../src/app/poetryResultCache";

const original = PoetryAssistantRequestSchema.parse({
  task: "critique",
  text: "空山不见人，但闻人语响。",
  rhymeBook: "pingshui",
  mode: "reading",
  direction: "meaning",
});
const responseFor = (
  input: typeof original,
  overview = "山静，人声更显幽深。",
): Extract<PoetryAssistantResponse, { task: "critique" }> => ({
  task: "critique",
  provider: "deepseek",
  model: "controlled-test",
  inputHash: sha256Hex(JSON.stringify(input)),
  notice: "受控测试",
  result: { overview, strengths: [], revisions: [] },
});
const detailedResponse = (
  input: typeof original,
): Extract<PoetryAssistantResponse, { task: "critique" }> => ({
  ...responseFor(input),
  result: {
    overview: "总评",
    strengths: ["“空山”与“人语”形成动静对照。"],
    revisions: [
      {
        startTokenId: "l1c1",
        endTokenId: "l1c1",
        original: "空",
        replacement: "幽",
        reason: "让空间更显深远，也照应全诗的静谧氛围。",
        tradeoff: "画面更浓，但会削弱原句的开阔感。",
      },
    ],
  },
});
describe("follow-up ownership and durable discussion context", () => {
  it("keeps the source and options, bounds history to three turns and does not mutate earlier inputs", () => {
    let input = original;
    for (let index = 0; index < 5; index++)
      input = buildStudyFollowUp(
        input,
        responseFor(input, `回答${index}`),
        `问题${index}`,
      );
    expect(input.task).toBe("critique");
    if (input.task !== "critique") throw new Error("invalid test task");
    expect(input.followUp?.turns.map((turn) => turn.answer)).toEqual([
      "回答2",
      "回答3",
      "回答4",
    ]);
    expect(input.followUp?.turns.map((turn) => turn.question)).toEqual([
      "问题1",
      "问题2",
      "问题3",
    ]);
    expect(input.text).toBe("空山不见人，但闻人语响。");
    expect(input.mode).toBe("reading");
    expect(original).not.toHaveProperty("followUp");
  });
  it("rejects a prior answer belonging to another request and enforces question length", () => {
    expect(() =>
      buildStudyFollowUp(
        original,
        { ...responseFor(original), inputHash: "b".repeat(64) },
        "继续",
      ),
    ).toThrow("不对应");
    for (const question of [" ", "问".repeat(241)])
      expect(() =>
        buildStudyFollowUp(original, responseFor(original), question),
      ).toThrow();
  });
  it("carries bounded strengths and revision reasons into the next question", () => {
    const next = buildStudyFollowUp(
      original,
      detailedResponse(original),
      "为什么换这个字？",
    );
    expect(next.followUp?.turns[0]).toMatchObject({
      answer: "总评",
      details: expect.stringContaining("原因：让空间更显深远"),
    });
    expect(next.followUp?.turns[0]?.details ?? "").toContain("取舍：画面更浓");
    const entry = createStudyEntry(next, responseFor(next));
    expect(
      parseStudyArchive(JSON.stringify(studyArchive([entry])))[0]?.input,
    ).toEqual(next);
    expect(studyText(entry)).toContain("原因：让空间更显深远");
    expect(studyText(entry, { includeHistory: false })).not.toContain(
      "原因：让空间更显深远",
    );
    const alternative = detailedResponse(original);
    alternative.result.revisions[0]!.reason = "另一种改字依据。";
    const different = buildStudyFollowUp(
      original,
      alternative,
      "为什么换这个字？",
    );
    const cache = new PoetryResultCache();
    cache.set(next, responseFor(next));
    expect(cache.get(different)).toBeNull();
  });
  it("marks clipped reasons explicitly without cutting replacement text or surrogate pairs", () => {
    const answer = detailedResponse(original);
    answer.result.strengths = Array(5).fill("𠀀".repeat(800));
    const edit = answer.result.revisions[0]!;
    answer.result.revisions = Array.from({ length: 6 }, () => ({
      ...edit,
      original: "𠀀".repeat(20),
      replacement: "𠀁".repeat(20),
      reason: "原" + "𠀂".repeat(799),
      tradeoff: "取".repeat(1600),
    }));
    answer.result.revisionNotice = "校".repeat(400);
    const next = buildStudyFollowUp(original, answer, "为什么？");
    const turn = next.followUp!.turns[0]!;
    expect(turn.detailsTruncated).toBe(true);
    expect(turn.details!.length).toBeLessThanOrEqual(6400);
    expect(turn.details).toContain("𠀁".repeat(20));
    expect(turn.details).toContain("…（摘录）");
    expect(() => encodeURIComponent(turn.details!)).not.toThrow();
    expect(studyText(createStudyEntry(next, responseFor(next)))).toContain(
      "建议摘录（较长理由有所省略）",
    );
    expect(answer.result.revisions[0]!.reason).toHaveLength(1599);
  });
  it("archives and shares discussion context while caching different prior answers independently", () => {
    const first = buildStudyFollowUp(
      original,
      responseFor(original, "不同理解甲"),
      "有什么依据？",
    );
    const second = buildStudyFollowUp(
      original,
      responseFor(original, "不同理解乙"),
      "有什么依据？",
    );
    const answer = responseFor(first);
    const cache = new PoetryResultCache();
    cache.set(first, answer);
    expect(cache.get(second)).toBeNull();
    const entry = createStudyEntry(first, answer);
    expect(parseStudyArchive(JSON.stringify(studyArchive([entry])))[0]).toEqual(
      entry,
    );
    expect(studyText(entry)).toContain("追问背景（此前的 AI 回答，仅供参考）");
    expect(studyText(entry)).toContain("不同理解甲");
    expect(studyText(entry)).toContain("回应你的问题");
    expect(studyText(entry)).not.toMatch(/textHash|followUp|pingshui/);
    const concise = studyText(entry, { includeHistory: false });
    expect(concise).toContain("有什么依据？");
    expect(concise).toContain(
      answer.task === "critique" ? answer.result.overview : "",
    );
    expect(concise).not.toContain("不同理解甲");
    expect(concise).not.toContain("追问背景");
    expect(
      parseStudyArchive(JSON.stringify(studyArchive([entry])))[0]!.input,
    ).toEqual(first);
  });
});
