/**
 * D3 三库有效候选矩阵：三首 × 平水/词林/新韵 = 9 个组合、288 字位。
 *
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d3-effective-candidates.ts
 *
 * 只读真实快照、已审正文与已批语境规则，**逐字位**计算：
 *   候选全集 / 有效候选 / 命中规则 / 已批语境证据 / 未审有效候选 / 平仄状态
 * 三种「有证据」口径分开统计，不混写：
 *   A 任一候选有证据  B 所有候选有证据  C 所有**有效**候选有证据
 *
 * 平水组合另用 resolveReadings 交叉核对一次（不作为期望来源，只做一致性检查）。
 * 输出 data/reviews/d3-b-effective-candidates.{json,md} 与 d3-b-a-gap-report.md。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BookId,
  ContextRule,
  Evidence,
  SourceRecord,
  Tone,
} from "@poetry/contracts";

import { isReadingsError, parseText, resolveReadings } from "../src/index.js";
import { createLexicon, deserializeSnapshot } from "../../lexicon/src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT_DIR = path.join(ROOT, "data", "reviews");

const BOOKS: Array<{ book: BookId; snapshot: string }> = [
  {
    book: "pingshui",
    snapshot: "data/normalized/pingshui.full-d2-patched.json",
  },
  { book: "cilin", snapshot: "data/normalized/cilin.full-d2.json" },
  { book: "xinyun", snapshot: "data/normalized/xinyun.full-d2.json" },
];

interface GoldenCase {
  id: string;
  title: string;
  text: string;
  reviewStatus: string;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

const cases = ["dengguanquelou", "jingyesi", "huanghelou"].map((name) =>
  readJson<GoldenCase>(`tests/golden/cases/${name}.json`),
);
const rules = readJson<ContextRule[]>("data/context/rules.json");
const contextEvidence = readJson<Evidence[]>("data/context/evidence.json");
const contextSources = readJson<SourceRecord[]>("data/context/sources.json");

interface TokenCell {
  tokenId: string;
  line: number;
  column: number;
  character: string;
  candidateIds: string[];
  effectiveCandidateIds: string[];
  contextRuleIds: string[];
  approvedContextEvidenceIds: string[];
  unbackedEffectiveCandidateIds: string[];
  toneStatus: "resolved" | "ambiguous" | "unknown";
  tone: Tone | null;
  readingStatus: "unknown" | "resolved" | "ambiguous" | "blocked";
  evidenceAny: boolean;
  evidenceAllCandidates: boolean;
  evidenceAllEffective: boolean;
  blockReason: string | null;
}

interface Cell {
  caseId: string;
  title: string;
  book: BookId;
  dataVersion: string;
  snapshotReviewStatus: string;
  tokens: number;
  hasCandidate: number;
  missing: number;
  multiCandidate: number;
  /** 语境筛选前：候选集合本身含平又含仄 */
  toneCriticalBefore: number;
  /** 语境筛选后：有效候选仍含平又含仄 */
  toneCriticalAfter: number;
  /** 语境筛选前含未审竞争候选的字位数（与「有效候选全有证据」不是一个分母） */
  tokensWithUnapprovedCompeting: number;
  ruleHits: number;
  evidenceAny: number;
  evidenceAllCandidates: number;
  evidenceAllEffective: number;
  resolved: number;
  ambiguous: number;
  unknown: number;
  blocked: number;
  blockedTokenIds: string[];
  resolveOutcome: string;
  mismatchWithResolve: number;
  tokenCells: TokenCell[];
}

function deriveTone(tones: Array<Tone | null>): {
  toneStatus: "resolved" | "ambiguous" | "unknown";
  tone: Tone | null;
} {
  if (tones.length === 0) return { toneStatus: "unknown", tone: null };
  const known = [
    ...new Set(tones.filter((tone): tone is Tone => tone !== null)),
  ].sort();
  if (tones.some((tone) => tone === null))
    return { toneStatus: "unknown", tone: null };
  if (known.length === 1)
    return { toneStatus: "resolved", tone: known[0] ?? null };
  return { toneStatus: "ambiguous", tone: null };
}

/** 按行做精确短语匹配，返回 tokenId → 命中的规则。 */
function ruleHitsFor(
  text: string,
  book: BookId,
  rulesForBook: ContextRule[],
): Map<string, ContextRule> {
  const hits = new Map<string, ContextRule>();
  const tokens = parseText({ text }).tokens;
  const byLine = new Map<number, typeof tokens>();
  for (const token of tokens) {
    const bucket = byLine.get(token.line) ?? [];
    bucket.push(token);
    byLine.set(token.line, bucket);
  }
  for (const lineTokens of byLine.values()) {
    const characters = lineTokens.map((token) => token.text);
    for (const rule of rulesForBook) {
      for (const phrase of rule.exactPhrases) {
        const target = [...phrase];
        for (
          let start = 0;
          start + target.length <= characters.length;
          start += 1
        ) {
          if (
            characters.slice(start, start + target.length).join("") !== phrase
          )
            continue;
          const hit = lineTokens[start + rule.targetOffset];
          if (hit === undefined) continue;
          if (hit.text !== rule.target) continue;
          hits.set(hit.tokenId, rule);
        }
      }
    }
  }
  return hits;
}

async function buildCell(
  goldenCase: GoldenCase,
  book: BookId,
  snapshot: Record<string, unknown>,
): Promise<Cell> {
  const snapshotCandidates = snapshot.candidates as Array<{
    id: string;
    character: string;
    tone: Tone | null;
    evidenceIds: string[];
  }>;
  const evidence = snapshot.evidence as Array<{
    id: string;
    reviewStatus: string;
  }>;
  const approved = new Set(
    evidence
      .filter((item) => item.reviewStatus === "approved")
      .map((item) => item.id),
  );
  const byCharacter = new Map<string, typeof snapshotCandidates>();
  for (const candidate of snapshotCandidates) {
    const bucket = byCharacter.get(candidate.character) ?? [];
    bucket.push(candidate);
    byCharacter.set(candidate.character, bucket);
  }

  const dataVersion = String(snapshot.dataVersion);
  const lexicon = createLexicon([deserializeSnapshot(snapshot)]);
  const poem = parseText({ text: goldenCase.text });
  const characters = [...new Set(poem.tokens.map((token) => token.text))];
  const lookup = await lexicon.lookupCharacters({
    characters,
    rhymeBook: book,
    dataVersion,
  });

  const rulesForBook = rules.filter((rule) => rule.book === book);
  const hits = ruleHitsFor(goldenCase.text, book, rulesForBook);
  const approvedContext = new Set(
    contextEvidence
      .filter((item) => item.reviewStatus === "approved")
      .map((item) => item.id),
  );

  const tokenCells: TokenCell[] = [];
  for (const token of poem.tokens) {
    const candidates = byCharacter.get(token.text) ?? [];
    const rule = hits.get(token.tokenId);
    let effective = candidates;
    let blockReason: string | null = null;

    if (rule !== undefined) {
      const chosen = rule.selectCandidateIds[0];
      const exists = candidates.some((candidate) => candidate.id === chosen);
      if (exists && chosen !== undefined) {
        effective = candidates.filter((candidate) => candidate.id === chosen);
      } else {
        blockReason = `CONTEXT_RULE_STALE:${rule.id}`;
      }
    }

    const effectiveIds = effective.map((candidate) => candidate.id);
    const unbacked = effective
      .filter(
        (candidate) => !candidate.evidenceIds.some((id) => approved.has(id)),
      )
      .map((candidate) => candidate.id);
    const { toneStatus, tone } = deriveTone(effective.map((c) => c.tone));

    let readingStatus: TokenCell["readingStatus"];
    if (candidates.length === 0) readingStatus = "unknown";
    else if (unbacked.length > 0) readingStatus = "blocked";
    else if (effective.length === 1) readingStatus = "resolved";
    else readingStatus = "ambiguous";

    tokenCells.push({
      tokenId: token.tokenId,
      line: token.line,
      column: token.column,
      character: token.text,
      candidateIds: candidates.map((candidate) => candidate.id),
      effectiveCandidateIds: effectiveIds,
      contextRuleIds: rule === undefined ? [] : [rule.id],
      approvedContextEvidenceIds:
        rule === undefined
          ? []
          : rule.evidenceIds.filter((id) => approvedContext.has(id)),
      unbackedEffectiveCandidateIds: unbacked,
      toneStatus,
      tone,
      readingStatus,
      evidenceAny: candidates.some((candidate) =>
        candidate.evidenceIds.some((id) => approved.has(id)),
      ),
      evidenceAllCandidates: candidates.every((candidate) =>
        candidate.evidenceIds.some((id) => approved.has(id)),
      ),
      evidenceAllEffective: effective.every((candidate) =>
        candidate.evidenceIds.some((id) => approved.has(id)),
      ),
      blockReason,
    });
  }

  // 平水组合：用 resolveReadings 交叉核对（不作为期望来源）。
  let resolveOutcome = "not-attempted";
  let mismatch = 0;
  if (book === "pingshui") {
    try {
      const merged = {
        ...lookup,
        evidence: [...lookup.evidence, ...contextEvidence],
        sources: [...lookup.sources, ...contextSources],
      };
      const annotated = resolveReadings({
        poem,
        lookup: merged,
        overrides: [],
        contextRules: rulesForBook,
      });
      resolveOutcome = "annotated";
      for (const annotatedToken of annotated.tokens) {
        const cell = tokenCells.find(
          (item) => item.tokenId === annotatedToken.tokenId,
        );
        if (cell === undefined) continue;
        const expected =
          annotatedToken.readingStatus === "resolved"
            ? "resolved"
            : annotatedToken.readingStatus === "unknown"
              ? "unknown"
              : "ambiguous";
        if (cell.readingStatus !== expected) mismatch += 1;
      }
    } catch (error) {
      resolveOutcome = isReadingsError(error) ? error.code : "OTHER_ERROR";
    }
  }

  const blockedTokenIds = tokenCells
    .filter((cell) => cell.readingStatus === "blocked")
    .map((cell) => cell.tokenId);

  return {
    caseId: goldenCase.id,
    title: goldenCase.title,
    book,
    dataVersion,
    snapshotReviewStatus: String(snapshot.reviewStatus),
    tokens: tokenCells.length,
    hasCandidate: tokenCells.filter((cell) => cell.candidateIds.length > 0)
      .length,
    missing: tokenCells.filter((cell) => cell.candidateIds.length === 0).length,
    multiCandidate: tokenCells.filter((cell) => cell.candidateIds.length > 1)
      .length,
    toneCriticalBefore: tokenCells.filter((cell) => {
      const tones = new Set(
        cell.candidateIds
          .map((id) => snapshotCandidates.find((c) => c.id === id)?.tone)
          .filter((tone): tone is Tone => tone !== null && tone !== undefined),
      );
      return tones.size > 1;
    }).length,
    toneCriticalAfter: tokenCells.filter((cell) => {
      const tones = new Set(
        cell.effectiveCandidateIds
          .map((id) => snapshotCandidates.find((c) => c.id === id)?.tone)
          .filter((tone): tone is Tone => tone !== null && tone !== undefined),
      );
      return tones.size > 1;
    }).length,
    tokensWithUnapprovedCompeting: tokenCells.filter(
      (cell) => !cell.evidenceAllCandidates,
    ).length,
    ruleHits: tokenCells.filter((cell) => cell.contextRuleIds.length > 0)
      .length,
    evidenceAny: tokenCells.filter((cell) => cell.evidenceAny).length,
    evidenceAllCandidates: tokenCells.filter(
      (cell) => cell.evidenceAllCandidates,
    ).length,
    evidenceAllEffective: tokenCells.filter((cell) => cell.evidenceAllEffective)
      .length,
    resolved: tokenCells.filter((cell) => cell.readingStatus === "resolved")
      .length,
    ambiguous: tokenCells.filter((cell) => cell.readingStatus === "ambiguous")
      .length,
    unknown: tokenCells.filter((cell) => cell.readingStatus === "unknown")
      .length,
    blocked: tokenCells.filter((cell) => cell.readingStatus === "blocked")
      .length,
    blockedTokenIds,
    resolveOutcome,
    mismatchWithResolve: mismatch,
    tokenCells,
  };
}

async function main(): Promise<void> {
  const cells: Cell[] = [];
  for (const { book, snapshot: snapshotPath } of BOOKS) {
    const snapshot = readJson<Record<string, unknown>>(snapshotPath);
    for (const goldenCase of cases) {
      cells.push(await buildCell(goldenCase, book, snapshot));
    }
  }

  const report = {
    generatedBy: "packages/readings/scripts/d3-effective-candidates.ts",
    note: "逐字位有效候选矩阵。三种「有证据」口径分开统计：evidenceAny=任一候选有证据；evidenceAllCandidates=所有候选有证据；evidenceAllEffective=所有有效候选有证据。blocked/unknown/ambiguous 分列，多读同调不写作读音已确定。",
    rules: {
      total: rules.length,
      byBook: rules.reduce<Record<string, number>>((acc, rule) => {
        acc[rule.book] = (acc[rule.book] ?? 0) + 1;
        return acc;
      }, {}),
      note: "语境规则按 book 生效；平水规则不自动迁移到词林/新韵，跨书需先证明词义可迁移与候选归属。",
    },
    totals: {
      combinations: cells.length,
      tokens: cells.reduce((sum, cell) => sum + cell.tokens, 0),
    },
    cells,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "d3-b-effective-candidates.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const lines: string[] = [];
  lines.push("# D3 三库有效候选矩阵（9 组合 / 288 字位）");
  lines.push("");
  lines.push("规则按 book 生效；平水 11 条不自动迁移到词林/新韵。");
  lines.push("");
  lines.push(
    "| 作品 | 韵书 | 字位 | 有候选 | 缺字 | 多候选 | 临界(筛前) | 临界(筛后) | 含未审竞争 | 规则命中 | 任一有证据 | 全部候选有证据 | 全部有效有证据 | resolved | ambiguous | unknown | blocked |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const cell of cells) {
    lines.push(
      `| ${cell.title} | ${cell.book} | ${cell.tokens} | ${cell.hasCandidate} | ${cell.missing} | ${cell.multiCandidate} | ${cell.toneCriticalBefore} | ${cell.toneCriticalAfter} | ${cell.tokensWithUnapprovedCompeting} | ${cell.ruleHits} | ${cell.evidenceAny} | ${cell.evidenceAllCandidates} | ${cell.evidenceAllEffective} | ${cell.resolved} | ${cell.ambiguous} | ${cell.unknown} | ${cell.blocked} |`,
    );
  }
  lines.push("");
  lines.push("## 平水组合与 resolveReadings 交叉核对");
  lines.push("");
  for (const cell of cells.filter((item) => item.book === "pingshui")) {
    lines.push(
      `- ${cell.title}：resolveReadings=${cell.resolveOutcome}，与逐字位推导不一致 ${cell.mismatchWithResolve} 处；blocked ${cell.blocked}，ambiguous ${cell.ambiguous}，resolved ${cell.resolved}`,
    );
  }
  lines.push("");

  writeFileSync(
    path.join(OUT_DIR, "d3-b-effective-candidates.md"),
    `${lines.join("\n").trimEnd()}\n`,
    "utf8",
  );

  // 给 A 的缺口报告：登鹳雀楼在词林/新韵下的逐字位情况。
  const gapLines: string[] = [];
  gapLines.push("# 给 A：登鹳雀楼在词林/新韵下的候选缺口");
  gapLines.push("");
  for (const book of ["cilin", "xinyun"] as BookId[]) {
    const cell = cells.find(
      (item) =>
        item.book === book && item.caseId === "golden-dengguanquelou-ps-v1",
    );
    if (cell === undefined) continue;
    gapLines.push(`## ${book}（${cell.dataVersion}）`);
    gapLines.push("");
    gapLines.push(
      `字位 ${cell.tokens}；有候选 ${cell.hasCandidate}；缺字 ${cell.missing}；多候选 ${cell.multiCandidate}；全部有效候选有证据 ${cell.evidenceAllEffective}/${cell.tokens}；blocked ${cell.blocked}。`,
    );
    gapLines.push("");
    gapLines.push(
      "| 字位 | 字 | 候选全集 | 有效候选 | 排除依据 | 平仄 | 阻断 |",
    );
    gapLines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const token of cell.tokenCells) {
      gapLines.push(
        `| ${token.tokenId} | ${token.character} | ${token.candidateIds.join("、") || "—"} | ${token.effectiveCandidateIds.join("、") || "—"} | ${token.contextRuleIds.length > 0 ? `语境规则 ${token.contextRuleIds.join("、")}` : "无（保留全部候选）"} | ${token.toneStatus}${token.tone === null ? "" : `=${token.tone}`} | ${token.blockReason ?? (token.unbackedEffectiveCandidateIds.length > 0 ? `未审候选 ${token.unbackedEffectiveCandidateIds.join("、")}` : "无")} |`,
      );
    }
    gapLines.push("");
  }
  writeFileSync(
    path.join(OUT_DIR, "d3-b-a-gap-report.md"),
    `${gapLines.join("\n").trimEnd()}\n`,
    "utf8",
  );

  console.log(
    cells
      .map(
        (cell) =>
          `${cell.title}/${cell.book}: ${cell.resolved}R ${cell.ambiguous}A ${cell.unknown}U ${cell.blocked}B`,
      )
      .join("\n"),
  );
}

await main();
