import type {
  AnnotatedPoem,
  Evidence,
  Finding,
  GenreDecision,
  ProsodyReport,
  SourceRecord,
  WorkMetadata,
} from "@poetry/contracts";
import {
  parseReviewedWorkExceptions,
  type ReviewedWorkException,
} from "./records.js";

export {
  parseReviewedWorkExceptions,
  ReviewedWorkExceptionError,
} from "./records.js";
export type { ReviewedWorkException } from "./records.js";

export interface ApplyReviewedWorkExceptionsInput {
  poem: AnnotatedPoem;
  /** 由既有 genre.fingerprintText 计算；不是含标点的请求 inputHash。 */
  textFingerprint: string;
  genre: GenreDecision;
  report: ProsodyReport;
  works: readonly WorkMetadata[];
  exceptions: readonly ReviewedWorkException[];
  evidence: readonly Evidence[];
  sources: readonly SourceRecord[];
}

function oneById<T extends { id: string }>(
  items: readonly T[],
  id: string,
): T | undefined {
  const matches = items.filter((item) => item.id === id);
  return matches.length === 1 ? matches[0] : undefined;
}

function approvedEvidence(
  input: ApplyReviewedWorkExceptionsInput,
  id: string,
  kind: Evidence["kind"],
): Evidence | undefined {
  const evidence = oneById(input.evidence, id);
  return evidence?.reviewStatus === "approved" &&
    evidence.kind === kind &&
    oneById(input.sources, evidence.sourceId) !== undefined
    ? evidence
    : undefined;
}

/** 校验整诗结构及文字，避免调用方传入旧指纹、重排字位或不完整正文仍命中。 */
function matchesText(
  poem: AnnotatedPoem,
  entry: ReviewedWorkException,
): boolean {
  const body = entry.approvedLines.join("");
  // 与冻结作品指纹口径一致：仅保留汉字，不转换简繁；此处逐字复核，不另算指纹。
  if (
    [...poem.originalText]
      .filter((char) => /\p{Script=Han}/u.test(char))
      .join("") !== body ||
    poem.quality !== "ok" ||
    poem.lines.length !== entry.approvedLines.length ||
    poem.tokens.length !== [...body].length
  )
    return false;
  const used = new Set<string>();
  const tokens = new Map(poem.tokens.map((token) => [token.tokenId, token]));
  if (tokens.size !== poem.tokens.length) return false;
  return poem.lines.every((line, lineIndex) => {
    const expected = [...entry.approvedLines[lineIndex]!];
    return (
      line.line === lineIndex + 1 &&
      line.text === expected.join("") &&
      line.tokenIds.length === expected.length &&
      line.tokenIds.every((id, columnIndex) => {
        const token = tokens.get(id);
        if (
          !token ||
          used.has(id) ||
          token.line !== line.line ||
          token.column !== columnIndex + 1 ||
          token.text !== expected[columnIndex] ||
          poem.originalText.slice(token.startUtf16, token.endUtf16) !==
            token.text
        )
          return false;
        used.add(id);
        return true;
      })
    );
  });
}

function matchesScope(
  input: ApplyReviewedWorkExceptionsInput,
  entry: ReviewedWorkException,
): boolean {
  const { poem, genre, report } = input;
  if (
    entry.reviewStatus !== "approved" ||
    poem.book !== entry.book ||
    input.textFingerprint !== entry.textFingerprint ||
    genre.basisType !== "reviewed_metadata" ||
    genre.applicability !== "applicable" ||
    genre.formFamily !== "regulated" ||
    genre.formId !== entry.formId ||
    report.selectedTemplateId === null ||
    report.selectedTemplateId !== genre.selectedTemplateId ||
    !genre.candidateTemplateIds.includes(report.selectedTemplateId) ||
    !report.candidates.some(
      (candidate) =>
        candidate.id === report.selectedTemplateId &&
        candidate.formId === entry.formId,
    )
  )
    return false;
  const matches = input.works.filter(
    (work) =>
      work.reviewStatus === "approved" &&
      work.approvedTextFingerprints.includes(input.textFingerprint),
  );
  const work = matches.length === 1 ? matches[0] : undefined;
  if (
    !work ||
    work.id !== entry.workId ||
    work.formFamily !== "regulated" ||
    work.formId !== entry.formId ||
    work.evidenceIds.length === 0 ||
    !work.evidenceIds.every(
      (id) =>
        genre.evidenceIds.includes(id) &&
        approvedEvidence(input, id, "work_metadata"),
    )
  )
    return false;
  const approval = approvedEvidence(
    input,
    entry.approval.evidenceId,
    "context",
  );
  return (
    approval !== undefined &&
    approval.sourceId === entry.approval.sourceId &&
    approval.locator === entry.approval.locator &&
    matchesText(poem, entry)
  );
}

function matchesFinding(
  input: ApplyReviewedWorkExceptionsInput,
  entry: ReviewedWorkException,
  check: Finding,
): boolean {
  if (
    check.ruleId !== entry.ruleId ||
    check.ruleVersion !== entry.ruleVersion ||
    check.status !== "fail" ||
    check.severity !== "error" ||
    check.resolvedBy !== null ||
    check.templateId !== input.report.selectedTemplateId ||
    check.locations.length !== 3 ||
    check.observed.length !== 3 ||
    check.observed.some((tone) => tone !== "P")
  )
    return false;
  return entry.target.columns.every((column, index) => {
    const location = check.locations[index];
    if (
      !location ||
      location.line !== entry.target.line ||
      location.column !== column
    )
      return false;
    const token = input.poem.tokens.find(
      (item) => item.tokenId === location.tokenId,
    );
    if (
      !token ||
      token.line !== location.line ||
      token.column !== location.column ||
      token.text !== [...entry.target.text][index] ||
      token.selectionMethod === "user" ||
      token.toneStatus !== "resolved" ||
      token.tone !== "P" ||
      token.possibleTones.length !== 1 ||
      token.possibleTones[0] !== "P" ||
      token.effectiveCandidateIds.length === 0
    )
      return false;
    // 有效候选全部同平可以成立；不强行将同调多读音改为唯一读音。
    return token.effectiveCandidateIds.every((id) => {
      const candidate = oneById(token.candidates, id);
      return (
        candidate?.book === entry.book &&
        candidate.character === token.text &&
        candidate.tone === "P"
      );
    });
  });
}

/** 通用核心之后、summary 之前应用；纯函数、确定、幂等，未匹配时原样返回。 */
export function applyReviewedWorkExceptions(
  input: ApplyReviewedWorkExceptionsInput,
): ProsodyReport {
  const entries = parseReviewedWorkExceptions(input.exceptions).filter(
    (entry) => matchesScope(input, entry),
  );
  let changed = false;
  const checks = input.report.checks.map((check) => {
    const entry = entries.find((item) => matchesFinding(input, item, check));
    if (!entry) return check;
    changed = true;
    return {
      ...check,
      status: "not_applicable" as const,
      severity: "info" as const,
      message: `${check.message} 已审作品特例 ${entry.id}@${entry.version}：${entry.message}（${entry.approval.locator}）`,
      evidenceIds: [
        ...new Set([...check.evidenceIds, entry.approval.evidenceId]),
      ],
      resolvedBy: null,
    };
  });
  return changed ? { ...input.report, checks } : input.report;
}
