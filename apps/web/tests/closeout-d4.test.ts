/**
 * D4 收口：按验收表复核状态语义。
 *
 * 若这里的断言失败，改 store/api 而不是放宽断言——本文件的每一条都直接
 * 对应任务卡的应观察事实。已在 store/concurrency/timeout 覆盖的路径不重复，
 * 只补「导出内容归属」「超时后恢复导出」「不可中断传输下的迟到成功」等缺口。
 */
import { describe, expect, it } from "vitest";
import { CheckerStore } from "../src/app/store";
import type { Transport } from "../src/api/analyze";
import type { InputDraft } from "../src/view-contract";
import type { AnalysisResponse } from "@poetry/contracts";
import {
  deferred,
  loadMockScenario,
  okResponse,
  scenarioDraft,
  unabortableTransport,
} from "./fixtures";

const draft = scenarioDraft("pass");

function variant(
  base: AnalysisResponse,
  status: "pass" | "needs_review" | "fail" | "not_applicable" | "unsupported",
  message: string,
): AnalysisResponse {
  return { ...base, summary: { status, message } };
}

/** 记录导出/复制的真实载荷，用于断言「导出只对应哪一次请求」。 */
function captureExport() {
  const copied: string[] = [];
  const downloaded: Array<{ filename: string; json: string }> = [];
  return {
    copied,
    downloaded,
    options: {
      writeText: async (text: string) => {
        copied.push(text);
      },
      download: (filename: string, json: string) => {
        downloaded.push({ filename, json });
      },
    },
  };
}

describe("D4 收口：并发归属", () => {
  it("A 慢 B 快：导出的摘要与 JSON 只描述 B", async () => {
    const base = loadMockScenario("pass");
    const slowA = deferred<Response>();
    const fastB = deferred<Response>();
    const exportSink = captureExport();

    let call = 0;
    const transport: Transport = {
      async post() {
        call += 1;
        return call === 1 ? slowA.promise : fastB.promise;
      },
    };

    const store = new CheckerStore(draft, {
      transport,
      ...exportSink.options,
    });

    const runA = store.analyze();
    const runB = store.analyze();

    // B 先完成（后面那次请求）
    fastB.resolve(okResponse(variant(base, "pass", "B 的结果")));
    await runB;
    // A 迟到成功，必须被身份守卫丢弃
    slowA.resolve(okResponse(variant(base, "fail", "A 的迟到结果")));
    await runA;

    const state = store.getState();
    expect(state.report?.summary.message).toBe("B 的结果");

    await store.copySummary();
    store.downloadReport();

    expect(exportSink.copied).toHaveLength(1);
    expect(exportSink.copied[0]).toContain("B 的结果");
    expect(exportSink.copied[0]).not.toContain("A 的迟到结果");

    expect(exportSink.downloaded).toHaveLength(1);
    const json = JSON.parse(exportSink.downloaded[0]!.json) as {
      report: { summary: { message: string } };
    };
    expect(json.report.summary.message).toBe("B 的结果");
  });

  it("A 迟到失败不污染 B：错误为空、导出照常可用", async () => {
    const base = loadMockScenario("pass");
    const slowA = deferred<Response>();
    const fastB = deferred<Response>();
    let call = 0;
    const transport: Transport = {
      async post() {
        call += 1;
        return call === 1 ? slowA.promise : fastB.promise;
      },
    };
    const store = new CheckerStore(draft, { transport });

    const runA = store.analyze();
    const runB = store.analyze();
    fastB.resolve(okResponse(base));
    await runB;
    slowA.reject(new TypeError("fetch failed"));
    await runA;

    const state = store.getState();
    expect(state.error).toBeNull();
    expect(state.report?.summary.status).toBe("pass");
    expect(state.busy).toBe(false);
  });
});

describe("D4 收口：请求期间编辑/换书", () => {
  it("编辑期间草稿不丢，迟到成功不覆盖草稿也不恢复旧覆盖", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    const transport = unabortableTransport([slow.promise]);
    const store = new CheckerStore(draft, { transport });

    const edited: InputDraft = {
      ...draft,
      text: `${draft.text}\n仄仄平平仄`,
    };
    const run = store.analyze();
    store.setDraft(edited);

    slow.resolve(okResponse(pass));
    await run;

    const state = store.getState();
    expect(state.draft.text).toBe(edited.text);
    expect(state.report).toBeNull();
    expect(state.overrides).toEqual([]);
    expect(state.pendingOverrides).toEqual([]);
    expect(state.busy).toBe(false);
  });

  it("切换韵书后，迟到的旧书响应不串到新书", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    const transport = unabortableTransport([slow.promise]);
    const store = new CheckerStore(draft, { transport });

    const run = store.analyze();
    store.setDraft({ ...draft, rhymeBook: "cilin" });
    slow.resolve(okResponse(pass));
    await run;

    const state = store.getState();
    expect(state.draft.rhymeBook).toBe("cilin");
    expect(state.report).toBeNull();
  });
});

describe("D4 收口：超时与恢复后的导出资格", () => {
  it("超时后：旧报告仍可查看，但复制与导出都被阻止；重试成功后恢复", async () => {
    const pass = loadMockScenario("pass");
    let call = 0;
    const transport: Transport = {
      post: (_path, _body, signal) => {
        call += 1;
        // 1 次成功 → 2 次挂起（触发超时）→ 3 次恢复成功
        if (call === 1 || call >= 3) return Promise.resolve(okResponse(pass));
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      },
    };
    const sink = captureExport();
    const store = new CheckerStore(draft, {
      transport,
      requestTimeoutMs: 40,
      ...sink.options,
    });

    // 第一次成功 → 可导出
    await store.analyze();
    expect(store.getState().report?.summary.status).toBe("pass");

    // 第二次超时 → 旧报告保留、可查看，但禁止复制/下载
    await store.analyze();
    expect(store.getState().error?.code).toBe("TIMEOUT");
    expect(store.getState().report?.summary.status).toBe("pass");
    expect(store.getState().busy).toBe(false);

    await store.copySummary();
    store.downloadReport();
    expect(sink.copied).toHaveLength(0);
    expect(sink.downloaded).toHaveLength(0);

    // 重新成功 → 导出恢复
    await store.analyze();
    expect(store.getState().error).toBeNull();
    await store.copySummary();
    store.downloadReport();
    expect(sink.copied).toHaveLength(1);
    expect(sink.downloaded).toHaveLength(1);
  });

  it("请求进行中禁止导出，结束后允许", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    const sink = captureExport();
    let call = 0;
    const transport: Transport = {
      async post() {
        call += 1;
        return call === 1 ? okResponse(pass) : slow.promise;
      },
    };
    const store = new CheckerStore(draft, { transport, ...sink.options });
    await store.analyze();

    const run = store.analyze();
    expect(store.getState().busy).toBe(true);
    await store.copySummary();
    store.downloadReport();
    expect(sink.copied).toHaveLength(0);
    expect(sink.downloaded).toHaveLength(0);

    slow.resolve(okResponse(pass));
    await run;
    await store.copySummary();
    expect(sink.copied).toHaveLength(1);
  });
});

describe("D4 收口：五类语义状态原样透传", () => {
  const statuses = [
    "pass",
    "fail",
    "needs_review",
    "not_applicable",
    "unsupported",
  ] as const;

  it.each(statuses)("%s 不被状态层改写或降级", async (status) => {
    const base = loadMockScenario("pass");
    const store = new CheckerStore(draft, {
      transport: {
        post: async () => okResponse(variant(base, status, `${status} 原文案`)),
      },
    });
    await store.analyze();
    expect(store.getState().report?.summary.status).toBe(status);
    expect(store.getState().report?.summary.message).toBe(`${status} 原文案`);
    // 五类都可导出（是否合律由报告自己表达，不由前端改判）
    expect(store.getState().stale).toBe(false);
  });
});

describe("D4 收口：主动取消后迟到成功", () => {
  it("abort() 之后即使底层忽略信号，迟到成功也不得成为当前报告", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    const transport = unabortableTransport([slow.promise]);
    const store = new CheckerStore(draft, { transport });

    const run = store.analyze();
    store.abort();
    slow.resolve(okResponse(pass));
    await run;

    const state = store.getState();
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
    // 取消后不应把这次结果落地
    expect(state.report).toBeNull();
  });
});
