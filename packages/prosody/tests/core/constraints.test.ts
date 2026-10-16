import { describe, expect, it } from "vitest";
import {
  checkCommonRhyme,
  checkTonePossibilities,
} from "../../src/core/constraints.js";
import type { RhymeDomain } from "../../src/core/constraints.js";

const domain = (...groups: string[][]): RhymeDomain => ({
  hasUnknown: false,
  options: groups.map((groupIds) => ({ tone: "P", groupIds })),
});
describe("平仄候选三值判定", () => {
  it("部分满足不能任选读音通过", () => {
    expect(checkTonePossibilities(["P", "Z"], ["P"])).toBe("uncertain");
    expect(checkTonePossibilities(["P", "Z"], ["P", "Z"])).toBe("pass");
  });
  it("区分冲突、缺失和确定通过", () => {
    expect(checkTonePossibilities(["Z"], ["P"])).toBe("fail");
    expect(checkTonePossibilities([], ["P"])).toBe("uncertain");
    expect(checkTonePossibilities(["P"], ["P"], true)).toBe("uncertain");
    expect(checkTonePossibilities(["P"], ["P"])).toBe("pass");
  });
});
describe("所有韵脚的共同归部", () => {
  it("同韵通过，明确异韵失败", () => {
    expect(checkCommonRhyme([domain(["尤"]), domain(["尤"])]).status).toBe(
      "pass",
    );
    expect(checkCommonRhyme([domain(["尤"]), domain(["先"])]).status).toBe(
      "fail",
    );
  });
  it("两两相交不能代替全体相交", () => {
    expect(
      checkCommonRhyme([
        domain(["A", "B"]),
        domain(["B", "C"]),
        domain(["A", "C"]),
      ]).status,
    ).toBe("fail");
  });
  it("部分读法同韵时保留不确定", () => {
    expect(checkCommonRhyme([domain(["A"], ["B"]), domain(["A"])]).status).toBe(
      "uncertain",
    );
  });
  it("所有读法都能同韵才通过，不强求所有读法使用同一部", () => {
    const result = checkCommonRhyme([domain(["A"], ["B"]), domain(["A", "B"])]);
    expect(result.status).toBe("pass");
    expect(result.possibleCommonGroupIds).toEqual(["A", "B"]);
  });
  it("不能拼接某读音的平声与另一读音的韵部", () => {
    const first: RhymeDomain = {
      hasUnknown: false,
      options: [
        { tone: "P", groupIds: ["B"] },
        { tone: "Z", groupIds: ["A"] },
      ],
    };
    expect(checkCommonRhyme([first, domain(["A"])]).status).toBe("fail");
  });
  it("缺字不被排除，超出状态上限不自动通过", () => {
    expect(
      checkCommonRhyme([domain(["A"]), { hasUnknown: true, options: [] }])
        .status,
    ).toBe("uncertain");
    expect(checkCommonRhyme([domain(["A"], ["B"])], 1).reason).toBe(
      "candidate_limit",
    );
    expect(checkCommonRhyme([]).status).toBe("not_applicable");
  });
});
