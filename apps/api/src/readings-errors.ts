import {
  isReadingsError,
  type ReadingsErrorCode,
  type ReadingsErrorDetails,
} from "@poetry/readings";

/**
 * readings 模块错误码 → HTTP 状态映射（依据 packages/readings/HANDOFF.md 第 6 节）。
 *
 * - OVERRIDE_* → 422（请求侧问题：人工选音无效）
 * - LOOKUP_*、CONTEXT_RULE_INVALID / CONTEXT_RULE_STALE → 503（数据/规则侧未就绪或脱节）
 * - POEM_TOKEN_* → 500（服务端自身缺陷）
 * - CONTEXT_RULES_PENDING 为保留码：规则执行被关闭时必须显式抛出，
 *   任何映射都不得把它（或任何 readings 错误）转成 200。
 */
const READINGS_HTTP_STATUS: Record<ReadingsErrorCode, number> = {
  POEM_TOKEN_SLICE_MISMATCH: 500,
  POEM_TOKEN_DUPLICATE: 500,
  LOOKUP_ENTRY_DUPLICATE: 503,
  LOOKUP_CANDIDATE_CHARACTER_MISMATCH: 503,
  LOOKUP_CANDIDATE_BOOK_MISMATCH: 503,
  LOOKUP_CANDIDATE_DUPLICATE: 503,
  LOOKUP_EVIDENCE_UNKNOWN: 503,
  LOOKUP_EVIDENCE_UNVERIFIED: 503,
  OVERRIDE_DUPLICATE_TOKEN: 422,
  OVERRIDE_TOKEN_UNKNOWN: 422,
  OVERRIDE_READING_UNKNOWN: 422,
  CONTEXT_RULE_INVALID: 503,
  CONTEXT_RULE_STALE: 503,
  CONTEXT_RULES_PENDING: 503,
};

export function readingsErrorStatus(code: string): number {
  if (Object.prototype.hasOwnProperty.call(READINGS_HTTP_STATUS, code)) {
    return READINGS_HTTP_STATUS[code as ReadingsErrorCode];
  }
  if (code.startsWith("OVERRIDE_")) return 422;
  if (code.startsWith("LOOKUP_") || code.startsWith("CONTEXT_RULE_")) return 503;
  if (code.startsWith("POEM_TOKEN_")) return 500;
  return 500;
}

export interface ReadingsErrorResponse {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      fieldErrors: Array<{ path: string; message: string }>;
    };
  };
}

export function toReadingsErrorResponse(
  error: unknown,
): ReadingsErrorResponse | null {
  if (!isReadingsError(error)) return null;
  const details: ReadingsErrorDetails = error.details;
  const status = readingsErrorStatus(error.code);
  // 错误体约定对齐：
  // - 503 族（LOOKUP_*、CONTEXT_RULE_*）与既有数据未就绪响应一致，code 用 DATA_NOT_READY，
  //   原始 readings 码保留在 message 前缀与 fieldErrors 中，便于定位（B 的 6e8eb16 注释同此建议）；
  // - 500 族对齐服务端 INTERNAL_ERROR 约定；
  // - 422 族保留具体 readings 码（契约已有 STALE_READING_OVERRIDE 这类具体 422 码的先例，
  //   前端需要区分是哪类选音问题）。
  const bodyCode =
    status === 503 ? "DATA_NOT_READY" : status === 500 ? "INTERNAL_ERROR" : error.code;
  return {
    status,
    body: {
      error: {
        code: bodyCode,
        message:
          status === 503 || status === 500
            ? `${error.code}：${error.message}`
            : error.message,
        fieldErrors: [
          ...Object.entries(details).map(([path, message]) => ({
            path,
            message,
          })),
          ...(status === 503
            ? [{ path: "readingsCode", message: error.code }]
            : []),
        ],
      },
    },
  };
}
