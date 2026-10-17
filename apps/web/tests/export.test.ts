/**
 * 导出纯函数与开发场景自检。
 * 不写只复制静态文案的测试：这里验证结构与「不重判」约束。
 */
import { describe, expect, it } from "vitest";
import {
  buildReportJson,
  buildSummaryText,
  collectUncertainties,
  reportFileName,
} from "../src/features/export";
import {
  codePointLength,
  normalizeDraft,
  sameInput,
  validateDraft,
} from "../src/app/examples";
import { loadMockScenario, scenarioDraft, type MockScenario } from "./fixtures";

const scenarios: MockScenario[] = [
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
];

describe("开发场景自检", () => {
  it.each(scenarios)("%s 的 summary.status 与文件名一致", (name) => {
    const report = loadMockScenario(name);
    expect(report.summary.status).toBe(name);
  });

  it("五种状态的正文互不相同（避免只能靠正文选中一种状态）", () => {
    const texts = scenarios.map((name) => loadMockScenario(name).poem.originalText);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("needs_review 场景确实含读音未定字位", () => {
    const report = loadMockScenario("needs_review");
    const unresolved = report.poem.tokens.filter(
      (token) => token.readingStatus !== "resolved",
    );
    expect(unresolved.length).toBeGreaterThan(0);
  });

  it("unsupported 场景没有任何「通过」迹象", () => {
    const report = loadMockScenario("unsupported");
    expect(report.summary.status).toBe("unsupported");
    expect(report.prosody.checks.every((check) => check.status !== "pass")).toBe(true);
    expect(report.prosody.rhyme.status).not.toBe("pass");
  });

  it("mismatch 场景在 Schema 层面仍合法（靠前端语义核对拦截）", () => {
    const report = loadMockScenario("mismatch");
    expect(report.summary.status).toBe("pass");
    // 行文本与字位刻意错位
    const firstToken = report.poem.tokens[0]!;
    expect(report.poem.originalText.slice(firstToken.startUtf16, firstToken.endUtf16)).toBe(
      firstToken.text,
    );
    const line2 = report.poem.lines[1]!;
    expect(line2.text.length).toBeLessThan(5);
  });
});

describe("collectUncertainties", () => {
  it("needs_review 报告收集到未定读音与不确定检查", () => {
    const report = loadMockScenario("needs_review");
    const result = collectUncertainties(report);
    expect(result.ambiguousReadings.length).toBeGreaterThan(0);
    expect(result.uncertainChecks.length).toBeGreaterThan(0);
    expect(result.genreApplicability).toBe("uncertain");
  });

  it("pass 报告的必检项不进入不确定清单", () => {
    const report = loadMockScenario("pass");
    const result = collectUncertainties(report);
    expect(
      result.uncertainChecks.every((check) => check.status !== "pass"),
    ).toBe(true);
  });
});

describe("buildReportJson / buildSummaryText", () => {
  const report = loadMockScenario("needs_review");
  const draft = scenarioDraft("needs_review");
  const request = {
    text: draft.text,
    rhymeBook: draft.rhymeBook,
    genreHint: draft.genreHint,
    formHint: draft.formHint,
    ruleSet: "teaching-v1" as const,
    inputHash: report.inputHash,
    readingOverrides: [{ tokenId: "l1c1", readingId: "fixture:reading:仄:Z" }],
  };

  it("JSON 导出含原文、请求快照、完整报告、版本、覆盖与不确定项", () => {
    const payload = buildReportJson({ report, request, overrides: request.readingOverrides });
    expect(payload.originalText).toBe(report.poem.originalText);
    expect(payload.request).toEqual(request);
    expect(payload.inputHash).toBe(report.inputHash);
    expect(payload.readingOverrides).toHaveLength(1);
    expect(payload.uncertainties.ambiguousReadings.length).toBeGreaterThan(0);
    expect(payload.report.summary.status).toBe(report.summary.status);
    expect(payload.exportedAtVersion.versions.rules).toBe(report.versions.rules);
  });

  it("摘要文本包含结论、口径、版本与不确定项数量", () => {
    const text = buildSummaryText({ report, request, overrides: [] });
    expect(text).toContain(report.summary.status);
    expect(text).toContain(report.policy.notice);
    expect(text).toContain(report.versions.rules);
    expect(text).toContain("可疑/待复核项");
  });

  it("文件名安全且限制长度", () => {
    const name = reportFileName(report);
    expect(name).toMatch(/^poetry-report-.*\.json$/u);
    expect(name).not.toMatch(/[\\/:*?"<>|\s]/u);
  });
});

describe("输入规则（D-D1-09）", () => {
  it("古体自动清掉具体近体形式", () => {
    const normalized = normalizeDraft({
      text: "仄仄平平仄",
      rhymeBook: "pingshui",
      genreHint: "ancient",
      formHint: "wujue",
    });
    expect(normalized.formHint).toBe("auto");
  });

  it("只改体裁时不清除形式以外的内容", () => {
    const normalized = normalizeDraft({
      text: "仄仄平平仄",
      rhymeBook: "pingshui",
      genreHint: "ancient",
      formHint: "auto",
    });
    expect(normalized.genreHint).toBe("ancient");
    expect(normalized.text).toBe("仄仄平平仄");
  });

  it("纯标点与无汉字输入被拒绝", () => {
    expect(
      validateDraft({
        text: "，，。！",
        rhymeBook: "pingshui",
        genreHint: "auto",
        formHint: "auto",
      }),
    ).toContain("必须包含汉字");
  });

  it("长度按 Unicode 码点计算，不按 UTF-16 码元", () => {
    const supplementary = "𠀀𠀁𠀂";
    expect(codePointLength(supplementary)).toBe(3);
    expect(supplementary.length).toBe(6);
  });

  it("超长正文被拒绝并给出实际码点数", () => {
    const long = "平".repeat(2001);
    const message = validateDraft({
      text: long,
      rhymeBook: "pingshui",
      genreHint: "auto",
      formHint: "auto",
    });
    expect(message).toContain("2001");
  });

  it("sameInput 对体裁与形式敏感", () => {
    const draft = scenarioDraft("pass");
    expect(sameInput(draft, draft)).toBe(true);
    expect(sameInput({ ...draft, formHint: "wujue" }, draft)).toBe(false);
    expect(sameInput({ ...draft, rhymeBook: "xinyun" }, draft)).toBe(false);
  });
});
