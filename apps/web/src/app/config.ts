import { createHttpTransport, type Transport } from "../api/analyze";

/**
 * 运行模式与 API 目标解析（D2 真实接入准备）。
 *
 * 规则：
 * - 生产构建（`PROD`）**禁止**开发 mock：误配直接抛错，不做静默兜底。
 * - `VITE_API_BASE_URL` 为空 → 走同源相对路径 `/api`（开发经 Vite 代理）。
 * - 填了绝对地址 → 直连该 origin（真实 API 联调用）。
 *
 * 只读取 `import.meta.env` 的白名单字段，不把整包 env 传进业务层。
 * 本函数是纯函数，便于在 Node 下测试。
 */
export interface WebEnv {
  PROD: boolean;
  VITE_API_BASE_URL?: string;
  VITE_DEV_MOCK?: string;
}

export type ApiModeSource = "mock" | "http";

export interface ApiResolution {
  mode: ApiModeSource;
  /** 传给 transport 的 base URL；空串表示同源相对路径。 */
  baseUrl: string;
  /** 面向日志/调试的可读说明，不含任何密钥。 */
  note: string;
}

export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigError";
  }
}

export function resolveApiConfig(env: WebEnv): ApiResolution {
  const mockRequested = env.VITE_DEV_MOCK === "1" || env.VITE_DEV_MOCK === "true";
  const rawBase = (env.VITE_API_BASE_URL ?? "").trim();

  if (mockRequested && env.PROD) {
    throw new ApiConfigError(
      "生产构建不允许启用开发 mock：请在构建环境移除 VITE_DEV_MOCK。",
    );
  }

  if (rawBase !== "" && !/^https?:\/\//u.test(rawBase)) {
    throw new ApiConfigError(
      `VITE_API_BASE_URL 必须是 http(s) 绝对地址或留空（同源 /api），收到：${rawBase}`,
    );
  }

  if (mockRequested) {
    return {
      mode: "mock",
      baseUrl: rawBase,
      note: "开发 mock 模式：transport 由调用方注入，不直连真实 API。",
    };
  }

  return {
    mode: "http",
    baseUrl: rawBase,
    note:
      rawBase === ""
        ? "HTTP 模式：同源相对路径 /api（开发经 Vite 代理到 127.0.0.1:3000）。"
        : `HTTP 模式：直连 ${rawBase}。`,
  };
}

/** 读取当前构建的 env。单独抽出来，便于测试时替换。 */
export function readWebEnv(): WebEnv {
  const env = import.meta.env;
  return {
    PROD: env.PROD,
    VITE_API_BASE_URL: env.VITE_API_BASE_URL,
    VITE_DEV_MOCK: env.VITE_DEV_MOCK,
  };
}

/**
 * 组装运行期 transport。
 *
 * mock 模式下必须由调用方显式注入 devTransport；这里不内置任何 mock 兜底，
 * 避免「请求失败就回退合成数据」这类把失败伪装成成功的路径。
 */
export function createRuntimeTransport(
  env: WebEnv,
  devTransport?: Transport,
): { transport: Transport; resolution: ApiResolution } {
  const resolution = resolveApiConfig(env);
  if (resolution.mode === "mock") {
    if (devTransport === undefined) {
      throw new ApiConfigError(
        "已启用开发 mock 但未注入 devTransport；请由开发预览入口显式提供。",
      );
    }
    return { transport: devTransport, resolution };
  }
  return {
    transport: createHttpTransport({ baseUrl: resolution.baseUrl }),
    resolution,
  };
}
