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
// D3 批次一公共导出（代码为 Codex 在 docs/handoffs/d3-codex-exceptions.md
// 指定原文；GLM 代加以解除 API 接线阻塞，C 复核后可自行调整措辞与位置）。
export {
  applyReviewedWorkExceptions,
  parseReviewedWorkExceptions,
  ReviewedWorkExceptionError,
} from "./reviewed-exceptions/index.js";
export type {
  ApplyReviewedWorkExceptionsInput,
  ReviewedWorkException,
} from "./reviewed-exceptions/index.js";
