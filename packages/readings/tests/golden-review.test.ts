/** 初审表预期独立读取原始快照；不能用报告自己的布尔值证明报告正确。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import {
  buildGoldenTokenReview,
  renderGoldenTokenReviewMarkdown,
} from "../scripts/golden-token-review.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const REPORT = "data/reviews/golden-token-review-2026-10-18";
type ReviewInput = Parameters<typeof buildGoldenTokenReview>[0];

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

const input: ReviewInput = {
  snapshot: readJson("data/normalized/pingshui.full-d2-patched.json"),
  legacy: readJson("data/normalized/pingshui.sample-d1.json"),
  works: readJson<{ items: ReviewInput["works"] }>(
    "data/works/review-queue.json",
  ).items,
  rules: readJson("data/context/rules.json"),
};
const report = readJson<ReturnType<typeof buildGoldenTokenReview>>(
  `${REPORT}.json`,
);
const markdown = readFileSync(path.join(ROOT, `${REPORT}.md`), "utf8").replace(
  /\r\n/g,
  "\n",
);
const rows = report.works.flatMap((work) => work.tokens);

// 只从源快照查证据，不使用报告的 evidenceApproved 或 machineOutcome。
function sourceCandidateBacked(candidateId: string): boolean {
  const candidate = input.snapshot.candidates.find(
    (item) => item.id === candidateId,
  );
  return (
    candidate !== undefined &&
    candidate.evidenceIds.some((id) =>
      input.snapshot.evidence.some(
        (item) => item.id === id && item.reviewStatus === "approved",
      ),
    )
  );
}

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

  it("逐字从源快照核对任一/全部/混合与阻断状态，不用报告自证", () => {
    let anyCount = 0;
    let allCount = 0;
    let mixedCount = 0;
    let blockedCount = 0;
    for (const row of rows) {
      const candidates = input.snapshot.candidates.filter(
        (item) => item.character === row.character,
      );
      const backed = candidates
        .filter((item) => sourceCandidateBacked(item.id))
        .map((item) => item.id);
      const unbacked = candidates
        .filter((item) => !sourceCandidateBacked(item.id))
        .map((item) => item.id);
      const any = backed.length > 0;
      const all = candidates.length > 0 && unbacked.length === 0;
      const mixed = any && !all;
      const expectedOutcome =
        candidates.length === 0
          ? "unknown"
          : !all
            ? "blocked"
            : candidates.length === 1
              ? "would-resolve"
              : "would-ambiguous";
      expect(row.candidateIds).toEqual(
        candidates.map((candidate) => candidate.id),
      );
      expect(row.approvedCandidateIds).toEqual(backed);
      expect(row.unbackedCandidateIds).toEqual(unbacked);
      expect(row.anyCandidateEvidenceApproved).toBe(any);
      expect(row.allCandidateEvidenceApproved).toBe(all);
      expect(row.evidenceApproved).toBe(all);
      expect(row.mixedCandidateEvidence).toBe(mixed);
      expect(row.machineOutcome, `${row.work} ${row.tokenId}`).toBe(
        expectedOutcome,
      );
      anyCount += Number(any);
      allCount += Number(all);
      mixedCount += Number(mixed);
      blockedCount += Number(expectedOutcome === "blocked");
    }
    expect(report.denominators.tokensWithAnyApprovedEvidence).toBe(anyCount);
    expect(report.denominators.tokensWithAllApprovedEvidence).toBe(allCount);
    expect(report.denominators.tokensWithMixedEvidence).toBe(mixedCount);
    expect(report.denominators.tokensWithoutApprovedEvidence).toBe(
      rows.length - anyCount,
    );
    expect(report.denominators.candidatePrecheckBlockedTokens).toBe(
      blockedCount,
    );
  });

  it("真实『昔』逐候选核查：只要仍有未审竞争候选，报告必须阻断", () => {
    const candidates = input.snapshot.candidates.filter(
      (candidate) => candidate.character === "昔",
    );
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual(
      ["pingshui:昔:ru:入声十药", "pingshui:昔:ru:入声十一陌"].sort(),
    );
    const all = candidates.every((candidate) =>
      sourceCandidateBacked(candidate.id),
    );
    const row = rows.find(
      (item) => item.work === "黄鹤楼" && item.tokenId === "l1c1",
    );
    expect(row?.machineOutcome).toBe(all ? "would-ambiguous" : "blocked");
  });

  it.each([
    { selectedApproved: false, competitorApproved: true },
    { selectedApproved: true, competitorApproved: false },
  ])(
    "已裁候选证据按自己的 ID 查询：选中=$selectedApproved，竞争=$competitorApproved",
    (state) => {
      // 内存合成审核状态，仅验证报告；不修改真实快照、不形成审核记录。
      const fixture = structuredClone(input);
      const selected = fixture.snapshot.candidates.find(
        (candidate) => candidate.id === "pingshui:更:qu:二十四敬",
      );
      const competitor = fixture.snapshot.candidates.find(
        (candidate) => candidate.id === "pingshui:更:ping:八庚",
      );
      if (selected === undefined || competitor === undefined)
        throw new Error("缺少更两读测试来源");
      for (const evidence of fixture.snapshot.evidence) {
        if (selected.evidenceIds.includes(evidence.id))
          evidence.reviewStatus = state.selectedApproved
            ? "approved"
            : "unverified";
        if (competitor.evidenceIds.includes(evidence.id))
          evidence.reviewStatus = state.competitorApproved
            ? "approved"
            : "unverified";
      }
      const actual = buildGoldenTokenReview(fixture);
      const row = actual.works[0]?.tokens.find(
        (item) => item.character === "更",
      );
      const adjudication = actual.adjudications.find(
        (item) => item.target === "更",
      );
      expect(row?.anyCandidateEvidenceApproved).toBe(true);
      expect(row?.allCandidateEvidenceApproved).toBe(false);
      expect(row?.mixedCandidateEvidence).toBe(true);
      expect(row?.machineOutcome).toBe("blocked"); // 这一列明确是语境筛选前预检。
      expect(adjudication?.candidateEvidenceApproved).toBe(
        state.selectedApproved,
      );
    },
  );

  it("缺字保持 unknown，不能因 every 空集判成已审，也不是未审候选阻断", () => {
    const fixture = structuredClone(input);
    fixture.snapshot.candidates = fixture.snapshot.candidates.filter(
      (candidate) => candidate.character !== "昔",
    );
    const actual = buildGoldenTokenReview(fixture);
    const row = actual.works.find((work) => work.title === "黄鹤楼")?.tokens[0];
    expect(row?.machineOutcome).toBe("unknown");
    expect(row?.anyCandidateEvidenceApproved).toBe(false);
    expect(row?.allCandidateEvidenceApproved).toBe(false);
    expect(actual.denominators.missingTokens).toBe(1);
  });

  it("每个候选都有声调，候选 ID 与声调一一对应且不缺项", () => {
    for (const row of rows) {
      expect(row.candidateIds).toHaveLength(row.candidateCount);
      expect(row.candidateTones).toHaveLength(row.candidateCount);
      expect(row.candidateTones.every((tone) => tone !== null)).toBe(true);
    }
  });

  it("十处裁定对上规则及所选候选的源证据", () => {
    expect(report.adjudications).toHaveLength(10);
    for (const item of report.adjudications) {
      const rule = input.rules.find((entry) => entry.id === item.ruleId);
      expect(rule, `${item.tokenId} 没有对应规则`).toBeDefined();
      expect(item.adjudicatedCandidateId).toBe(rule?.selectCandidateIds[0]);
      expect(item.ruleEvidenceIds).toEqual(rule?.evidenceIds);
      expect(item.candidateEvidenceApproved).toBe(
        sourceCandidateBacked(item.adjudicatedCandidateId ?? ""),
      );
    }
    expect(report.machineConclusion.tiers.toneCriticalWithRule).toBe(10);
  });

  it("无语境选择时，多读音同调的位置保留歧义且单列", () => {
    expect(report.machineConclusion.tiers.multiSameTone).toBe(12);
    expect(report.machineConclusion.mustRemainAmbiguous).toHaveLength(12);
    for (const item of report.machineConclusion.mustRemainAmbiguous) {
      expect(item.tokenId).toMatch(/^l\d+c\d+$/u);
    }
  });

  it("表用的是当前 API 快照，不是旧七字样本", () => {
    expect(report.dataVersion).toBe(input.snapshot.dataVersion);
    expect(report.snapshotReviewStatus).toBe(input.snapshot.reviewStatus);
    expect(report.versionDiff.legacyCharacters).toBe(7);
    expect(report.versionDiff.currentCharacters).toBeGreaterThan(8000);
  });

  it("JSON/Markdown 均与当前生成器、源快照一致，防止只改脚本漏重新生成", () => {
    const fresh = buildGoldenTokenReview(input);
    expect(report).toEqual(fresh);
    expect(markdown).toBe(renderGoldenTokenReviewMarkdown(fresh));
  });

  it("Markdown 无旧零计数及重复章节，更/楼备注引用后续裁定", () => {
    const headings = markdown
      .split("\n")
      .filter((line) => line.startsWith("## "));
    expect(new Set(headings).size).toBe(headings.length);
    expect(markdown).not.toContain("当前可确定：**0**");
    expect(markdown).not.toContain("approved 0/106");
    expect(markdown).not.toContain("故仍待语境证据");
    expect(markdown).not.toContain("即使其余证据获批也不得转 approved");
    expect(markdown).toContain("楼↔樓异体映射，无需重复审核");
    expect(rows.find((row) => row.character === "更")?.humanNote).toContain(
      "取去声二十四敬",
    );
  });
});
