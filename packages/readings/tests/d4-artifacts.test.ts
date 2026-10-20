/**
 * D4 交付物守卫：逐行接口字段、阻断与歧义分列、跨书草稿不平移平水候选。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const DIR = "data/reviews/d4/b";

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, DIR, name), "utf8")) as T;
}

interface Row {
  caseId: string;
  book: string;
  tokenId: string;
  character: string;
  allCandidateIds: string[];
  effectiveCandidateIds: string[];
  unverifiedEffectiveIds: string[];
  missingSourceIds: string[];
  contextRuleIds: string[];
  readingStatus: string;
  toneStatus: string;
  possibleTones: string[];
  blockingReason: string | null;
  category: string;
}

const report = readJson<{
  schemaVersion: string;
  baseSha: string;
  mode: string;
  dataVersions: Record<string, string>;
  rows: Row[];
}>("effective-candidates.json");
const drafts = readJson<{
  count: number;
  drafts: Array<{
    book: string;
    candidateIds: string[];
    selectCandidateIds: string[];
    reviewStatus: string;
    evidenceNeeded: string[];
  }>;
}>("context-drafts.json");

describe("D4 逐行接口", () => {
  it("288 行 = 3 作品 × 3 韵书 × 96 字位，字段齐全", () => {
    expect(report.rows).toHaveLength(288);
    expect(report.schemaVersion).toBe("d4-b/effective-candidates-1");
    expect(report.baseSha).not.toBe("unknown");
    expect(Object.keys(report.dataVersions).sort()).toEqual([
      "cilin",
      "pingshui",
      "xinyun",
    ]);
    const required = [
      "caseId",
      "book",
      "tokenId",
      "character",
      "allCandidateIds",
      "effectiveCandidateIds",
      "unverifiedEffectiveIds",
      "missingSourceIds",
      "contextRuleIds",
      "readingStatus",
      "toneStatus",
      "possibleTones",
      "blockingReason",
    ];
    for (const row of report.rows) {
      for (const key of required) {
        expect(row, `${row.book}/${row.tokenId}`).toHaveProperty(key);
      }
    }
  });

  it("blocked 与 ambiguous 分列：blocked 必有未审有效候选和阻断原因", () => {
    const blocked = report.rows.filter(
      (row) => row.readingStatus === "blocked",
    );
    expect(blocked.length).toBeGreaterThan(0);
    for (const row of blocked) {
      expect(row.unverifiedEffectiveIds.length, row.tokenId).toBeGreaterThan(0);
      expect(row.blockingReason, row.tokenId).not.toBeNull();
    }
    const ambiguous = report.rows.filter(
      (row) => row.readingStatus === "ambiguous",
    );
    expect(ambiguous.length).toBeGreaterThan(0);
    for (const row of ambiguous) {
      expect(row.unverifiedEffectiveIds, row.tokenId).toEqual([]);
      // 多读同调：平仄可确定但读音不写成确定
      expect(row.possibleTones.length, row.tokenId).toBe(1);
      expect(row.toneStatus).toBe("resolved");
    }
  });

  it("有效候选是候选全集的子集，且 resolved 只出现在唯一有效候选时", () => {
    for (const row of report.rows) {
      for (const id of row.effectiveCandidateIds) {
        expect(row.allCandidateIds, `${row.book}/${row.tokenId}`).toContain(id);
      }
      if (row.readingStatus === "resolved") {
        expect(row.effectiveCandidateIds.length).toBe(1);
      }
    }
  });
});

describe("D4 跨书语境草稿", () => {
  it("草稿全部未批准、未定候选，且候选 ID 属于本书", () => {
    expect(drafts.count).toBe(drafts.drafts.length);
    expect(drafts.drafts.length).toBeGreaterThan(0);
    for (const draft of drafts.drafts) {
      expect(draft.reviewStatus).toBe("unverified");
      expect(draft.selectCandidateIds).toEqual([]);
      expect(draft.evidenceNeeded.length).toBeGreaterThan(0);
      for (const id of draft.candidateIds) {
        expect(
          id.startsWith(`${draft.book}:`),
          `${draft.book} 草稿混入 ${id}`,
        ).toBe(true);
      }
    }
  });

  it("没有把平水候选搬进词林/新韵草稿", () => {
    for (const draft of drafts.drafts) {
      for (const id of draft.candidateIds) {
        expect(id.startsWith("pingshui:")).toBe(false);
      }
    }
  });
});
