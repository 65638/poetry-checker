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
