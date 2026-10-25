import { describe, expect, it } from "vitest";
import type { ReadingCandidate, RhymeWordsResponse } from "@poetry/contracts";
import { RhymeCatalogCache } from "../src/app/rhymeCatalogCache";

function catalog(
  characters: number,
  readingsPerCharacter = 1,
): RhymeWordsResponse {
  const entries = Array.from({ length: characters }, (_, i) => {
    const character = String.fromCodePoint(0x4e00 + i);
    return {
      character,
      candidates: Array.from(
        { length: readingsPerCharacter },
        (_, j): ReadingCandidate => ({
          id: `test:${i}:${j}`,
          character,
          book: "xinyun",
          toneClass: "ping",
          tone: "P",
          groupIds: ["test-group"],
          gloss: null,
          modernReading: null,
          fanqie: null,
          evidenceIds: [],
        }),
      ),
    };
  });
  return {
    readingId: "test-seed",
    offset: 0,
    limit: Math.max(1, characters),
    total: characters,
    lookup: {
      book: "xinyun",
      dataVersion: "controlled-test-v1",
      entries,
      missing: [],
      groups: [],
      evidence: [],
      sources: [],
    },
  };
}

describe("完整韵部目录的有界LRU缓存", () => {
  it("最多8个目录，读取提升优先级且不会修改目录", () => {
    const cache = new RhymeCatalogCache();
    const values = Array.from({ length: 9 }, () => catalog(1));
    values.slice(0, 8).forEach((value, i) => cache.set(String(i), value));
    expect(cache.get("0")).toBe(values[0]);
    cache.set("8", values[8]!);
    expect(cache.size).toBe(8);
    expect(cache.candidateCount).toBe(8);
    expect(cache.get("1")).toBeNull();
    expect(cache.get("0")).toBe(values[0]);
    expect(values[1]!.lookup.entries).toHaveLength(1);
  });
  it("按读音候选总数控制10000上限，而不是按汉字个数", () => {
    const cache = new RhymeCatalogCache();
    cache.set("first", catalog(2500, 2));
    cache.set("second", catalog(2500, 2));
    expect(cache.candidateCount).toBe(10000);
    expect(cache.size).toBe(2);
    cache.get("first");
    cache.set("third", catalog(1));
    expect(cache.get("first")).not.toBeNull();
    expect(cache.get("second")).toBeNull();
    expect(cache.candidateCount).toBe(5001);
  });
  it("替换相同key时扣除旧计数，并把新值设为最近使用", () => {
    const cache = new RhymeCatalogCache();
    cache.set("same", catalog(2000));
    cache.set("other", catalog(3000));
    const replacement = catalog(6000);
    cache.set("same", replacement);
    expect(cache.size).toBe(2);
    expect(cache.candidateCount).toBe(9000);
    cache.set("new", catalog(2000));
    expect(cache.get("other")).toBeNull();
    expect(cache.get("same")).toBe(replacement);
    expect(cache.candidateCount).toBe(8000);
  });
  it("单条超预算不缓存、不驱逐其它结果；同key旧值也不冒充新值", () => {
    const cache = new RhymeCatalogCache();
    const kept = catalog(3000);
    cache.set("kept", kept);
    cache.set("replaced", catalog(1));
    cache.set("huge", catalog(5001, 2));
    expect(cache.size).toBe(2);
    expect(cache.candidateCount).toBe(3001);
    expect(cache.get("huge")).toBeNull();
    cache.set("replaced", catalog(10001));
    expect(cache.get("replaced")).toBeNull();
    expect(cache.get("kept")).toBe(kept);
    expect(cache.candidateCount).toBe(3000);
  });
  it("清空同时归零预算，后续可重新缓存；缺失读取不影响顺序", () => {
    const cache = new RhymeCatalogCache();
    cache.set("old", catalog(10000));
    expect(cache.get("missing")).toBeNull();
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.candidateCount).toBe(0);
    expect(cache.get("old")).toBeNull();
    cache.set("next", catalog(10000));
    expect(cache.size).toBe(1);
    expect(cache.candidateCount).toBe(10000);
  });
});
