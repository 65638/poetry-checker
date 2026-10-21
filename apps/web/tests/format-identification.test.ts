import { describe, expect, it } from "vitest";
import {
  evaluateProsody as evaluateProsodyCore,
  matchTemplates as matchTemplatesCore,
} from "@poetry/prosody";
import {
  formatHeading,
  incompleteSummary,
  locateFinding,
  templateLabel,
} from "../src/app/reportView";
import { CheckerStore } from "../src/app/store";
import {
  buildReportJson,
  buildSummaryText,
  collectUncertainties,
} from "../src/features/export";
import {
  loadMockScenario,
  okResponse,
  scenarioDraft,
  scriptedTransport,
} from "./fixtures";

function reportOf() {
  const report = loadMockScenario("pass");
  report.prosody = evaluateProsodyCore({
    poem: report.poem,
    candidates: matchTemplatesCore({
      poem: report.poem,
      formHint: "auto",
      ruleSet: "teaching-v1",
    }),
    selectedTemplateId: null,
    applicability: "uncertain",
    ruleSet: "teaching-v1",
  });
  report.summary.status = "needs_review";
  return report;
}

describe("分项识别展示与导出", () => {
  it("整诗未选格式时仍显示起式，且不修改报告", () => {
    const report = reportOf();
    const before = structuredClone(report);
    expect(formatHeading(report)).toBe("五绝形制 · 仄起");
    expect(incompleteSummary(report).label).toBe("五绝形制 · 仄起");
    expect(incompleteSummary(report).desc).not.toContain("平起／仄起");
    expect(report).toEqual(before);
  });

  it("同声多音的起式照常显示，不依赖 readingStatus", () => {
    const report = reportOf();
    report.poem.tokens[1]!.readingStatus = "ambiguous";
    report.poem.tokens[1]!.selectedReadingId = null;
    expect(incompleteSummary(report).label).toBe("五绝形制 · 仄起");
    expect(incompleteSummary(report).desc).toContain("读音或声调未确定");
  });

  it("条件性问题独立导出，不混入共同问题或更改摘要状态", () => {
    const report = reportOf();
    const before = structuredClone(report);
    const state = {
      report,
      request: { text: report.poem.originalText },
      overrides: [],
    };
    const text = buildSummaryText(state);
    expect(text).toContain("格式：五绝形制 · 仄起");
    expect(text).toContain("不计入共同问题");
    expect(buildReportJson(state).report.prosody.conditionalChecks).toEqual(
      report.prosody.conditionalChecks,
    );
    expect(collectUncertainties(report).uncertainChecks.length).toBe(
      report.prosody.checks.filter(
        (c) => c.status === "uncertain" || c.status === "unsupported",
      ).length,
    );
    expect(report).toEqual(before);
  });

  it("条件性问题可选择、精确定位，不发送请求或修改读音", async () => {
    const report = reportOf();
    const transport = scriptedTransport([okResponse(report)]);
    const store = new CheckerStore(scenarioDraft("pass"), { transport });
    await store.analyze();
    const block = report.prosody.conditionalChecks!.find((b) =>
      b.checks.some(
        (c) => b.conditionalFindingIds.includes(c.id) && c.status === "fail",
      ),
    )!;
    const finding = block.checks.find(
      (c) => block.conditionalFindingIds.includes(c.id) && c.status === "fail",
    )!;
    const before = store.getState().report;
    store.selectFinding(finding.id);
    expect(store.getState().selectedFindingId).toBe(finding.id);
    expect(locateFinding(report, finding.id).map((t) => t.tokenId)).toEqual(
      finding.locations.map((l) => l.tokenId),
    );
    expect(
      templateLabel(
        report.prosody.candidates.find((c) => c.id === block.templateId)!,
      ),
    ).toMatch(/平起|仄起/);
    store.selectFinding(null);
    expect(transport.calls).toHaveLength(1);
    expect(store.getState().report).toBe(before);
  });
});
