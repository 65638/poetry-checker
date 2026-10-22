/**
 * 业务状态协调器测试：并发守卫、陈旧失效、换书清覆盖、选音归属、导出快照。
 * 覆盖任务书 D-D1-02 / 03 / 04 / 06 / 07 / 09。
 */
import { describe, expect, it } from "vitest";
import { CheckerStore } from "../src/app/store";
import type { InputDraft } from "../src/view-contract";
import {
  deferred,
  errorResponse,
  jsonResponse,
  loadMockScenario,
  okResponse,
  scenarioDraft,
  scriptedTransport,
  unabortableTransport,
  type MockScenario,
} from "./fixtures";

function draftOf(scenario: MockScenario): InputDraft {
  return scenarioDraft(scenario);
}

function makeStore(
  script: Array<Response | Promise<Response>>,
  draft = draftOf("pass"),
) {
  const transport = scriptedTransport(script);
  const store = new CheckerStore(draft, { transport });
  return { store, transport };
}

describe("首次提交（D-D1-01 的状态层）", () => {
  it("用户停止等待后保留原文，迟到的成功不显示，随后可重新提交", async () => {
    const late = deferred<Response>();
    const transport = unabortableTransport([
      late.promise,
      okResponse(loadMockScenario("pass")),
    ]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    const running = store.analyze();
    store.cancelAnalysis();
    expect(store.getState().busy).toBe(false);
    expect(store.getState().feedback).toContain("已停止本次分析");
    expect(store.getState().error).toBeNull();
    expect(store.getState().draft).toEqual(draftOf("pass"));
    late.resolve(okResponse(loadMockScenario("pass")));
    await running;
    expect(store.getState().report).toBeNull();
    expect(store.getState().feedback).toContain("已停止");
    await store.analyze();
    expect(store.getState().report).not.toBeNull();
    expect(store.getState().feedback).toBeNull();
  });
  it("停止选音重检时退回已提交的选音，保留同一份旧报告与快照", async () => {
    const report = loadMockScenario("pass");
    const late = deferred<Response>();
    const transport = unabortableTransport([okResponse(report), late.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    const previous = store.getState();
    const token = report.poem.tokens.find((t) => t.candidates.length > 0)!;
    const pending = store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    expect(store.getState().pendingOverrides).toHaveLength(1);
    store.cancelAnalysis();
    expect(store.getState().pendingOverrides).toEqual(previous.overrides);
    expect(store.getState().requestSnapshot).toBe(previous.requestSnapshot);
    expect(store.getState().report).toBe(previous.report);
    expect(store.getState().feedback).toContain("上次结果未更新");
    late.resolve(okResponse(report));
    await pending;
    expect(store.getState().requestSnapshot).toBe(previous.requestSnapshot);
  });
  it("成功时写入 report/busy=false，并记录请求快照", async () => {
    const { store, transport } = makeStore([
      okResponse(loadMockScenario("pass")),
    ]);
    await store.analyze();

    const state = store.getState();
    expect(state.report?.summary.status).toBe("pass");
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
    expect(state.stale).toBe(false);
    expect(transport.calls[0]?.body).toMatchObject({
      text: draftOf("pass").text,
      rhymeBook: "pingshui",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    });
  });

  it("busy 在请求期间为 true，完成后为 false", async () => {
    const pending = deferred<Response>();
    const { store } = makeStore([pending.promise]);
    const run = store.analyze();
    expect(store.getState().busy).toBe(true);
    pending.resolve(okResponse(loadMockScenario("pass")));
    await run;
    expect(store.getState().busy).toBe(false);
  });

  it("非法草稿不发送请求，给可恢复错误", async () => {
    const { store, transport } = makeStore(
      [okResponse(loadMockScenario("pass"))],
      {
        text: "，，。",
        rhymeBook: "pingshui",
        genreHint: "auto",
        formHint: "auto",
      },
    );
    await store.analyze();
    expect(transport.calls).toHaveLength(0);
    expect(store.getState().error?.code).toBe("INVALID_DRAFT");
    expect(store.getState().feedback).toBeNull();
  });
});

describe("乱序响应（D-D1-02）", () => {
  it("请求 A 慢、B 快：A 最后成功也不覆盖 B，且旧收尾不重开 busy", async () => {
    // 两个请求的草稿相同，所以两份响应的正文都必须对应同一段原文。
    // 用同一份 pass 报告，只把 B 的 summary 改成 needs_review 以区分来源。
    const baseReport = loadMockScenario("pass");
    const variantB: typeof baseReport = {
      ...baseReport,
      summary: {
        status: "needs_review",
        message: "B 响应的合成场景（同正文，仅改 summary）",
      },
    };

    const slow = deferred<Response>();
    const fast = deferred<Response>();
    const transport = unabortableTransport([slow.promise, fast.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });

    const runA = store.analyze();
    const runB = store.analyze();
    expect(store.getState().busy).toBe(true);

    fast.resolve(okResponse(variantB));
    await runB;
    expect(store.getState().report?.summary.status).toBe("needs_review");
    expect(store.getState().busy).toBe(false);

    // A 迟到成功：必须被丢弃，且不能重新打开 busy。
    slow.resolve(okResponse(baseReport));
    await runA;
    expect(store.getState().report?.summary.status).toBe("needs_review");
    expect(store.getState().busy).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it("请求 A 慢、B 快：A 迟到失败也不能覆盖 B 的成功", async () => {
    const slow = deferred<Response>();
    const fast = deferred<Response>();
    const transport = unabortableTransport([slow.promise, fast.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });

    const runA = store.analyze();
    const runB = store.analyze();
    fast.resolve(okResponse(loadMockScenario("pass")));
    await runB;

    slow.resolve(errorResponse("INTERNAL_ERROR", "服务内部错误", 500));
    await runA;

    expect(store.getState().report?.summary.status).toBe("pass");
    expect(store.getState().error).toBeNull();
    expect(store.getState().busy).toBe(false);
  });

  it("新请求开始时中止旧请求的 signal", async () => {
    const baseReport = loadMockScenario("pass");
    const variantB: typeof baseReport = {
      ...baseReport,
      summary: {
        status: "needs_review",
        message: "B 响应的合成场景（同正文，仅改 summary）",
      },
    };
    const slow = deferred<Response>();
    const fast = deferred<Response>();
    const { store, transport } = makeStore([slow.promise, fast.promise]);

    const runA = store.analyze();
    const runB = store.analyze();
    expect(transport.calls[0]?.signal?.aborted).toBe(true);
    expect(transport.calls[1]?.signal?.aborted).toBe(false);

    fast.resolve(okResponse(variantB));
    slow.resolve(okResponse(baseReport));
    await Promise.all([runA, runB]);
    expect(store.getState().report?.summary.status).toBe("needs_review");
  });
});

describe("陈旧结果与失效（D-D1-03）", () => {
  it("请求未完成时只改正文：旧响应被身份守卫丢弃，不成为当前报告", async () => {
    const pending = deferred<Response>();
    const { store } = makeStore([pending.promise], draftOf("pass"));

    const run = store.analyze();
    store.setDraft({
      ...draftOf("pass"),
      text: `${draftOf("pass").text}\n仄仄平平仄`,
    });
    pending.resolve(okResponse(loadMockScenario("pass")));
    await run;

    // 修复 3 之后：编辑会递增请求身份，旧响应连落地机会都没有。
    const state = store.getState();
    expect(state.report).toBeNull();
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
    expect(state.selectedTokenId).toBeNull();
    expect(state.selectedFindingId).toBeNull();
    expect(state.overrides).toEqual([]);
    expect(state.pendingOverrides).toEqual([]);
  });

  it("报告已完成后再改正文：报告保留但标 stale", async () => {
    const { store } = makeStore([okResponse(loadMockScenario("pass"))]);
    await store.analyze();
    expect(store.getState().report?.summary.status).toBe("pass");
    expect(store.getState().stale).toBe(false);

    store.setDraft({
      ...draftOf("pass"),
      text: `${draftOf("pass").text}\n仄仄平平仄`,
    });
    expect(store.getState().report?.summary.status).toBe("pass");
    expect(store.getState().stale).toBe(true);
  });

  it("改正文使旧报告失效并清空选音与选择", async () => {
    const { store } = makeStore([okResponse(loadMockScenario("pass"))]);
    await store.analyze();
    store.selectFinding("fixture:check");
    expect(store.getState().selectedFindingId).toBe("fixture:check");

    store.setDraft({
      ...draftOf("pass"),
      text: `${draftOf("pass").text}\n仄仄平平仄`,
    });
    expect(store.getState().stale).toBe(true);
    expect(store.getState().selectedFindingId).toBeNull();
    expect(store.getState().selectedTokenId).toBeNull();
  });

  it("正文改回与报告一致时 stale 自动解除", async () => {
    const draft = draftOf("pass");
    const { store } = makeStore([okResponse(loadMockScenario("pass"))], draft);
    await store.analyze();
    store.setDraft({ ...draft, text: `${draft.text}\n仄仄平平仄` });
    expect(store.getState().stale).toBe(true);
    store.setDraft({ ...draft });
    expect(store.getState().stale).toBe(false);
  });

  it("换韵书清空旧覆盖与选择，旧候选不复用", async () => {
    const pass = loadMockScenario("pass");
    const { store } = makeStore([okResponse(pass)], draftOf("pass"));
    await store.analyze();
    store.selectToken("l1c1");
    expect(store.getState().selectedTokenId).toBe("l1c1");

    store.setDraft({ ...draftOf("pass"), rhymeBook: "xinyun" });
    expect(store.getState().overrides).toEqual([]);
    expect(store.getState().selectedTokenId).toBeNull();
  });
});

describe("选音请求构造与归属校验（D-D1-05 / D-D1-06）", () => {
  it("合法选音：请求携带当前 inputHash，且覆盖只保留该字位一条", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([
      okResponse(pass),
      okResponse(loadMockScenario("needs_review")),
    ]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();

    const reportHash = store.getState().report?.inputHash;
    const token = pass.poem.tokens[0];
    expect(token).toBeDefined();
    const candidate = token!.candidates[0];
    expect(candidate).toBeDefined();

    await store.chooseReading({
      tokenId: token!.tokenId,
      readingId: candidate!.id,
    });

    expect(transport.calls).toHaveLength(2);
    const second = transport.calls[1]?.body as {
      inputHash?: string;
      readingOverrides: Array<{ tokenId: string; readingId: string }>;
    };
    expect(second.inputHash).toBe(reportHash);
    expect(second.readingOverrides).toEqual([
      { tokenId: token!.tokenId, readingId: candidate!.id },
    ]);
  });

  it("同一字位重复选择只保留最新一条覆盖", async () => {
    const pass = loadMockScenario("pass");
    const token = pass.poem.tokens[0]!;
    const twoToneToken =
      pass.poem.tokens.find((item) => item.candidates.length > 1) ?? token;
    const first = twoToneToken.candidates[0]!;
    const second = twoToneToken.candidates[twoToneToken.candidates.length - 1]!;

    const transport = scriptedTransport([
      okResponse(pass),
      okResponse(pass),
      okResponse(pass),
    ]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();

    await store.chooseReading({
      tokenId: twoToneToken.tokenId,
      readingId: first.id,
    });
    // 成功后才提交：此时已生效覆盖 = 本次请求携带的覆盖。
    const afterFirst = store
      .getState()
      .overrides.filter((item) => item.tokenId === twoToneToken.tokenId);
    expect(afterFirst).toHaveLength(1);

    if (first.id !== second.id) {
      await store.chooseReading({
        tokenId: twoToneToken.tokenId,
        readingId: second.id,
      });
      const afterSecond = store
        .getState()
        .overrides.filter((item) => item.tokenId === twoToneToken.tokenId);
      expect(afterSecond).toEqual([
        { tokenId: twoToneToken.tokenId, readingId: second.id },
      ]);
      expect(afterSecond).toHaveLength(1);
    }
  });

  it("外字 readingId 不发请求，给可理解反馈", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([okResponse(pass)]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    const before = transport.calls.length;

    await store.chooseReading({
      tokenId: "l1c1",
      readingId: "fixture:reading:无:Z",
    });

    expect(transport.calls.length).toBe(before);
    expect(store.getState().feedback).toContain("不属于字位");
  });

  it("不属于当前报告的 tokenId 不发请求", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([okResponse(pass)]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    const before = transport.calls.length;

    await store.chooseReading({
      tokenId: "l9c9",
      readingId: "fixture:reading:平:P",
    });
    expect(transport.calls.length).toBe(before);
    expect(store.getState().feedback).toContain("不属于当前报告");
  });

  it("stale 报告选音被拒绝（业务层也拦，不只靠按钮禁用）", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([okResponse(pass)]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    store.setDraft({
      ...draftOf("pass"),
      text: `${draftOf("pass").text}\n仄仄平平仄`,
    });
    const before = transport.calls.length;

    const token = pass.poem.tokens[0]!;
    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });

    expect(transport.calls.length).toBe(before);
    expect(store.getState().feedback).toContain("已不对应当前输入");
  });

  it("busy 时选音被拒绝", async () => {
    const pass = loadMockScenario("pass");
    const pending = deferred<Response>();
    const transport = scriptedTransport([okResponse(pass), pending.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();

    const token = pass.poem.tokens[0]!;
    const run = store.analyze();
    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    expect(store.getState().feedback).toContain("正在分析");

    pending.resolve(okResponse(pass));
    await run;
  });
});

describe("导出与复制不重新判定（D-D1-10 状态层）", () => {
  it("复制/导出使用报告快照，不读用户随后改过的草稿", async () => {
    const pass = loadMockScenario("pass");
    const written: string[] = [];
    const downloaded: Array<{ filename: string; json: string }> = [];
    const transport = scriptedTransport([okResponse(pass)]);
    const store = new CheckerStore(draftOf("pass"), {
      transport,
      writeText: async (text) => {
        written.push(text);
      },
      download: (filename, json) => {
        downloaded.push({ filename, json });
      },
    });
    await store.analyze();

    // 用户随后改了草稿
    store.setDraft({ ...draftOf("pass"), text: "完全不同的正文，含汉字。" });

    await store.copySummary();
    store.downloadReport();

    // stale 时应阻止导出
    expect(written).toHaveLength(0);
    expect(downloaded).toHaveLength(0);
    expect(store.getState().feedback).toContain("已阻止");
  });

  it("报告有效时导出包含原文、请求快照、版本与不确定项", async () => {
    const pass = loadMockScenario("needs_review");
    const downloaded: Array<{ filename: string; json: string }> = [];
    const transport = scriptedTransport([okResponse(pass)]);
    const store = new CheckerStore(draftOf("needs_review"), {
      transport,
      download: (filename, json) => {
        downloaded.push({ filename, json });
      },
      writeText: async () => undefined,
    });
    await store.analyze();
    store.downloadReport();

    expect(downloaded).toHaveLength(1);
    const payload = JSON.parse(downloaded[0]!.json) as {
      originalText: string;
      request: { text: string };
      uncertainties: { ambiguousReadings: unknown[] };
      report: { summary: { status: string } };
    };
    expect(payload.originalText).toBe(pass.poem.originalText);
    expect(payload.request.text).toBe(pass.poem.originalText);
    expect(payload.report.summary.status).toBe("needs_review");
    expect(payload.uncertainties).toBeDefined();
  });
});

describe("错误保留输入（D-D1-07 状态层）", () => {
  it("503 后保留正文并给出可恢复错误，不显示缓存成功", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([
      okResponse(pass),
      errorResponse("DATA_NOT_READY", "数据尚未接入", 503),
    ]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    expect(store.getState().report?.summary.status).toBe("pass");

    const changed = {
      ...draftOf("pass"),
      text: `${draftOf("pass").text}\n仄仄平平仄`,
    };
    store.setDraft(changed);
    await store.analyze();

    const state = store.getState();
    expect(state.draft.text).toBe(changed.text);
    expect(state.error?.code).toBe("HTTP_503");
    // 旧报告仍在，但必须标 stale 且不能当作本次成功。
    expect(state.report?.summary.status).toBe("pass");
    expect(state.stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 修复 2 回归：选音提交与报告快照必须来自同一次成功计算
// ---------------------------------------------------------------------------
describe("选音与快照一致性（修复 2）", () => {
  function makeExportableStore(script: Array<Response | Promise<Response>>) {
    const written: string[] = [];
    const downloaded: Array<{ filename: string; json: string }> = [];
    const transport = scriptedTransport(script);
    const store = new CheckerStore(draftOf("pass"), {
      transport,
      writeText: async (text) => {
        written.push(text);
      },
      download: (filename, json) => {
        downloaded.push({ filename, json });
      },
    });
    return { store, transport, written, downloaded };
  }

  it("成功响应后 overrides 与 requestSnapshot.readingOverrides 是同一组", async () => {
    const pass = loadMockScenario("pass");
    const { store } = makeExportableStore([okResponse(pass), okResponse(pass)]);
    await store.analyze();
    const token = pass.poem.tokens[0]!;
    const candidate = token.candidates[0]!;
    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: candidate.id,
    });

    const state = store.getState();
    expect(state.overrides).toEqual([
      { tokenId: token.tokenId, readingId: candidate.id },
    ]);
    expect(state.requestSnapshot?.readingOverrides).toEqual(state.overrides);
    expect(state.busy).toBe(false);
  });

  it("成功报告 → 选音 → 503：保留旧快照但禁止复制导出，重试后恢复", async () => {
    const pass = loadMockScenario("pass");
    const { store, written, downloaded } = makeExportableStore([
      okResponse(pass),
      errorResponse("DATA_NOT_READY", "数据尚未接入", 503),
      okResponse(pass),
    ]);
    await store.analyze();
    const token = pass.poem.tokens[0]!;
    const candidate = token.candidates[0]!;

    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: candidate.id,
    });

    const state = store.getState();
    // 选音失败：旧报告与其快照保持，覆盖退回已生效值（空）。
    expect(state.error?.code).toBe("HTTP_503");
    expect(state.overrides).toEqual([]);
    expect(state.pendingOverrides).toEqual([]);
    expect(state.report?.summary.status).toBe("pass");
    expect(state.stale).toBe(false);

    store.downloadReport();
    await store.copySummary();
    expect(downloaded).toHaveLength(0);
    expect(written).toHaveLength(0);
    expect(store.getState().feedback).toContain("已阻止");
    await store.analyze();
    store.downloadReport();
    await store.copySummary();
    expect(downloaded).toHaveLength(1);
    expect(written).toHaveLength(1);
    const payload = JSON.parse(downloaded[0]!.json);
    expect(payload.readingOverrides).toEqual([]);
    expect(payload.request.readingOverrides).toEqual([]);
  });

  it("网络失败保留旧快照但阻止复制", async () => {
    const pass = loadMockScenario("pass");
    const transport = scriptedTransport([
      okResponse(pass),
      Promise.reject(new TypeError("fetch failed")),
    ]);
    const written: string[] = [];
    const store = new CheckerStore(draftOf("pass"), {
      transport,
      writeText: async (text) => {
        written.push(text);
      },
    });
    await store.analyze();
    const token = pass.poem.tokens[0]!;
    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });

    expect(store.getState().error?.code).toBe("NETWORK_ERROR");
    expect(store.getState().overrides).toEqual([]);
    await store.copySummary();
    expect(written).toHaveLength(0);
    expect(store.getState().feedback).toContain("已阻止");
  });

  it("请求处理中禁止导出，避免新旧结果混用", async () => {
    const pass = loadMockScenario("pass");
    const pending = deferred<Response>();
    const { store, written, downloaded } = makeExportableStore([
      okResponse(pass),
      pending.promise,
    ]);
    await store.analyze();
    const token = pass.poem.tokens[0]!;

    const run = store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    expect(store.getState().busy).toBe(true);
    expect(store.getState().pendingOverrides).toHaveLength(1);

    store.downloadReport();
    await store.copySummary();
    expect(downloaded).toHaveLength(0);
    expect(written).toHaveLength(0);
    expect(store.getState().feedback).toContain("正在重新分析");

    pending.resolve(okResponse(pass));
    await run;
    expect(store.getState().busy).toBe(false);
  });

  it("stale 不由失败路径手写：请求失败不会把 stale 打开", async () => {
    const pass = loadMockScenario("pass");
    const { store } = makeExportableStore([
      okResponse(pass),
      errorResponse("DATA_NOT_READY", "数据尚未接入", 503),
    ]);
    await store.analyze();
    const token = pass.poem.tokens[0]!;
    await store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    // 正文没变，报告仍对应当前输入 → 不是 stale（stale 只由草稿比较派生）。
    expect(store.getState().stale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 修复 3 回归：编辑但不重新提交，也要让在途请求失效
// ---------------------------------------------------------------------------
describe("编辑使在途请求失效（修复 3）", () => {
  it("慢选音请求 → 改正文不提交 → 旧响应返回：覆盖保持清空", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    // 关键：用忽略 abort 的 transport，确保旧响应真的会到达。
    const transport = unabortableTransport([okResponse(pass), slow.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    const token = pass.poem.tokens[0]!;

    const run = store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    expect(store.getState().busy).toBe(true);

    // 编辑但不重新提交
    store.setDraft({
      ...draftOf("pass"),
      text: `${draftOf("pass").text}\n仄仄平平仄`,
    });
    expect(store.getState().overrides).toEqual([]);
    expect(store.getState().pendingOverrides).toEqual([]);
    expect(store.getState().busy).toBe(false);

    // 旧响应迟到：必须被身份守卫丢弃
    slow.resolve(
      jsonResponse({
        ...pass,
        summary: { status: "fail", message: "迟到的旧响应，不应生效" },
      }),
    );
    await run;

    const state = store.getState();
    expect(state.overrides).toEqual([]);
    expect(state.pendingOverrides).toEqual([]);
    expect(state.report?.summary.status).toBe("pass"); // 仍是旧报告
    expect(state.stale).toBe(true);
  });

  it("改回原文也不能复活已失效的选音结果", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    const transport = unabortableTransport([okResponse(pass), slow.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    const token = pass.poem.tokens[0]!;

    const run = store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    const changed = `${draftOf("pass").text}\n仄仄平平仄`;
    store.setDraft({ ...draftOf("pass"), text: changed });
    store.setDraft({ ...draftOf("pass") }); // 改回原文

    slow.resolve(okResponse(pass));
    await run;

    expect(store.getState().overrides).toEqual([]);
    expect(store.getState().pendingOverrides).toEqual([]);
    expect(store.getState().stale).toBe(false);
  });

  it("切换韵书让在途响应失效", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    const transport = unabortableTransport([okResponse(pass), slow.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    const token = pass.poem.tokens[0]!;

    const run = store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    store.setDraft({ ...draftOf("pass"), rhymeBook: "xinyun" });

    slow.resolve(okResponse(pass));
    await run;

    expect(store.getState().overrides).toEqual([]);
    expect(store.getState().pendingOverrides).toEqual([]);
    expect(store.getState().stale).toBe(true);
  });

  it("体裁/体式参数变化也让在途响应失效", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    const transport = unabortableTransport([okResponse(pass), slow.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    const token = pass.poem.tokens[0]!;

    const run = store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    store.setDraft({ ...draftOf("pass"), formHint: "wujue" });

    slow.resolve(okResponse(pass));
    await run;

    expect(store.getState().overrides).toEqual([]);
    expect(store.getState().stale).toBe(true);
  });

  it("迟到失败也不覆盖当前状态", async () => {
    const pass = loadMockScenario("pass");
    const slow = deferred<Response>();
    const transport = unabortableTransport([okResponse(pass), slow.promise]);
    const store = new CheckerStore(draftOf("pass"), { transport });
    await store.analyze();
    const token = pass.poem.tokens[0]!;

    const run = store.chooseReading({
      tokenId: token.tokenId,
      readingId: token.candidates[0]!.id,
    });
    store.setDraft({
      ...draftOf("pass"),
      text: `${draftOf("pass").text}\n仄仄平平仄`,
    });
    const runIdAfterEdit = store.currentRunId;

    slow.resolve(errorResponse("INTERNAL_ERROR", "服务内部错误", 500));
    await run;

    expect(store.getState().error).toBeNull();
    expect(store.getState().busy).toBe(false);
    expect(store.currentRunId).toBe(runIdAfterEdit);
  });
});
