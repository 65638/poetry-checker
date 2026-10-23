import { describe, expect, it } from "vitest";
import {
  PoetryAssistantRequestSchema,
  type LibraryWork,
} from "@poetry/contracts";
import { passageQuestion } from "../src/app/passageQuestion";
import { readingSections } from "../src/app/library";

const work = (paragraphs: string[]): LibraryWork => ({
  id: "controlled-passages",
  title: "测试作品",
  author: "测试",
  dynasty: "",
  source: "受控测试",
  sourceUrl: null,
  tags: [],
  kind: "verse",
  paragraphs,
});
describe("passage questions retain actual source positions", () => {
  it("keeps a short poem as full context and quotes the selected paragraph", () => {
    const original = work([
      "空山不见人，但闻人语响。",
      "返景入深林，复照青苔上。",
    ]);
    const seed = passageQuestion(original, 1);
    expect(seed).toEqual({
      section: 0,
      question:
        "请结合全诗，解释原作第2段“返景入深林，复照青苔上。”的意思和表达作用。",
    });
  });
  it("locates repeated paragraphs by offset rather than the first matching words", () => {
    const original = work(Array(100).fill("山中有清风，月下有人归。"));
    const sections = readingSections(original);
    expect(sections.length).toBeGreaterThan(1);
    const seed = passageQuestion(original, 80);
    expect(seed.section).toBeGreaterThan(0);
    expect(seed.question).toContain("当前选段");
    expect(seed.question).toContain("第81段");
  });
  it("bounds supplementary characters using the request's UTF-16 limits without breaking glyphs", () => {
    const original = work(["𠀀".repeat(1500), "末段，。！！还有文字。"]);
    const sections = readingSections(original);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.flatMap((section) => section.paragraphs).join("")).toBe(
      original.paragraphs.join(""),
    );
    for (const section of sections) {
      const text = section.paragraphs.join("\n");
      expect(() => encodeURIComponent(text)).not.toThrow();
      expect(
        PoetryAssistantRequestSchema.safeParse({
          task: "critique",
          text,
          mode: "reading",
          direction: "meaning",
          rhymeBook: "pingshui",
        }).success,
      ).toBe(true);
    }
    const seed = passageQuestion(original, 0);
    expect(seed.question).toContain("开头");
    expect(seed.question.length).toBeLessThanOrEqual(240);
    expect(() => encodeURIComponent(seed.question)).not.toThrow();
    const last = passageQuestion(original, 1);
    expect(sections[last.section]!.paragraphs.join("\n")).toContain("末段，");
    expect(last.question).toContain("末段，。！！还有文字。");
  });
  it("refuses missing and noninteger paragraph references without guessing", () => {
    const original = work(["空山不见人。"]);
    for (const index of [-1, 1, 0.5, NaN])
      expect(() => passageQuestion(original, index)).toThrow();
  });
});
