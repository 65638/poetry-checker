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
  return {
    status: readingsErrorStatus(error.code),
    body: {
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: Object.entries(details).map(([path, message]) => ({
          path,
          message,
        })),
      },
    },
  };
}
