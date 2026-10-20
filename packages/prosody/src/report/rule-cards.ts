import type { Evidence, RuleCard, SourceRecord } from "@poetry/contracts";

// 发布卡完整性校验（C 维护，供 D4 回归与 GLM/Codex 装载前自检）。
// 只读：不修改卡片、不改变审核状态；发现不一致时返回稳定错误码，供测试与装载门槛使用。

export type RuleCardProblemCode =
  | "unknown_rule_id"
  | "version_mismatch"
  | "duplicate_rule_id"
  | "evidence_unresolved"
  | "evidence_not_approved"
  | "source_unresolved";

export interface RuleCardProblem {
  code: RuleCardProblemCode;
  detail: string;
}

export interface RuleCardValidationResult {
  ok: boolean;
  problems: RuleCardProblem[];
}

/**
 * 校验发布卡：
 * - ruleId 必须属于冻结的 10 个 ID，version 必须为 "1"，且不得重复；
 * - 每个 evidenceId 必须在证据注册表中恰好解析一次且 reviewStatus=approved；
 * - 每条证据的 sourceId 必须能在来源表中解析。
 * 不校验 statement 的语文学正确性（那属于文献审核，不在本函数职责内）。
 */
export function validateRuleCards(
  cards: readonly RuleCard[],
  evidence: readonly Evidence[],
  sources: readonly SourceRecord[],
  frozenRuleIds: readonly string[],
): RuleCardValidationResult {
  const problems: RuleCardProblem[] = [];
  const frozen = new Set(frozenRuleIds);
  const evidenceById = new Map<string, Evidence[]>();
  for (const record of evidence) {
    const list = evidenceById.get(record.id) ?? [];
    list.push(record);
    evidenceById.set(record.id, list);
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  const seen = new Set<string>();

  for (const card of cards) {
    if (!frozen.has(card.id)) {
      problems.push({ code: "unknown_rule_id", detail: card.id });
    }
    if (card.version !== "1") {
      problems.push({ code: "version_mismatch", detail: `${card.id} version=${card.version}` });
    }
    if (seen.has(card.id)) {
      problems.push({ code: "duplicate_rule_id", detail: card.id });
    }
    seen.add(card.id);
    for (const evidenceId of card.evidenceIds) {
      const matches = evidenceById.get(evidenceId) ?? [];
      if (matches.length !== 1) {
        problems.push({
          code: "evidence_unresolved",
          detail: `${card.id} -> ${evidenceId}（解析到 ${matches.length} 条）`,
        });
        continue;
      }
      const record = matches[0]!;
      if (record.reviewStatus !== "approved") {
        problems.push({
          code: "evidence_not_approved",
          detail: `${card.id} -> ${evidenceId} reviewStatus=${record.reviewStatus}`,
        });
      }
      if (!sourceIds.has(record.sourceId)) {
        problems.push({
          code: "source_unresolved",
          detail: `${card.id} -> ${evidenceId} sourceId=${record.sourceId}`,
        });
      }
    }
  }

  return { ok: problems.length === 0, problems };
}
