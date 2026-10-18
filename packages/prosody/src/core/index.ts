import type {
  EvaluateInput,
  MatchInput,
  ProsodyReport,
  TemplateCandidate,
} from "@poetry/contracts";
import { candidateFor, compatible, evaluate } from "./evaluation.js";
import { getTemplates } from "./templates.js";

export { getTemplates } from "./templates.js";
export type { TemplateDefinition } from "./templates.js";
export { checkTonePossibilities, checkCommonRhyme } from "./constraints.js";
export type { RhymeDomain, CommonRhymeResult } from "./constraints.js";

export function matchTemplatesCore(input: MatchInput): TemplateCandidate[] {
  return getTemplates(input.formHint)
    .filter((template) => compatible(input.poem, template))
    .map((template) => candidateFor(input.poem, template))
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

// 保留旧公共出口以免破坏 C 的包装层；已支持的 teaching-v1 判断不再抛此占位异常。
export class ProsodyNotImplementedError extends Error {
  readonly code = "PROSODY_EVALUATION_PENDING";
  constructor(ruleSet: string) {
    super(`规则集尚未实现：${ruleSet}`);
    this.name = "ProsodyNotImplementedError";
  }
}

export function evaluateProsodyCore(input: EvaluateInput): ProsodyReport {
  return evaluate(input);
}
