/**
 * @poetry/genre 错误码（M5 / 队员 E，D1 最小集）。
 *
 * 只定义两类：尚未实现的分支、被上游绕过校验的非法请求。
 * 未实现分支必须显式抛出，不能以 uncertain 占位冒充完成（见 docs/team/15 第 5 节）。
 */
export const GENRE_ERROR_CODES = [
  "GENRE_BRANCH_PENDING",
  "GENRE_REQUEST_INVALID",
] as const;

export type GenreErrorCode = (typeof GENRE_ERROR_CODES)[number];

export class GenreError extends Error {
  readonly code: GenreErrorCode;
  /** 未实现分支的稳定标识，便于 HANDOFF 与 API 错误映射对齐。 */
  readonly branch: string | null;

  constructor(
    code: GenreErrorCode,
    message: string,
    branch: string | null = null,
  ) {
    super(message);
    this.name = "GenreError";
    this.code = code;
    this.branch = branch;
  }
}

export function isGenreError(value: unknown): value is GenreError {
  return value instanceof GenreError;
}
