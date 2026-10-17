/**
 * @poetry/readings 公共入口（M2 / 队员 B）。
 *
 * 两个纯函数：parseText 解析原文与字位，resolveReadings 传播候选与平仄。
 * 模块不查网络、不查数据库、不调用模型判音；lookup 与规则由调用方注入。
 */
export {
  parseText,
  hashOriginalText,
  isHanCharacter,
  LINE_BOUNDARY_CHARACTERS,
  LAYOUT_TOLERANT_CHARACTERS,
  PARSE_NOTICE_CODES,
} from "./parse.js";
export type { ParseTextInput, ParseNoticeCode } from "./parse.js";

export { resolveReadings, CONTEXT_NOTICE_CODES } from "./resolve.js";
export type { ResolveReadingsInput, ContextNoticeCode } from "./resolve.js";

export {
  ReadingsError,
  READINGS_ERROR_CODES,
  isReadingsError,
} from "./errors.js";
export type { ReadingsErrorCode, ReadingsErrorDetails } from "./errors.js";
