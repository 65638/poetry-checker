import type { AnnotatedPoem, ProsodyReport } from "@poetry/contracts";

// 引用闭合工具（C 维护）：供 GLM 在组装 AnalysisResponse / provenance 前自检。
// 只读校验，不改变核心状态、等级、候选顺序；不是第二份 HTTP 协议，字段类型复用 contracts。

/** 契约冻结的 10 个规则 ID（teaching-v1，ruleVersion 固定为 "1"）。 */
export const FROZEN_RULE_IDS = [
  "METER.POSITION",
  "RHYME.COMMON",
  "RELATION.DUI",
  "RELATION.NIAN",
  "GUPING.NARROW",
  "TAIL.SANPING",
  "TAIL.SANZE",
  "RESCUE.SELF",
  "RESCUE.TEAO",
  "RESCUE.DUIJU",
] as const;

/** 允许出现在 Finding.resolvedBy 的救法规则 ID。 */
export const RESCUE_RULE_IDS = ["RESCUE.SELF", "RESCUE.TEAO", "RESCUE.DUIJU"] as const;

const FROZEN = new Set<string>(FROZEN_RULE_IDS);
const RESCUES = new Set<string>(RESCUE_RULE_IDS);

export interface RuleReferences {
  /** 报告内出现的全部规则 ID（去重、稳定排序）。 */
  ruleIds: string[];
  /** 被 resolvedBy 引用的救法规则 ID（去重、稳定排序）。 */
  rescueRuleIds: string[];
}

/** 汇总报告需要随 provenance.rules 返回的规则 ID。 */
export function collectRuleReferences(report: ProsodyReport): RuleReferences {
  const ruleIds = new Set<string>();
  const rescueRuleIds = new Set<string>();
  for (const check of report.checks) {
    ruleIds.add(check.ruleId);
    if (check.resolvedBy !== null) rescueRuleIds.add(check.resolvedBy);
  }
  return {
    ruleIds: [...ruleIds].sort(),
    rescueRuleIds: [...rescueRuleIds].sort(),
  };
}

export interface ClosureProblem {
  code:
    | "check_id_duplicate"
    | "rule_id_unknown"
    | "rule_version_mismatch"
    | "resolved_by_unknown"
    | "related_finding_missing"
    | "relation_finding_missing"
    | "relation_token_missing"
    | "rhyme_token_missing"
    | "location_token_missing"
    | "location_mismatch"
    | "template_mismatch";
  /** 可读说明，含具体 ID，便于最小复现。 */
  detail: string;
}

export interface ClosureResult {
  ok: boolean;
  problems: ClosureProblem[];
}

/**
 * 校验报告的引用闭合：
 * - Finding.ruleId 属于 10 个固定 ID，ruleVersion 为 "1"；
 * - resolvedBy 属于三个救法 ID；
 * - relatedFindingIds、relations[].findingIds 指向报告内存在的 Finding；
 * - locations[].tokenId、relations[].tokenIds、rhyme.tokenIds 能在 poem.tokens 解析，且行列一致；
 * - Finding.id 不重复；选定模板时，非空 templateId 必须与 selectedTemplateId 一致。
 */
export function checkReportClosure(
  report: ProsodyReport,
  poem: AnnotatedPoem,
): ClosureResult {
  const problems: ClosureProblem[] = [];
  const tokens = new Map(poem.tokens.map((token) => [token.tokenId, token]));
  const findingIds = new Set(report.checks.map((check) => check.id));
  const seenIds = new Set<string>();

  for (const check of report.checks) {
    if (seenIds.has(check.id)) {
      problems.push({ code: "check_id_duplicate", detail: check.id });
    }
    seenIds.add(check.id);

    if (!FROZEN.has(check.ruleId)) {
      problems.push({ code: "rule_id_unknown", detail: `${check.id} ruleId=${check.ruleId}` });
    }
    if (check.ruleVersion !== "1") {
      problems.push({
        code: "rule_version_mismatch",
        detail: `${check.id} ruleVersion=${check.ruleVersion}`,
      });
    }
    if (check.resolvedBy !== null && !RESCUES.has(check.resolvedBy)) {
      problems.push({
        code: "resolved_by_unknown",
        detail: `${check.id} resolvedBy=${check.resolvedBy}`,
      });
    }
    for (const related of check.relatedFindingIds) {
      if (!findingIds.has(related)) {
        problems.push({ code: "related_finding_missing", detail: `${check.id} -> ${related}` });
      }
    }
    for (const location of check.locations) {
      const token = tokens.get(location.tokenId);
      if (!token) {
        problems.push({ code: "location_token_missing", detail: location.tokenId });
        continue;
      }
      if (token.line !== location.line || token.column !== location.column) {
        problems.push({
          code: "location_mismatch",
          detail: `${location.tokenId} 声明 ${location.line}.${location.column}，实际 ${token.line}.${token.column}`,
        });
      }
    }
    if (
      report.selectedTemplateId !== null &&
      check.templateId !== null &&
      check.templateId !== report.selectedTemplateId
    ) {
      problems.push({
        code: "template_mismatch",
        detail: `${check.id} templateId=${check.templateId} selected=${report.selectedTemplateId}`,
      });
    }
  }

  for (const relation of report.relations) {
    for (const findingId of relation.findingIds) {
      if (!findingIds.has(findingId)) {
        problems.push({
          code: "relation_finding_missing",
          detail: `${relation.kind} -> ${findingId}`,
        });
      }
    }
    for (const tokenId of relation.tokenIds) {
      if (!tokens.has(tokenId)) {
        problems.push({ code: "relation_token_missing", detail: `${relation.kind} -> ${tokenId}` });
      }
    }
  }

  for (const tokenId of report.rhyme.tokenIds) {
    if (!tokens.has(tokenId)) {
      problems.push({ code: "rhyme_token_missing", detail: tokenId });
    }
  }

  return { ok: problems.length === 0, problems };
}
