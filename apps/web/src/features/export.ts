import type {
  AnalysisResponse,
  Finding,
  ReadingOverride,
} from "@poetry/contracts";
import { FORM_LABEL, formatHeading, rootCauseChecks } from "../app/reportView";

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
    .filter(
      (check) => check.status === "uncertain" || check.status === "unsupported",
    )
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
    conditionalChecks: (report.prosody.conditionalChecks ?? [])
      .map((block) => ({
        templateId: block.templateId,
        checks: block.checks.filter(
          (check) =>
            block.conditionalFindingIds.includes(check.id) &&
            (check.status === "uncertain" || check.status === "unsupported"),
        ),
      }))
      .filter((block) => block.checks.length > 0),
    unresolvedRhyme,
    uncertainRelations,
    genreApplicability: report.genre.applicability,
  };
}

const BOOK_LABEL = {
  pingshui: "平水韵",
  cilin: "词林正韵",
  xinyun: "中华新韵",
};
const STATUS_LABEL = {
  pass: "已实现的必检项均通过。",
  fail: "按当前参考格式，发现格律问题。",
  needs_review: "暂不作合律结论。",
  not_applicable: "不按近体格律评判。",
  unsupported: "当前规则尚不能完整评判此体式。",
};
const RULE_LABEL: Record<string, string> = {
  "METER.POSITION": "平仄与参考格式不符",
  "RHYME.COMMON": "韵脚未能归入同一韵部",
  "RELATION.NIAN": "此处失粘",
  "RELATION.DUI": "此处失对",
  "GUPING.NARROW": "按参考格式，此处有孤平",
  "TAIL.SANPING": "出现三平尾",
  "TAIL.SANZE": "出现三仄尾",
};

function describeIssue(report: AnalysisResponse, check: Finding) {
  const position = check.locations
    .map((location) => {
      const token = report.poem.tokens.find(
        (t) => t.tokenId === location.tokenId,
      );
      return `第${location.line}句第${location.column}字${token ? `「${token.text}」` : ""}`;
    })
    .join("、");
  const name = RULE_LABEL[check.ruleId] ?? "该处仍有格律问题";
  const tones = (values: string[]) =>
    values.map((t) => (t === "P" ? "平" : "仄")).join("或");
  const comparison =
    check.ruleId === "METER.POSITION" &&
    check.expected.length > 0 &&
    check.observed.length > 0 &&
    [...check.expected, ...check.observed].every((t) => t === "P" || t === "Z")
      ? `（应为${tones(check.expected)}，实际为${tones(check.observed)}）`
      : "";
  return `${position ? position + "：" : ""}${name}${comparison}。`;
}

/** Sharing uses recorded conclusions in plain language; full diagnostics stay in JSON. */
export function buildSummaryText({ report }: ExportState): string {
  const lines = [
    "诗词格律简评",
    "",
    report.poem.originalText,
    "",
    `依据：${BOOK_LABEL[report.policy.rhymeBook]} · ${report.policy.toneBasis === "historical" ? "传统四声（入声归仄）" : "普通话声调"}`,
  ];
  const format = report.prosody.format;
  const evenFeet = report.poem.lines
    .filter((line) => line.line % 2 === 0)
    .map((line) =>
      report.poem.tokens.find((t) => t.tokenId === line.tokenIds.at(-1)),
    );
  const evenZe =
    evenFeet.length > 0 &&
    evenFeet.every((t) => t?.toneStatus === "resolved" && t.tone === "Z");
  const outsideBasicRhyme =
    !!format && evenZe && report.genre.applicability === "uncertain";
  if (format) {
    const rhyme = format.firstLineRhyme.value;
    lines.push(
      `格式：${formatHeading(report)}${outsideBasicRhyme ? "" : `；${rhyme === "rhymed" ? "首句入韵参考" : rhyme === "unrhymed" ? "首句不入韵参考" : "首句用韵待确认"}`}。`,
    );
    const second = report.poem.tokens.find(
      (t) => t.tokenId === format.start.tokenId,
    );
    if (second && format.start.value)
      lines.push(
        `起式依据：首句第二字「${second.text}」为${format.start.value === "ping" ? "平" : "仄"}声。`,
      );
    if (format.start.alternativeReason)
      lines.push(format.start.alternativeReason);
    if (format.firstLineRhyme.observed === "different")
      lines.push("首句与偶数句韵部不同，需区分出韵与首句借韵。");
    if (evenZe) lines.push("用韵：偶数句均仄收，现有平韵基本谱不能直接套用。");
  } else if (report.genre.formId) {
    lines.push(`参考形制：${FORM_LABEL[report.genre.formId]}。`);
  }
  lines.push(
    `评语：${outsideBasicRhyme ? "当前仅作逐字平仄参考，不据平韵基本谱判定合律。" : STATUS_LABEL[report.summary.status]}`,
  );
  const problems = rootCauseChecks(report).filter((c) => c.status === "fail");
  if (problems.length && !outsideBasicRhyme) {
    lines.push(
      report.genre.applicability === "uncertain"
        ? `按近体规则比对有${problems.length}处偏离；体式尚未确认，不据此认定原诗出律：`
        : `按${report.prosody.selectedTemplateId === null ? "各候选共有的" : "当前参考格式的"}检查，发现${problems.length}项问题：`,
    );
    for (const check of problems.slice(0, 5))
      lines.push(`· ${describeIssue(report, check)}`);
    if (problems.length > 5)
      lines.push(`另有${problems.length - 5}项，详见完整报告。`);
  }
  const pending: string[] = [];
  const missing = report.poem.tokens.filter((t) => t.candidates.length === 0);
  const ambiguous = report.poem.tokens.filter(
    (t) =>
      t.candidates.length > 0 &&
      (t.readingStatus !== "resolved" || t.toneStatus !== "resolved"),
  );
  const glyphs = (tokens: AnalysisResponse["poem"]["tokens"]) => {
    const chars = [...new Set(tokens.map((t) => t.text))];
    return (
      chars
        .slice(0, 6)
        .map((c) => `「${c}」`)
        .join("、") + (chars.length > 6 ? "等字" : "")
    );
  };
  if (missing.length) pending.push(`所选韵书缺少${glyphs(missing)}的记录`);
  if (ambiguous.length) pending.push(`${glyphs(ambiguous)}的读音待确认`);
  if (
    report.prosody.selectedTemplateId === null &&
    report.summary.status === "needs_review" &&
    !outsideBasicRhyme
  )
    pending.push("参考格式尚未唯一确定");
  if (report.genre.applicability === "uncertain" && !outsideBasicRhyme)
    pending.push("是否适用近体格律尚待确认");
  const otherPending = report.prosody.checks.filter(
    (c) => c.status === "uncertain" && !c.id.endsWith(":template"),
  );
  if (otherPending.length && !outsideBasicRhyme)
    pending.push(`另有${otherPending.length}项检查未确定`);
  const unsupported = report.prosody.checks.filter(
    (c) => c.status === "unsupported",
  );
  if (unsupported.length && report.summary.status !== "unsupported")
    pending.push(`有${unsupported.length}项规则暂未支持`);
  if (pending.length) lines.push(`尚待确认：${pending.join("；")}。`);
  if (
    !outsideBasicRhyme &&
    report.prosody.conditionalChecks?.some((b) =>
      b.checks.some(
        (c) =>
          b.conditionalFindingIds.includes(c.id) &&
          c.status === "fail" &&
          c.resolvedBy === null,
      ),
    )
  ) {
    lines.push("部分问题仅在特定参考格式下成立，暂不计入共同问题。");
  }
  lines.push("", "韵书资料与自动判读可能有误，本简评仅供参考。");
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
  const safe =
    firstLine.replace(/[\\/:*?"<>|\s]+/gu, "").slice(0, 12) || "report";
  return `poetry-report-${safe}.json`;
}
