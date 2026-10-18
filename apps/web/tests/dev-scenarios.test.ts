/**
 * 开发场景装载（任务书第 8 节）与 store 的开发报告注入。
 *
 * 关注两件事：
 * 1. 生产未授权时装载必须抛错（合成数据不进发布路径）；
 * 2. `applyDevReport` 必须让 report / requestSnapshot / snapshotDraft 同源，
 *    否则导出又会回到「覆盖与快照不一致」的老问题。
 */
import { describe, expect, it } from "vitest";
import { CheckerStore } from "../src/app/store";
import { applyDevReport } from "../src/app/devScenarioStore";
import {
  DEV_SCENARIOS,
  DevScenarioUnavailable,
  loadDevScenario,
  scenarioLabel,
} from "../src/app/devScenarios";
import { loadMockScenario, okResponse, scenarioDraft, scriptedTransport } from "./fixtures";

describe("开发场景守卫", () => {
  it("未授权时拒绝装载（生产构建不得使用合成数据）", async () => {
    await expect(loadDevScenario("pass", false)).rejects.toBeInstanceOf(
      DevScenarioUnavailable,
    );
    await expect(loadDevScenario("pass", false)).rejects.toThrow(
      /生产构建不允许装载开发场景/u,
    );
  });

  it("五个场景都有可读标签", () => {
    for (const scenario of DEV_SCENARIOS) {
      expect(scenarioLabel(scenario.id)).toContain("·");
    }
    expect(DEV_SCENARIOS.map((item) => item.id)).toEqual([
      "pass",
      "fail",
      "needs_review",
      "not_applicable",
      "unsupported",
    ]);
  });
});

describe("CheckerStore.applyDevReport", () => {
  it("注入报告后 report / requestSnapshot / snapshotDraft 同源", () => {
    const pass = loadMockScenario("pass");
    const store = new CheckerStore(
      { text: "", rhymeBook: "pingshui", genreHint: "auto", formHint: "auto" },
      { transport: scriptedTransport([okResponse(pass)]) },
    );

    applyDevReport(store, pass);

    const state = store.getState();
    expect(state.report?.summary.status).toBe("pass");
    expect(state.draft.text).toBe(pass.poem.originalText);
    expect(state.snapshotDraft?.text).toBe(pass.poem.originalText);
    expect(state.requestSnapshot?.inputHash).toBe(pass.inputHash);
    expect(state.requestSnapshot?.rhymeBook).toBe(pass.policy.rhymeBook);
    expect(state.overrides).toEqual([]);
    // 与报告一致 → 不应是 stale
    expect(state.stale).toBe(false);
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
  });

  it("注入前已有的选音/选择被清空", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([okResponse(pass), okResponse(pass)]);
    const store = new CheckerStore(scenarioDraft("pass"), { transport });
    await store.analyze();

    const token = pass.poem.tokens[0]!;
    store.selectToken(token.tokenId);
    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    expect(store.getState().overrides.length).toBeGreaterThan(0);

    applyDevReport(store, loadMockScenario("needs_review"));

    const state = store.getState();
    expect(state.report?.summary.status).toBe("needs_review");
    expect(state.overrides).toEqual([]);
    expect(state.pendingOverrides).toEqual([]);
    expect(state.selectedTokenId).toBeNull();
    expect(state.selectedFindingId).toBeNull();
    // 新报告的韵书/原文成为当前草稿
    expect(state.draft.text).toBe(loadMockScenario("needs_review").poem.originalText);
  });

  it("注入后可直接导出，且导出内容与注入的报告一致", () => {
    const pass = loadMockScenario("pass");
    const downloaded: Array<{ filename: string; json: string }> = [];
    const store = new CheckerStore(
      { text: "", rhymeBook: "pingshui", genreHint: "auto", formHint: "auto" },
      {
        transport: scriptedTransport([okResponse(pass)]),
        download: (filename, json) => {
          downloaded.push({ filename, json });
        },
      },
    );
    applyDevReport(store, pass);
    store.downloadReport();

    expect(downloaded).toHaveLength(1);
    const payload = JSON.parse(downloaded[0]!.json) as {
      originalText: string;
      inputHash: string;
      report: { summary: { status: string } };
    };
    expect(payload.originalText).toBe(pass.poem.originalText);
    expect(payload.inputHash).toBe(pass.inputHash);
    expect(payload.report.summary.status).toBe("pass");
  });

  it("注入会中止在途请求，迟到响应不能覆盖注入结果", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferredLike<Response>();
    const transport = scriptedTransport([okResponse(pass), slow.promise]);
    const store = new CheckerStore(scenarioDraft("pass"), { transport });
    await store.analyze();

    const run = store.analyze(); // 在途
    applyDevReport(store, loadMockScenario("unsupported"));
    expect(store.getState().report?.summary.status).toBe("unsupported");

    slow.resolve(okResponse(pass));
    await run;

    // 注入后的报告必须保持，不被迟到响应改写
    expect(store.getState().report?.summary.status).toBe("unsupported");
  });
});

/** 极简 deferred，避免本文件依赖 fixtures 的内部实现细节。 */
function deferredLike<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
