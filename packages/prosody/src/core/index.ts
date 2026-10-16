import type {
  EvaluateInput,
  MatchInput,
  ProsodyReport,
  TemplateCandidate,
} from "@poetry/contracts";
import { checkTonePossibilities } from "./constraints.js";
import { getTemplates } from "./templates.js";

export { getTemplates } from "./templates.js";
export type { TemplateDefinition } from "./templates.js";
export { checkTonePossibilities, checkCommonRhyme } from "./constraints.js";
export type { RhymeDomain, CommonRhymeResult } from "./constraints.js";

export function matchTemplatesCore(input: MatchInput): TemplateCandidate[] {
  const tokenMap = new Map(
    input.poem.tokens.map((token) => [token.tokenId, token]),
  );
  return getTemplates(input.formHint)
    .filter(
      (template) =>
        input.poem.lines.length === template.lineCount &&
        input.poem.lines.every(
          (line) => line.tokenIds.length === template.width,
        ),
    )
    .map((template) => {
      let fixedCount = 0;
      let passCount = 0;
      let failCount = 0;
      for (const [lineIndex, line] of input.poem.lines.entries()) {
        for (const [columnIndex, tokenId] of line.tokenIds.entries()) {
          const allowed = template.expectedTones[lineIndex]?.[columnIndex];
          if (allowed === undefined || allowed.length !== 1) continue;
          fixedCount += 1;
          const token = tokenMap.get(tokenId);
          const status = checkTonePossibilities(
            token?.possibleTones ?? [],
            allowed,
            token === undefined || token.toneStatus === "unknown",
          );
          if (status === "pass") passCount += 1;
          if (status === "fail") failCount += 1;
        }
      }
      const evaluated = passCount + failCount;
      const toneFit = evaluated === 0 ? null : passCount / evaluated;
      return {
        id: template.id,
        formId: template.formId,
        lineTypes: template.lineTypes,
        expectedTones: template.expectedTones,
        requiredRhymeLines: template.requiredRhymeLines,
        evaluatedKeyRate: fixedCount === 0 ? 0 : evaluated / fixedCount,
        // 其余特征尚未实现，保持 null；本阶段得分只是平仄候选排序，不能用于最终判定。
        features: {
          toneFit,
          relationFit: null,
          rhymeFit: null,
          parallelismFit: null,
        },
        score: toneFit,
      };
    })
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) || a.id.localeCompare(b.id, "en"),
    );
}

export class ProsodyNotImplementedError extends Error {
  readonly code = "PROSODY_EVALUATION_PENDING";
  constructor(ruleSet: string) {
    super(
      `完整判定尚未接入：${ruleSet}。基础模板匹配不能代替粘对、孤平、尾式和拗救检查。`,
    );
    this.name = "ProsodyNotImplementedError";
  }
}

export function evaluateProsodyCore(input: EvaluateInput): ProsodyReport {
  throw new ProsodyNotImplementedError(input.ruleSet);
}
