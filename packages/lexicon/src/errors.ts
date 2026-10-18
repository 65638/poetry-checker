/**
 * 韵书模块的可识别错误。
 *
 * 这些错误码由 API 层映射为 HTTP 状态；模块本身不回退、不返回空成功。
 * 未注册的 dataVersion 必须报 LEXICON_VERSION_NOT_FOUND，不允许悄悄使用旧版本。
 */
export type LexiconErrorCode =
  | "LEXICON_INVALID_INPUT"
  | "LEXICON_VERSION_NOT_FOUND"
  | "LEXICON_BOOK_MISMATCH"
  | "LEXICON_DUPLICATE_ID"
  | "LEXICON_REFERENCE_UNRESOLVED"
  | "LEXICON_INVALID_RESULT";

export class LexiconError extends Error {
  readonly code: LexiconErrorCode;
  readonly details: readonly string[];

  constructor(
    code: LexiconErrorCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(details.length === 0 ? message : `${message}：${details.join("；")}`);
    this.name = "LexiconError";
    this.code = code;
    this.details = details;
  }
}

export function isLexiconError(error: unknown): error is LexiconError {
  return error instanceof LexiconError;
}
