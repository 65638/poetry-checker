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
): PoetryAssistantResponse => ({
  task: "critique",
  provider: "deepseek",
  model: "controlled-test",
  inputHash: sha256Hex(JSON.stringify(input)),
  notice: "受控测试",
  result: { overview, strengths: [], revisions: [] },
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
