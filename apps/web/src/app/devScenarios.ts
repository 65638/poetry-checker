import type { AnalysisResponse } from "@poetry/contracts";
import type { InputDraft } from "../view-contract";

/**
 * D1/D2 开发场景选择器（任务书第 8 节）。
 *
 * 约束：
 * - **不给 `AnalyzeRequest` 增加 scenario 等字段**；场景只在开发侧选择，
 *   切换时直接装载该 fixture 自身的正文与韵书。
 * - 合成报告不得挂真实名篇的名字，界面必须标注「开发合成样例」。
 * - 装载入口是**动态 import**，fixture 只形成独立 chunk；生产入口不引用，
 *   因此发布包不会带合成报告。运行时另有 `allowed` 守卫。
 */

export const DEV_SCENARIOS = [
  { id: "pass", label: "pass · 必检项通过" },
  { id: "fail", label: "fail · 明确违规" },
  { id: "needs_review", label: "needs_review · 读数待定" },
  { id: "not_applicable", label: "not_applicable · 古体不适用" },
  { id: "unsupported", label: "unsupported · 尚未支持" },
] as const;

export type DevScenarioId = (typeof DEV_SCENARIOS)[number]["id"];

export interface DevScenario {
  id: DevScenarioId;
  label: string;
  report: AnalysisResponse;
  /** 场景自身的正文与韵书，切换时一并装载。 */
  draft: InputDraft;
}

export class DevScenarioUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevScenarioUnavailable";
  }
}

export function scenarioLabel(id: DevScenarioId): string {
  return DEV_SCENARIOS.find((item) => item.id === id)?.label ?? id;
}

/**
 * 装载某个场景。
 * `allowed` 由调用方传入（生产入口传 false），即使模块被误打包也无法装载。
 * 使用动态 import，确保 fixture 不进入生产首屏包。
 */
export async function loadDevScenario(
  id: DevScenarioId,
  allowed: boolean,
): Promise<DevScenario> {
  if (!allowed) {
    throw new DevScenarioUnavailable("生产构建不允许装载开发场景。");
  }
  const { readDevScenario } = await import("./devScenarios.data");
  const report = await readDevScenario(id);
  if (report === undefined) {
    throw new DevScenarioUnavailable(`未找到开发场景：${id}`);
  }
  return {
    id,
    label: scenarioLabel(id),
    report,
    draft: {
      text: report.poem.originalText,
      rhymeBook: report.policy.rhymeBook,
      genreHint: "auto",
      formHint: "auto",
    },
  };
}
