import { afterEach, describe, expect, it, vi } from "vitest";
import type { RhymeWordsResponse } from "@poetry/contracts";
import { requestAllRhymeWords } from "../src/api/all-rhyme-words";
import { requestRhymeWords } from "../src/api/poetry-studio";

vi.mock("../src/api/poetry-studio", () => ({ requestRhymeWords: vi.fn() }));
const fetchPage = vi.mocked(requestRhymeWords);
const input = { rhymeBook: "pingshui" as const, readingId: "seed" };
const page = (offset: number, total: number): RhymeWordsResponse => ({
  readingId: input.readingId,
  total,
  offset,
  limit: 120,
  lookup: {
    book: input.rhymeBook,
    dataVersion: "controlled-test-v1",
    entries: Array.from(
      { length: Math.max(0, Math.min(120, total - offset)) },
      (_, i) => {
        const character = String.fromCodePoint(0x4e00 + offset + i);
        return {
          character,
          candidates: [
            {
              id: `test:${offset + i}`,
              character,
              book: "pingshui",
              toneClass: "ping",
              tone: "P",
              groupIds: ["test-group"],
              gloss: null,
              modernReading: null,
              fanqie: null,
              evidenceIds: ["test-evidence"],
            },
          ],
        };
      },
    ),
    missing: [],
    groups: [
      {
        id: "test-group",
        book: "pingshui",
        name: "受控测试韵部",
        toneClass: "ping",
        evidenceIds: ["test-evidence"],
      },
    ],
    evidence: [
      {
        id: "test-evidence",
        sourceId: "test-source",
        kind: "rhyme_entry",
        locator: "受控测试",
        assertion: "仅用于测试",
        excerpt: null,
        reviewStatus: "unverified",
      },
    ],
    sources: [
      {
        id: "test-source",
        title: "受控测试来源",
        edition: null,
        url: null,
        license: "test",
        snapshotSha256: null,
        revision: null,
        retrievedAt: null,
      },
    ],
  },
});
afterEach(() => vi.resetAllMocks());

describe("完整同韵候选加载", () => {
  it("遍历超过两页的全部字并合并证据，不修改各页对象", async () => {
    const pages = [page(0, 245), page(120, 245), page(240, 245)];
    const before = structuredClone(pages);
    pages.forEach((value) => fetchPage.mockResolvedValueOnce(value));
    const progress = vi.fn();
    const result = await requestAllRhymeWords(input, undefined, progress);
    expect(fetchPage.mock.calls.map(([value]) => value.offset)).toEqual([
      0, 120, 240,
    ]);
    expect(result.lookup.entries).toHaveLength(245);
    expect(result.lookup.entries.at(-1)?.character).toBe(
      String.fromCodePoint(0x4e00 + 244),
    );
    expect(result.lookup.groups).toHaveLength(1);
    expect(result.lookup.evidence).toHaveLength(1);
    expect(result.lookup.sources).toHaveLength(1);
    expect(progress.mock.calls).toEqual([
      [120, 245],
      [240, 245],
      [245, 245],
    ]);
    expect(pages).toEqual(before);
  });
  it("空韵部也只发一次请求并明确0个完成", async () => {
    fetchPage.mockResolvedValueOnce(page(0, 0));
    const progress = vi.fn();
    expect(
      (await requestAllRhymeWords(input, undefined, progress)).lookup.entries,
    ).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(0, 0);
  });
  it.each([
    [
      "版本变化",
      (p: RhymeWordsResponse) => {
        p.lookup.dataVersion = "changed";
      },
    ],
    [
      "总数变化",
      (p: RhymeWordsResponse) => {
        p.total++;
      },
    ],
    [
      "重复字",
      (p: RhymeWordsResponse) => {
        p.lookup.entries[0] = page(0, 245).lookup.entries[0]!;
      },
    ],
    [
      "重复候选",
      (p: RhymeWordsResponse) => {
        p.lookup.entries[0]!.candidates[0]!.id = "test:0";
      },
    ],
    [
      "候选对应其他字",
      (p: RhymeWordsResponse) => {
        p.lookup.entries[0]!.candidates[0]!.character = "错";
      },
    ],
    [
      "缺字",
      (p: RhymeWordsResponse) => {
        p.lookup.missing = ["缺"];
      },
    ],
    [
      "空白页",
      (p: RhymeWordsResponse) => {
        p.lookup.entries = [];
      },
    ],
    [
      "过短页",
      (p: RhymeWordsResponse) => {
        p.lookup.entries.pop();
      },
    ],
    [
      "证据冲突",
      (p: RhymeWordsResponse) => {
        p.lookup.evidence[0]!.assertion = "不同依据";
      },
    ],
    [
      "空候选",
      (p: RhymeWordsResponse) => {
        p.lookup.entries[0]!.candidates = [];
      },
    ],
  ] as const)("拒绝%s，不把局部列表冒充全部", async (_name, change) => {
    const next = page(120, 245);
    change(next);
    fetchPage.mockResolvedValueOnce(page(0, 245)).mockResolvedValueOnce(next);
    await expect(requestAllRhymeWords(input)).rejects.toThrow("尚未完整取得");
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
  it("拒绝超出有界上限的总数", async () => {
    fetchPage.mockResolvedValueOnce(page(0, 100001));
    await expect(requestAllRhymeWords(input)).rejects.toThrow("尚未完整取得");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it("中途网络失败不发布部分列表", async () => {
    fetchPage
      .mockResolvedValueOnce(page(0, 245))
      .mockRejectedValueOnce(new Error("network"));
    const progress = vi.fn();
    await expect(
      requestAllRhymeWords(input, undefined, progress),
    ).rejects.toThrow("network");
    expect(progress.mock.calls).toEqual([[120, 245]]);
  });
  it("已取消不发送；进度回调取消后不获取下一页", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      requestAllRhymeWords(input, cancelled.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchPage).not.toHaveBeenCalled();
    const active = new AbortController();
    fetchPage.mockResolvedValueOnce(page(0, 245));
    await expect(
      requestAllRhymeWords(input, active.signal, () => active.abort()),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it("最终响应迟到且已取消时，也不返回成功或报告完成进度", async () => {
    const controller = new AbortController();
    fetchPage.mockImplementationOnce(async () => {
      controller.abort();
      return page(0, 1);
    });
    const progress = vi.fn();
    await expect(
      requestAllRhymeWords(input, controller.signal, progress),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).not.toHaveBeenCalled();
  });
});
