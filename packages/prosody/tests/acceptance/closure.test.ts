import { describe, expect, it } from "vitest";
import type { ProsodyReport } from "@poetry/contracts";
import {
  checkReportClosure,
  collectRuleReferences,
  evaluateProsody,
  matchTemplates,
} from "../../src/index.js";
import { makeCodePoem, makeSyntheticPoem } from "./fixtures.js";

// C 维护的引用闭合工具验收：只读校验，不改变报告内容。

const RULE_SET = "teaching-v1" as const;

function analyze(
  poem: ReturnType<typeof makeSyntheticPoem>,
  selectedTemplateId: string | null,
): ProsodyReport {
  return evaluateProsody({
    poem,
    candidates: matchTemplates({ poem, formHint: "auto", ruleSet: RULE_SET }),
    selectedTemplateId,
    applicability: "applicable",
    ruleSet: RULE_SET,
  });
}

describe("引用闭合工具（report/closure）", () => {
  it("正格报告：闭合通过，规则引用可汇总", () => {
    const poem = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const closure = checkReportClosure(report, poem);
    expect(closure.ok).toBe(true);
    expect(closure.problems).toEqual([]);

    const refs = collectRuleReferences(report);
    expect(refs.ruleIds).toContain("METER.POSITION");
    expect(refs.ruleIds).toContain("RHYME.COMMON");
    expect(refs.ruleIds).toContain("RELATION.DUI");
    expect(refs.ruleIds).toContain("RELATION.NIAN");
    expect(refs.rescueRuleIds).toEqual([]);
  });

  it("已救报告：resolvedBy 只引用救法规则，闭合通过", () => {
    const poem = makeCodePoem(["ZZPZZ", "PPPZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const closure = checkReportClosure(report, poem);
    expect(closure.ok).toBe(true);

    const refs = collectRuleReferences(report);
    expect(refs.rescueRuleIds).toContain("RESCUE.DUIJU");
    for (const rescue of refs.rescueRuleIds) {
      expect(["RESCUE.SELF", "RESCUE.TEAO", "RESCUE.DUIJU"]).toContain(rescue);
    }
    for (const check of report.checks) {
      if (check.resolvedBy !== null) expect(check.resolvedBy).toBe("RESCUE.DUIJU");
    }
  });

  it("人为破坏引用：逐项报出稳定错误码", () => {
    const poem = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const broken = JSON.parse(JSON.stringify(report)) as ProsodyReport;

    broken.checks[0]!.resolvedBy = "RESCUE.UNKNOWN";
    broken.checks[1]!.relatedFindingIds = ["missing:finding"];
    broken.checks[1]!.id = broken.checks[0]!.id; // 制造重复 ID
    broken.checks[2]!.locations[0]!.line = 9; // 与 poem token 行列不一致
    broken.rhyme.tokenIds = [...broken.rhyme.tokenIds, "l9c9"];

    const closure = checkReportClosure(broken, poem);
    expect(closure.ok).toBe(false);
    const codes = new Set(closure.problems.map((problem) => problem.code));
    expect(codes.has("resolved_by_unknown")).toBe(true);
    expect(codes.has("related_finding_missing")).toBe(true);
    expect(codes.has("check_id_duplicate")).toBe(true);
    expect(codes.has("location_mismatch")).toBe(true);
    expect(codes.has("rhyme_token_missing")).toBe(true);
    for (const problem of closure.problems) expect(problem.detail.length).toBeGreaterThan(0);
  });
});
