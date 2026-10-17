/**
 * D2：真实 API 接入准备——运行模式与 API 目标解析。
 *
 * 这里只测纯函数，不启动浏览器：
 * - 生产构建禁止开发 mock（误配要抛错，不能静默兜底）
 * - base URL 只接受 http(s) 绝对地址或留空（同源 /api）
 * - mock 模式必须显式注入 devTransport
 */
import { describe, expect, it } from "vitest";
import {
  ApiConfigError,
  createRuntimeTransport,
  resolveApiConfig,
  type WebEnv,
} from "../src/app/config";

const prod: WebEnv = { PROD: true };
const dev: WebEnv = { PROD: false };

describe("resolveApiConfig", () => {
  it("默认同源 /api（开发经 Vite 代理）", () => {
    const r = resolveApiConfig(dev);
    expect(r.mode).toBe("http");
    expect(r.baseUrl).toBe("");
    expect(r.note).toContain("/api");
  });

  it("生产构建同样默认同源 /api", () => {
    const r = resolveApiConfig(prod);
    expect(r.mode).toBe("http");
    expect(r.baseUrl).toBe("");
  });

  it("开发可用 VITE_DEV_MOCK=1 进入 mock 模式", () => {
    const r = resolveApiConfig({ ...dev, VITE_DEV_MOCK: "1" });
    expect(r.mode).toBe("mock");
  });

  it("生产构建启用开发 mock 必须抛错", () => {
    expect(() => resolveApiConfig({ ...prod, VITE_DEV_MOCK: "1" })).toThrowError(
      ApiConfigError,
    );
    expect(() => resolveApiConfig({ ...prod, VITE_DEV_MOCK: "true" })).toThrowError(
      /生产构建不允许启用开发 mock/u,
    );
  });

  it("绝对地址被接受并直连", () => {
    const r = resolveApiConfig({
      ...dev,
      VITE_API_BASE_URL: "http://127.0.0.1:3000",
    });
    expect(r.mode).toBe("http");
    expect(r.baseUrl).toBe("http://127.0.0.1:3000");
    expect(r.note).toContain("127.0.0.1:3000");
  });

  it("非法 base URL 被拒绝（防止把相对路径/拼写错误当直连）", () => {
    expect(() =>
      resolveApiConfig({ ...dev, VITE_API_BASE_URL: "127.0.0.1:3000" }),
    ).toThrowError(/http\(s\)/u);
    expect(() =>
      resolveApiConfig({ ...dev, VITE_API_BASE_URL: "/api" }),
    ).toThrowError(ApiConfigError);
  });

  it("空白字符串按未设置处理", () => {
    const r = resolveApiConfig({ ...dev, VITE_API_BASE_URL: "   " });
    expect(r.baseUrl).toBe("");
  });
});

describe("createRuntimeTransport", () => {
  it("http 模式下创建可用的 transport，不需要注入 mock", () => {
    const { transport, resolution } = createRuntimeTransport(dev);
    expect(resolution.mode).toBe("http");
    expect(typeof transport.post).toBe("function");
  });

  it("mock 模式未注入 devTransport 时抛错（不内置兜底）", () => {
    expect(() =>
      createRuntimeTransport({ ...dev, VITE_DEV_MOCK: "1" }),
    ).toThrowError(/未注入 devTransport/u);
  });

  it("mock 模式注入的 transport 被原样使用", () => {
    const calls: unknown[] = [];
    const devTransport = {
      async post(_path: string, body: unknown) {
        calls.push(body);
        return new Response("{}", { status: 200 });
      },
    };
    const { transport, resolution } = createRuntimeTransport(
      { ...dev, VITE_DEV_MOCK: "1" },
      devTransport,
    );
    expect(resolution.mode).toBe("mock");
    expect(transport).toBe(devTransport);
  });

  it("生产 + mock 在创建阶段就失败", () => {
    expect(() =>
      createRuntimeTransport({ ...prod, VITE_DEV_MOCK: "1" }, {
        post: async () => new Response("{}"),
      }),
    ).toThrowError(ApiConfigError);
  });
});
