import { describe, expect, it } from "vitest";
import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";
import { PoetryResultCache } from "../src/app/poetryResultCache";

const input: PoetryAssistantRequest = {
  task: "critique",
  text: "白日依山尽",
  rhymeBook: "pingshui",
  direction: "meaning",
  mode: "reading",
};
const result: PoetryAssistantResponse = {
  task: "critique",
  provider: "deepseek",
  model: "controlled-test-model",
  inputHash: "a".repeat(64),
  notice: "测试参考",
  result: { overview: "受控结果", strengths: [], revisions: [] },
};

describe("bounded session-only poetry result reuse", () => {
  it("only reuses the same complete request, including mode/direction/book/text", () => {
    const cache = new PoetryResultCache();
    cache.set(input, result);
    expect(cache.get({ ...input })).toBe(result);
    for (const changed of [
      { ...input, text: "黄河入海流" },
      { ...input, rhymeBook: "xinyun" as const },
      { ...input, mode: "writing" as const },
      { ...input, direction: "sound" as const },
    ])
      expect(cache.get(changed)).toBeNull();
  });
  it("expires 15 minutes after generation even when repeatedly read", () => {
    let now = 0;
    const cache = new PoetryResultCache(() => now);
    cache.set(input, result);
    now = 14 * 60 * 1000;
    expect(cache.get(input)).toBe(result);
    now = 15 * 60 * 1000;
    expect(cache.get(input)).toBeNull();
  });
  it("does not reuse a result against a changed formal rule context", () => {
    const cache = new PoetryResultCache();
    const original = {
      ...input,
      prosodyContext: {
        format: "五绝形制",
        templateId: null,
        issues: [],
        applicability: "uncertain" as const,
      },
    };
    cache.set(original, result);
    expect(
      cache.get({
        ...original,
        prosodyContext: {
          ...original.prosodyContext,
          applicability: "applicable",
        },
      }),
    ).toBeNull();
  });
  it("keeps only 12 recently used requests and evicts without touching the originals", () => {
    const cache = new PoetryResultCache();
    const rows = Array.from({ length: 13 }, (_, index) => ({
      ...input,
      text: `第${index}首`,
    }));
    for (const row of rows.slice(0, 12)) cache.set(row, result);
    expect(cache.get(rows[0]!)).toBe(result);
    cache.set(rows[12]!, result);
    expect(cache.get(rows[0]!)).toBe(result);
    expect(cache.get(rows[1]!)).toBeNull();
    expect(cache.get(rows[12]!)).toBe(result);
  });
});
