import { describe, expect, it } from "vitest";
import { getTemplates, matchTemplates } from "../../src/index.js";
import {
  FORM_SHAPES,
  SEQUENCES,
  expectedCanonicalTones,
  expectedRhymeLines,
  expectedTemplateId,
  makeSyntheticPoem,
  startForWidth,
} from "./fixtures.js";
import type { FormId } from "./fixtures.js";

const FORM_IDS = ["wujue", "qijue", "wulv", "qilv"] as const;

// 手工核对的模板 ID 与顺序（按起式序列表）：七言起式按第二字，与五言名称相反。
const EXPECTED_ORDER: Record<FormId, string[]> = {
  wujue: ["wujue-ze-unrhymed", "wujue-ze-rhymed", "wujue-ping-unrhymed", "wujue-ping-rhymed"],
  qijue: ["qijue-ping-unrhymed", "qijue-ping-rhymed", "qijue-ze-unrhymed", "qijue-ze-rhymed"],
  wulv: ["wulv-ze-unrhymed", "wulv-ze-rhymed", "wulv-ping-unrhymed", "wulv-ping-rhymed"],
  qilv: ["qilv-ping-unrhymed", "qilv-ping-rhymed", "qilv-ze-unrhymed", "qilv-ze-rhymed"],
};

describe("C-D1-01：四体 16 套模板结构验收", () => {
  it("16 套模板 ID 全局唯一", () => {
    const templates = getTemplates();
    expect(templates).toHaveLength(16);
    expect(new Set(templates.map((template) => template.id)).size).toBe(16);
  });

  describe.each(FORM_IDS)("体式 %s", (formId) => {
    const shape = FORM_SHAPES[formId];

    it("四套起式齐全，ID 与枚举顺序确定", () => {
      const ids = getTemplates(formId).map((template) => template.id);
      expect(ids).toEqual(EXPECTED_ORDER[formId]);
    });

    it("句宽与句数符合体式", () => {
      for (const template of getTemplates(formId)) {
        expect(template.width).toBe(shape.width);
        expect(template.lineCount).toBe(shape.lineCount);
      }
    });

    it("句型序列、正格平仄与必韵句逐项对照手工表", () => {
      for (const sequence of SEQUENCES) {
        const id = expectedTemplateId(formId, sequence, shape.width);
        const template = getTemplates(formId).find((item) => item.id === id);
        expect(template, `缺少模板 ${id}`).toBeDefined();
        if (!template) continue;
        const lineTypes = sequence.lineTypes.slice(0, shape.lineCount);
        expect(template.lineTypes).toEqual(lineTypes);
        expect(template.canonicalTones).toEqual(
          expectedCanonicalTones(shape.width, lineTypes, shape.lineCount),
        );
        expect(template.requiredRhymeLines).toEqual(
          expectedRhymeLines(shape.lineCount, sequence.firstLineRhymes),
        );
      }
    });

    it("起式按第二字判定，不按第一字", () => {
      for (const sequence of SEQUENCES) {
        const template = getTemplates(formId).find(
          (item) => item.id === expectedTemplateId(formId, sequence, shape.width),
        );
        if (!template) continue;
        const second = template.canonicalTones[0]?.[1];
        expect(second).toBe(startForWidth(shape.width, sequence.start) === "ping" ? "P" : "Z");
      }
    });

    it("逐位允许集合非空、包含正格、宽松位恰为 P/Z 两值", () => {
      for (const template of getTemplates(formId)) {
        for (const [lineIndex, line] of template.expectedTones.entries()) {
          const canonical = template.canonicalTones[lineIndex];
          if (!canonical) continue;
          for (const [columnIndex, allowed] of line.entries()) {
            expect(
              allowed.length,
              `${template.id} L${lineIndex + 1}C${columnIndex + 1} 允许集合为空`,
            ).toBeGreaterThan(0);
            const tone = canonical[columnIndex];
            expect(tone, `${template.id} 正格缺少 L${lineIndex + 1}C${columnIndex + 1}`).toBeDefined();
            if (!tone) continue;
            expect(allowed).toContain(tone);
            if (allowed.length > 1) expect([...allowed].sort()).toEqual(["P", "Z"]);
          }
        }
      }
    });
  });
});

describe("可变位口径（Codex 2026-10-17 确认：七言 D 第 3 字可平可仄、第 5 字固定仄；五言 D 第 3 字固定仄）", () => {
  it("七言 D 型：第 1、3 字允许 P/Z，第 5 字只有 Z", () => {
    const template = getTemplates("qijue").find((item) => item.id === "qijue-ping-unrhymed");
    const line4 = template?.expectedTones[3];
    expect(line4?.[0]).toEqual(["P", "Z"]); // 七言第 1 字（中）
    expect(line4?.[2]).toEqual(["P", "Z"]); // 七言第 3 字（中）
    expect(line4?.[4]).toEqual(["Z"]); // 七言第 5 字固定仄
  });

  it("五言 D 型：仅第 1 字可变，第 3 字固定仄", () => {
    const template = getTemplates("wujue").find((item) => item.id === "wujue-ze-unrhymed");
    const line4 = template?.expectedTones[3];
    expect(line4?.[0]).toEqual(["P", "Z"]); // 五言第 1 字（中）
    expect(line4?.[2]).toEqual(["Z"]); // 五言第 3 字固定仄
  });
});

describe("matchTemplates 行为验收（只验收候选特征，不断言“最终合律通过”）", () => {
  it("C-D1-02：合成 A B C D 五绝在 wujue 下命中仄起首句不入韵模板", () => {
    const poem = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    const candidates = matchTemplates({ poem, formHint: "wujue", ruleSet: "teaching-v1" });
    expect(candidates).toHaveLength(4);
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual(
      [...EXPECTED_ORDER.wujue].sort(),
    );
    const top = candidates[0];
    expect(top?.id).toBe("wujue-ze-unrhymed");
    expect(top?.features.toneFit).toBe(1);
    expect(top?.evaluatedKeyRate).toBe(1);
    expect(top?.score).toBe(1);
    // D2 已实现粘对/押韵特征；本正格合成诗二者均为 1，对仗仍未支持。
    expect(top?.features.relationFit).toBe(1);
    expect(top?.features.rhymeFit).toBe(1);
    expect(top?.features.parallelismFit).toBeNull();
  });

  it("C-D1-02b：合成 A B C D 七绝在 qijue 下命中平起首句不入韵模板", () => {
    const poem = makeSyntheticPoem(["A", "B", "C", "D"], 7);
    const candidates = matchTemplates({ poem, formHint: "qijue", ruleSet: "teaching-v1" });
    const top = candidates[0];
    expect(top?.id).toBe("qijue-ping-unrhymed");
    expect(top?.features.toneFit).toBe(1);
    expect(top?.evaluatedKeyRate).toBe(1);
  });

  it("C-D1-02c：只有完全吻合的模板 toneFit=1，其余低于 1", () => {
    const poem = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    const candidates = matchTemplates({ poem, formHint: "wujue", ruleSet: "teaching-v1" });
    const perfect = candidates.filter((candidate) => candidate.features.toneFit === 1);
    expect(perfect.map((candidate) => candidate.id)).toEqual(["wujue-ze-unrhymed"]);
  });

  it("C-D1-03：四句五言交给 qilv / wulv 不拼接、不改体式，返回空候选", () => {
    const poem = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    expect(matchTemplates({ poem, formHint: "qilv", ruleSet: "teaching-v1" })).toEqual([]);
    expect(matchTemplates({ poem, formHint: "wulv", ruleSet: "teaching-v1" })).toEqual([]);
  });

  it("C-D1-03b：八句五言交给 wujue 同样结构不符，返回空候选", () => {
    const poem = makeSyntheticPoem(["A", "B", "C", "D", "A", "B", "C", "D"], 5);
    expect(matchTemplates({ poem, formHint: "wujue", ruleSet: "teaching-v1" })).toEqual([]);
  });
});
