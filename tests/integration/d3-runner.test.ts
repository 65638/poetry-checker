import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/server";
import {
  acceptanceExitCode,
  checkCell,
  POEMS,
} from "./e2e/d3-acceptance-api.mjs";
import type { AnalysisResponse } from "@poetry/contracts";
import { passedScenario } from "../e2e/scenario-result.mjs";
import {
  assertReportExport,
  assertSummaryExport,
} from "../e2e/export-checks.mjs";

const poem = POEMS.find((p: { id: string }) => p.id === "huanghelou")!;
describe("浏览器场景不得把缺陷返回值算为通过", () => {
  it.each([
    { status: "blocked", defect: "旧报告已下载" },
    { status: "fail" },
    { defect: "文件数量变化" },
  ])("拒绝未通过结果 %j", (detail) => {
    expect(() => passedScenario("test", detail)).toThrow("场景未通过");
  });
  it("明确成功的实际断言结果可以记录", () => {
    expect(passedScenario("test", { blockedExport: true }).status).toBe("pass");
  });
});
const app = buildApp();
const request = {
  text: poem.text,
  rhymeBook: "pingshui",
  genreHint: "auto",
  formHint: "auto",
  ruleSet: "teaching-v1",
  readingOverrides: [],
};
let report: AnalysisResponse;
beforeAll(async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/analyze",
    payload: request,
  });
  expect(res.statusCode).toBe(200);
  report = res.json();
});

// Mutate actual API output to prove the acceptance runner cannot hide a broken export.
const exported = () => ({
  report: structuredClone(report),
  request: structuredClone(request),
  inputHash: report.inputHash,
  originalText: report.poem.originalText,
  readingOverrides: [],
  exportedAtVersion: {
    schemaVersion: report.schemaVersion,
    versions: { ...report.versions },
  },
});
const summary = () =>
  [
    "诗词格律简评",
    "",
    report.poem.originalText,
    "",
    "依据：平水韵 · 传统四声（入声归仄）",
    `格式：七律形制 · ${report.prosody.format?.start.value === "ping" ? "平起" : report.prosody.format?.start.value === "ze" ? "仄起" : "起式未定"}`,
    "评语：按当前参考格式，发现格律问题。",
  ].join("\n");

describe("E06 验收不得把内容缺失或旧报告判成通过", () => {
  it("完整报告与摘要匹配当前 API/请求时通过", () => {
    expect(() => assertReportExport(exported(), report, request)).not.toThrow();
    expect(() => assertSummaryExport(summary(), report, request)).not.toThrow();
  });
  it("剪贴板为空或读取没有结果时拒绝，不能跳过", () => {
    for (const text of ["", "   ", undefined]) {
      expect(() => assertSummaryExport(text, report, request)).toThrow();
    }
  });
  it("Windows 剪贴板 CRLF 与同一正文的 LF 表达等价", () => {
    expect(() =>
      assertSummaryExport(summary().replace(/\n/g, "\r\n"), report, request),
    ).not.toThrow();
  });
  it("体裁大类相同但具体体式错误也拒绝", () => {
    expect(() =>
      assertSummaryExport(
        summary().replace("七律形制", "五绝形制"),
        report,
        request,
      ),
    ).toThrow();
  });
  it("摘要中正文相同但韵书被偷换也拒绝", () => {
    const changed = summary().replace("依据：平水韵", "依据：中华新韵");
    expect(() => assertSummaryExport(changed, report, request)).toThrow();
  });
  it("导出字位数相同但某字声调被改也拒绝", () => {
    const bad = exported();
    const token = bad.report.poem.tokens[0]!;
    token.tone = token.tone === "P" ? "Z" : "P";
    expect(() => assertReportExport(bad, report, request)).toThrow();
  });
  it("导出数据版本相同但规则版本错误也拒绝", () => {
    const bad = exported();
    bad.report.versions.rules = "stale-rules";
    expect(() => assertReportExport(bad, report, request)).toThrow();
  });
  it("JSON 请求快照正文相同但其他配置不同也拒绝", () => {
    const bad = exported();
    bad.request.formHint = "qijue";
    expect(() => assertReportExport(bad, report, request)).toThrow();
  });
  it("报告正确但外层版本元数据不同也拒绝", () => {
    const bad = exported();
    bad.exportedAtVersion.versions.rules = "stale-rules";
    expect(() => assertReportExport(bad, report, request)).toThrow();
  });
});
afterAll(() => app.close());
const tail = (body: AnalysisResponse) =>
  body.prosody.checks.find(
    (f) => f.ruleId === "TAIL.SANPING" && f.locations.some((l) => l.line === 4),
  )!;
const check = (body: unknown) =>
  checkCell(poem, "pingshui", { status: 200, body, ms: 0 });

describe("E 九格 runner 的反误报回归", () => {
  it("接受当前固定平水黄鹤楼的完整报告（summary 仍 fail）", () => {
    expect(report.summary.status).toBe("fail");
    expect(check(report).issues).toEqual([]);
  });
  it("拒绝只有必填字段名但字段内容无效的响应", () => {
    expect(check({ ...report, versions: {} }).ok).toBe(false);
  });
  it("not_applicable 但仍 error 的特例不能通过", () => {
    const mutated = structuredClone(report);
    tail(mutated).severity = "error";
    expect(check(mutated).ok).toBe(false);
  });
  it("用普通规则依据代替特例审批依据不能通过", () => {
    const mutated = structuredClone(report);
    tail(mutated).evidenceIds = ["made-up-evidence"];
    expect(check(mutated).ok).toBe(false);
  });
  it("删掉所有其他偏离而保留 summary=fail 不能通过", () => {
    const mutated = structuredClone(report);
    for (const f of mutated.prosody.checks) {
      if (f.ruleId !== "TAIL.SANPING" && f.status === "fail") {
        f.status = "pass";
        f.severity = "info";
      }
    }
    expect(check(mutated).ok).toBe(false);
  });
  it("阻断单列，不能以 exit 0 暗示九格完成", () => {
    expect(acceptanceExitCode(0, 6)).toBe(2);
    expect(acceptanceExitCode(1, 6)).toBe(1);
    expect(acceptanceExitCode(0, 0)).toBe(0);
    const outcome = checkCell(poem, "cilin", {
      status: 503,
      body: {
        error: { code: "DATA_NOT_READY", message: "未审", fieldErrors: [] },
      },
    });
    expect(outcome.blocked).toBe(true);
    expect(outcome.ok).toBe(false);
  });
});
