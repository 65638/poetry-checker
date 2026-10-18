/**
 * D2 真实数据复现与覆盖统计（带分母）。
 *
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d2-coverage.ts
 *
 * 数据来源只用仓库内真实快照 `data/normalized/pingshui.sample-d1.json`（七字真实小样本，
 * reviewStatus=unverified），正文取 `data/works/review-queue.json` 里 E 登记的三首固定正文。
 *
 * 本脚本**不绕过审核门槛**：证据未审核时 resolveReadings 会抛 LOOKUP_EVIDENCE_UNVERIFIED，
 * 这里如实记录该结果，并把缺口按字位统计出来，不产出“成功空候选”。
 *
 * 输出：data/context/d2-coverage-report.json 与同名 .md。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LookupResult } from "@poetry/contracts";

import { parseText, resolveReadings, isReadingsError } from "../src/index.js";
import { createLexicon, deserializeSnapshot } from "../../lexicon/src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT_DIR = path.join(ROOT, "data", "context");

interface WorkEntry {
  caseId: string;
  title: string;
  author: string | null;
  text: string;
  reviewStatus: string;
}

interface WorkReport {
  caseId: string;
  title: string;
  tokens: number;
  uniqueCharacters: number;
  coveredTokens: number;
  missingTokens: number;
  multiCandidateTokens: number;
  tokensWithoutApprovedEvidence: number;
  missingCharacters: string[];
  multiCandidateCharacters: Array<{
    character: string;
    candidateIds: string[];
    tones: Array<string | null>;
  }>;
  resolveOutcome:
    | { kind: "annotated" }
    | {
        kind: "data_not_ready";
        code: string;
        message: string;
        details: Record<string, string>;
      }
    | { kind: "error"; code: string | null; message: string };
  contextRuleHits: number;
  readingStatusCounts: Record<string, number> | null;
  toneStatusCounts: Record<string, number> | null;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function approvedEvidenceIds(lookup: LookupResult): Set<string> {
  return new Set(
    lookup.evidence
      .filter((evidence) => evidence.reviewStatus === "approved")
      .map((evidence) => evidence.id),
  );
}

async function analyseWork(
  lexicon: ReturnType<typeof createLexicon>,
  work: WorkEntry,
  dataVersion: string,
): Promise<WorkReport> {
  const poem = parseText({ text: work.text });
  const characters = [...new Set(poem.tokens.map((token) => token.text))];
  const lookup = await lexicon.lookupCharacters({
    characters,
    rhymeBook: "pingshui",
    dataVersion,
  });

  const candidatesByCharacter = new Map(
    lookup.entries.map((entry) => [entry.character, entry.candidates]),
  );
  const approved = approvedEvidenceIds(lookup);

  let coveredTokens = 0;
  let missingTokens = 0;
  let multiCandidateTokens = 0;
  let tokensWithoutApprovedEvidence = 0;
  const multiCandidateCharacters: WorkReport["multiCandidateCharacters"] = [];

  for (const character of characters) {
    const candidates = candidatesByCharacter.get(character);
    if (candidates === undefined || candidates.length <= 1) continue;
    multiCandidateCharacters.push({
      character,
      candidateIds: candidates.map((candidate) => candidate.id),
      tones: candidates.map((candidate) => candidate.tone),
    });
  }

  for (const token of poem.tokens) {
    const candidates = candidatesByCharacter.get(token.text);
    if (candidates === undefined) {
      missingTokens += 1;
      continue;
    }
    coveredTokens += 1;
    if (candidates.length > 1) multiCandidateTokens += 1;
    const backed = candidates.some((candidate) =>
      candidate.evidenceIds.some((id) => approved.has(id)),
    );
    if (!backed) tokensWithoutApprovedEvidence += 1;
  }

  let resolveOutcome: WorkReport["resolveOutcome"];
  let readingStatusCounts: Record<string, number> | null = null;
  let toneStatusCounts: Record<string, number> | null = null;
  const contextRuleHits = 0;

  try {
    const annotated = resolveReadings({
      poem,
      lookup,
      overrides: [],
      contextRules: [],
    });
    readingStatusCounts = countBy(
      annotated.tokens.map((token) => token.readingStatus),
    );
    toneStatusCounts = countBy(
      annotated.tokens.map((token) => token.toneStatus),
    );
    resolveOutcome = { kind: "annotated" };
  } catch (error) {
    if (isReadingsError(error)) {
      resolveOutcome = {
        kind: "data_not_ready",
        code: error.code,
        message: error.message,
        details: { ...error.details },
      };
    } else {
      resolveOutcome = {
        kind: "error",
        code: null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    caseId: work.caseId,
    title: work.title,
    tokens: poem.tokens.length,
    uniqueCharacters: characters.length,
    coveredTokens,
    missingTokens,
    multiCandidateTokens,
    tokensWithoutApprovedEvidence,
    missingCharacters: [...lookup.missing].sort(),
    multiCandidateCharacters,
    resolveOutcome,
    contextRuleHits,
    readingStatusCounts,
    toneStatusCounts,
  };
}

async function main(): Promise<void> {
  const sample = readJson<Record<string, unknown>>(
    "data/normalized/pingshui.sample-d1.json",
  );
  const works = readJson<{ items: WorkEntry[] }>(
    "data/works/review-queue.json",
  ).items;
  const reviewQueue = readJson<{ items: unknown[] }>(
    "data/context/review-queue.json",
  ).items;

  const dataVersion = String(sample.dataVersion);
  const lexicon = createLexicon([deserializeSnapshot(sample)]);

  const reports: WorkReport[] = [];
  for (const work of works) {
    reports.push(await analyseWork(lexicon, work, dataVersion));
  }

  const report = {
    generatedBy: "packages/readings/scripts/d2-coverage.ts",
    book: "pingshui" as const,
    dataVersion,
    snapshotReviewStatus: sample.reviewStatus,
    snapshotNotice: sample.notice,
    contextRules: {
      approved: 0,
      loaded: 0,
      inReviewQueue: reviewQueue.length,
      note: "本批次没有任何一条语境规则通过人工审核，因此实际参与选音的规则为 0 条。",
    },
    denominators: {
      unit: "token（格律字位）",
      note: "所有比例的分母都是字位；缺字、证据未就绪都按字位计入，不做字符级折算。",
    },
    works: reports,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "d2-coverage-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const lines: string[] = [];
  lines.push("# D2 真实数据覆盖报告（带分母）");
  lines.push("");
  lines.push(
    `数据：\`${dataVersion}\`（平水，快照 reviewStatus=\`${String(sample.reviewStatus)}\`）`,
  );
  lines.push("");
  lines.push(
    "正文：`data/works/review-queue.json` 中 E 登记的三首固定正文（均为 pending 状态）。",
  );
  lines.push("");
  lines.push(
    `语境规则：实际参与选音 **0 条**；待审队列 ${reviewQueue.length} 条，不计入覆盖。`,
  );
  lines.push("");
  lines.push(
    "| 作品 | 字位 | 去重字数 | 有候选字位 | 缺字位 | 多候选字位 | 无已审核证据字位 | resolve 结果 |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of reports) {
    const outcome =
      item.resolveOutcome.kind === "annotated"
        ? "已标注"
        : item.resolveOutcome.kind === "data_not_ready"
          ? `未就绪（${item.resolveOutcome.code}）`
          : "错误";
    lines.push(
      `| ${item.title} | ${item.tokens} | ${item.uniqueCharacters} | ${item.coveredTokens} | ${item.missingTokens} | ${item.multiCandidateTokens} | ${item.tokensWithoutApprovedEvidence} | ${outcome} |`,
    );
  }
  lines.push("");
  lines.push("## 读法");
  lines.push("");
  lines.push(
    "- **有候选字位 / 缺字位**：`lookup` 层事实。缺字是 A 的样本只有七字导致，不是解析问题。",
  );
  lines.push(
    "- **无已审核证据字位**：这些字位即使有候选，也不能支撑读音/平仄结论；`resolveReadings` 按门槛抛 `LOOKUP_EVIDENCE_UNVERIFIED`。",
  );
  lines.push(
    "- **仍歧义 / 未知 / 有效语境命中**：本批次全部为 0——不是因为判成 0，而是因为没有一条规则通过审核、也没有一个字位拿到已审核证据，标注阶段整体未就绪。",
  );
  lines.push(
    "- 因此本报告**不产生**读音准确率或自动覆盖率：没有已审核证据与已审核规则，任何比例都会是拿未核实数据算出来的。",
  );
  lines.push("");
  lines.push("## 缺口清单");
  lines.push("");
  for (const item of reports) {
    const missing =
      item.missingCharacters.length === 0
        ? "（无缺字）"
        : item.missingCharacters.join("、");
    lines.push(
      `- **${item.title}**（${item.tokens} 字位）：缺 ${item.missingTokens} 字位；缺字：${missing}`,
    );
    for (const multi of item.multiCandidateCharacters) {
      lines.push(
        `  - 多候选「${multi.character}」：${multi.candidateIds.join(" / ")}（平仄 ${multi.tones.join(" / ")}）`,
      );
    }
  }
  lines.push("");

  writeFileSync(
    path.join(OUT_DIR, "d2-coverage-report.md"),
    `${lines.join("\n").trimEnd()}\n`,
    "utf8",
  );

  console.log(lines.join("\n"));
}

await main();
