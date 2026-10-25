import { afterEach, describe, expect, it, vi } from "vitest";
import { responseMessage } from "../src/api/responseMessages";
import {
  loadCatalog,
  loadCharacterReference,
  loadPronunciation,
} from "../src/api/library";
import {
  requestPoetry,
  requestRhymeWords,
  studioPost,
} from "../src/api/poetry-studio";
import { createReadingAssistant } from "../src/api/reading-assistant";
import { createCharacterLookup } from "../src/api/characters";
import { BUILTIN_WORKS } from "../src/app/library";
import {
  PoetryAssistantRequestSchema,
  RhymeWordsRequestSchema,
} from "@poetry/contracts";
afterEach(() => vi.unstubAllGlobals());
describe("reader-facing API failures", () => {
  it.each([
    null,
    [],
    { error: null },
    { error: { message: {} } },
    { error: { message: "" } },
    { error: { message: "x".repeat(401) } },
    { error: { message: "<html>502 Gateway</html>" } },
    { error: { message: '[{"code":"invalid_type"}]' } },
    { error: { message: "Error at handler (file.js:1:2)" } },
  ])("rejects malformed or technical server explanations %#", (value) => {
    expect(responseMessage(value, "请重试")).toBe("请重试");
  });
  it("preserves useful specific backend explanations", () => {
    expect(
      responseMessage(
        { error: { message: " 本篇未提供逐字注音。 " } },
        "请重试",
      ),
    ).toBe("本篇未提供逐字注音。");
  });
  it("reports malformed successful literary and rhyme responses without dumping schemas", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}"));
    const input = PoetryAssistantRequestSchema.parse({
      task: "critique",
      text: "空山不见人。",
      rhymeBook: "pingshui",
      mode: "reading",
      direction: "meaning",
    });
    await expect(requestPoetry(input)).rejects.toThrow("研读结果不完整");
    const rhyme = RhymeWordsRequestSchema.parse({
      rhymeBook: "pingshui",
      readingId: "test",
      offset: 0,
    });
    await expect(requestRhymeWords(rhyme)).rejects.toThrow("同韵字资料不完整");
  });
  it("gives separate useful messages for incomplete corpus, pronunciation and dictionary reference", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}"));
    await expect(loadCatalog()).rejects.toThrow("诗库目录不完整");
    await expect(loadPronunciation(BUILTIN_WORKS[0]!)).rejects.toThrow(
      "注音资料不完整",
    );
    await expect(loadCharacterReference("月")).rejects.toThrow(
      "参考资料不完整",
    );
  });
  it("never treats malformed reading suggestions as a successful choice", async () => {
    const client = createReadingAssistant("", async () => new Response("{}"));
    const signal = new AbortController().signal;
    await expect(client.status(signal)).rejects.toThrow("AI服务状态");
    await expect(
      client.suggest({ text: "月", rhymeBook: "pingshui" }, signal),
    ).rejects.toThrow("尚未应用");
  });
  it("explains dictionary and reading network failures while preserving explicit cancellation", async () => {
    const error = new TypeError("Failed to fetch");
    const fetcher: typeof fetch = async () => {
      throw error;
    };
    const signal = new AbortController().signal;
    await expect(
      createCharacterLookup("", fetcher)("月", "pingshui", signal),
    ).rejects.toThrow("连接不上查字服务");
    await expect(
      createReadingAssistant("", fetcher).status(signal),
    ).rejects.toThrow("连接不上读音服务");
    const aborted = AbortSignal.abort();
    await expect(
      createCharacterLookup("", fetcher)("月", "pingshui", aborted),
    ).rejects.toBe(aborted.reason);
    await expect(
      createReadingAssistant("", fetcher).status(aborted),
    ).rejects.toBe(error);
  });
  it("uses a readable fallback for object-valued backend errors", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: { message: { details: "internal" } } }),
          { status: 503 },
        ),
    );
    await expect(studioPost("poetry-assistant", {})).rejects.toThrow(
      "服务暂时未能完成请求（503）",
    );
  });
});
