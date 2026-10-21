import type {
  AnalysisResponse,
  AnnotatedToken,
  Evidence,
  ReadingCandidate,
  SourceRecord,
} from "@poetry/contracts";

/**
 * 证据抽屉的数据层（D3）。
 *
 * 原则（任务书第 4 节 / 公共契约第 7 节）：
 * - 只把报告里已有的字段整理成可读结构，**不编造来源、反切、页码**；
 * - 反切缺失就显示「该数据未提供反切」，不虚构；
 * - 用户指定的读音标 `user`，不伪装成系统自动判断；
 * - 引用了但解析不到的 evidence/source 要显式列出，不静默丢弃。
 */

export type CandidateOrigin = AnnotatedToken["selectionMethod"];

export interface CandidateView {
  id: string;
  character: string;
  toneClass: string;
  tone: "P" | "Z" | null;
  toneLabel: "平" | "仄" | "未知";
  gloss: string | null;
  /** 有效候选（参与判定）；其余候选仍展示但标注不参与。 */
  isEffective: boolean;
  /** 是否为当前选中读音。 */
  isSelected: boolean;
  /** 现代读音；缺失时为 null，不补造。 */
  modernReading: null | {
    pinyin: string;
    toneNumber: 1 | 2 | 3 | 4 | 5;
  };
  /** 反切；缺失时 available=false，由 UI 明确显示「未提供」。 */
  fanqie: { available: true; text: string } | { available: false };
  groupNames: string[];
  evidence: EvidenceView[];
  /** 引用了但报告 provenance 中解析不到的 ID。 */
  unresolvedEvidenceIds: string[];
}

export interface EvidenceView {
  id: string;
  kind: Evidence["kind"];
  locator: string;
  assertion: string;
  excerpt: string | null;
  reviewStatus: "approved" | "unverified";
  source: SourceView | null;
}

export interface SourceView {
  id: string;
  title: string;
  edition: string | null;
  url: string | null;
  license: string;
  revision: string | null;
}

export interface RuleCardView {
  id: string;
  version: string;
  name: string;
  scope: string;
  statement: string;
  limitations: string[];
}

export interface TokenEvidenceView {
  tokenId: string;
  text: string;
  line: number;
  column: number;
  startUtf16: number;
  endUtf16: number;
  /** 原文该区间的切片，供展示层核对，不按 DOM 索引猜。 */
  slice: string;
  toneLabel: "平" | "仄" | "未定";
  toneStatus: "resolved" | "ambiguous" | "unknown";
  readingStatus: "resolved" | "ambiguous" | "unknown";
  selectionMethod: CandidateOrigin;
  /** 用户指定时明确标注。 */
  isUserSpecified: boolean;
  reason: string;
  candidates: CandidateView[];
  /** 该字位关联的诊断（含规则卡）。 */
  findings: Array<{
    id: string;
    ruleId: string;
    status: string;
    severity: string;
    message: string;
    ruleCard: RuleCardView | null;
  }>;
  /** 该字位涉及的韵部（来自有效候选）。 */
  groupNames: string[];
}

function sourceView(source: SourceRecord): SourceView {
  return {
    id: source.id,
    title: source.title,
    edition: source.edition,
    url: source.url,
    license: source.license,
    revision: source.revision,
  };
}

function toneLabelOf(tone: "P" | "Z" | null): "平" | "仄" | "未知" {
  if (tone === "P") return "平";
  if (tone === "Z") return "仄";
  return "未知";
}

/** 把报告里的 evidence 与 source 建立索引。 */
export function buildEvidenceIndex(report: AnalysisResponse): {
  evidence: Map<string, EvidenceView>;
  sources: Map<string, SourceView>;
  groups: Map<string, string>;
  rules: Map<string, RuleCardView>;
} {
  const sources = new Map<string, SourceView>();
  for (const source of report.provenance.sources) {
    sources.set(source.id, sourceView(source));
  }
  const evidence = new Map<string, EvidenceView>();
  for (const item of report.provenance.evidence) {
    evidence.set(item.id, {
      id: item.id,
      kind: item.kind,
      locator: item.locator,
      assertion: item.assertion,
      excerpt: item.excerpt,
      reviewStatus: item.reviewStatus,
      source: sources.get(item.sourceId) ?? null,
    });
  }
  const groups = new Map<string, string>();
  for (const group of report.provenance.groups) {
    groups.set(group.id, group.name);
  }
  const rules = new Map<string, RuleCardView>();
  for (const rule of report.provenance.rules) {
    rules.set(rule.id, {
      id: rule.id,
      version: rule.version,
      name: rule.name,
      scope: rule.scope,
      statement: rule.statement,
      limitations: rule.limitations,
    });
  }
  return { evidence, sources, groups, rules };
}

function buildCandidate(
  candidate: ReadingCandidate,
  token: AnalysisResponse["poem"]["tokens"][number],
  index: ReturnType<typeof buildEvidenceIndex>,
): CandidateView {
  const evidence: EvidenceView[] = [];
  const unresolved: string[] = [];
  for (const id of candidate.evidenceIds) {
    const found = index.evidence.get(id);
    if (found === undefined) unresolved.push(id);
    else evidence.push(found);
  }
  const groupNames = candidate.groupIds.map(
    (id) => index.groups.get(id) ?? `未知韵部 ${id}`,
  );
  return {
    id: candidate.id,
    character: candidate.character,
    toneClass: candidate.toneClass,
    tone: candidate.tone,
    toneLabel: toneLabelOf(candidate.tone),
    gloss: candidate.gloss,
    isEffective: token.effectiveCandidateIds.includes(candidate.id),
    isSelected: token.selectedReadingId === candidate.id,
    modernReading:
      candidate.modernReading === null
        ? null
        : {
            pinyin: candidate.modernReading.pinyin,
            toneNumber: candidate.modernReading.toneNumber,
          },
    fanqie:
      candidate.fanqie === null
        ? { available: false }
        : { available: true, text: candidate.fanqie.text },
    groupNames,
    evidence,
    unresolvedEvidenceIds: unresolved,
  };
}

/**
 * 单个字位的证据视图。
 * `tokenId` 不在报告中时返回 null（不返回空壳）。
 */
export function buildTokenEvidence(
  report: AnalysisResponse,
  tokenId: string,
): TokenEvidenceView | null {
  const token = report.poem.tokens.find((item) => item.tokenId === tokenId);
  if (token === undefined) return null;
  const index = buildEvidenceIndex(report);

  const findings = report.prosody.checks
    .filter((check) =>
      check.locations.some((location) => location.tokenId === tokenId),
    )
    .map((check) => ({
      id: check.id,
      ruleId: check.ruleId,
      status: check.status,
      severity: check.severity,
      message: check.message,
      ruleCard: index.rules.get(check.ruleId) ?? null,
    }));

  const candidates = token.candidates.map((candidate) =>
    buildCandidate(candidate, token, index),
  );

  const effectiveGroups = new Set<string>();
  for (const candidate of token.candidates) {
    if (!token.effectiveCandidateIds.includes(candidate.id)) continue;
    for (const groupId of candidate.groupIds) {
      effectiveGroups.add(index.groups.get(groupId) ?? `未知韵部 ${groupId}`);
    }
  }

  return {
    tokenId: token.tokenId,
    text: token.text,
    line: token.line,
    column: token.column,
    startUtf16: token.startUtf16,
    endUtf16: token.endUtf16,
    slice: report.poem.originalText.slice(token.startUtf16, token.endUtf16),
    toneLabel:
      token.tone === "P" ? "平" : token.tone === "Z" ? "仄" : "未定",
    toneStatus: token.toneStatus,
    readingStatus: token.readingStatus,
    selectionMethod: token.selectionMethod,
    isUserSpecified: token.selectionMethod === "user",
    reason: token.reason,
    candidates,
    findings,
    groupNames: [...effectiveGroups],
  };
}

/** 证据抽屉里「缺失项」的显式清单，避免静默。 */
export interface EvidenceGaps {
  /** 缺少反切的数据（按字位）。 */
  missingFanqie: string[];
  /** 报告引用了但解析不到的 evidence id。 */
  unresolvedEvidenceIds: string[];
  /** 有诊断但没有规则卡。 */
  findingsWithoutRuleCard: string[];
}

export function collectEvidenceGaps(view: TokenEvidenceView): EvidenceGaps {
  return {
    missingFanqie: view.candidates
      .filter((candidate) => !candidate.fanqie.available)
      .map((candidate) => candidate.id),
    unresolvedEvidenceIds: [
      ...new Set(view.candidates.flatMap((item) => item.unresolvedEvidenceIds)),
    ],
    findingsWithoutRuleCard: view.findings
      .filter((finding) => finding.ruleCard === null)
      .map((finding) => finding.id),
  };
}
