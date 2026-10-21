import type { AnalysisResponse } from "@poetry/contracts";

/**
 * D2 逐字谱 / 诊断 / 押韵的视图模型（纯函数，无 DOM、无格律计算）。
 *
 * 只做「按报告已有字段整理与排序」，**不新增判定**：
 * - 平仄文字映射只翻译 `token.tone`，不推断声调；
 * - 韵脚标记只取 `prosody.rhyme.tokenIds`；
 * - 诊断分组只按 `ruleId` 前缀映射到固定类别，不重新评估状态。
 */

export type ToneLabel = "平" | "仄" | "未定";

/** Explain incomplete reports using their recorded causes, without re-evaluating rules. */
export function incompleteSummary(report: AnalysisResponse): {
  label: string;
  desc: string;
} {
  const missing = report.poem.tokens.filter((t) => t.candidates.length === 0);
  const unresolved = report.poem.tokens.filter(
    (t) =>
      t.candidates.length > 0 &&
      (t.readingStatus !== "resolved" || t.toneStatus !== "resolved"),
  );
  const templatePending = report.prosody.selectedTemplateId === null;
  const reasons: string[] = [];
  const labels: string[] = [];
  if (missing.length) {
    const glyphs = [...new Set(missing.map((t) => t.text))];
    reasons.push(
      `所选韵书缺录：${glyphs.slice(0, 8).join("、")}${glyphs.length > 8 ? "等" : ""}`,
    );
    labels.push("韵书缺字");
  }
  if (unresolved.length) {
    reasons.push(`${unresolved.length}个字位的读音或声调未确定`);
    labels.push("部分读音未定");
  }
  if (templatePending) {
    reasons.push("尚未确定采用哪种格律格式（平起／仄起、首句是否入韵）");
    labels.push("格律格式未确定");
  }
  if (report.poem.quality === "needs_review") {
    reasons.push("文本解析存在疑问，请检查分句和标点");
    labels.push("分句需确认");
  }
  return {
    label: labels.length === 1 ? labels[0]! : "暂无完整结论",
    desc: reasons.length
      ? `${reasons.join("；")}。`
      : "仍有检查项目未确定，详见诗旁批注。",
  };
}

export interface TokenCell {
  tokenId: string;
  text: string;
  line: number;
  column: number;
  startUtf16: number;
  endUtf16: number;
  toneLabel: ToneLabel;
  /** 读音是否未定（不影响 toneLabel 的语义）。 */
  tonePending: boolean;
  readingStatus: "resolved" | "ambiguous" | "unknown";
  selectionMethod: AnalysisResponse["poem"]["tokens"][number]["selectionMethod"];
  /** 是否为韵脚字位。 */
  isRhyme: boolean;
  /** 属于哪些诊断（按报告顺序）。 */
  findingIds: string[];
}

export function toneLabel(tone: "P" | "Z" | null): ToneLabel {
  if (tone === "P") return "平";
  if (tone === "Z") return "仄";
  return "未定";
}

/** 逐字谱：保持原文顺序，标出韵脚与关联诊断。 */
export function buildTokenSpectrum(
  report: AnalysisResponse,
): TokenCell[] {
  const rhyme = new Set(report.prosody.rhyme.tokenIds);
  const findingsByToken = new Map<string, string[]>();
  for (const check of report.prosody.checks) {
    for (const location of check.locations) {
      const bucket = findingsByToken.get(location.tokenId) ?? [];
      bucket.push(check.id);
      findingsByToken.set(location.tokenId, bucket);
    }
  }
  return report.poem.tokens.map((token) => ({
    tokenId: token.tokenId,
    text: token.text,
    line: token.line,
    column: token.column,
    startUtf16: token.startUtf16,
    endUtf16: token.endUtf16,
    toneLabel: toneLabel(token.tone),
    tonePending: token.toneStatus !== "resolved",
    readingStatus: token.readingStatus,
    selectionMethod: token.selectionMethod,
    isRhyme: rhyme.has(token.tokenId),
    findingIds: findingsByToken.get(token.tokenId) ?? [],
  }));
}

export type FindingGroup =
  | "meter"
  | "rhyme"
  | "relation"
  | "isolated"
  | "variation"
  | "other";

export const FINDING_GROUP_LABELS: Record<FindingGroup, string> = {
  meter: "平仄",
  rhyme: "押韵",
  relation: "粘对",
  isolated: "孤平/尾式",
  variation: "变格/拗救",
  other: "其他",
};

/** 规则 ID 前缀 → 类别。未知前缀归到 other，不猜。 */
export function findingGroup(ruleId: string): FindingGroup {
  const upper = ruleId.toUpperCase();
  if (upper.startsWith("METER") || upper.startsWith("TONE")) return "meter";
  if (upper.startsWith("RHYME") || upper.startsWith("RIME")) return "rhyme";
  if (upper.startsWith("NIAN") || upper.startsWith("DUI") || upper.startsWith("RELATION")) {
    return "relation";
  }
  if (upper.startsWith("ISOLATED") || upper.startsWith("TAIL") || upper.startsWith("END")) {
    return "isolated";
  }
  if (upper.startsWith("VARIATION") || upper.startsWith("RESCUE") || upper.startsWith("BENG")) {
    return "variation";
  }
  return "other";
}

export interface FindingView {
  id: string;
  group: FindingGroup;
  ruleId: string;
  ruleVersion: string;
  status: "pass" | "fail" | "uncertain" | "not_applicable" | "unsupported";
  severity: "error" | "warning" | "info";
  message: string;
  expected: string[];
  observed: string[];
  tokenIds: string[];
  resolvedBy: string | null;
  /** 是否属于「需要处理」：fail 或 uncertain 或 error/warning。 */
  needsAttention: boolean;
}

const SEVERITY_RANK: Record<FindingView["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const STATUS_RANK: Record<FindingView["status"], number> = {
  fail: 0,
  uncertain: 1,
  unsupported: 2,
  not_applicable: 3,
  pass: 4,
};

export function buildFindings(report: AnalysisResponse): FindingView[] {
  return report.prosody.checks.map((check) => ({
    id: check.id,
    group: findingGroup(check.ruleId),
    ruleId: check.ruleId,
    ruleVersion: check.ruleVersion,
    status: check.status,
    severity: check.severity,
    message: check.message,
    expected: check.expected,
    observed: check.observed,
    tokenIds: check.locations.map((location) => location.tokenId),
    resolvedBy: check.resolvedBy,
    needsAttention:
      check.status === "fail" || check.status === "uncertain" ||
      check.severity === "error" || check.severity === "warning",
  }));
}

/**
 * 分组 + 排序。`onlyNeedsAttention` 对应「只看需处理项」。
 * 组内按 severity 再按 status 排序；同组内保持稳定（不依赖随机顺序）。
 */
export function groupFindings(
  findings: FindingView[],
  onlyNeedsAttention = false,
): Array<{ group: FindingGroup; label: string; items: FindingView[] }> {
  const filtered = onlyNeedsAttention
    ? findings.filter((item) => item.needsAttention)
    : findings;

  const order: FindingGroup[] = [
    "meter",
    "rhyme",
    "relation",
    "isolated",
    "variation",
    "other",
  ];

  return order
    .map((group) => {
      const items = filtered
        .filter((item) => item.group === group)
        .sort((a, b) => {
          const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
          if (bySeverity !== 0) return bySeverity;
          const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
          if (byStatus !== 0) return byStatus;
          return a.id.localeCompare(b.id);
        });
      return { group, label: FINDING_GROUP_LABELS[group], items };
    })
    .filter((entry) => entry.items.length > 0);
}

export interface PositionTarget {
  tokenId: string;
  line: number;
  column: number;
  /** UTF-16 半开区间，供展示层按区间定位，不按 DOM 字符索引猜。 */
  startUtf16: number;
  endUtf16: number;
  text: string;
}

/**
 * 诊断定位：把 finding 的 tokenId 解析成原文位置。
 * 找不到对应 token 时返回 null（不退回「滚到整段」）。
 */
export function locateFinding(
  report: AnalysisResponse,
  findingId: string,
): PositionTarget[] {
  const finding = report.prosody.checks.find((item) => item.id === findingId);
  if (finding === undefined) return [];
  const byId = new Map(report.poem.tokens.map((token) => [token.tokenId, token]));
  const targets: PositionTarget[] = [];
  for (const location of finding.locations) {
    const token = byId.get(location.tokenId);
    if (token === undefined) continue;
    targets.push({
      tokenId: token.tokenId,
      line: token.line,
      column: token.column,
      startUtf16: token.startUtf16,
      endUtf16: token.endUtf16,
      text: token.text,
    });
  }
  return targets;
}

export interface RhymeFootView {
  tokenId: string;
  text: string;
  line: number;
  column: number;
  groupIds: string[];
}

/** 押韵区：韵脚 + 每个韵脚命中的韵部（来自报告候选，不新造）。 */
export function buildRhymeFeet(report: AnalysisResponse): RhymeFootView[] {
  const byId = new Map(report.poem.tokens.map((token) => [token.tokenId, token]));
  return report.prosody.rhyme.tokenIds.flatMap((tokenId) => {
    const token = byId.get(tokenId);
    if (token === undefined) return [];
    const groupIds = [
      ...new Set(
        token.candidates
          .filter((candidate) => token.effectiveCandidateIds.includes(candidate.id))
          .flatMap((candidate) => candidate.groupIds),
      ),
    ];
    return [
      {
        tokenId: token.tokenId,
        text: token.text,
        line: token.line,
        column: token.column,
        groupIds,
      },
    ];
  });
}

/** 共同归部状态：报告已给出 commonGroupIds，这里只判断是否为空。 */
export function rhymeCommonGroups(report: AnalysisResponse): {
  status: "shared" | "none" | "unknown";
  groupIds: string[];
} {
  const ids = report.prosody.rhyme.commonGroupIds;
  if (ids.length > 0) return { status: "shared", groupIds: ids };
  if (report.prosody.rhyme.tokenIds.length === 0) {
    return { status: "unknown", groupIds: [] };
  }
  return { status: "none", groupIds: [] };
}

export interface RelationSideView {
  tokenId: string;
  text: string | null;
  line: number | null;
  column: number | null;
  startUtf16: number | null;
  endUtf16: number | null;
}

export interface RelationView {
  /** `nian` = 粘，`dui` = 对。 */
  kind: "nian" | "dui";
  kindLabel: "粘" | "对";
  status: "pass" | "fail" | "uncertain" | "not_applicable" | "unsupported";
  sides: RelationSideView[];
  findingIds: string[];
  /** 任一 tokenId 在报告中找不到时标记，供 UI 明确提示。 */
  hasUnresolvedTokens: boolean;
}

/**
 * 粘对关系：把 relation 的 tokenIds 解析成字位与位置。
 *
 * 报告里 relations 可能是空数组（当前 fixture 即为空）；空数组时返回空，
 * 不补造关系，也不显示「已通过」。
 */
export function buildRelations(report: AnalysisResponse): RelationView[] {
  const byId = new Map(report.poem.tokens.map((token) => [token.tokenId, token]));
  return report.prosody.relations.map((relation) => {
    let hasUnresolvedTokens = false;
    const sides: RelationSideView[] = relation.tokenIds.map((tokenId) => {
      const token = byId.get(tokenId);
      if (token === undefined) {
        hasUnresolvedTokens = true;
        return {
          tokenId,
          text: null,
          line: null,
          column: null,
          startUtf16: null,
          endUtf16: null,
        };
      }
      return {
        tokenId: token.tokenId,
        text: token.text,
        line: token.line,
        column: token.column,
        startUtf16: token.startUtf16,
        endUtf16: token.endUtf16,
      };
    });
    return {
      kind: relation.kind,
      kindLabel: relation.kind === "nian" ? "粘" : "对",
      status: relation.status,
      sides,
      findingIds: relation.findingIds,
      hasUnresolvedTokens,
    };
  });
}
