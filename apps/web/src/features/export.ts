import type { AnalysisResponse, ReadingOverride } from "@poetry/contracts";

export interface ExportState {
  report: AnalysisResponse;
  /** 产生该报告的请求快照，导出只依据它，不读用户随后改过的草稿。 */
  request: Record<string, unknown>;
  overrides: ReadingOverride[];
}

/** 收集报告里所有不确定项，导出时单列，避免被进度掩盖。 */
export function collectUncertainties(report: AnalysisResponse) {
  const ambiguousReadings = report.poem.tokens
    .filter((token) => token.readingStatus !== "resolved")
    .map((token) => ({
      tokenId: token.tokenId,
      text: token.text,
      readingStatus: token.readingStatus,
      possibleTones: token.possibleTones,
      toneStatus: token.toneStatus,
    }));
  const uncertainChecks = report.prosody.checks
    .filter((check) => check.status === "uncertain" || check.status === "unsupported")
    .map((check) => ({
      id: check.id,
      ruleId: check.ruleId,
      status: check.status,
      message: check.message,
    }));
  const unresolvedRhyme =
    report.prosody.rhyme.status === "uncertain" ||
    report.prosody.rhyme.status === "unsupported"
      ? report.prosody.rhyme
      : null;
  const uncertainRelations = report.prosody.relations.filter(
    (relation) => relation.status === "uncertain",
  );
  return {
    ambiguousReadings,
    uncertainChecks,
    unresolvedRhyme,
    uncertainRelations,
    genreApplicability: report.genre.applicability,
  };
}

/** 可读摘要（纯文本，复制即用）。 */
export function buildSummaryText(state: ExportState): string {
  const { report, request, overrides } = state;
  const uncertainties = collectUncertainties(report);
  const lines: string[] = [
    "诗格律检查器 · 分析摘要",
    "",
    `结论：${report.summary.status} — ${report.summary.message}`,
    `韵书：${report.policy.rhymeBook}（${report.policy.toneBasis}）`,
    `口径：${report.policy.notice}`,
    `体式：${report.genre.formFamily}${report.genre.formId ? ` / ${report.genre.formId}` : ""}（适用性：${report.genre.applicability}）`,
    `规则版本：${report.versions.rules}｜数据版本：${report.versions.data}`,
    `原文摘要：${report.inputHash}`,
    "",
    "原文：",
    report.poem.originalText,
    "",
    `可疑/待复核项：${uncertainties.uncertainChecks.length} 条`,
  ];
  for (const check of uncertainties.uncertainChecks) {
    lines.push(`  - [${check.status}] ${check.ruleId}：${check.message}`);
  }
  if (uncertainties.ambiguousReadings.length > 0) {
    lines.push(`读音未定字位：${uncertainties.ambiguousReadings.map((item) => `${item.text}(${item.tokenId})`).join("、")}`);
  }
  if (overrides.length > 0) {
    lines.push(`用户指定读音：${overrides.map((item) => `${item.tokenId}→${item.readingId}`).join("、")}`);
  }
  lines.push("", `请求快照：${JSON.stringify(request)}`);
  return lines.join("\n");
}

/** 完整 JSON 导出：原文、请求参数、完整报告、版本、覆盖与不确定项。 */
export function buildReportJson(state: ExportState) {
  return {
    exportedAtVersion: {
      schemaVersion: state.report.schemaVersion,
      versions: state.report.versions,
    },
    originalText: state.report.poem.originalText,
    request: state.request,
    inputHash: state.report.inputHash,
    readingOverrides: state.overrides,
    uncertainties: collectUncertainties(state.report),
    report: state.report,
  };
}

export function reportFileName(report: AnalysisResponse): string {
  const firstLine = report.poem.lines[0]?.text ?? "";
  const safe = firstLine.replace(/[\\/:*?"<>|\s]+/gu, "").slice(0, 12) || "report";
  return `poetry-report-${safe}.json`;
}
