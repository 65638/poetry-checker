/**
 * @poetry/genre 公共入口（M5 / 队员 E，D1 最小分支）。
 *
 * 纯函数 classifyGenre：不查网络、不读文件、不调用模型、不重算格律 score。
 * GoldenCase 是本地测试数据格式，不增加公共 API 字段。
 */
export { classifyGenre, FORM_SHAPE, GENRE_THRESHOLDS } from "./classify.js";
export type { ClassifyGenreInput } from "./classify.js";

export { GenreError, GENRE_ERROR_CODES, isGenreError } from "./errors.js";
export type { GenreErrorCode } from "./errors.js";

export {
  fingerprintText,
  isHanCharacter,
  normalizeForFingerprint,
} from "./fingerprint.js";

export {
  GOLDEN_REVIEW_STATUSES,
  validateGoldenCase,
  validateGoldenCases,
} from "./golden-case.js";
export type {
  GoldenCase,
  GoldenCaseAssertion,
  GoldenCaseIssue,
  GoldenCaseValidation,
  GoldenSourceCandidate,
} from "./golden-case.js";
