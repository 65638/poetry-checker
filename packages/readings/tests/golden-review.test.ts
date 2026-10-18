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
  contextRuleDrafts: Array<{
    selectCandidateIds: string[];
    evidenceIds: string[];
    reviewStatus: string;
  }>;
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

  it("证据未审核时，机器结论一律是门禁拦截，不产出读音结论", () => {
    expect(report.denominators.evidenceApproved).toBe(0);
    expect(report.denominators.tokensWithoutApprovedEvidence).toBe(96);
    expect(rows.every((row) => row.evidenceApproved === false)).toBe(true);
    expect(rows.every((row) => row.machineOutcome === "blocked")).toBe(true);
  });

  it("每个候选都有声调，候选 ID 与声调一一对应且不缺项", () => {
    for (const row of rows) {
      expect(row.candidateIds).toHaveLength(row.candidateCount);
      expect(row.candidateTones).toHaveLength(row.candidateCount);
      expect(row.candidateTones.every((tone) => tone !== null)).toBe(true);
    }
  });

  it("上下文规则草案不替人批准：selectCandidateIds/evidenceIds 为空、reviewStatus 未审核", () => {
    expect(report.contextRuleDrafts).toHaveLength(10);
    for (const draft of report.contextRuleDrafts) {
      expect(draft.selectCandidateIds).toEqual([]);
      expect(draft.evidenceIds).toEqual([]);
      expect(draft.reviewStatus).toBe("unverified");
    }
  });

  it("表用的是当前 API 快照，不是旧七字样本", () => {
    expect(report.dataVersion).toBe(
      "pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft",
    );
    expect(report.snapshotReviewStatus).toBe("unverified");
  });
});
