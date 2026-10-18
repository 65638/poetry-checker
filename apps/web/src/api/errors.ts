import type { AnalyzeRequest, ErrorResponse } from "@poetry/contracts";

/** 可注入的传输层：测试用手动控制 Promise 顺序的假实现。 */
export interface Transport {
  post(path: string, body: unknown, signal?: AbortSignal): Promise<Response>;
}

/** 集中 API client 暴露给业务层的错误形状。 */
export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "ABORTED"
  | "HTTP_422"
  | "HTTP_413"
  | "HTTP_503"
  | "HTTP_404"
  | "HTTP_500"
  | "BAD_JSON"
  | "BAD_SCHEMA"
  | "RESPONSE_INPUT_MISMATCH"
  | "RESPONSE_BOOK_MISMATCH"
  | "CONTRACT_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  readonly fieldErrors: Array<{ path: string; message: string }>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: {
      status?: number | null;
      fieldErrors?: Array<{ path: string; message: string }>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = options.status ?? null;
    this.fieldErrors = options.fieldErrors ?? [];
  }

  /** 供 UI 显示的稳定文案；不把 unknown 说成网络故障。 */
  get userMessage(): string {
    switch (this.code) {
      case "NETWORK_ERROR":
        return "无法连接分析服务，请检查网络后重试。输入内容已保留。";
      case "ABORTED":
        return "请求已取消。";
      case "HTTP_422":
        return `请求未被接受：${this.message}`;
      case "HTTP_413":
        return "正文超出长度限制（最多 2,000 个 Unicode 码点）。";
      case "HTTP_503":
        return "分析数据尚未就绪，请稍后重试。输入内容已保留。";
      case "HTTP_404":
        return "请求的资源不存在。";
      case "HTTP_500":
        return "分析服务内部错误，请稍后重试。";
      case "BAD_JSON":
        return "服务返回的内容无法解析，已按失败处理，未展示为正常报告。";
      case "BAD_SCHEMA":
        return "服务返回的报告不符合公共契约，已拒绝展示。";
      case "RESPONSE_INPUT_MISMATCH":
        return "服务返回的报告与本次提交的原文不一致，已拒绝展示。";
      case "RESPONSE_BOOK_MISMATCH":
        return "服务返回的报告与本次请求的韵书不一致，已拒绝展示。";
      case "CONTRACT_ERROR":
        return "本地请求构造不符合公共契约，未发送请求。";
      default:
        return "请求失败，请重试。";
    }
  }
}

/** 从响应体里尽力解析契约错误对象。 */
export function parseErrorResponse(body: unknown): ErrorResponse | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as { error?: unknown };
  if (typeof candidate.error !== "object" || candidate.error === null) return null;
  const error = candidate.error as {
    code?: unknown;
    message?: unknown;
    fieldErrors?: unknown;
  };
  if (typeof error.code !== "string" || typeof error.message !== "string") {
    return null;
  }
  const fieldErrors = Array.isArray(error.fieldErrors)
    ? error.fieldErrors.flatMap((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          typeof (item as { path?: unknown }).path === "string" &&
          typeof (item as { message?: unknown }).message === "string"
        ) {
          return [
            {
              path: (item as { path: string }).path,
              message: (item as { message: string }).message,
            },
          ];
        }
        return [];
      })
    : [];
  return {
    error: { code: error.code, message: error.message, fieldErrors },
  };
}

export type { AnalyzeRequest };
