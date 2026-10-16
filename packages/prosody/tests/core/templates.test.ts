import { describe, expect, it } from "vitest";
import {
  getTemplates,
  matchTemplatesCore,
  evaluateProsodyCore,
  ProsodyNotImplementedError,
} from "../../src/core/index.js";
import { makeFixture } from "../../../contracts/tests/fixtures.js";

describe("整诗模板", () => {
  it("四体共十六套，ID 唯一", () => {
    const templates = getTemplates();
    expect(templates).toHaveLength(16);
    expect(new Set(templates.map((t) => t.id)).size).toBe(16);
  });
  it("起式按第二字判定；五七言对应起式不同", () => {
    expect(
      getTemplates("wujue").find((t) => t.id === "wujue-ze-unrhymed")
        ?.lineTypes,
    ).toEqual(["A", "B", "C", "D"]);
    expect(
      getTemplates("qijue").find((t) => t.id === "qijue-ping-unrhymed")
        ?.lineTypes,
    ).toEqual(["A", "B", "C", "D"]);
    expect(
      getTemplates("wulv").find((t) => t.id === "wulv-ping-rhymed")?.lineTypes,
    ).toEqual(["B", "D", "A", "B", "C", "D", "A", "B"]);
  });
  it("首句韵与偶数句正确，返回结果相互独立", () => {
    expect(
      getTemplates("qilv").find((t) => t.firstLineRhymes)?.requiredRhymeLines,
    ).toEqual([1, 2, 4, 6, 8]);
    expect(getTemplates("wujue")[0]?.requiredRhymeLines).toEqual([2, 4]);
    const first = getTemplates();
    first[0]!.lineTypes[0] = "D";
    expect(getTemplates()[0]!.lineTypes[0]).toBe("A");
  });
  it("未知关键位不算吻合；尚未实现特征保持 null", () => {
    const poem = makeFixture().poem;
    for (const token of poem.tokens) {
      token.possibleTones = [];
      token.toneStatus = "unknown";
    }
    const candidates = matchTemplatesCore({
      poem,
      formHint: "wujue",
      ruleSet: "teaching-v1",
    });
    expect(candidates).toHaveLength(4);
    expect(
      candidates.every(
        (c) =>
          c.score === null &&
          c.evaluatedKeyRate === 0 &&
          c.features.rhymeFit === null,
      ),
    ).toBe(true);
  });
  it("未实现完整判定时明确报错，不用空报告伪装通过", () => {
    expect(() =>
      evaluateProsodyCore({
        poem: makeFixture().poem,
        candidates: [],
        selectedTemplateId: null,
        applicability: "applicable",
        ruleSet: "teaching-v1",
      }),
    ).toThrow(ProsodyNotImplementedError);
  });
});
