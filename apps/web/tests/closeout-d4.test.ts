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
import { sha256Hex } from "../src/utils/sha256";
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

/**
 * 请求体断言：供浏览器验收对齐。
 *
 * 浏览器验收不能用「页面看起来对」代替请求体检查；这里把三个固定场景的
 * 实际 POST 形状钉在状态层，E 的浏览器用例应观察到同样的字段。
 */
describe("D4 收口：请求体形状（与 E 的浏览器断言对齐）", () => {
  const pass = loadMockScenario("pass");
  const path = "/api/v1/analyze";

  it("慢 A 后快 B：两次 POST 的 inputHash 分别对应旧/新正文", async () => {
    // 两套各自匹配的 fixture：改正文后响应必须与请求同源，否则会被客户端拒绝
    // （RESPONSE_INPUT_MISMATCH），那是另一条正确行为，不能混进本用例。
    const draftA = scenarioDraft("pass");
    const draftB = scenarioDraft("needs_review");
    const reportA = loadMockScenario("pass");
    const reportB = loadMockScenario("needs_review");

    const slow = deferred<Response>();
    const fast = deferred<Response>();
    const transport = unabortableTransport([slow.promise, fast.promise]);
    const store = new CheckerStore(draftA, { transport });

    const runA = store.analyze();
    store.setDraft(draftB);
    const runB = store.analyze();

    fast.resolve(okResponse(reportB));
    await runB;
    slow.resolve(okResponse(reportA));
    await runA;

    expect(transport.calls).toHaveLength(2);
    const [callA, callB] = transport.calls;
    expect(callA?.path).toBe(path);
    expect(callB?.path).toBe(path);
    const bodyA = callA?.body as { inputHash: string; text: string };
    const bodyB = callB?.body as { inputHash: string; text: string };
    expect(bodyA.text).toBe(draftA.text);
    expect(bodyB.text).toBe(draftB.text);
    expect(bodyA.inputHash).toBe(sha256Hex(draftA.text));
    expect(bodyB.inputHash).toBe(sha256Hex(draftB.text));
    // 正文变了必然产生不同摘要
    expect(bodyA.inputHash).not.toBe(bodyB.inputHash);
    // 最终报告属于 B，且与当前输入同源
    expect(store.getState().report?.summary.status).toBe("needs_review");
    expect(store.getState().stale).toBe(false);
  });

  it("客户端超时只发一次请求，不自动重试", async () => {
    const transport = unabortableTransport([
      new Promise<Response>((_resolve, reject) => {
        setTimeout(() => reject(new DOMException("aborted", "AbortError")), 30);
      }),
    ]);
    const store = new CheckerStore(draft, {
      transport,
      requestTimeoutMs: 25,
    });

    await store.analyze();

    expect(transport.calls).toHaveLength(1);
    const body = transport.calls[0]?.body as { inputHash: string; text: string };
    expect(body.text).toBe(draft.text);
    expect(body.inputHash).toBe(sha256Hex(draft.text));
    expect(store.getState().error?.code).toBe("TIMEOUT");
  });

  it("选音请求携带 tokenId/readingId 与当时正文摘要；换书后覆盖为空且书已切换", async () => {
    const token = pass.poem.tokens[0]!;
    const candidate = token.candidates[0]!;
    const transport = unabortableTransport([
      okResponse(pass),
      okResponse(pass),
      okResponse(pass),
    ]);
    const store = new CheckerStore(draft, { transport });

    // 1) 首次分析
    await store.analyze();

    // 2) 选音重查
    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: candidate.id,
    });

    const chooseBody = transport.calls[1]?.body as {
      inputHash: string;
      readingOverrides: Array<{ tokenId: string; readingId: string }>;
      rhymeBook: string;
    };
    expect(transport.calls[1]?.path).toBe(path);
    expect(chooseBody.readingOverrides).toEqual([
      { tokenId: token.tokenId, readingId: candidate.id },
    ]);
    expect(chooseBody.inputHash).toBe(sha256Hex(draft.text));

    // 3) 换韵书 → 覆盖被清空，再提交时不带旧覆盖
    store.setDraft({ ...draft, rhymeBook: "cilin" });
    expect(store.getState().overrides).toEqual([]);
    await store.analyze();

    const afterBookBody = transport.calls[2]?.body as {
      rhymeBook: string;
      readingOverrides: unknown[];
      inputHash: string;
    };
    expect(afterBookBody.rhymeBook).toBe("cilin");
    expect(afterBookBody.readingOverrides).toEqual([]);
    // 正文没变，摘要保持不变
    expect(afterBookBody.inputHash).toBe(sha256Hex(draft.text));
  });
});
