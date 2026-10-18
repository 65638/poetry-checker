/**
 * 三首金标准逐字机器初审表（96 字位）。
 *
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/golden-token-review.ts
 *
 * 只读真实快照与固定正文，不调用格律、不推断读音：
 * - 候选、平仄、韵部、证据状态全部取自快照；
 * - 字位预检检查语境筛选前的全部候选，区分任一/全部/混合证据状态；
 * - 已裁定规则单列其选中候选的证据，不代替真实 resolve/API 结果或人工批准。
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
  /** 兼容旧字段：现在明确表示全部候选都有 approved 证据。 */
  evidenceApproved: boolean;
  anyCandidateEvidenceApproved: boolean;
  allCandidateEvidenceApproved: boolean;
  mixedCandidateEvidence: boolean;
  approvedCandidateIds: string[];
  unbackedCandidateIds: string[];
  evidenceIds: string[];
  groupIds: string[];
  machineOutcome: "blocked" | "would-resolve" | "would-ambiguous" | "unknown";
  machineNote: string;
  humanNote: string;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

interface AdjudicatedRule {
  id: string;
  target: string;
  exactPhrases: string[];
  targetOffset: number;
  selectCandidateIds: string[];
  evidenceIds: string[];
}

/**
 * 把 `data/context/rules.json` 的裁定规则映射到具体字位：
 * 逐条在正文里找短语匹配，`targetOffset` 指向的那个 token 即为裁定位置。
 * 纯字符串比对，不调用 resolveReadings。
 */
function mapRulesToTokens(
  rules: AdjudicatedRule[],
  works: Array<{ title: string; text: string }>,
): Map<string, AdjudicatedRule> {
  const byToken = new Map<string, AdjudicatedRule>();
  for (const rule of rules) {
    for (const work of works) {
      const tokens = parseText({ text: work.text }).tokens;
      const byLine = new Map<number, typeof tokens>();
      for (const token of tokens) {
        const bucket = byLine.get(token.line) ?? [];
        bucket.push(token);
        byLine.set(token.line, bucket);
      }
      for (const lineTokens of byLine.values()) {
        const characters = lineTokens.map((token) => token.text);
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
            byToken.set(`${work.title}|${hit.tokenId}`, rule);
          }
        }
      }
    }
  }
  return byToken;
}

/** 人工备注只复述人审记录已确认的范围，不新增结论。 */
const HUMAN_NOTES: Record<string, string> = {
  更: "J03 第一批确认两读；13_J03三首核心诗逐字人审_第二批.md §五第 1 条已裁定「更上一层楼」取去声二十四敬，语境规则已落库。",
  楼: "13_J03三首核心诗逐字人审_第二批.md §二已记录组长同意楼↔樓异体映射，无需重复审核；按候选范围落实，不代表整个十一尤获批。",
  白: "J03 第一批确认该候选归属属实（范围仅限列明候选，不等于全部韵部获批）。",
  一: "J03 第一批确认该候选归属属实（范围仅限列明候选）。",
  流: "J03 第一批确认该候选归属属实（范围仅限列明候选）。",
  雪: "J03 第一批确认该候选归属属实（范围仅限列明候选）。",
  物: "J03 第一批确认该候选归属属实（范围仅限列明候选）。",
};

interface ReviewInput {
  snapshot: {
    dataVersion: string;
    book: string;
    reviewStatus: string;
    candidates: CandidateRecord[];
    evidence: EvidenceRecord[];
    groups: Array<{ id: string; name: string; toneClass: string | null }>;
  };
  legacy: {
    dataVersion: string;
    candidates: CandidateRecord[];
  };
  works: WorkEntry[];
  rules: AdjudicatedRule[];
}

/** 纯报告构建：测试可替换证据输入，不改真实快照或磁盘上的生成物。 */
export function buildGoldenTokenReview({
  snapshot,
  legacy,
  works,
  rules,
}: ReviewInput) {
  const ruleByToken = mapRulesToTokens(rules, works);

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
  const candidatesById = new Map(
    snapshot.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const isBacked = (candidate: CandidateRecord) =>
    candidate.evidenceIds.some((id) => approved.has(id));
  const groupName = new Map(snapshot.groups.map((g) => [g.id, g.name]));

  const rows: Row[] = [];
  for (const work of works) {
    const poem = parseText({ text: work.text });
    for (const token of poem.tokens) {
      const candidates = byCharacter.get(token.text) ?? [];
      const tones = [...new Set(candidates.map((c) => c.tone))];
      const knownTones = tones.filter((t): t is Tone => t !== null);
      const approvedCandidateIds = candidates
        .filter(isBacked)
        .map((candidate) => candidate.id);
      const unbackedCandidateIds = candidates
        .filter((candidate) => !isBacked(candidate))
        .map((candidate) => candidate.id);
      const anyCandidateEvidenceApproved = approvedCandidateIds.length > 0;
      const allCandidateEvidenceApproved =
        candidates.length > 0 && unbackedCandidateIds.length === 0;
      const mixedCandidateEvidence =
        anyCandidateEvidenceApproved && !allCandidateEvidenceApproved;
      const multi = candidates.length > 1;
      const toneCritical = multi && knownTones.length > 1;

      // 此列是语境筛选前的候选证据预检；不模拟规则消歧，不代表整诗输出。
      let machineOutcome: Row["machineOutcome"];
      let machineNote: string;
      if (candidates.length === 0) {
        machineOutcome = "unknown";
        machineNote =
          "未收录：没有候选，保持 unknown；不冒充证据通过或未审候选阻断";
      } else if (!allCandidateEvidenceApproved) {
        machineOutcome = "blocked";
        machineNote = `候选预检阻断：${approvedCandidateIds.length}/${candidates.length} 个候选有 approved 证据标记，未满足 ${unbackedCandidateIds.join("、")}`;
      } else if (candidates.length === 1) {
        machineOutcome = "would-resolve";
        machineNote =
          "候选唯一且有 approved 证据标记，字位具备 resolved 的证据条件；整诗结果另验";
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
        evidenceApproved: allCandidateEvidenceApproved,
        anyCandidateEvidenceApproved,
        allCandidateEvidenceApproved,
        mixedCandidateEvidence,
        approvedCandidateIds,
        unbackedCandidateIds,
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

  const toneCriticalRows = rows.filter((row) => row.toneCritical);
  const multiRows = rows.filter((row) => row.candidateCount > 1);
  const legacyChars = new Set(legacy.candidates.map((c) => c.character));

  const report = {
    generatedBy: "packages/readings/scripts/golden-token-review.ts",
    task: "B 逐字机器初审表（96 字位）",
    note: "本表只统计快照标记并做语境筛选前的候选证据预检；不调用 resolveReadings，不代替真实 API 结果或批准任何证据。人工备注引用 J03 第一批及第二批记录。当前批准清单存在候选/部级范围冲突，approved 数量不等于相同范围的人审完成。",
    machineOutcomeScope: "all-candidates-before-context",
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
      tokensWithAnyApprovedEvidence: rows.filter(
        (row) => row.anyCandidateEvidenceApproved,
      ).length,
      tokensWithAllApprovedEvidence: rows.filter(
        (row) => row.allCandidateEvidenceApproved,
      ).length,
      tokensWithMixedEvidence: rows.filter((row) => row.mixedCandidateEvidence)
        .length,
      tokensWithoutApprovedEvidence: rows.filter(
        (row) => !row.anyCandidateEvidenceApproved,
      ).length,
      candidatePrecheckBlockedTokens: rows.filter(
        (row) => row.machineOutcome === "blocked",
      ).length,
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
      currentCandidates: snapshot.candidates.length,
      note: "旧七字样本（白、一、更、流、楼、雪、物）不在 API 装载清单内；本表全部数据来自 106 部全量快照，不使用旧样本结果。",
    },
    adjudications: toneCriticalRows.map((row) => {
      const rule = ruleByToken.get(`${row.work}|${row.tokenId}`);
      const selectedId = rule?.selectCandidateIds[0];
      const selectedCandidate =
        selectedId === undefined ? undefined : candidatesById.get(selectedId);
      return {
        work: row.work,
        tokenId: row.tokenId,
        target: row.character,
        candidateIds: row.candidateIds,
        tones: row.tones,
        ruleId: rule?.id ?? null,
        adjudicatedCandidateId: rule?.selectCandidateIds[0] ?? null,
        ruleEvidenceIds: rule?.evidenceIds ?? [],
        adjudicationSource: rule
          ? "docs/reviews/13_J03三首核心诗逐字人审_第二批.md"
          : null,
        candidateEvidenceApproved:
          selectedCandidate !== undefined && isBacked(selectedCandidate),
        note: rule
          ? "裁定已落库为语境规则；若被选候选的韵书证据仍未审核，仍会被门禁拦截"
          : "尚未裁定为语境规则",
      };
    }),
    machineConclusion: {
      singleCandidateEvidenceReady: rows
        .filter((row) => row.machineOutcome === "would-resolve")
        .map((row) => ({
          work: row.work,
          tokenId: row.tokenId,
          character: row.character,
        })),
      candidatePrecheckByWork: works.map((work) => {
        const blocked = rows.filter(
          (row) => row.work === work.title && row.machineOutcome === "blocked",
        );
        return {
          work: work.title,
          blockedTokens: blocked.length,
          firstBlockedTokenId: blocked[0]?.tokenId ?? null,
        };
      }),
      tiers: {
        singleCandidate: rows.filter((row) => row.candidateCount === 1).length,
        multiSameTone: rows.filter(
          (row) => row.candidateCount > 1 && !row.toneCritical,
        ).length,
        multiToneCritical: toneCriticalRows.length,
        toneCriticalWithRule: toneCriticalRows.filter((row) =>
          ruleByToken.has(`${row.work}|${row.tokenId}`),
        ).length,
      },
      // 没有可用语境规则或用户覆盖时，不能从平仄相同推断读音相同。
      mustRemainAmbiguous: rows
        .filter((row) => row.candidateCount > 1 && !row.toneCritical)
        .map((row) => ({
          work: row.work,
          tokenId: row.tokenId,
          character: row.character,
          candidateIds: row.candidateIds,
          tones: row.tones,
          reason:
            "无适用语境规则/用户覆盖时，须先满足所有有效候选的证据门槛，再保留读音 ambiguous；平仄一致不等于读音已消歧",
        })),
      note: [
        `字位层面：任一候选有 approved 标记 ${rows.filter((row) => row.anyCandidateEvidenceApproved).length}/${rows.length}；全部候选有标记 ${rows.filter((row) => row.allCandidateEvidenceApproved).length}/${rows.length}；已审/未审混合 ${rows.filter((row) => row.mixedCandidateEvidence).length}。均为快照标记统计，不扩张人审范围。`,
        "候选预检不应用语境规则。真实 resolveReadings 会先选择有效候选，再逐一检查证据；语境规则本身也需已审核的语境证据。整诗有任一有效候选缺依据时仍拒绝结果。",
        "单候选且有证据的字位仅具备 resolved 的证据条件；多候选同调在无适用语境规则/用户覆盖时保留读音 ambiguous。两者都不代表整首诗已通过。",
        HUMAN_NOTES["楼"],
      ],
    },
  };

  return report;
}

export function renderGoldenTokenReviewMarkdown(
  report: ReturnType<typeof buildGoldenTokenReview>,
): string {
  const rows = report.works.flatMap((work) => work.tokens);
  const toneCriticalRows = rows.filter((row) => row.toneCritical);
  const { denominators: counts, versionDiff } = report;
  const lines: string[] = [];
  lines.push("# 三首金标准逐字机器初审表（96 字位）");
  lines.push("");
  lines.push(`快照：\`${SNAPSHOT}\``);
  lines.push(`dataVersion：\`${report.dataVersion}\``);
  lines.push(
    `分母：**${counts.tokens} 字位**；有候选 ${counts.coveredTokens}；缺字 ${counts.missingTokens}；多候选 ${counts.multiCandidateTokens}；其中平仄临界 ${counts.toneCriticalTokens}；evidence approved 标记 **${counts.evidenceApproved}/${counts.evidenceTotal}**。`,
  );
  lines.push("");
  lines.push(`> ${report.note}`);
  lines.push("");
  lines.push("| 字位证据统计（语境筛选前） | 数量 |");
  lines.push("| --- | ---: |");
  lines.push(
    `| 任一候选有 approved 证据标记 | ${counts.tokensWithAnyApprovedEvidence} |`,
  );
  lines.push(
    `| 全部候选有 approved 证据标记 | ${counts.tokensWithAllApprovedEvidence} |`,
  );
  lines.push(`| 已审/未审候选混合 | ${counts.tokensWithMixedEvidence} |`);
  lines.push(
    `| 没有候选获 approved 证据标记（含缺字） | ${counts.tokensWithoutApprovedEvidence} |`,
  );
  lines.push(`| 候选预检阻断字位 | ${counts.candidatePrecheckBlockedTokens} |`);
  lines.push("");

  for (const work of report.works) {
    const workRows = work.tokens;
    lines.push(`## ${work.title}（${workRows.length} 字位）`);
    lines.push("");
    lines.push(
      "| 字位 | 字 | 行列 | 候选数 | 候选（平仄） | 韵部 | 平仄临界 | 证据标记 | 候选预检（非整诗结论） |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of workRows) {
      const candidateText = row.candidateIds
        .map((id, index) => `${id}（${row.candidateTones[index] ?? "?"}）`)
        .join("；");
      lines.push(
        `| ${row.tokenId} | ${row.character} | ${row.line}/${row.column} | ${row.candidateCount} | ${candidateText} | ${row.groupIds.join("、")} | ${row.toneCritical ? "**是**" : "否"} | ${row.candidateCount === 0 ? "无候选" : row.mixedCandidateEvidence ? "mixed" : row.allCandidateEvidenceApproved ? "全部 approved" : "全部未满足"} | ${row.machineNote} |`,
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
  lines.push("## 已裁定的十处（来自 13_ 第二批人审）");
  lines.push("");
  lines.push(
    "裁定已落库为 `data/context/rules.json` 的语境规则；「被选候选韵书证据」只按裁定选中的 candidateId 查询快照标记，不借用同字其他候选的批准；实际生效仍需语境证据被 API 装载。",
  );
  lines.push("");
  lines.push(
    "| 位置 | 目标字 | 候选 | 平仄 | 裁定候选 | 规则 ID | 被选候选韵书证据 |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const item of report.adjudications) {
    lines.push(
      `| ${item.work} ${item.tokenId} | ${item.target} | ${item.candidateIds.join("；")} | ${item.tones.join("/")} | ${item.adjudicatedCandidateId ?? "—"} | ${item.ruleId ?? "—"} | ${item.candidateEvidenceApproved ? "已审核" : "**未审核**"} |`,
    );
  }
  lines.push("");
  lines.push("## 字位证据条件与整诗结果");
  lines.push("");
  lines.push(
    `- 单候选且有 approved 证据标记：${report.machineConclusion.singleCandidateEvidenceReady.length} 字位。仅为字位证据条件，不能据此宣称整诗已返回结果。`,
  );
  for (const work of report.machineConclusion.candidatePrecheckByWork) {
    lines.push(
      `- ${work.work}：语境筛选前 ${work.blockedTokens} 个字位未满足全部候选证据，首个为 ${work.firstBlockedTokenId ?? "无"}。`,
    );
  }
  lines.push(
    "- 本表未调用 resolve/API；实际整诗结果须以 context-smoke 和真实 API 复验为准。",
  );
  lines.push(
    `- 结构分档：单候选 ${report.machineConclusion.tiers.singleCandidate} 字位；平仄临界且有裁定 ${report.machineConclusion.tiers.toneCriticalWithRule}/${report.machineConclusion.tiers.multiToneCritical} 字位；多候选同调 ${report.machineConclusion.tiers.multiSameTone} 字位。证据到位后，无适用语境规则/用户覆盖的多候选同调字位仍保持读音 ambiguous。`,
  );
  lines.push(`- ${HUMAN_NOTES["楼"]}`);
  lines.push("");
  lines.push(
    "### 无语境选择时保持 ambiguous 的位置（多读音、平仄一致，共 " +
      report.machineConclusion.mustRemainAmbiguous.length +
      " 个）",
  );
  lines.push("");
  lines.push("| 位置 | 字 | 候选 | 平仄 |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of report.machineConclusion.mustRemainAmbiguous) {
    lines.push(
      `| ${item.work} ${item.tokenId} | ${item.character} | ${item.candidateIds.join("；")} | ${item.tones.join("/")} |`,
    );
  }
  lines.push("");
  lines.push("## 版本差异");
  lines.push("");
  lines.push(
    `旧样本 \`${LEGACY_SAMPLE}\`（${versionDiff.legacyDataVersion}）只有 ${versionDiff.legacyCharacters} 个字；`,
  );
  lines.push(
    `当前快照 \`${SNAPSHOT}\`（${report.dataVersion}）有 ${versionDiff.currentCharacters} 个字、${versionDiff.currentCandidates} 条候选。`,
  );
  lines.push(
    "按任务书要求，本表全部使用当前快照，未使用旧七字样本的任何结果；旧样本只用于说明差异。",
  );
  lines.push("");

  return `${lines.join("\n").trimEnd()}\n`;
}

function main(): void {
  const report = buildGoldenTokenReview({
    snapshot: readJson<ReviewInput["snapshot"]>(SNAPSHOT),
    legacy: readJson<ReviewInput["legacy"]>(LEGACY_SAMPLE),
    works: readJson<{ items: WorkEntry[] }>("data/works/review-queue.json")
      .items,
    rules: readJson<AdjudicatedRule[]>("data/context/rules.json"),
  });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "golden-token-review-2026-10-18.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(OUT_DIR, "golden-token-review-2026-10-18.md"),
    renderGoldenTokenReviewMarkdown(report),
    "utf8",
  );

  const { denominators: counts } = report;
  console.log(
    `rows=${counts.tokens} covered=${counts.coveredTokens} missing=${counts.missingTokens} multi=${counts.multiCandidateTokens} toneCritical=${counts.toneCriticalTokens} approved=${counts.evidenceApproved}/${counts.evidenceTotal} any=${counts.tokensWithAnyApprovedEvidence} all=${counts.tokensWithAllApprovedEvidence} mixed=${counts.tokensWithMixedEvidence}`,
  );
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
