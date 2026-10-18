/**
 * 错误文案必须保留服务端诊断细节（D2 真实联调发现）。
 *
 * 背景：真实 API 在数据未审核时返回 503，message 里带精确原因
 * （`LOOKUP_EVIDENCE_UNVERIFIED：字位 l1c1（白）… 没有已审核证据`），
 * 但前端曾只显示固定文案「稍后重试」，用户无法判断是等数据还是改输入。
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/errors";

describe("ApiError.userMessage 保留服务端原因", () => {
  it("HTTP_503 同时给出行动建议与服务端原因", () => {
    const detail =
      "LOOKUP_EVIDENCE_UNVERIFIED：字位 l1c1（白）参与读音/平仄推导的候选 pingshui:白:ru 没有已审核证据";
    const error = new ApiError("HTTP_503", detail, { status: 503 });
    expect(error.userMessage).toContain("稍后重试");
    expect(error.userMessage).toContain("原因：");
    expect(error.userMessage).toContain("LOOKUP_EVIDENCE_UNVERIFIED");
    expect(error.userMessage).toContain("l1c1");
  });

  it("HTTP_500 与 HTTP_404 同样保留原因", () => {
    const e500 = new ApiError("HTTP_500", "orchestrator: prosody crashed", { status: 500 });
    expect(e500.userMessage).toContain("原因：");
    expect(e500.userMessage).toContain("prosody crashed");

    const e404 = new ApiError("HTTP_404", "规则 METER.POSITION 未提供", { status: 404 });
    expect(e404.userMessage).toContain("原因：");
    expect(e404.userMessage).toContain("METER.POSITION");
  });

  it("空 message 时只给行动建议，不出现「原因：」空壳", () => {
    const error = new ApiError("HTTP_503", "", { status: 503 });
    expect(error.userMessage).toContain("稍后重试");
    expect(error.userMessage).not.toContain("原因：");
  });

  it("超长 message 被抑制，避免把整段内部堆栈塞进 UI", () => {
    const long = "x".repeat(700);
    const error = new ApiError("HTTP_500", long, { status: 500 });
    expect(error.userMessage).not.toContain(long);
    expect(error.userMessage).toContain("稍后重试");
  });

  it("413 也带上服务端原因（超限行数与码点数由服务端说明）", () => {
    const error = new ApiError("HTTP_413", "诗句超过 100 行上限", { status: 413 });
    expect(error.userMessage).toContain("原因：");
    expect(error.userMessage).toContain("100 行");
  });

  it("422 直接内联原因（不重复加「原因：」前缀）", () => {
    const error = new ApiError("HTTP_422", "正文必须包含汉字", { status: 422 });
    expect(error.userMessage).toContain("正文必须包含汉字");
  });

  it("网络错误不把服务端原因说成成功或报告问题", () => {
    const error = new ApiError("NETWORK_ERROR", "fetch failed");
    expect(error.userMessage).toContain("无法连接");
    expect(error.userMessage).not.toContain("报告");
  });
});
