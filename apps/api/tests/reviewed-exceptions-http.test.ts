// D3 批次一 HTTP 真链路验收（GLM）：已审特例适用后的黄鹤楼行为。
// 依据 docs/handoffs/d3-codex-exceptions.md 第 7 条与 13_ 第二批第 8 条裁定。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AnalysisResponse } from "@poetry/contracts";
import { buildApp } from "../src/server.js";

const works = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../data/works/review-queue.json", import.meta.url)),
    "utf8",
  ),
) as { items: Array<{ caseId: string; text: string }> };
const HUANGHELOU_TEXT = (() => {
  const entry = works.items.find(
    (item) => item.caseId === "golden-huanghelou-ps-v1",
  );
  if (entry === undefined) throw new Error("缺少黄鹤楼金标准文本");
  return entry.text;
})();

const app = buildApp();

async function analyzeHuanghelou(): Promise<AnalysisResponse> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/analyze",
    payload: {
      text: HUANGHELOU_TEXT,
      rhymeBook: "pingshui",
      genreHint: "auto",
      formHint: "auto",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as AnalysisResponse;
}

describe("D3 批次一·已审特例 HTTP 真链路", () => {
  it("l4c5-7 空悠悠：TAIL.SANPING 转 not_applicable/info，PPP 与位置保留，resolvedBy=null", async () => {
    const body = await analyzeHuanghelou();
    const finding = body.prosody.checks.find(
      (c) =>
        c.ruleId === "TAIL.SANPING" &&
        c.locations.some((l) => l.tokenId === "l4c5"),
    );
    expect(finding, "缺少 l4c5 三平尾诊断").toBeDefined();
    expect(finding?.status).toBe("not_applicable");
    expect(finding?.severity).toBe("info");
    expect(finding?.observed).toEqual(["P", "P", "P"]);
    expect(finding?.locations.map((l) => l.tokenId)).toEqual([
      "l4c5",
      "l4c6",
      "l4c7",
    ]);
    expect(finding?.resolvedBy).toBeNull();
    expect(finding?.message).toContain("第 13 号第 8 条");
  });

  it("其他偏离保持原判：l4c5 的 METER.POSITION 仍 fail/error，整诗 summary 仍 fail（不硬改 pass）", async () => {
    const body = await analyzeHuanghelou();
    const meter = body.prosody.checks.find(
      (c) =>
        c.ruleId === "METER.POSITION" &&
        c.locations.some((l) => l.tokenId === "l4c5"),
    );
    expect(meter, "缺少 l4c5 逐位常格对照").toBeDefined();
    expect(meter?.status).toBe("fail");
    expect(meter?.severity).toBe("error");
    // 特例只豁免这一项；其余 error 级 fail 仍存在，summary 如实 fail
    const errors = body.prosody.checks.filter(
      (c) => c.status === "fail" && c.severity === "error",
    );
    expect(errors.length).toBeGreaterThanOrEqual(8);
    expect(body.summary.status).toBe("fail");
    // 版本标识携带特例资源
    expect(body.versions.rules).toBe("teaching-v1+reviewed-works-v1");
  });

  it("一般三平尾仍是 error：临时目录断言由 Codex 57 项单测覆盖；此处钉特例只登记黄鹤楼一条", async () => {
    const r = (await import("../src/resources.js")).loadResources();
    expect(r.reviewedWorkExceptions).toHaveLength(1);
    expect(r.reviewedWorkExceptions[0]?.id).toBe(
      "exception:j03b2:huanghelou:l4:sanping:pingshui",
    );
    expect(r.reviewedWorkExceptions[0]?.reviewStatus).toBe("approved");
    // 装载校验零错误（引用闭合）
    expect(r.loadErrors).toEqual([]);
  });
});
