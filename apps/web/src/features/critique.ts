import type {
  AnalysisResponse,
  PoetryAssistantRequest,
} from "@poetry/contracts";

/** Preserve the report's conditions; never infer genre from a template mismatch. */
export function buildProsodyContext(
  report: AnalysisResponse,
): Extract<PoetryAssistantRequest, { task: "critique" }>["prosodyContext"] {
  return {
    rhymeBook: report.policy.rhymeBook,
    toneBasis: report.policy.toneBasis,
    applicability: report.genre.applicability,
    format: report.prosody.format
      ? `${report.prosody.format.shape.width}言${report.prosody.format.shape.lineCount}句；${report.prosody.format.start.value === "ping" ? "平起" : report.prosody.format.start.value === "ze" ? "仄起" : "起式待确认"}；首句${report.prosody.format.firstLineRhyme.value === "rhymed" ? "入韵" : report.prosody.format.firstLineRhyme.value === "unrhymed" ? "不入韵" : "用韵待确认"}`
      : "格式待确认",
    templateId: report.prosody.selectedTemplateId,
    issues: report.prosody.checks
      .filter(
        (check) =>
          (check.status === "fail" || check.status === "uncertain") &&
          check.resolvedBy === null,
      )
      .slice(0, 120)
      .map((check) => ({
        ruleId: check.ruleId,
        status: check.status as "fail" | "uncertain",
        severity: check.severity,
        expected: check.expected,
        observed: check.observed,
        locations: check.locations.flatMap((location) => {
          const token = report.poem.tokens.find(
            (item) => item.tokenId === location.tokenId,
          );
          return token
            ? [
                {
                  tokenId: token.tokenId,
                  line: token.line,
                  column: token.column,
                  text: token.text,
                },
              ]
            : [];
        }),
        message: check.message,
      })),
  };
}
