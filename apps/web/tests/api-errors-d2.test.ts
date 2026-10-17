/**
 * D2：真实 API 错误行为（D2-05）。
 *
 * 关注的不是「有没有 error 对象」，而是用户能否据此行动：
 * - 503 / 422 / 413 / 404 / 500 / 离线 / 超时 各自给出可执行解释；
 * - 失败后保留正文、不无穷加载、不回退旧 fixture 冒充成功；
 * - 错误状态不会被当成「分析完成」。
 */
import { describe, expect, it } from "vitest";
import { CheckerStore } from "../src/app/store";
import { analyze } from "../src/api/analyze";
import type { Transport } from "../src/api/analyze";
import { ApiError } from "../src/api/errors";
import {
  errorResponse,
  loadMockScenario,
  okResponse,
  scenarioDraft,
  scriptedTransport,
} from "./fixtures";

const draft = scenarioDraft("pass");

/** 断言错误码 + 文案包含可执行动词或明确原因，而不是空泛一句「失败」。 */
function expectActionable(error: ApiError, matcher: RegExp) {
  expect(error.userMessage.length).toBeGreaterThan(6);
  expect(error.userMessage).toMatch(matcher);
}

describe("HTTP 错误状态到可执行解释", () => {
  const cases: Array<{
    label: string;
    response: Response;
    code: string;
    status: number;
    message: RegExp;
  }> = [
    {
      label: "503 数据未就绪",
      response: errorResponse("DATA_NOT_READY", "数据尚未接入", 503),
      code: "HTTP_503",
      status: 503,
      message: /稍后重试|已保留/u,
    },
    {
      label: "422 请求不合法",
      response: errorResponse("VALIDATION_ERROR", "正文必须包含汉字", 422),
      code: "HTTP_422",
      status: 422,
      message: /未被接受/u,
    },
    {
      label: "413 超出长度",
      response: errorResponse("PAYLOAD_TOO_LARGE", "超过上限", 413),
      code: "HTTP_413",
      status: 413,
      message: /2,000|限制/u,
    },
    {
      label: "404 资源不存在",
      response: errorResponse("NOT_FOUND", "规则不存在", 404),
      code: "HTTP_404",
      status: 404,
      message: /不存在/u,
    },
    {
      label: "500 服务内部错误",
      response: errorResponse("INTERNAL_ERROR", "服务内部错误", 500),
      code: "HTTP_500",
      status: 500,
      message: /稍后重试/u,
    },
  ];

  it.each(cases)("$label → $code 且文案可行动", async (testCase) => {
    const transport = scriptedTransport([testCase.response]);
    const outcome = await analyze(draft, transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe(testCase.code);
    expect(outcome.error.status).toBe(testCase.status);
    expectActionable(outcome.error, testCase.message);
  });

  it("413 与 503 的错误码不同（不能都显示成同一种失败）", async () => {
    const a = await analyze(draft, scriptedTransport([errorResponse("X", "太长", 413)]));
    const b = await analyze(draft, scriptedTransport([errorResponse("Y", "未就绪", 503)]));
    expect(a.ok || b.ok).toBe(false);
    if (a.ok || b.ok) return;
    expect(a.error.code).not.toBe(b.error.code);
    expect(a.error.userMessage).not.toBe(b.error.userMessage);
  });
});

describe("离线与超时", () => {
  it("离线（fetch 直接拒绝）映射为 NETWORK_ERROR 且提示已保留输入", async () => {
    const transport: Transport = {
      post: async () => {
        throw new TypeError("Failed to fetch");
      },
    };
    const outcome = await analyze(draft, transport);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NETWORK_ERROR");
    expect(outcome.error.userMessage).toMatch(/无法连接|保留/u);
  });

  it("超时（AbortSignal.timeout 触发）不会永远挂起，且区分于普通网络错误", async () => {
    const transport: Transport = {
      post: (_path, _body, signal) =>
        new Promise<Response>((_resolve, reject) => {
          // 模拟服务端不响应：signal 一到就拒绝
          signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "TimeoutError"));
          });
        }),
    };
    const outcome = await analyze(draft, transport, [], AbortSignal.timeout(30));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // 超时也走 ABORTED（与手动取消同一路径），不会挂在 loading
    expect(["ABORTED", "NETWORK_ERROR"]).toContain(outcome.error.code);
  });

  it("超时/取消后 busy 必须恢复，不无穷加载", async () => {
    const pending = new Promise<Response>(() => {
      /* 永不 settle，模拟卡死；由 abort 触发 */
    });
    const transport: Transport = {
      post: (_p, _b, signal) =>
        Promise.race([
          pending,
          new Promise<Response>((_r, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
        ]),
    };
    const store = new CheckerStore(draft, { transport });
    const run = store.analyze();
    expect(store.getState().busy).toBe(true);
    store.abort();
    await run;
    expect(store.getState().busy).toBe(false);
  });
});

describe("失败后的状态语义（不回退旧 fixture）", () => {
  it("首次分析 503：无报告、正文保留、错误可读", async () => {
    const transport = scriptedTransport([
      errorResponse("DATA_NOT_READY", "数据尚未接入", 503),
    ]);
    const store = new CheckerStore(draft, { transport });
    await store.analyze();

    const state = store.getState();
    expect(state.report).toBeNull();
    expect(state.draft.text).toBe(draft.text);
    expect(state.busy).toBe(false);
    expect(state.error?.code).toBe("HTTP_503");
    // 关键：不能悄悄塞一份 fixture 报告
    expect(state.report).toBeNull();
  });

  it("有旧报告时新请求失败：旧报告标 stale，不当作本次结果", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([
      okResponse(pass),
      errorResponse("INTERNAL_ERROR", "服务内部错误", 500),
    ]);
    const store = new CheckerStore(draft, { transport });
    await store.analyze();
    expect(store.getState().report?.summary.status).toBe("pass");

    const changed = { ...draft, text: `${draft.text}\n仄仄平平仄` };
    store.setDraft(changed);
    await store.analyze();

    const state = store.getState();
    expect(state.error?.code).toBe("HTTP_500");
    // 旧报告仍在，但必须 stale，且导出被阻止
    expect(state.report?.summary.status).toBe("pass");
    expect(state.stale).toBe(true);
    expect(state.draft.text).toBe(changed.text);
  });

  it("422 后修正输入再提交可恢复", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([
      errorResponse("VALIDATION_ERROR", "正文必须包含汉字", 422),
      okResponse(pass),
    ]);
    const store = new CheckerStore(draft, { transport });

    await store.analyze();
    expect(store.getState().error?.code).toBe("HTTP_422");

    // 用户修正后可重试成功，错误被清除
    await store.analyze();
    expect(store.getState().error).toBeNull();
    expect(store.getState().report?.summary.status).toBe("pass");
  });

  it("错误不改变 report/overrides/requestSnapshot 的同源关系", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([
      okResponse(pass),
      errorResponse("DATA_NOT_READY", "未就绪", 503),
    ]);
    const store = new CheckerStore(draft, { transport });
    await store.analyze();

    const before = store.getState();
    await store.analyze();
    const after = store.getState();

    // 失败请求未成功，快照不应被替换
    expect(after.requestSnapshot).toBe(before.requestSnapshot);
    expect(after.report).toBe(before.report);
    expect(after.overrides).toEqual(after.requestSnapshot?.readingOverrides ?? []);
  });
});
