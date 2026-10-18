/**
 * 守护逐字机器初审表的结构与口径。
 *
 * 表本身由 `packages/readings/scripts/golden-token-review.ts` 生成；
 * 这里只断言「不许越界」的几条：行数、分母、门禁结论、规则草案未擅自批准。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const REPORT = "data/reviews/golden-token-review-2026-10-18.json";

interface Row {
  tokenId: string;
  character: string;
  candidateCount: number;
  candidateIds: string[];
  candidateTones: Array<string | null>;
  toneCritical: boolean;
  evidenceApproved: boolean;
  machineOutcome: string;
}

interface Report {
  dataVersion: string;
  snapshotReviewStatus: string;
  denominators: Record<string, unknown> & {
    tokens: number;
    coveredTokens: number;
    missingTokens: number;
    multiCandidateTokens: number;
    toneCriticalTokens: number;
    evidenceApproved: number;
    evidenceTotal: number;
    tokensWithoutApprovedEvidence: number;
  };
  works: Array<{ title: string; tokens: Row[] }>;
  adjudications: Array<{
    tokenId: string;
    target: string;
    ruleId: string | null;
    adjudicatedCandidateId: string | null;
    ruleEvidenceIds: string[];
  }>;
  machineConclusion: {
    tiers: {
      singleCandidate: number;
      multiSameTone: number;
      multiToneCritical: number;
      toneCriticalWithRule: number;
    };
    mustRemainAmbiguous: Array<{ tokenId: string; character: string }>;
  };
  versionDiff: { legacyCharacters: number; currentCharacters: number };
}

const report = JSON.parse(
  readFileSync(path.join(ROOT, REPORT), "utf8"),
) as Report;
const rows = report.works.flatMap((work) => work.tokens);

describe("逐字机器初审表", () => {
  it("覆盖 96 个金标准字位，按作品 20/20/56 拆分", () => {
    expect(rows).toHaveLength(96);
    expect(
      report.works.map((work) => [work.title, work.tokens.length]),
    ).toEqual([
      ["登鹳雀楼", 20],
      ["静夜思", 20],
      ["黄鹤楼", 56],
    ]);
    expect(report.denominators.tokens).toBe(96);
    expect(report.denominators.coveredTokens).toBe(96);
    expect(report.denominators.missingTokens).toBe(0);
  });

  it("多候选 22 个，其中平仄临界 10 个", () => {
    expect(report.denominators.multiCandidateTokens).toBe(22);
    expect(report.denominators.toneCriticalTokens).toBe(10);
    expect(rows.filter((row) => row.toneCritical)).toHaveLength(10);
  });

  it("机器结论与证据状态一致：未审字位一律门禁拦截，已审字位不标拦截", () => {
    const unbacked = rows.filter((row) => !row.evidenceApproved);
    const backed = rows.filter((row) => row.evidenceApproved);
    expect(report.denominators.tokensWithoutApprovedEvidence).toBe(
      unbacked.length,
    );
    expect(unbacked.length + backed.length).toBe(96);
    expect(unbacked.every((row) => row.machineOutcome === "blocked")).toBe(
      true,
    );
    expect(backed.every((row) => row.machineOutcome !== "blocked")).toBe(true);
    // 诗级结论仍被门禁拒绝：只要有一处未审字位，整首就不出结果。
    expect(
      rows.some((row) => row.evidenceApproved) ||
        report.denominators.evidenceApproved === 0,
    ).toBe(true);
  });

  it("每个候选都有声调，候选 ID 与声调一一对应且不缺项", () => {
    for (const row of rows) {
      expect(row.candidateIds).toHaveLength(row.candidateCount);
      expect(row.candidateTones).toHaveLength(row.candidateCount);
      expect(row.candidateTones.every((tone) => tone !== null)).toBe(true);
    }
  });

  it("十处裁定都能对上已落库的语境规则", () => {
    expect(report.adjudications).toHaveLength(10);
    for (const item of report.adjudications) {
      expect(item.ruleId, `${item.tokenId} 没有对应的规则`).not.toBeNull();
      expect(item.adjudicatedCandidateId).not.toBeNull();
      expect(item.ruleEvidenceIds.length).toBeGreaterThan(0);
    }
    expect(report.machineConclusion.tiers.toneCriticalWithRule).toBe(10);
  });

  it("多读音同调的位置必须保持 ambiguous 且已单列", () => {
    expect(report.machineConclusion.tiers.multiSameTone).toBe(12);
    expect(report.machineConclusion.mustRemainAmbiguous).toHaveLength(12);
    for (const item of report.machineConclusion.mustRemainAmbiguous) {
      expect(item.tokenId).toMatch(/^l\d+c\d+$/u);
    }
  });

  it("表用的是当前 API 快照，不是旧七字样本", () => {
    expect(report.dataVersion).toBe(
      "pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft",
    );
    expect(report.snapshotReviewStatus).toBe("unverified");
    expect(report.versionDiff.legacyCharacters).toBe(7);
    expect(report.versionDiff.currentCharacters).toBeGreaterThan(8000);
  });
});
