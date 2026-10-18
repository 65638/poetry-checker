/**
 * 覆盖统计与「平仄取决于消歧」位置分析（带分母，按 AGENTS.md 四栏口径）。
 *
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d2-coverage.ts
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d2-coverage.ts <快照相对路径>
 *
 * 默认用 `data/normalized/pingshui.full-d2-patched.json`——即 `apps/api/src/snapshot-manifest.json`
 * 为 pingshui 声明的当前快照（106 部，含上声三讲补缺）。105 部版 `pingshui.full-d2.json`
 * 不在 API 清单内，只在报告的版本说明里作对照。
 * 正文取 `data/works/review-queue.json` 中 E 登记的三首固定正文。
 *
 * 本脚本**不绕过审核门槛**：证据未审核时 resolveReadings 会抛 LOOKUP_EVIDENCE_UNVERIFIED，
 * 这里如实记录，并把缺口按字位统计出来，不产出“成功空候选”。
 *
 * 输出：
 *   data/context/d2-coverage-report.json / .md
 *   data/context/tone-critical-positions.json（平仄依赖消歧的位置清单，给人工审核用）
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Tone } from "@poetry/contracts";

import { parseText, resolveReadings, isReadingsError } from "../src/index.js";
import { createLexicon, deserializeSnapshot } from "../../lexicon/src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT_DIR = path.join(ROOT, "data", "context");
const DEFAULT_SNAPSHOT = "data/normalized/pingshui.full-d2-patched.json";
/** API 当前装载的平水快照，见 apps/api/src/snapshot-manifest.json。 */
const API_MANIFEST_SNAPSHOT = "pingshui.full-d2-patched.json";
/** 不在 API 清单内的 105 部版，仅用于版本差异说明。 */
const LEGACY_SNAPSHOT = "pingshui.full-d2.json";

interface WorkEntry {
  caseId: string;
  title: string;
  author: string | null;
  text: string;
  reviewStatus: string;
}

interface ToneCriticalPosition {
  tokenId: string;
  character: string;
  line: number;
  column: number;
  candidateIds: string[];
  tones: Array<Tone | null>;
  groupIds: string[];
  evidenceIds: string[];
  evidenceApproved: boolean;
}

interface WorkReport {
  caseId: string;
  title: string;
  tokens: number;
  uniqueCharacters: number;
  coveredTokens: number;
  missingTokens: number;
  multiCandidateTokens: number;
  toneCritical: ToneCriticalPosition[];
  toneFixedMulti: ToneCriticalPosition[];
  tokensWithoutApprovedEvidence: number;
  missingCharacters: string[];
  resolveOutcome:
    | { kind: "annotated" }
    | {
        kind: "data_not_ready";
        code: string;
        message: string;
        details: Record<string, string>;
      }
    | { kind: "error"; code: string | null; message: string };
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

async function analyseWork(
  lexicon: ReturnType<typeof createLexicon>,
  work: WorkEntry,
  dataVersion: string,
  approved: ReadonlySet<string>,
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

  let coveredTokens = 0;
  let missingTokens = 0;
  let multiCandidateTokens = 0;
  let tokensWithoutApprovedEvidence = 0;
  const toneCritical: ToneCriticalPosition[] = [];
  const toneFixedMulti: ToneCriticalPosition[] = [];

  for (const token of poem.tokens) {
    const candidates = candidatesByCharacter.get(token.text);
    if (candidates === undefined) {
      missingTokens += 1;
      continue;
    }
    coveredTokens += 1;

    const tones = [...new Set(candidates.map((candidate) => candidate.tone))];
    const knownTones = tones.filter((tone): tone is Tone => tone !== null);
    const evidenceApproved = candidates.some((candidate) =>
      candidate.evidenceIds.some((id) => approved.has(id)),
    );
    if (!evidenceApproved) tokensWithoutApprovedEvidence += 1;

    const position: ToneCriticalPosition = {
      tokenId: token.tokenId,
      character: token.text,
      line: token.line,
      column: token.column,
      candidateIds: candidates.map((candidate) => candidate.id),
      tones,
      groupIds: [...new Set(candidates.flatMap((c) => c.groupIds))],
      evidenceIds: [
        ...new Set(candidates.flatMap((candidate) => candidate.evidenceIds)),
      ],
      evidenceApproved,
    };

    if (candidates.length > 1) {
      multiCandidateTokens += 1;
      // 平仄取决于消歧：候选里既有平又有仄。
      if (knownTones.length > 1) toneCritical.push(position);
      else toneFixedMulti.push(position);
    }
  }

  let resolveOutcome: WorkReport["resolveOutcome"];
  try {
    resolveReadings({ poem, lookup, overrides: [], contextRules: [] });
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
    toneCritical,
    toneFixedMulti,
    tokensWithoutApprovedEvidence,
    missingCharacters: [...lookup.missing].sort(),
    resolveOutcome,
  };
}

async function main(): Promise<void> {
  const snapshotPath = process.argv[2] ?? DEFAULT_SNAPSHOT;
  const sample = readJson<Record<string, unknown>>(snapshotPath);
  const works = readJson<{ items: WorkEntry[] }>(
    "data/works/review-queue.json",
  ).items;
  const reviewQueue = readJson<{ items: unknown[] }>(
    "data/context/review-queue.json",
  ).items;

  const dataVersion = String(sample.dataVersion);
  const lexicon = createLexicon([deserializeSnapshot(sample)]);
  const evidenceRecords = (sample.evidence ?? []) as Array<{
    id: string;
    reviewStatus: string;
  }>;
  const approved = new Set(
    evidenceRecords
      .filter((item) => item.reviewStatus === "approved")
      .map((item) => item.id),
  );
  const approvedCount = approved.size;

  const reports: WorkReport[] = [];
  for (const work of works) {
    reports.push(await analyseWork(lexicon, work, dataVersion, approved));
  }

  const totalTokens = reports.reduce((sum, item) => sum + item.tokens, 0);
  const totalCovered = reports.reduce(
    (sum, item) => sum + item.coveredTokens,
    0,
  );
  const totalMissing = reports.reduce(
    (sum, item) => sum + item.missingTokens,
    0,
  );
  const totalNoEvidence = reports.reduce(
    (sum, item) => sum + item.tokensWithoutApprovedEvidence,
    0,
  );
  const totalToneCritical = reports.reduce(
    (sum, item) => sum + item.toneCritical.length,
    0,
  );

  const report = {
    generatedBy: "packages/readings/scripts/d2-coverage.ts",
    book: "pingshui" as const,
    snapshot: snapshotPath,
    snapshotDeclaration: {
      source: "apps/api/src/snapshot-manifest.json",
      apiManifestSnapshot: API_MANIFEST_SNAPSHOT,
      legacySnapshot: LEGACY_SNAPSHOT,
      matchesApiManifest:
        snapshotPath === `data/normalized/${API_MANIFEST_SNAPSHOT}`,
      note: "本报告与 API 装的是同一份快照（106 部）。105 部版缺上声三讲，不在 API 清单内；两份快照的 reviewStatus 都是 unverified，都不能称为已审核数据。",
    },
    dataVersion,
    snapshotReviewStatus: sample.reviewStatus,
    snapshotNotice: sample.notice,
    fourColumnSummary: {
      structure: {
        lexiconAccepted: true,
        snapshotReviewStatus: sample.reviewStatus,
        note: "快照通过 deserializeSnapshot 的引用完整性校验与 LookupResultSchema；这只说明结构与引用成立，不代表内容审核。",
      },
      machineComparison: {
        tokens: totalTokens,
        coveredTokens: totalCovered,
        missingTokens: totalMissing,
        note: "逐字位比对字表覆盖情况。",
      },
      humanReview: {
        worksApproved: 0,
        contextRulesApproved: 0,
        contextRulesInQueue: reviewQueue.length,
        note: "E 的三首正文仍是 pending；语境规则仍在待审队列。",
      },
      evidenceApproved: {
        approved: approvedCount,
        total: evidenceRecords.length,
        note: "evidence 未审核时，有候选的字位也不能进入确定结论。",
      },
    },
    denominators: {
      unit: "token（格律字位）",
      note: "所有比例的分母都是字位；缺字、证据未就绪都按字位计入。",
    },
    totals: {
      tokens: totalTokens,
      coveredTokens: totalCovered,
      missingTokens: totalMissing,
      tokensWithoutApprovedEvidence: totalNoEvidence,
      toneCriticalPositions: totalToneCritical,
    },
    works: reports,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "d2-coverage-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  writeFileSync(
    path.join(OUT_DIR, "tone-critical-positions.json"),
    `${JSON.stringify(
      {
        generatedBy: "packages/readings/scripts/d2-coverage.ts",
        note: "平仄取决于消歧的位置：候选里同时存在平与仄，选错会直接改变格律结论。按字位列出，供人工优先审核对应韵部证据。",
        dataVersion,
        positions: reports.flatMap((item) =>
          item.toneCritical.map((position) => ({
            work: item.title,
            ...position,
          })),
        ),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const lines: string[] = [];
  lines.push("# 覆盖报告（带分母，四栏口径）");
  lines.push("");
  lines.push(`快照：\`${snapshotPath}\``);
  lines.push(`dataVersion：\`${dataVersion}\``);
  lines.push("");
  lines.push(
    "> **快照口径**：本报告使用 `apps/api/src/snapshot-manifest.json` 为 pingshui 声明的当前快照" +
      "（106 部，含上声三讲补缺）。105 部版 `pingshui.full-d2.json` 缺上声三讲、不在 API 清单内，" +
      "不与本报告混用；两份快照的 `reviewStatus` 都是 `unverified`，都不代表已审核数据。",
  );
  lines.push("");
  lines.push("| 项目 | 结构完整性 | 机器对照 | 人工核验 | evidence approved |");
  lines.push("| --- | --- | --- | --- | --- |");
  lines.push(
    `| 现状 | 引用/结构通过（快照 reviewStatus=${String(sample.reviewStatus)}） | ${totalCovered}/${totalTokens} 字位有候选，缺字 ${totalMissing} | 作品审核 0/3，语境规则 0 条 | **${approvedCount}/${evidenceRecords.length}** |`,
  );
  lines.push("");
  lines.push(
    "> 结构通过 ≠ 内容审核通过。上表最后一栏才是决定能否出结论的那一栏。",
  );
  lines.push("");
  lines.push(
    "| 作品 | 字位 | 有候选 | 缺字 | 多候选 | 其中平仄取决于消歧 | 无已审核证据 | resolve 结果 |",
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
      `| ${item.title} | ${item.tokens} | ${item.coveredTokens} | ${item.missingTokens} | ${item.multiCandidateTokens} | ${item.toneCritical.length} | ${item.tokensWithoutApprovedEvidence} | ${outcome} |`,
    );
  }
  lines.push("");
  lines.push(`## 平仄取决于消歧的位置（共 ${totalToneCritical} 个）`);
  lines.push("");
  lines.push(
    "这些字位的候选同时含平与仄，选错会直接改变格律结论；其余多音字位属于「读音歧义但平仄已定」，不影响格律。",
  );
  lines.push("");
  for (const item of reports) {
    if (item.toneCritical.length === 0) continue;
    lines.push(`**${item.title}**`);
    lines.push("");
    for (const position of item.toneCritical) {
      lines.push(
        `- ${position.tokenId}「${position.character}」：${position.candidateIds.length} 个候选（平仄 ${position.tones.join("/")}）`,
      );
      for (const candidateId of position.candidateIds) {
        lines.push(`  - \`${candidateId}\``);
      }
    }
    lines.push("");
  }
  lines.push("## 读法");
  lines.push("");
  lines.push(
    "- **有候选 / 缺字**：lookup 层事实。当前全量表下三首诗 100% 有候选。",
  );
  lines.push(
    "- **无已审核证据**：有候选但证据未审核，`resolveReadings` 按门槛抛 `LOOKUP_EVIDENCE_UNVERIFIED`。",
  );
  lines.push(
    "- **仍歧义 / 未知 / 有效语境命中**：本批次全部为 0——没有一条规则通过审核、也没有一个字位拿到已审核证据。",
  );
  lines.push(
    "- 因此本报告**不产生**读音准确率或自动覆盖率：任何比例都会是拿未核实数据算出来的。",
  );
  lines.push("");

  writeFileSync(
    path.join(OUT_DIR, "d2-coverage-report.md"),
    `${lines.join("\n").trimEnd()}\n`,
    "utf8",
  );

  console.log(lines.join("\n"));
}

await main();
