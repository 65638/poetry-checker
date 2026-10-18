/**
 * D3 证据抽屉数据层。
 *
 * 重点不是「有数据」，而是：
 * - 反切缺失要能显式报告（不许虚构）；
 * - 引用不到的证据/规则卡要列出来（不许静默丢弃）；
 * - 用户指定读音要可识别，且不改写报告原值；
 * - 原文切片按 UTF-16 区间，与 token 坐标一致。
 */
import { describe, expect, it } from "vitest";
import {
  buildEvidenceIndex,
  buildTokenEvidence,
  collectEvidenceGaps,
} from "../src/app/evidence";
import { loadMockScenario, type MockScenario } from "./fixtures";

const scenarios: MockScenario[] = [
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
  "supplementary",
];

describe("buildEvidenceIndex", () => {
  it("把 evidence 关联到 source，并索引韵部与规则卡", () => {
    const report = loadMockScenario("pass");
    const index = buildEvidenceIndex(report);

    expect(index.sources.size).toBe(report.provenance.sources.length);
    expect(index.evidence.size).toBe(report.provenance.evidence.length);
    expect(index.groups.size).toBe(report.provenance.groups.length);
    expect(index.rules.size).toBe(report.provenance.rules.length);

    for (const item of index.evidence.values()) {
      expect(item.source).not.toBeNull();
      expect(item.source?.id).toBe(report.provenance.sources[0]?.id);
    }
  });
});

describe("buildTokenEvidence", () => {
  it.each(scenarios)("%s：字位切片与区间一致", (name) => {
    const report = loadMockScenario(name);
    const token = report.poem.tokens[0]!;
    const view = buildTokenEvidence(report, token.tokenId);
    expect(view).not.toBeNull();
    expect(view!.slice).toBe(token.text);
    expect(view!.slice).toBe(
      report.poem.originalText.slice(view!.startUtf16, view!.endUtf16),
    );
  });

  it("候选原样映射：平仄、贡献标记、选中标记", () => {
    const report = loadMockScenario("pass");
    const token = report.poem.tokens[0]!;
    const view = buildTokenEvidence(report, token.tokenId)!;

    expect(view.candidates).toHaveLength(token.candidates.length);
    for (const [index, candidate] of view.candidates.entries()) {
      const source = token.candidates[index]!;
      expect(candidate.id).toBe(source.id);
      expect(candidate.character).toBe(source.character);
      expect(candidate.tone).toBe(source.tone);
      expect(candidate.isEffective).toBe(
        token.effectiveCandidateIds.includes(source.id),
      );
      expect(candidate.isSelected).toBe(token.selectedReadingId === source.id);
    }
  });

  it("反切缺失显式标记，不补造文本", () => {
    const report = loadMockScenario("pass");
    const token = report.poem.tokens[0]!;
    const view = buildTokenEvidence(report, token.tokenId)!;
    // fixture 的 fanqie 均为 null
    expect(view.candidates.every((candidate) => !candidate.fanqie.available)).toBe(
      true,
    );
    const gaps = collectEvidenceGaps(view);
    expect(gaps.missingFanqie.length).toBe(view.candidates.length);
  });

  it("未定读音的字位仍能看到候选与平仄，不显示成通过", () => {
    const report = loadMockScenario("needs_review");
    const unresolved = report.poem.tokens.find(
      (token) => token.readingStatus !== "resolved",
    )!;
    const view = buildTokenEvidence(report, unresolved.tokenId)!;
    expect(view.readingStatus).not.toBe("resolved");
    expect(view.candidates.length).toBeGreaterThan(0);
    expect(view.toneLabel).toBe(
      unresolved.tone === "P" ? "平" : unresolved.tone === "Z" ? "仄" : "未定",
    );
    // 未定不能静默选中某个候选
    expect(view.candidates.filter((candidate) => candidate.isSelected)).toHaveLength(
      0,
    );
  });

  it("用户指定的读音被标注且报告原值不被改写", () => {
    const report = loadMockScenario("pass");
    const token = { ...report.poem.tokens[0]!, selectionMethod: "user" as const };
    const patched = {
      ...report,
      poem: {
        ...report.poem,
        tokens: [token, ...report.poem.tokens.slice(1)],
      },
    };
    const view = buildTokenEvidence(patched, token.tokenId)!;
    expect(view.isUserSpecified).toBe(true);
    expect(view.selectionMethod).toBe("user");
    // 原报告 token 未被修改
    expect(report.poem.tokens[0]!.selectionMethod).toBe("unique");
  });

  it("找不到字位返回 null，不返回空壳", () => {
    const report = loadMockScenario("pass");
    expect(buildTokenEvidence(report, "l99c99")).toBeNull();
  });

  it("诊断带上规则卡；缺失规则卡被显式报告", () => {
    const report = loadMockScenario("fail");
    const check = report.prosody.checks[0]!;
    const tokenId = check.locations[0]!.tokenId;
    const view = buildTokenEvidence(report, tokenId)!;
    expect(view.findings.length).toBeGreaterThan(0);
    const finding = view.findings[0]!;
    expect(finding.ruleCard).not.toBeNull();
    expect(finding.ruleCard?.id).toBe(check.ruleId);
    expect(finding.ruleCard?.statement.length).toBeGreaterThan(0);

    const gaps = collectEvidenceGaps(view);
    expect(gaps.findingsWithoutRuleCard).toEqual([]);
  });

  it("韵部名称能解析；解析不到时标注而非静默", () => {
    const report = loadMockScenario("pass");
    const token = report.poem.tokens[0]!;
    const view = buildTokenEvidence(report, token.tokenId)!;
    for (const name of view.groupNames) {
      expect(name.length).toBeGreaterThan(0);
    }

    // 人为移除韵部定义，验证会标注「未知韵部」而不是当成空
    const broken = {
      ...report,
      provenance: { ...report.provenance, groups: [] },
    };
    const brokenView = buildTokenEvidence(broken, token.tokenId)!;
    const missing = brokenView.candidates.flatMap((candidate) =>
      candidate.groupNames.filter((name) => name.startsWith("未知韵部")),
    );
    expect(missing.length).toBeGreaterThan(0);
  });

  it("引用不到的证据 ID 被列入 gaps", () => {
    const report = loadMockScenario("pass");
    const token = report.poem.tokens[0]!;
    const view = buildTokenEvidence(report, token.tokenId)!;
    const gaps = collectEvidenceGaps(view);
    // fixture 的证据是完整的，不应有未解析项
    expect(gaps.unresolvedEvidenceIds).toEqual([]);

    const broken = {
      ...report,
      provenance: { ...report.provenance, evidence: [] },
    };
    const brokenView = buildTokenEvidence(broken, token.tokenId)!;
    const brokenGaps = collectEvidenceGaps(brokenView);
    expect(brokenGaps.unresolvedEvidenceIds.length).toBeGreaterThan(0);
  });

  it("补充平面汉字的证据视图区间正确", () => {
    const report = loadMockScenario("supplementary");
    const cell = report.poem.tokens.find((token) => [...token.text].length === 1 && token.text.length === 2)!;
    const view = buildTokenEvidence(report, cell.tokenId)!;
    expect(view.slice).toBe(cell.text);
    expect(view.startUtf16).toBe(cell.startUtf16);
    expect(view.endUtf16).toBe(cell.endUtf16);
  });
});
