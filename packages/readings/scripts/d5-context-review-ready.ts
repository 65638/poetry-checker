/**
 * D5 第 2 件：13 条跨书草稿的逐条可审批材料。
 *
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d5-context-review-ready.ts
 *
 * 只做「把材料摆齐」：列出本书候选、每个候选的证据审核状态、拟选项（当前一律为空）、
 * 词义依据、反例、A 侧证据依赖与待审点。**不写 data/context**，不产生任何批准。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BookId, Tone } from "@poetry/contracts";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT_DIR = path.join(ROOT, "data", "reviews", "d5", "b");
const SNAPSHOT_BY_BOOK: Record<string, string> = {
  cilin: "data/normalized/cilin.full-d2.json",
  xinyun: "data/normalized/xinyun.full-d2.json",
};

interface Draft {
  id: string;
  book: BookId;
  caseId: string;
  tokenId: string;
  target: string;
  exactPhrases: string[];
  targetOffset: number;
  candidateIds: string[];
  selectCandidateIds: string[];
  semanticBasis: string;
  transferCondition: string;
  evidenceNeeded: string[];
  negativeExamples: string[];
  reviewStatus: string;
  sourceRuleRef: string;
}

interface Snapshot {
  dataVersion: string;
  candidates: Array<{
    id: string;
    character: string;
    tone: Tone | null;
    toneClass: string | null;
    groupIds: string[];
    evidenceIds: string[];
  }>;
  evidence: Array<{ id: string; reviewStatus: string; kind: string }>;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

function main(): void {
  const drafts = readJson<{ drafts: Draft[] }>(
    "data/reviews/d4/b/context-drafts.json",
  ).drafts;

  const snapshots = new Map<string, Snapshot>();
  for (const [book, file] of Object.entries(SNAPSHOT_BY_BOOK)) {
    snapshots.set(book, readJson<Snapshot>(file));
  }

  const items = drafts.map((draft) => {
    const snapshot = snapshots.get(draft.book);
    const approved = new Set(
      (snapshot?.evidence ?? [])
        .filter((item) => item.reviewStatus === "approved")
        .map((item) => item.id),
    );
    const candidates = draft.candidateIds.map((candidateId) => {
      const candidate = (snapshot?.candidates ?? []).find(
        (item) => item.id === candidateId,
      );
      const evidenceIds = candidate?.evidenceIds ?? [];
      return {
        candidateId,
        tone: candidate?.tone ?? null,
        toneClass: candidate?.toneClass ?? null,
        groupIds: candidate?.groupIds ?? [],
        evidenceIds,
        evidenceApproved: evidenceIds.filter((id) => approved.has(id)).length,
        evidenceTotal: evidenceIds.length,
      };
    });

    const readyCandidates = candidates.filter(
      (item) =>
        item.evidenceTotal > 0 && item.evidenceApproved === item.evidenceTotal,
    );

    return {
      draftId: draft.id,
      book: draft.book,
      caseId: draft.caseId,
      tokenId: draft.tokenId,
      target: draft.target,
      exactPhrases: draft.exactPhrases,
      targetOffset: draft.targetOffset,
      dataVersion: snapshot?.dataVersion ?? "unknown",
      candidateIds: draft.candidateIds,
      candidateEvidence: candidates,
      // 拟选项：只有当本书候选证据已审、且义项依据可定位时才可填。
      proposedSelection: null,
      proposedSelectionReason:
        readyCandidates.length === 0
          ? "本书全部候选证据未审核：连候选归属都未确认，谈不上选音"
          : "候选证据已审，但仍缺该义项在本书的可定位来源，不能仅凭平水裁定迁移",
      senseBasis: draft.semanticBasis,
      transferCondition: draft.transferCondition,
      counterExamples: draft.negativeExamples,
      aSideDependency: {
        candidateEvidencePending: candidates
          .filter((item) => item.evidenceApproved === 0)
          .map((item) => item.candidateId),
        requiredEvidence: draft.evidenceNeeded,
      },
      pendingPoints: [
        "本书候选的归部证据需由 A 落库并审核",
        "该义项在本书的可定位来源（韵书条目/字书义项/反切）",
        "组长裁定：是否接受平水义项向本书迁移",
        "裁定后仍需补一条本书反例的安全边界检查",
      ],
      // 明确：不是「只差点批准」。
      readiness: "not-approval-ready",
      readinessReason:
        "selectCandidateIds 为空且本书候选证据未审，属材料待补，不是待批选项",
      sourceRuleRef: draft.sourceRuleRef,
      reviewStatus: "unverified",
    };
  });

  const report = {
    schemaVersion: "d5-b/context-review-ready-1",
    generatedBy: "packages/readings/scripts/d5-context-review-ready.ts",
    command:
      "node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d5-context-review-ready.ts",
    source: "data/reviews/d4/b/context-drafts.json",
    note: "本文件只摆材料，不写 data/context、不产生批准。没有精确人审接受记录的条目一律保持 unverified。",
    counts: {
      drafts: items.length,
      notApprovalReady: items.filter(
        (item) => item.readiness === "not-approval-ready",
      ).length,
      byBook: items.reduce<Record<string, number>>((acc, item) => {
        acc[item.book] = (acc[item.book] ?? 0) + 1;
        return acc;
      }, {}),
      candidatesWithoutApprovedEvidence: items.reduce(
        (sum, item) =>
          sum +
          item.candidateEvidence.filter(
            (candidate) => candidate.evidenceApproved === 0,
          ).length,
        0,
      ),
    },
    items,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "context-review-ready.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const lines: string[] = [];
  lines.push("# 13 条跨书语境草稿：逐条可审批材料");
  lines.push("");
  lines.push(
    "本文件只摆材料，不写 `data/context`、不产生批准。`selectCandidateIds` 仍为空，且本书候选证据未审——**不是「只差点批准」**。",
  );
  lines.push("");
  lines.push(
    "| # | 韵书 | 位置 | 字 | 本书候选（证据已审/总） | 拟选 | 待审点 |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  items.forEach((item, index) => {
    const candidates = item.candidateEvidence
      .map(
        (candidate) =>
          `${candidate.candidateId}（${candidate.evidenceApproved}/${candidate.evidenceTotal}）`,
      )
      .join("、");
    lines.push(
      `| ${index + 1} | ${item.book} | ${item.tokenId} | ${item.target} | ${candidates} | 未定 | ${item.pendingPoints[0]} |`,
    );
  });
  lines.push("");
  lines.push(
    `合计 ${report.counts.drafts} 条，${report.counts.notApprovalReady} 条未达可批准状态；涉及 ${report.counts.candidatesWithoutApprovedEvidence} 个候选证据为 0/1 已审。`,
  );
  lines.push("");
  writeFileSync(
    path.join(OUT_DIR, "context-review-ready.md"),
    `${lines.join("\n").trimEnd()}\n`,
    "utf8",
  );

  console.log(
    `drafts=${report.counts.drafts} notReady=${report.counts.notApprovalReady} unapprovedCandidates=${report.counts.candidatesWithoutApprovedEvidence}`,
  );
}

main();
