/**
 * D2–D3：请求取消与并发回归。
 *
 * 与 store.test.ts 的分工：
 * - store.test.ts 覆盖单次/双次请求的状态语义（乱序、陈旧、选音归属）；
 * - 本文件专测「取消契约」与「多次连续提交」的边界：
 *   abort 的识别、abort 后不产生错误态、幂等、多次提交的身份守卫。
 *
 * 全部使用可注入 transport，不依赖 DOM。
 */
import { describe, expect, it } from "vitest";
import { CheckerStore } from "../src/app/store";
import { analyze } from "../src/api/analyze";
import type { Transport } from "../src/api/analyze";
import type { InputDraft } from "../src/view-contract";
import type { AnalysisResponse } from "@poetry/contracts";
import {
  deferred,
  errorResponse,
  loadMockScenario,
  okResponse,
  scenarioDraft,
} from "./fixtures";

function draftOf(name: "pass" | "needs_review"): InputDraft {
  return scenarioDraft(name);
}

/** 记录每次调用拿到的 signal，便于断言取消时序。 */
function recordingTransport(script: Array<Response | Promise<Response>>): {
  transport: Transport;
  signals: AbortSignal[];
} {
  const signals: AbortSignal[] = [];
  let index = 0;
  return {
    signals,
    transport: {
      async post(_path, _body, signal) {
        if (signal !== undefined) signals.push(signal);
        const next = script[index];
        index += 1;
        if (next === undefined) {
          throw new Error(`recordingTransport: 第 ${index} 次调用没有预设响应`);
        }
        return next;
      },
    },
  };
}

function variantWith(
  base: AnalysisResponse,
  status: "pass" | "needs_review" | "fail",
  message: string,
): AnalysisResponse {
  return { ...base, summary: { status, message } };
}

describe("取消契约（D2）", () => {
  it("signal 已 abort 时的拒绝被识别为 ABORTED，而不是网络错误", async () => {
    const controller = new AbortController();
    const transport: Transport = {
      post: async () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      },
    };
    const outcome = await analyze(
      draftOf("pass"),
      transport,
      [],
      controller.signal,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("ABORTED");
    // 取消不能被当成普通网络失败给用户看。
    expect(outcome.error.code).not.toBe("NETWORK_ERROR");
  });

  it("无 signal 时的异常仍是 NETWORK_ERROR", async () => {
    const transport: Transport = {
      post: async () => {
        throw new TypeError("fetch failed");
      },
    };
    const outcome = await analyze(draftOf("pass"), transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NETWORK_ERROR");
  });

  it("用户取消进行中的提交：不显示错误，报告保持原状", async () => {
    const pass = loadMockScenario("pass");
    // abort 后 analyze() 可能在 await transport 前就返回，
    // 因此这个 Promise 要自带 catch，避免未处理拒绝污染测试。
    const pending = deferred<Response>();
    pending.promise.catch(() => undefined);
    const { transport } = recordingTransport([okResponse(pass), pending.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    expect(store.getState().report?.summary.status).toBe("pass");

    const run = store.analyze();
    expect(store.getState().busy).toBe(true);
    store.abort();
    // 模拟底层按 abort 拒绝
    pending.reject(new DOMException("Aborted", "AbortError"));
    await run;

    const state = store.getState();
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
    expect(state.report?.summary.status).toBe("pass");
    expect(state.stale).toBe(false);
  });

  it("abort 是幂等的：连续调用不抛错、不产生错误态", async () => {
    const pass = loadMockScenario("pass");
    const pending = deferred<Response>();
    pending.promise.catch(() => undefined);
    const { transport } = recordingTransport([okResponse(pass), pending.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });

    const run = store.analyze();
    store.abort();
    store.abort();
    store.abort();
    pending.reject(new DOMException("Aborted", "AbortError"));
    await run;

    expect(store.getState().error).toBeNull();
    expect(store.getState().busy).toBe(false);
  });

  it("新请求会取消旧请求的 signal", async () => {
    const pass = loadMockScenario("pass");
    const first = deferred<Response>();
    const second = deferred<Response>();
    const { transport, signals } = recordingTransport([
      first.promise,
      second.promise,
    ]);
    const store = new CheckerStore(draftOf("pass"), { transport });

    const runA = store.analyze();
    const runB = store.analyze();
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    second.resolve(okResponse(pass));
    first.resolve(okResponse(pass));
    await Promise.all([runA, runB]);
    expect(store.getState().busy).toBe(false);
  });
});

describe("并发压力（D3）", () => {
  it("连续 5 次提交、乱序完成：只保留最后一次提交的结果", async () => {
    const base = loadMockScenario("pass");
    const statuses = ["pass", "needs_review", "fail", "pass", "needs_review"] as const;
    const pending = statuses.map(() => deferred<Response>());

    let callIndex = 0;
    const transport: Transport = {
      async post() {
        const slot = pending[callIndex];
        callIndex += 1;
        if (slot === undefined) throw new Error("超出预设调用次数");
        return slot.promise;
      },
    };

    const store = new CheckerStore(draftOf("pass"), { transport });
    const runs = statuses.map(() => store.analyze());
    expect(callIndex).toBe(5);

    // 乱序放行：先放 0、2、4，再放 1、3
    for (const idx of [0, 2, 4, 1, 3]) {
      pending[idx]?.resolve(
        okResponse(variantWith(base, statuses[idx]!, `并发场景 ${idx}`)),
      );
      await Promise.resolve();
    }
    await Promise.all(runs);

    const state = store.getState();
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
    // 第 5 次提交（下标 4）是最后一次，其响应内容必须胜出。
    expect(state.report?.summary.message).toBe("并发场景 4");
    expect(state.report?.summary.status).toBe("needs_review");
  });

  it("前面的响应全部迟到失败，也不影响最后成功的结果", async () => {
    const pass = loadMockScenario("pass");
    const pending = [deferred<Response>(), deferred<Response>()];
    let callIndex = 0;
    const transport: Transport = {
      async post() {
        const slot = pending[callIndex];
        callIndex += 1;
        if (slot === undefined) throw new Error("超出预设调用次数");
        return slot.promise;
      },
    };
    const store = new CheckerStore(draftOf("pass"), { transport });

    const runA = store.analyze();
    const runB = store.analyze();

    // B（最后一次）先成功，A 迟到失败
    pending[1]!.resolve(okResponse(pass));
    await runB;
    pending[0]!.reject(new TypeError("fetch failed"));
    await runA;

    expect(store.getState().error).toBeNull();
    expect(store.getState().report?.summary.status).toBe("pass");
    expect(store.getState().busy).toBe(false);
  });

  it("提交 → 失败 → 再提交成功：错误被清除", async () => {
    const pass = loadMockScenario("pass");
    const transport = recordingTransport([
      errorResponse("INTERNAL_ERROR", "服务内部错误", 500),
      okResponse(pass),
    ]).transport;
    const store = new CheckerStore(draftOf("pass"), { transport });

    await store.analyze();
    expect(store.getState().error?.code).toBe("HTTP_500");

    await store.analyze();
    expect(store.getState().error).toBeNull();
    expect(store.getState().report?.summary.status).toBe("pass");
  });

  it("失败后不留下半更新状态：report/overrides/snapshot 三者一致", async () => {
    const pass = loadMockScenario("pass");
    const transport = recordingTransport([
      okResponse(pass),
      errorResponse("DATA_NOT_READY", "数据尚未接入", 503),
    ]).transport;
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();

    const token = pass.poem.tokens[0]!;
    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });

    const state = store.getState();
    expect(state.error?.code).toBe("HTTP_503");
    // 三者必须描述同一次成功计算
    expect(state.overrides).toEqual(state.requestSnapshot?.readingOverrides ?? []);
    expect(state.report?.inputHash).toBe(state.requestSnapshot?.inputHash);
    expect(state.pendingOverrides).toEqual(state.overrides);
  });
});
