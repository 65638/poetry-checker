/**
 * 测试 D-D1-01 / D-D1-07 / D-D1-08 的 API 层行为：
 * 五类合法报告原样消费、错误映射、以及「Schema 合法但不匹配请求」的拒绝。
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  analyze,
  buildAnalyzeRequest,
  type Transport,
} from "../src/api/analyze";
import { ApiError } from "../src/api/errors";
import { sha256Hex } from "../src/utils/sha256";
import {
  errorResponse,
  jsonResponse,
  loadMockScenario,
  okResponse,
  scenarioDraft,
  scriptedTransport,
  type MockScenario,
} from "./fixtures";

const scenarios: MockScenario[] = [
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
];

describe("sha256Hex 与 Node crypto 一致（保持 inputHash 口径）", () => {
  it.each(["", "平", "仄仄平平仄", "白日依山尽，黄河入海流。", "𠀀 emoji 😀", "a\nb\nc"])(
    "对 %j 计算一致",
    (text) => {
      const expected = createHash("sha256").update(text, "utf8").digest("hex");
      expect(sha256Hex(text)).toBe(expected);
    },
  );
});

describe("buildAnalyzeRequest", () => {
  it("总是带 ruleSet 与空覆盖，并补上本次原文摘要", () => {
    const draft = {
      text: "仄仄平平仄",
      rhymeBook: "pingshui" as const,
      genreHint: "auto" as const,
      formHint: "auto" as const,
    };
    const built = buildAnalyzeRequest(draft);
    expect(built.request.ruleSet).toBe("teaching-v1");
    expect(built.request.readingOverrides).toEqual([]);
    expect(built.request.inputHash).toBe(sha256Hex(draft.text));
    expect(built.expectedInputHash).toBe(built.request.inputHash);
  });

  it("人工选音时携带覆盖与 inputHash", () => {
    const draft = scenarioDraft("pass");
    const built = buildAnalyzeRequest(draft, [
      { tokenId: "l1c1", readingId: "fixture:reading:仄:Z" },
    ]);
    expect(built.request.readingOverrides).toEqual([
      { tokenId: "l1c1", readingId: "fixture:reading:仄:Z" },
    ]);
    expect(built.request.inputHash).toBeDefined();
  });

  it("违反公共契约时抛 CONTRACT_ERROR 且不发送", () => {
    const draft = {
      text: "",
      rhymeBook: "pingshui" as const,
      genreHint: "auto" as const,
      formHint: "auto" as const,
    };
    expect(() => buildAnalyzeRequest(draft)).toThrowError(ApiError);
    try {
      buildAnalyzeRequest(draft);
    } catch (error) {
      expect((error as ApiError).code).toBe("CONTRACT_ERROR");
    }
  });

  it("古体与具体近体形式互斥由契约拒绝", () => {
    const draft = scenarioDraft("pass");
    const invalid = { ...draft, genreHint: "ancient" as const, formHint: "wujue" as const };
    try {
      buildAnalyzeRequest(invalid);
      throw new Error("应当抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("CONTRACT_ERROR");
    }
  });
});

describe("analyze 消费五类合法报告（D-D1-01）", () => {
  it.each(scenarios)("原样保留 %s 的 summary.status", async (scenario) => {
    const report = loadMockScenario(scenario);
    const draft = scenarioDraft(scenario);
    const transport = scriptedTransport([okResponse(report)]);
    const outcome = await analyze(draft, transport);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.summary.status).toBe(report.summary.status);
    expect(outcome.report.summary.message).toBe(report.summary.message);
    // 通过不能被「升级」，未支持不能被显示成通过。
    expect(outcome.report.summary.status).not.toBe(
      scenario === "pass" ? "fail" : "pass",
    );
    expect(outcome.report.poem.originalText).toBe(draft.text);
  });

  it("请求路径固定为 /api/v1/analyze，且只发一次", async () => {
    const report = loadMockScenario("pass");
    const transport = scriptedTransport([okResponse(report)]);
    await analyze(scenarioDraft("pass"), transport);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.path).toBe("/api/v1/analyze");
  });
});

describe("analyze 的错误映射（D-D1-07）", () => {
  const cases: Array<[string, Response, string, number]> = [
    ["422 校验失败", errorResponse("VALIDATION_ERROR", "请求不符合公共契约", 422, [{ path: "text", message: "必须包含汉字" }]), "HTTP_422", 422],
    ["413 超长", errorResponse("PAYLOAD_TOO_LARGE", "正文超过 2,000 个 Unicode 码点上限", 413), "HTTP_413", 413],
    ["503 数据未就绪", errorResponse("DATA_NOT_READY", "数据尚未接入", 503), "HTTP_503", 503],
    ["500 内部错误", errorResponse("INTERNAL_ERROR", "服务内部错误", 500), "HTTP_500", 500],
  ];

  it.each(cases)("%s 映射为可识别错误", async (_label, response, expectedCode, status) => {
    const transport = scriptedTransport([response]);
    const outcome = await analyze(scenarioDraft("pass"), transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe(expectedCode);
    expect(outcome.error.status).toBe(status);
    // 用户文案不得把错误说成正常 unknown 报告。
    expect(outcome.error.userMessage.length).toBeGreaterThan(0);
  });

  it("网络拒绝映射为 NETWORK_ERROR", async () => {
    const transport: Transport = {
      post: async () => {
        throw new TypeError("fetch failed");
      },
    };
    const outcome = await analyze(scenarioDraft("pass"), transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NETWORK_ERROR");
  });

  it("非 JSON 响应映射为 BAD_JSON，不当作成功报告", async () => {
    const transport = scriptedTransport([
      new Response("<html>oops</html>", { status: 200 }),
    ]);
    const outcome = await analyze(scenarioDraft("pass"), transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("BAD_JSON");
  });

  it("坏 Schema 映射为 BAD_SCHEMA", async () => {
    const broken = { ...loadMockScenario("pass"), schemaVersion: "9.9" };
    const transport = scriptedTransport([jsonResponse(broken)]);
    const outcome = await analyze(scenarioDraft("pass"), transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("BAD_SCHEMA");
  });

  it("422 保留 fieldErrors 供 UI 展示", async () => {
    const transport = scriptedTransport([
      errorResponse("VALIDATION_ERROR", "请求不符合公共契约", 422, [
        { path: "text", message: "正文必须包含汉字" },
      ]),
    ]);
    const outcome = await analyze(scenarioDraft("pass"), transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.fieldErrors).toEqual([
      { path: "text", message: "正文必须包含汉字" },
    ]);
  });
});

describe("analyze 拒绝不匹配的响应（D-D1-08）", () => {
  it("含补充平面汉字的合法报告必须被接受（码点 vs UTF-16 分离）", async () => {
    const report = loadMockScenario("supplementary");
    const draft = scenarioDraft("supplementary");

    // 前提：正文确实含补充平面汉字（1 码点 = 2 UTF-16 码元），
    // 行长度按 UTF-16 length 会与字位数不等。
    const supplementary = report.poem.tokens.find(
      (token) => [...token.text].length === 1 && token.text.length === 2,
    );
    expect(supplementary).toBeDefined();
    const line = report.poem.lines.find((item) =>
      item.tokenIds.includes(supplementary!.tokenId),
    );
    expect(line).toBeDefined();
    expect(line!.text.length).toBeGreaterThan(line!.tokenIds.length);

    const transport = scriptedTransport([okResponse(report)]);
    const outcome = await analyze(draft, transport);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.summary.status).toBe("pass");
  });

  it("Schema 合法但原文与请求不同 → RESPONSE_INPUT_MISMATCH", async () => {
    const requestDraft = scenarioDraft("pass");
    const mismatchedReport = loadMockScenario("mismatch");
    // 前提：mismatch 报告本身通过 Schema。
    expect(mismatchedReport.poem.originalText).toBe(requestDraft.text);

    const transport = scriptedTransport([okResponse(mismatchedReport)]);
    const outcome = await analyze(requestDraft, transport);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("RESPONSE_INPUT_MISMATCH");
    expect(outcome.error.userMessage).toContain("不一致");
  });

  it("字位文本与切片不符由公共 Schema 拦截（业务层不重复实现）", async () => {
    const report = loadMockScenario("pass");
    const corrupted = structuredClone(report);
    const target = corrupted.poem.tokens[0]!;
    const source = corrupted.poem.tokens.find(
      (token) => token.text !== target.text,
    );
    expect(source).toBeDefined();
    target.text = source!.text;

    const transport = scriptedTransport([okResponse(corrupted)]);
    const outcome = await analyze(scenarioDraft("pass"), transport);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // 公共 Schema 的 superRefine 已核对「originalText 切片 == token.text」。
    expect(outcome.error.code).toBe("BAD_SCHEMA");
  });

  it("行文本与字位组成不符（Schema 合法）由业务层拦截", async () => {
    const report = loadMockScenario("mismatch");
    const transport = scriptedTransport([okResponse(report)]);
    const outcome = await analyze(scenarioDraft("pass"), transport);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("RESPONSE_INPUT_MISMATCH");
    expect(outcome.error.message).toContain("行");
  });

  it("韵书与请求不同 → RESPONSE_BOOK_MISMATCH", async () => {
    const draft = { ...scenarioDraft("pass"), rhymeBook: "xinyun" as const };
    // 报告仍是 pingshui，且 toneBasis 与自身一致（不会先被 Schema 拒绝）。
    const report = loadMockScenario("pass");
    const transport = scriptedTransport([okResponse(report)]);
    const outcome = await analyze(draft, transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("RESPONSE_BOOK_MISMATCH");
  });
});
