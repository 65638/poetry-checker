// 首批导出由 Codex 建立；此文件交接给 C。core/ 由 Codex 继续实现。
export {
  matchTemplatesCore as matchTemplates,
  evaluateProsodyCore as evaluateProsody,
  ProsodyNotImplementedError,
  getTemplates,
  checkTonePossibilities,
  checkCommonRhyme,
} from "./core/index.js";
export type {
  TemplateDefinition,
  RhymeDomain,
  CommonRhymeResult,
} from "./core/index.js";
// C 维护的引用闭合工具（只读校验，供 GLM 组装 AnalysisResponse/provenance 前自检）。
export {
  FROZEN_RULE_IDS,
  RESCUE_RULE_IDS,
  collectRuleReferences,
  checkReportClosure,
} from "./report/closure.js";
export type {
  RuleReferences,
  ClosureProblem,
  ClosureResult,
} from "./report/closure.js";
// Codex 实现的已审作品特例适用层（C 只做公共导出，不编辑实现）。
// 纯函数：通用核心之后、summary 之前调用；未命中时原样返回报告。
export {
  applyReviewedWorkExceptions,
  parseReviewedWorkExceptions,
  ReviewedWorkExceptionError,
} from "./reviewed-exceptions/index.js";
export type {
  ApplyReviewedWorkExceptionsInput,
  ReviewedWorkException,
} from "./reviewed-exceptions/index.js";
