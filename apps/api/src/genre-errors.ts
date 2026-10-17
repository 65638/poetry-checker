import { isGenreError, type GenreErrorCode } from "@poetry/genre";

/**
 * genre 模块错误码 → HTTP 映射（依据 packages/genre/src/errors.ts 的语义声明）。
 *
 * - GENRE_BRANCH_PENDING：未实现分支的显式抛出（不得以 uncertain 冒充完成）。
 *   归入数据/规则未就绪族，与 readings 503 族同样对齐 DATA_NOT_READY 错误体约定。
 * - GENRE_REQUEST_INVALID：上游绕过契约校验的请求，属请求侧问题 → 422，保留具体码。
 */
const GENRE_HTTP_STATUS: Record<GenreErrorCode, number> = {
  GENRE_BRANCH_PENDING: 503,
  GENRE_REQUEST_INVALID: 422,
};

export function genreErrorStatus(code: string): number {
  if (Object.prototype.hasOwnProperty.call(GENRE_HTTP_STATUS, code)) {
    return GENRE_HTTP_STATUS[code as GenreErrorCode];
  }
  if (code.startsWith("GENRE_REQUEST_")) return 422;
  if (code.startsWith("GENRE_")) return 503;
  return 500;
}

export interface GenreErrorResponse {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      fieldErrors: Array<{ path: string; message: string }>;
    };
  };
}

export function toGenreErrorResponse(error: unknown): GenreErrorResponse | null {
  if (!isGenreError(error)) return null;
  const status = genreErrorStatus(error.code);
  const bodyCode =
    status === 503 ? "DATA_NOT_READY" : status === 500 ? "INTERNAL_ERROR" : error.code;
  const fieldErrors: Array<{ path: string; message: string }> = [];
  if (typeof error.branch === "string" && error.branch.length > 0) {
    fieldErrors.push({ path: "branch", message: error.branch });
  }
  if (status === 503) {
    fieldErrors.push({ path: "genreCode", message: error.code });
  }
  return {
    status,
    body: {
      error: {
        code: bodyCode,
        message:
          status === 503 ? `${error.code}：${error.message}` : error.message,
        fieldErrors,
      },
    },
  };
}
