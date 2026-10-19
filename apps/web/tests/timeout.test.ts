/**
 * 客户端超时（D3 D07）。
 *
 * 背景：浏览器实测中，服务端不返回时前端 `busy` 会永久为真、按钮一直是「分析中…」，
 * 用户既无法重试也没有解释。这里钉住：超时按**可重试失败**处理，且必须与
 * 用户主动取消区分开（取消不该弹出错误）。
 */
import { describe, expect, it } from "vitest";
import { CheckerStore, DEFAULT_REQUEST_TIMEOUT_MS } from "../src/app/store";
import type { Transport } from "../src/api/analyze";
import { loadMockScenario, okResponse, scenarioDraft } from "./fixtures";

const draft = scenarioDraft("pass");

/** 永不返回、但能被 abort 打断的 transport。 */
function hangingTransport(): Transport {
  return {
    post: (_path, _body, signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
  };
}

describe("分析超时", () => {
  it("默认超时是 30 秒（不是无限等待）", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it("服务端不返回时按 TIMEOUT 结束，busy 恢复、正文保留、不产生报告", async () => {
    const store = new CheckerStore(draft, {
      transport: hangingTransport(),
      requestTimeoutMs: 40,
    });

    await store.analyze();

    const state = store.getState();
    expect(state.busy).toBe(false);
    expect(state.error?.code).toBe("TIMEOUT");
    expect(state.error?.message).toContain("超时");
    expect(state.error?.message).toContain("重试");
    expect(state.draft.text).toBe(draft.text);
    expect(state.report).toBeNull();
  });

  it("超时文案不冒充旧报告结论", async () => {
    const store = new CheckerStore(draft, {
      transport: hangingTransport(),
      requestTimeoutMs: 40,
    });
    await store.analyze();
    expect(store.getState().error?.message).toContain("未展示任何旧报告结论");
  });

  it("用户主动取消不报错（与超时区分）", async () => {
    const store = new CheckerStore(draft, {
      transport: hangingTransport(),
      requestTimeoutMs: 5_000,
    });
    const run = store.analyze();
    expect(store.getState().busy).toBe(true);
    store.abort();
    await run;

    const state = store.getState();
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
  });

  it("requestTimeoutMs=0 表示不设超时（挂起语义，仅供测试）", async () => {
    const store = new CheckerStore(draft, {
      transport: hangingTransport(),
      requestTimeoutMs: 0,
    });
    void store.analyze();
    await new Promise((r) => setTimeout(r, 120));
    // 没有超时就不该自行结束
    expect(store.getState().busy).toBe(true);
    store.abort();
  });

  it("正常响应不会被超时误伤", async () => {
    const pass = loadMockScenario("pass");
    const store = new CheckerStore(draft, {
      transport: { post: async () => okResponse(pass) },
      requestTimeoutMs: 5_000,
    });
    await store.analyze();
    expect(store.getState().error).toBeNull();
    expect(store.getState().report?.summary.status).toBe("pass");
  });

  it("超时后可以重试成功（可恢复）", async () => {
    const pass = loadMockScenario("pass");
    let call = 0;
    const store = new CheckerStore(draft, {
      transport: {
        post: (_path, _body, signal) => {
          call += 1;
          if (call === 1) {
            return new Promise<Response>((_resolve, reject) => {
              signal?.addEventListener("abort", () => {
                reject(new DOMException("aborted", "AbortError"));
              });
            });
          }
          return Promise.resolve(okResponse(pass));
        },
      },
      requestTimeoutMs: 40,
    });

    await store.analyze();
    expect(store.getState().error?.code).toBe("TIMEOUT");

    await store.analyze();
    expect(store.getState().error).toBeNull();
    expect(store.getState().report?.summary.status).toBe("pass");
  });
});
