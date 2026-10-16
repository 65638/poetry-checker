import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AnalysisResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  ReadyResponseSchema,
  RhymeBooksResponseSchema,
} from "@poetry/contracts";
import { buildApp } from "../src/server.js";

const requestFixture = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/contracts/request.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

const validBody = {
  ...requestFixture,
  readingOverrides: [],
  inputHash: undefined,
};

describe("apps/api D1 mock", () => {
  it("healthz 返回契约约定的存活状态", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(res.json())).toEqual({ status: "ok" });
    await app.close();
  });

  it("readyz 返回就绪状态与版本", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(ReadyResponseSchema.parse(res.json()).status).toBe("ready");
    await app.close();
  });

  it("rhyme-books 返回三本书且通过 Schema", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/rhyme-books" });
    expect(res.statusCode).toBe(200);
    const parsed = RhymeBooksResponseSchema.parse(res.json());
    expect(parsed.books.map((b) => b.id)).toEqual(["pingshui", "cilin", "xinyun"]);
    await app.close();
  });

  it("analyze 合法请求返回 200 且响应通过 AnalysisResponse 校验", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(() => AnalysisResponseSchema.parse(res.json())).not.toThrow();
    await app.close();
  });

  it("analyze 把请求韵书写入 policy 与 poem，不残留 fixture 的平水韵", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: { ...validBody, rhymeBook: "xinyun" },
    });
    const body = AnalysisResponseSchema.parse(res.json());
    expect(body.policy.rhymeBook).toBe("xinyun");
    expect(body.policy.toneBasis).toBe("mandarin_base");
    expect(body.poem.book).toBe("xinyun");
    await app.close();
  });

  it("analyze 非法枚举返回 422 与统一错误对象", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: { ...validBody, rhymeBook: "guangyun" },
    });
    expect(res.statusCode).toBe(422);
    const parsed = ErrorResponseSchema.parse(res.json());
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("analyze 超长文本返回 413", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: { ...validBody, text: "平".repeat(2001) },
    });
    expect(res.statusCode).toBe(413);
    const parsed = ErrorResponseSchema.parse(res.json());
    expect(parsed.error.code).toBe("PAYLOAD_TOO_LARGE");
    await app.close();
  });

  it("characters/rules/sources 在真实数据接入前返回 503", async () => {
    const app = buildApp();
    for (const url of [
      "/api/v1/characters/%E7%99%BD?book=pingshui",
      "/api/v1/rules/METER.POSITION",
      "/api/v1/sources/src-1",
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(503);
      expect(ErrorResponseSchema.parse(res.json()).error.code).toBe("DATA_NOT_READY");
    }
    await app.close();
  });

  it("相同请求产生逐字节一致的业务响应", async () => {
    const app = buildApp();
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: validBody,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: validBody,
    });
    expect(second.body).toBe(first.body);
    await app.close();
  });
});
