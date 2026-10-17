import { isLexiconError, type LexiconErrorCode } from "@poetry/lexicon";

/**
 * lexicon 错误码 → HTTP 映射（依据 packages/lexicon/src/errors.ts 语义）。
 * 参数类 → 422 保留具体码；版本/数据未就绪 → 503 DATA_NOT_READY 族；
 * 数据损坏/内部不一致 → 500 INTERNAL_ERROR（服务端缺陷不算用户错）。
 */
const LEXICON_HTTP_STATUS: Record<LexiconErrorCode, number> = {
  LEXICON_INVALID_INPUT: 422,
  LEXICON_BOOK_MISMATCH: 422,
  LEXICON_VERSION_NOT_FOUND: 503,
  LEXICON_DUPLICATE_ID: 500,
  LEXICON_REFERENCE_UNRESOLVED: 500,
  LEXICON_INVALID_RESULT: 500,
};

export function lexiconErrorStatus(code: string): number {
  if (Object.prototype.hasOwnProperty.call(LEXICON_HTTP_STATUS, code)) {
    return LEXICON_HTTP_STATUS[code as LexiconErrorCode];
  }
  if (code.startsWith("LEXICON_INVALID_") || code.startsWith("LEXICON_BOOK_")) return 422;
  if (code.startsWith("LEXICON_VERSION_")) return 503;
  return 500;
}

export function toLexiconErrorResponse(error: unknown): {
  status: number;
  body: { error: { code: string; message: string; fieldErrors: Array<{ path: string; message: string }> } };
} | null {
  if (!isLexiconError(error)) return null;
  const status = lexiconErrorStatus(error.code);
  const bodyCode = status === 503 ? "DATA_NOT_READY" : status === 500 ? "INTERNAL_ERROR" : error.code;
  return {
    status,
    body: {
      error: {
        code: bodyCode,
        message: status === 422 ? error.message : `${error.code}：${error.message}`,
        fieldErrors: status === 503 ? [{ path: "lexiconCode", message: error.code }] : [],
      },
    },
  };
}
