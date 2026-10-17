import type { AnalysisResponse } from "@poetry/contracts";
import type { DevScenarioId } from "./devScenarios";

/**
 * 开发场景数据装载器（仅由 devScenarios.loadDevScenario 动态 import）。
 *
 * 用 `import.meta.glob` 收集 fixtures/mocks，并保持**非 eager**，
 * 让 Vite 把它们切成独立 chunk；生产入口不 import 本模块，
 * 因此发布包不会包含合成报告。
 */
const modules = import.meta.glob<{ default: AnalysisResponse }>(
  "../../../fixtures/mocks/*.json",
);

export async function readDevScenario(
  id: DevScenarioId,
): Promise<AnalysisResponse | undefined> {
  const key = Object.keys(modules).find((path) => path.endsWith(`/${id}.json`));
  if (key === undefined) return undefined;
  const loader = modules[key];
  if (loader === undefined) return undefined;
  const mod = await loader();
  return mod.default;
}
