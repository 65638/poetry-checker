/**
 * 三首金标准逐字机器初审表（96 字位）。
 *
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/golden-token-review.ts
 *
 * 只读真实快照与固定正文，不调用格律、不推断读音：
 * - 候选、平仄、韵部、证据状态全部取自快照；
 * - 证据未审核时机器结论一律为「门禁拦截」，不产出 readingStatus；
 * - 规则草案只列候选与待查义项，不替人做批准。
 *
 * 输出：data/reviews/golden-token-review-2026-10-18.json 与同名 .md
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Tone } from "@poetry/contracts";

import { parseText } from "../src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT_DIR = path.join(ROOT, "data", "reviews");
const SNAPSHOT = "data/normalized/pingshui.full-d2-patched.json";
/** 旧七字样本，只用于版本差异说明。 */
const LEGACY_SAMPLE = "data/normalized/pingshui.sample-d1.json";

interface CandidateRecord {
  id: string;
  character: string;
  toneClass: string;
  tone: Tone | null;
  groupIds: string[];
  evidenceIds: string[];
}

interface EvidenceRecord {
  id: string;
  kind: string;
  reviewStatus: string;
  locator: string;
}

interface WorkEntry {
  caseId: string;
  title: string;
  text: string;
}

interface Row {
  work: string;
  caseId: string;
  line: number;
  column: number;
  tokenId: string;
  character: string;
  candidateCount: number;
  candidateIds: string[];
  tones: Array<Tone | null>;
  /** 与 candidateIds 一一对应的声调（不去重）。 */
  candidateTones: Array<Tone | null>;
  toneCritical: boolean;
  evidenceApproved: boolean;
  evidenceIds: string[];
  groupIds: string[];
  machineOutcome: "blocked" | "would-resolve" | "would-ambiguous";
  machineNote: string;
  humanNote: string;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

/** 人工备注只复述人审记录已确认的范围，不新增结论。 */
const HUMAN_NOTES: Record<string, string> = {
  更: "J03 第一批确认「更两读」属实；未确认哪一义项对应哪一读音，故仍待语境证据。",
  楼: "J03 第一批对「楼与樓」判为存疑，要求补异体关系与证据：不得因同部或已归档转为 approved。",
  白: "J03 第一批确认该候选归属属实（范围仅限列明候选，不等于全部韵部获批）。",
  一: "J03 第一批确认该候选归属属实（范围仅限列明候选）。",
  流: "J03 第一批确认该候选归属属实（范围仅限列明候选）。",
  雪: "J03 第一批确认该候选归属属实（范围仅限列明候选）。",
  物: "J03 第一批确认该候选归属属实（范围仅限列明候选）。",
};

function main(): void {
  const snapshot = readJson<{
    dataVersion: string;
    book: string;
    reviewStatus: string;
    candidates: CandidateRecord[];
    evidence: EvidenceRecord[];
    groups: Array<{ id: string; name: string; toneClass: string | null }>;
  }>(SNAPSHOT);
  const legacy = readJson<{
    dataVersion: string;
    candidates: CandidateRecord[];
  }>(LEGACY_SAMPLE);
  const works = readJson<{ items: WorkEntry[] }>(
    "data/works/review-queue.json",
  ).items;

  const byCharacter = new Map<string, CandidateRecord[]>();
  for (const candidate of snapshot.candidates) {
    const bucket = byCharacter.get(candidate.character);
    if (bucket === undefined) byCharacter.set(candidate.character, [candidate]);
    else bucket.push(candidate);
  }
  const approved = new Set(
    snapshot.evidence
      .filter((item) => item.reviewStatus === "approved")
      .map((item) => item.id),
  );
  const groupName = new Map(snapshot.groups.map((g) => [g.id, g.name]));

  const rows: Row[] = [];
  for (const work of works) {
    const poem = parseText({ text: work.text });
    for (const token of poem.tokens) {
      const candidates = byCharacter.get(token.text) ?? [];
      const tones = [...new Set(candidates.map((c) => c.tone))];
      const knownTones = tones.filter((t): t is Tone => t !== null);
      const evidenceApproved = candidates.some((c) =>
        c.evidenceIds.some((id) => approved.has(id)),
      );
      const multi = candidates.length > 1;
      const toneCritical = multi && knownTones.length > 1;

      // 机器结论只依据当前证据状态，不做任何读音推断。
      let machineOutcome: Row["machineOutcome"];
      let machineNote: string;
      if (!evidenceApproved) {
        machineOutcome = "blocked";
        machineNote = `门禁拦截：候选证据未审核（approved 0/${snapshot.evidence.length}），不产出 readingStatus`;
      } else if (candidates.length === 1) {
        machineOutcome = "would-resolve";
        machineNote = "候选唯一且证据已审核，可 resolved";
      } else {
        machineOutcome = "would-ambiguous";
        machineNote = toneCritical
          ? "多候选含平含仄：读音与平仄均需消歧"
          : `多候选但平仄已定（${knownTones.join("/")}）：读音歧义、平仄可确定`;
      }

      rows.push({
        work: work.title,
        caseId: work.caseId,
        line: token.line,
        column: token.column,
        tokenId: token.tokenId,
        character: token.text,
        candidateCount: candidates.length,
        candidateIds: candidates.map((c) => c.id),
        tones,
        candidateTones: candidates.map((c) => c.tone),
        toneCritical,
        evidenceApproved,
        evidenceIds: [...new Set(candidates.flatMap((c) => c.evidenceIds))],
        groupIds: [
          ...new Set(
            candidates.flatMap((c) =>
              c.groupIds.map((id) => groupName.get(id) ?? id),
            ),
          ),
        ],
        machineOutcome,
        machineNote,
        humanNote: HUMAN_NOTES[token.text] ?? "",
      });
    }
  }

  // 规则草案的短语取「以目标字为中心、长度 3 的窗口」，贴边时向内收；
  // 这只是可审核的起点，评审可换成更合适的词组。
  const draftPhrase: Record<string, { phrase: string; targetOffset: number }> =
    {};
  for (const work of works) {
    const poem = parseText({ text: work.text });
    const tokens = poem.tokens;
    for (const row of rows.filter((r) => r.caseId === work.caseId)) {
      const index = tokens.findIndex((t) => t.tokenId === row.tokenId);
      const lineTokens = tokens.filter((t) => t.line === tokens[index]?.line);
      if (index < 0 || lineTokens.length === 0) continue;
      const offsetInLine = lineTokens.findIndex(
        (t) => t.tokenId === row.tokenId,
      );
      const start = Math.max(
        0,
        Math.min(offsetInLine - 1, lineTokens.length - 3),
      );
      const window = lineTokens.slice(start, start + 3).map((t) => t.text);
      draftPhrase[row.tokenId] = {
        phrase: window.join(""),
        targetOffset: offsetInLine - start,
      };
    }
  }

  const toneCriticalRows = rows.filter((row) => row.toneCritical);
  const multiRows = rows.filter((row) => row.candidateCount > 1);
  const legacyChars = new Set(legacy.candidates.map((c) => c.character));

  const report = {
    generatedBy: "packages/readings/scripts/golden-token-review.ts",
    task: "B 逐字机器初审表（96 字位）",
    note: "本表是机器初审：只陈述快照事实与门禁结果，不给读音结论、不批准任何证据。人工备注仅复述 J03 第一批已确认的范围。",
    book: snapshot.book,
    snapshot: SNAPSHOT,
    dataVersion: snapshot.dataVersion,
    snapshotReviewStatus: snapshot.reviewStatus,
    apiManifestSnapshot: "pingshui.full-d2-patched.json",
    denominators: {
      unit: "token（格律字位）",
      tokens: rows.length,
      works: works.map((work) => ({
        title: work.title,
        tokens: rows.filter((row) => row.work === work.title).length,
      })),
      coveredTokens: rows.filter((row) => row.candidateCount > 0).length,
      missingTokens: rows.filter((row) => row.candidateCount === 0).length,
      multiCandidateTokens: multiRows.length,
      toneCriticalTokens: toneCriticalRows.length,
      evidenceTotal: snapshot.evidence.length,
      evidenceApproved: approved.size,
      tokensWithoutApprovedEvidence: rows.filter((row) => !row.evidenceApproved)
        .length,
    },
    works: works.map((work) => ({
      caseId: work.caseId,
      title: work.title,
      tokens: rows.filter((row) => row.work === work.title),
    })),
    toneCritical: toneCriticalRows.map((row) => ({
      work: row.work,
      tokenId: row.tokenId,
      character: row.character,
      candidateIds: row.candidateIds,
      tones: row.tones,
      humanNote: row.humanNote,
    })),
    versionDiff: {
      legacySample: LEGACY_SAMPLE,
      legacyDataVersion: legacy.dataVersion,
      legacyCharacters: legacyChars.size,
      currentCharacters: byCharacter.size,
      note: "旧七字样本（白、一、更、流、楼、雪、物）不在 API 装载清单内；本表全部数据来自 106 部全量快照，不使用旧样本结果。",
    },
    contextRuleDrafts: toneCriticalRows.map((row) => ({
      id: `draft-${row.caseId}-${row.tokenId}`,
      target: row.character,
      work: row.work,
      tokenId: row.tokenId,
      phrase: draftPhrase[row.tokenId]?.phrase ?? "",
      targetOffset: draftPhrase[row.tokenId]?.targetOffset ?? -1,
      book: snapshot.book,
      candidateIds: row.candidateIds,
      tones: row.tones,
      selectCandidateIds: [],
      evidenceIds: [],
      reviewStatus: "unverified",
      evidenceNeeded:
        "该语境义项的可定位来源（韵书条目/字书义项/反切）；义项↔候选的对应须由人工裁定，不得按合律或现代读音推定",
    })),
    machineConclusion: {
      determinableNow: [],
      tiers: {
        singleCandidate: rows.filter((row) => row.candidateCount === 1).length,
        multiSameTone: rows.filter(
          (row) => row.candidateCount > 1 && !row.toneCritical,
        ).length,
        multiToneCritical: toneCriticalRows.length,
      },
      note: [
        "当前 0 个字位可确定：全部候选证据未审核，resolveReadings 对三首均按门禁拒绝。",
        "证据获批后（结构性判断，不含义项裁定）：单候选字位可 resolved；多候选同调字位读音 ambiguous、平仄确定；10 个临界位读音与平仄都须消歧。",
        "「楼」按 J03 第一批属存疑，即使其他证据获批也不得转 approved。",
      ],
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "golden-token-review-2026-10-18.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const lines: string[] = [];
  lines.push("# 三首金标准逐字机器初审表（96 字位）");
  lines.push("");
  lines.push(`快照：\`${SNAPSHOT}\``);
  lines.push(`dataVersion：\`${snapshot.dataVersion}\``);
  lines.push(
    `分母：**${rows.length} 字位**；有候选 ${report.denominators.coveredTokens}；缺字 ${report.denominators.missingTokens}；多候选 ${multiRows.length}；其中平仄临界 ${toneCriticalRows.length}；无已审核证据 ${report.denominators.tokensWithoutApprovedEvidence}；evidence approved **${approved.size}/${snapshot.evidence.length}**。`,
  );
  lines.push("");
  lines.push(
    "> 本表是机器初审，不给读音结论。证据未审核，`resolveReadings` 对三首全部按门禁拒绝（`LOOKUP_EVIDENCE_UNVERIFIED`）。",
  );
  lines.push("");

  for (const work of works) {
    const workRows = rows.filter((row) => row.work === work.title);
    lines.push(`## ${work.title}（${workRows.length} 字位）`);
    lines.push("");
    lines.push(
      "| 字位 | 字 | 行列 | 候选数 | 候选（平仄） | 韵部 | 平仄临界 | 证据审核 | 机器结论 |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of workRows) {
      const candidateText = row.candidateIds
        .map((id, index) => `${id}（${row.candidateTones[index] ?? "?"}）`)
        .join("；");
      lines.push(
        `| ${row.tokenId} | ${row.character} | ${row.line}/${row.column} | ${row.candidateCount} | ${candidateText} | ${row.groupIds.join("、")} | ${row.toneCritical ? "**是**" : "否"} | ${row.evidenceApproved ? "approved" : "unverified"} | ${row.machineNote} |`,
      );
    }
    lines.push("");
  }

  lines.push("## 10 个高优先级多音异常（平仄取决于消歧）");
  lines.push("");
  lines.push("| 作品 | 字位 | 字 | 候选 | 平仄 | 人工备注 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of toneCriticalRows) {
    lines.push(
      `| ${row.work} | ${row.tokenId} | ${row.character} | ${row.candidateIds.join("；")} | ${row.tones.join("/")} | ${row.humanNote || "—"} |`,
    );
  }
  lines.push("");
  lines.push("## 上下文规则草案（待人工裁定，非批准）");
  lines.push("");
  lines.push(
    "短语取「以目标字为中心、长度 3」的窗口，贴边时向内收，仅作可审核起点；`selectCandidateIds` 一律留空，义项↔候选由人工裁定。",
  );
  lines.push("");
  lines.push("| 位置 | 目标字 | 短语 | 偏移 | 候选 | 平仄 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const draft of report.contextRuleDrafts) {
    lines.push(
      `| ${draft.work} ${draft.tokenId} | ${draft.target} | ${draft.phrase} | ${draft.targetOffset} | ${draft.candidateIds.join("；")} | ${draft.tones.join("/")} |`,
    );
  }
  lines.push("");
  lines.push("## 可确定 / 必须保持歧义");
  lines.push("");
  lines.push(
    `- 当前可确定：**0** 字位（证据 approved 0/${snapshot.evidence.length}，门禁拒绝）。`,
  );
  lines.push(
    `- 证据获批后的结构分档：单候选 ${report.machineConclusion.tiers.singleCandidate} 字位可 resolved；多候选同调 ${report.machineConclusion.tiers.multiSameTone} 字位读音 ambiguous、平仄确定；平仄临界 ${report.machineConclusion.tiers.multiToneCritical} 字位读音与平仄都须消歧。`,
  );
  lines.push(
    "- 「楼」：J03 第一批判为存疑（要求补异体关系与证据），即使其余证据获批也不得转 approved。",
  );
  lines.push("");
  lines.push("## 版本差异");
  lines.push("");
  lines.push(
    `旧样本 \`${LEGACY_SAMPLE}\`（${legacy.dataVersion}）只有 ${legacyChars.size} 个字；`,
  );
  lines.push(
    `当前快照 \`${SNAPSHOT}\`（${snapshot.dataVersion}）有 ${byCharacter.size} 个字、${snapshot.candidates.length} 条候选。`,
  );
  lines.push(
    "按任务书要求，本表全部使用当前快照，未使用旧七字样本的任何结果；旧样本只用于说明差异。",
  );
  lines.push("");

  writeFileSync(
    path.join(OUT_DIR, "golden-token-review-2026-10-18.md"),
    `${lines.join("\n").trimEnd()}\n`,
    "utf8",
  );

  console.log(
    `rows=${rows.length} covered=${report.denominators.coveredTokens} missing=${report.denominators.missingTokens} multi=${multiRows.length} toneCritical=${toneCriticalRows.length} approved=${approved.size}/${snapshot.evidence.length}`,
  );
}

main();
