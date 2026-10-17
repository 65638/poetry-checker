/**
 * 开发场景装载链路的回归测试（D2）。
 *
 * 背景：`devScenarios.data.ts` 里的 `import.meta.glob` 路径曾少一级
 * （`../../../fixtures` → `apps/fixtures`，不存在），dev 下装载必然失败，
 * 但生产构建时 glob 被折叠成空对象，`pnpm verify` 与类型检查都发现不了。
 * 这里在 Vitest（同样走 Vite 的 glob 转换）里真实装载一次，把它钉住。
 */
import { describe, expect, it } from "vitest";
import {
  DEV_SCENARIOS,
  DevScenarioUnavailable,
  loadDevScenario,
} from "../src/app/devScenarios";

describe("devScenarios 装载链路", () => {
  it.each(DEV_SCENARIOS.map((s) => s.id))("能装载 %s 并返回合法报告", async (id) => {
    const scenario = await loadDevScenario(id, true);
    expect(scenario.id).toBe(id);
    expect(scenario.label).toContain("·");
    expect(scenario.report.summary.status).toBe(id);
    expect(scenario.draft.text).toBe(scenario.report.poem.originalText);
    expect(scenario.draft.rhymeBook).toBe(scenario.report.policy.rhymeBook);
  });

  it("装载的报告与 fixture 正文一致（glob 真的解析到了文件）", async () => {
    const scenario = await loadDevScenario("needs_review", true);
    // 该场景正文必须非空，且含 20 个字位
    expect(scenario.report.poem.originalText.length).toBeGreaterThan(0);
    expect(scenario.report.poem.tokens).toHaveLength(20);
    // 未定读音字位确实存在（needs_review 的语义）
    expect(
      scenario.report.poem.tokens.some((t) => t.readingStatus !== "resolved"),
    ).toBe(true);
  });

  it("未授权时拒绝装载（生产守卫）", async () => {
    await expect(loadDevScenario("pass", false)).rejects.toBeInstanceOf(
      DevScenarioUnavailable,
    );
  });

  it("不存在的场景 id 被拒绝", async () => {
    await expect(
      loadDevScenario("no-such-scenario" as never, true),
    ).rejects.toBeInstanceOf(DevScenarioUnavailable);
  });
});
