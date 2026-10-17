import { describe, expect, it } from "vitest";
import { AnnotatedPoemSchema } from "@poetry/contracts";
import {
  checkCommonRhyme,
  checkTonePossibilities,
  matchTemplates,
} from "../../src/index.js";
import type { RhymeDomain } from "../../src/index.js";
import { makeAnnotatedPoem, makeSyntheticPoem, overrideToken } from "./fixtures.js";
import type { SyntheticReadingSpec } from "./fixtures.js";

const domain = (options: SyntheticReadingSpec[], hasUnknown = false): RhymeDomain => ({
  hasUnknown,
  options,
});

describe("三值与未知（C-D1-04 / C-D1-05）", () => {
  it("C-D1-04：候选 P/Z 在只允许一种时 uncertain，不挑选合律读音", () => {
    expect(checkTonePossibilities(["P", "Z"], ["Z"])).toBe("uncertain");
    expect(checkTonePossibilities(["Z"], ["Z"])).toBe("pass");
    expect(checkTonePossibilities(["P"], ["Z"])).toBe("fail");
  });

  it("C-D1-04b：歧义必检位使可判位比例下降，但不计为失败", () => {
    const clean = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    const poem = overrideToken(clean, "l1c2", {
      readings: [
        { tone: "P", groupIds: ["synthetic:group:P"] },
        { tone: "Z", groupIds: ["synthetic:group:Z"] },
      ],
    });
    expect(poem.tokens.find((token) => token.tokenId === "l1c2")?.toneStatus).toBe("ambiguous");

    const run = (input: typeof poem) =>
      matchTemplates({ poem: input, formHint: "wujue", ruleSet: "teaching-v1" }).find(
        (candidate) => candidate.id === "wujue-ze-unrhymed",
      );
    const cleanTop = run(clean);
    const top = run(poem);
    expect(cleanTop).toBeDefined();
    expect(top).toBeDefined();
    if (!cleanTop || !top) return;
    expect(cleanTop.evaluatedKeyRate).toBe(1);
    expect(top.features.toneFit).toBe(1);
    expect(top.evaluatedKeyRate).toBeLessThan(cleanTop.evaluatedKeyRate);
  });

  it("C-D1-05：无候选字位 uncertain，可判位比例下降，不算满分已知", () => {
    const clean = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    const poem = overrideToken(clean, "l1c2", { readings: [] });
    const token = poem.tokens.find((item) => item.tokenId === "l1c2");
    expect(token?.readingStatus).toBe("unknown");
    expect(token?.possibleTones).toEqual([]);
    expect(checkTonePossibilities([], ["Z"])).toBe("uncertain");

    const run = (input: typeof poem) =>
      matchTemplates({ poem: input, formHint: "wujue", ruleSet: "teaching-v1" }).find(
        (candidate) => candidate.id === "wujue-ze-unrhymed",
      );
    const cleanTop = run(clean);
    const top = run(poem);
    expect(cleanTop).toBeDefined();
    expect(top).toBeDefined();
    if (!cleanTop || !top) return;
    expect(top.features.toneFit).toBe(1);
    expect(top.evaluatedKeyRate).toBeLessThan(cleanTop.evaluatedKeyRate);
  });

  it("C-D1-05b：已知候选之外还有未知声调候选时整体 unknown，不用已知候选掩盖", () => {
    const clean = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    const poem = overrideToken(clean, "l1c2", {
      readings: [
        { tone: "P", groupIds: ["synthetic:group:P"] },
        { tone: null, groupIds: [] },
      ],
    });
    const token = poem.tokens.find((item) => item.tokenId === "l1c2");
    expect(token?.toneStatus).toBe("unknown");
    expect(token?.possibleTones).toEqual(["P"]);
    expect(token?.tone).toBeNull();
    expect(checkTonePossibilities(["P"], ["P"], true)).toBe("uncertain");

    const run = (input: typeof poem) =>
      matchTemplates({ poem: input, formHint: "wujue", ruleSet: "teaching-v1" }).find(
        (candidate) => candidate.id === "wujue-ze-unrhymed",
      );
    const cleanTop = run(clean);
    const top = run(poem);
    expect(cleanTop).toBeDefined();
    expect(top).toBeDefined();
    if (!cleanTop || !top) return;
    expect(top.evaluatedKeyRate).toBeLessThan(cleanTop.evaluatedKeyRate);
  });
});

describe("押韵公共归部反例（C-D1-06 / C-D1-07 / C-D1-08）", () => {
  it("C-D1-06：韵部集合两两相交但全体不相交，判 fail", () => {
    const result = checkCommonRhyme([
      domain([{ tone: "P", groupIds: ["synthetic:甲", "synthetic:乙"] }]),
      domain([{ tone: "P", groupIds: ["synthetic:乙", "synthetic:丙"] }]),
      domain([{ tone: "P", groupIds: ["synthetic:甲", "synthetic:丙"] }]),
    ]);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("no_common_group");
    expect(result.possibleCommonGroupIds).toEqual([]);
  });

  it("C-D1-07：声调与韵部来自不同候选时不拼接伪造可行读音", () => {
    const result = checkCommonRhyme([
      domain([
        { tone: "P", groupIds: ["synthetic:乙"] },
        { tone: "Z", groupIds: ["synthetic:甲"] },
      ]),
      domain([{ tone: "P", groupIds: ["synthetic:甲"] }]),
    ]);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("no_common_group");
  });

  it("C-D1-08：部分读法同韵 uncertain；缺字韵脚不能删掉后宣布同韵", () => {
    const partial = checkCommonRhyme([
      domain([
        { tone: "P", groupIds: ["synthetic:甲"] },
        { tone: "P", groupIds: ["synthetic:乙"] },
      ]),
      domain([{ tone: "P", groupIds: ["synthetic:甲"] }]),
    ]);
    expect(partial.status).toBe("uncertain");
    expect(partial.reason).toBe("reading_dependent");
    expect(partial.possibleCommonGroupIds).toEqual(["synthetic:甲"]);

    const missing = checkCommonRhyme([
      domain([{ tone: "P", groupIds: ["synthetic:甲"] }]),
      domain([], true),
    ]);
    expect(missing.status).toBe("uncertain");
    expect(missing.reason).toBe("unknown");
  });

  it("全部可行读法都能同韵才 pass；不同读法可共部也算通过", () => {
    const simple = checkCommonRhyme([
      domain([{ tone: "P", groupIds: ["synthetic:甲"] }]),
      domain([{ tone: "P", groupIds: ["synthetic:甲"] }]),
    ]);
    expect(simple.status).toBe("pass");
    expect(simple.possibleCommonGroupIds).toEqual(["synthetic:甲"]);

    const multi = checkCommonRhyme([
      domain([
        { tone: "P", groupIds: ["synthetic:甲"] },
        { tone: "P", groupIds: ["synthetic:乙"] },
      ]),
      domain([{ tone: "P", groupIds: ["synthetic:甲", "synthetic:乙"] }]),
    ]);
    expect(multi.status).toBe("pass");
    // 契约要求数组稳定排序：按 Unicode 码点升序（乙 U+4E59 在 甲 U+7532 之前）。
    expect(multi.possibleCommonGroupIds).toEqual(["synthetic:乙", "synthetic:甲"]);
  });

  it("明确异韵 fail；无韵脚 not_applicable", () => {
    expect(
      checkCommonRhyme([
        domain([{ tone: "P", groupIds: ["synthetic:甲"] }]),
        domain([{ tone: "P", groupIds: ["synthetic:先"] }]),
      ]).status,
    ).toBe("fail");
    expect(checkCommonRhyme([]).status).toBe("not_applicable");
  });
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe("输入不可变与结果稳定（C-D1-09）", () => {
  it("冻结输入重复执行 matchTemplates，输入不变、结果一致", () => {
    const poem = deepFreeze(makeSyntheticPoem(["A", "B", "C", "D"], 5));
    const snapshot = JSON.stringify(poem);
    const first = matchTemplates({ poem, formHint: "wujue", ruleSet: "teaching-v1" });
    const second = matchTemplates({ poem, formHint: "wujue", ruleSet: "teaching-v1" });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(poem)).toBe(snapshot);
  });

  it("冻结押韵域重复执行 checkCommonRhyme，输入不变、结果一致", () => {
    const domains = deepFreeze([
      domain([
        { tone: "P", groupIds: ["synthetic:甲"] },
        { tone: "P", groupIds: ["synthetic:乙"] },
      ]),
      domain([{ tone: "P", groupIds: ["synthetic:甲", "synthetic:乙"] }]),
    ]);
    const snapshot = JSON.stringify(domains);
    const first = checkCommonRhyme(domains);
    const second = checkCommonRhyme(domains);
    expect(first).toEqual(second);
    expect(JSON.stringify(domains)).toBe(snapshot);
  });
});

describe("独立 fixture 构造与位置映射", () => {
  it("补充平面汉字：UTF-16 区间能切回原字，样本通过 Schema", () => {
    const poem = makeAnnotatedPoem([
      [
        { text: "𠀀", tones: ["P"] },
        { text: "平", tones: ["P"] },
        { text: "仄", tones: ["Z"] },
        { text: "平", tones: ["P"] },
        { text: "仄", tones: ["Z"] },
      ],
    ]);
    expect(AnnotatedPoemSchema.parse(poem)).toEqual(poem);
    const tokens = poem.tokens;
    expect(tokens[0]?.startUtf16).toBe(0);
    expect(tokens[0]?.endUtf16).toBe(2);
    expect(tokens[1]?.startUtf16).toBe(2);
    expect(tokens[1]?.endUtf16).toBe(3);
    for (const token of tokens) {
      expect(poem.originalText.slice(token.startUtf16, token.endUtf16)).toBe(token.text);
    }
    expect(poem.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("跨行全局位置连续：换行占 1 个 UTF-16 单元", () => {
    const poem = makeAnnotatedPoem([
      [
        { text: "平", tones: ["P"] },
        { text: "仄", tones: ["Z"] },
      ],
      [{ text: "平", tones: ["P"] }],
    ]);
    const line2 = poem.tokens.find((token) => token.tokenId === "l2c1");
    expect(line2?.startUtf16).toBe(3);
    expect(poem.lines[1]?.tokenIds).toEqual(["l2c1"]);
  });

  it("合成候选自带明确来源标注，不冒充古籍", () => {
    const poem = makeSyntheticPoem(["A"], 5);
    for (const token of poem.tokens) {
      expect(token.reason).toContain("合成");
      for (const candidate of token.candidates) {
        expect(candidate.gloss).toContain("非真实韵书");
        expect(candidate.id).toMatch(/^synthetic:reading:/);
      }
    }
  });
});

