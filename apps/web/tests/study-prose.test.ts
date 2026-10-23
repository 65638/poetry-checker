import { describe, expect, it } from "vitest";
import { studyProse } from "../src/app/studyProseText";
describe("readable AI prose without rewriting evidence", () => {
  it("keeps short and explicitly formatted answers intact", () => {
    for (const text of [
      "“月”在诗中只是一个意象。",
      "第一段。\n\n第二段。",
      "一段。\r\n第二行。",
      "句。".repeat(200) + "\n作者自行分行。",
    ])
      expect(studyProse(text)).toBe(text);
  });
  it("only adds paragraph breaks at sentence ends and preserves all source characters", () => {
    for (const text of [
      "“山林有声。”这句话仅用于排版测试，不是真实文献摘引。".repeat(15),
      "。" + "甲乙丙丁戊己庚辛壬癸。".repeat(30) + "无标点结尾",
      "长".repeat(1600),
    ]) {
      const formatted = studyProse(text);
      expect(formatted.replace(/\n/gu, "")).toBe(text);
      if (text.includes("。")) expect(formatted).toContain("\n\n");
      else expect(formatted).toBe(text);
    }
  });
});
