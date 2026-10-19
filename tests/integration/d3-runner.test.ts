import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/server";
import {
  acceptanceExitCode,
  checkCell,
  POEMS,
} from "./e2e/d3-acceptance-api.mjs";
import type { AnalysisResponse } from "@poetry/contracts";

const poem = POEMS.find((p: { id: string }) => p.id === "huanghelou")!;
const app = buildApp();
let report: AnalysisResponse;
beforeAll(async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/analyze",
    payload: {
      text: poem.text,
      rhymeBook: "pingshui",
      genreHint: "auto",
      formHint: "auto",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    },
  });
  expect(res.statusCode).toBe(200);
  report = res.json();
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
