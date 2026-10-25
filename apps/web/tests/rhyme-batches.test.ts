import { describe, expect, it, vi } from "vitest";
import type { PoetryAssistantResponse } from "@poetry/contracts";
import {
  RhymeBatchSession,
  type RhymeTaskInput,
} from "../src/api/rhyme-batches";

const input = (count = 241): RhymeTaskInput => ({
  task: "rhyme",
  text: "空山不见人，但闻人语响。",
  rhymeBook: "pingshui",
  readingId: "reading:响",
  targetTokenId: "l2c5",
  candidateIds: Array.from({ length: count }, (_, i) => `candidate:${i}`),
});
const response = (ids: string[]): PoetryAssistantResponse => ({
  task: "rhyme",
  provider: "deepseek",
  model: "controlled-test",
  inputHash: "0".repeat(64),
  notice: "受控交互测试，不代表真实模型判断",
  result: { matches: ids.map((id) => ({ id, reason: `理由 ${id}` })) },
});
const signal = () => new AbortController().signal;

describe("全量同韵候选AI分批", () => {
  it("覆盖末尾候选且每批不超过120，合并每批建议而非只看第一页", async () => {
    const request = vi.fn(async (value: RhymeTaskInput) =>
      response([value.candidateIds.at(-1)!]),
    );
    const progress: number[] = [];
    const session = new RhymeBatchSession(input(), request);
    const result = await session.run(signal(), (p) =>
      progress.push(p.completed),
    );
    expect(
      request.mock.calls.map(([value]) => value.candidateIds.length),
    ).toEqual([120, 120, 1]);
    expect(request.mock.calls.flatMap(([value]) => value.candidateIds)).toEqual(
      input().candidateIds,
    );
    expect(result.result.matches.map((match) => match.id)).toEqual([
      "candidate:119",
      "candidate:239",
      "candidate:240",
    ]);
    expect(result.coverage).toEqual({ completed: 241, total: 241, batches: 3 });
    expect(progress).toEqual([0, 120, 240, 241]);
    expect(result).not.toHaveProperty("provider");
    expect(result).not.toHaveProperty("inputHash");
  });

  it("分批失败后仅重试未完成部分，诗文及读音快照不变", async () => {
    let failOnce = true;
    const request = vi.fn(async (value: RhymeTaskInput) => {
      if (value.candidateIds[0] === "candidate:120" && failOnce) {
        failOnce = false;
        throw new Error("受控网络故障");
      }
      return response([value.candidateIds[0]!]);
    });
    const original = input();
    const session = new RhymeBatchSession(original, request);
    original.text = "后来编辑的新诗";
    original.candidateIds[0] = "后来修改的候选";
    await expect(session.run(signal())).rejects.toThrow("受控网络故障");
    expect(session.progress).toEqual({ completed: 120, total: 241 });
    const result = await session.run(signal());
    expect(request.mock.calls.map(([value]) => value.candidateIds[0])).toEqual([
      "candidate:0",
      "candidate:120",
      "candidate:120",
      "candidate:240",
    ]);
    expect(
      request.mock.calls.every(([value]) => value.text === input().text),
    ).toBe(true);
    expect(result.result.matches).toHaveLength(3);
  });

  it("用户显式新建一轮会重新荐字，不沿用另一诗文的成功批次", async () => {
    const request = vi.fn(async (value: RhymeTaskInput) =>
      response([value.candidateIds[0]!]),
    );
    await new RhymeBatchSession(input(121), request).run(signal());
    await new RhymeBatchSession(
      { ...input(121), text: "一首新诗。" },
      request,
    ).run(signal());
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[2]![0].text).toBe("一首新诗。");
  });

  it("停止时不再请求下一批，已完成批次可在重试时复用", async () => {
    const control = new AbortController();
    const request = vi.fn(async (value: RhymeTaskInput) =>
      response([value.candidateIds[0]!]),
    );
    const session = new RhymeBatchSession(input(), request);
    await expect(
      session.run(control.signal, (p) => {
        if (p.completed === 120) control.abort();
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).toHaveBeenCalledTimes(1);
    const result = await session.run(signal());
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.coverage.completed).toBe(241);
  });

  it("运输层取消后仍返回成功时，迟到批次不写入缓存也不增加进度", async () => {
    const control = new AbortController();
    let finish!: (value: PoetryAssistantResponse) => void;
    const request = vi.fn(
      () =>
        new Promise<PoetryAssistantResponse>((resolve) => {
          finish = resolve;
        }),
    );
    const session = new RhymeBatchSession(input(), request);
    const result = session.run(control.signal);
    control.abort();
    finish(response(["candidate:0"]));
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(session.progress.completed).toBe(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("同会话误并发时只有最新执行可写入缓存，不会重复首批或漏掉末批", async () => {
    let releaseOld!: (value: PoetryAssistantResponse) => void;
    const oldProgress: number[] = [];
    const request = vi.fn(async (value: RhymeTaskInput) => {
      if (request.mock.calls.length === 1)
        return new Promise<PoetryAssistantResponse>((resolve) => {
          releaseOld = resolve;
        });
      return response([value.candidateIds.at(-1)!]);
    });
    const session = new RhymeBatchSession(input(241), request);
    const first = session.run(signal(), (p) => oldProgress.push(p.completed));
    const firstRejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const latest = await session.run(signal());
    releaseOld(response(["candidate:0"]));
    await firstRejected;
    expect(oldProgress).toEqual([0]);
    expect(latest.result.matches.map((match) => match.id)).toEqual([
      "candidate:119",
      "candidate:239",
      "candidate:240",
    ]);
    expect(session.progress).toEqual({ completed: 241, total: 241 });
    const calls = request.mock.calls.length;
    const resumed = await session.run(signal());
    expect(resumed).toEqual(latest);
    expect(request).toHaveBeenCalledTimes(calls);
  });

  it("已有完成批次的并发续跑不会把迟到的失败批次计入进度", async () => {
    let finishLate!: (value: PoetryAssistantResponse) => void;
    let secondCalls = 0;
    const request = vi.fn(async (value: RhymeTaskInput) => {
      if (value.candidateIds[0] === "candidate:120" && secondCalls++ === 0)
        return new Promise<PoetryAssistantResponse>((resolve) => {
          finishLate = resolve;
        });
      return response([value.candidateIds.at(-1)!]);
    });
    const session = new RhymeBatchSession(input(241), request);
    const old = session.run(signal());
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(session.progress.completed).toBe(120);
    const latest = await session.run(signal());
    finishLate(response(["candidate:120"]));
    await rejected;
    expect(latest.result.matches.map((match) => match.id)).toEqual([
      "candidate:119",
      "candidate:239",
      "candidate:240",
    ]);
    expect(session.progress.completed).toBe(241);
    expect(
      request.mock.calls.filter(
        ([value]) => value.candidateIds[0] === "candidate:0",
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["candidate:240"],
    ["candidate:0", "candidate:0"],
    ["invented-candidate"],
  ])("拒绝属于其他批次、重复或伪造的荐字 %j", async (...args) => {
    const ids = args as string[];
    const request = vi.fn(async () => response(ids));
    const session = new RhymeBatchSession(input(), request);
    await expect(session.run(signal())).rejects.toThrow("范围外或重复候选");
    expect(session.progress.completed).toBe(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("空推荐仍算已遍历，但不会编造可替换字", async () => {
    const request = vi.fn(async () => response([]));
    const result = await new RhymeBatchSession(input(121), request).run(
      signal(),
    );
    expect(result.result.matches).toEqual([]);
    expect(result.coverage.completed).toBe(121);
  });

  it("空候选或重复ID在发送前拒绝，已取消的调用也不发送", async () => {
    const request = vi.fn(async () => response([]));
    expect(() => new RhymeBatchSession(input(0), request)).toThrow(
      "完整同韵候选",
    );
    expect(
      () =>
        new RhymeBatchSession(
          { ...input(1), candidateIds: ["one", "one"] },
          request,
        ),
    ).toThrow("重复");
    const control = new AbortController();
    control.abort();
    await expect(
      new RhymeBatchSession(input(1), request).run(control.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
});
