import { describe, expect, it } from "vitest";
import { createReadingAssistant } from "../src/api/reading-assistant";
import { sha256Hex } from "../src/utils/sha256";

const input = {
  text: "更",
  rhymeBook: "pingshui" as const,
  targetTokenIds: ["l1c1"],
};
const response = {
  provider: "zhipu",
  model: "glm-5.3-flash",
  inputHash: sha256Hex(input.text),
  rhymeBook: "pingshui",
  dataVersion: "test-only",
  missingTokenIds: [],
  truncated: false,
  notice: "test-only",
  suggestions: [
    {
      tokenId: "l1c1",
      character: "更",
      line: 1,
      column: 1,
      candidateId: null,
      pronunciation: null,
      reason: "未定",
      candidate: null,
      groupNames: [],
      evidenceApproved: false,
    },
  ],
};
describe("reading assistant client validates ownership", () => {
  it("forwards only text/book/targets to own backend and accepts explicit uncertainty", async () => {
    const signal = new AbortController().signal;
    const client = createReadingAssistant("", async (url, init) => {
      expect(url).toBe("/api/v1/reading-suggestions");
      expect(JSON.parse(init!.body as string)).toEqual(input);
      expect(init?.signal).toBe(signal);
      expect(init?.headers).not.toHaveProperty("Authorization");
      return new Response(JSON.stringify(response));
    });
    expect(
      (await client.suggest(input, signal)).suggestions[0]?.candidateId,
    ).toBeNull();
  });
  it.each([
    { ...response, offset: 24 },
    { ...response, inputHash: "a".repeat(64) },
    { ...response, rhymeBook: "cilin" },
    {
      ...response,
      suggestions: [{ ...response.suggestions[0], tokenId: "l2c2" }],
    },
    {
      ...response,
      suggestions: [response.suggestions[0], response.suggestions[0]],
    },
    {
      ...response,
      suggestions: [{ ...response.suggestions[0], candidateId: "invented" }],
    },
  ])(
    "rejects mismatched hashes, books, targets, duplicates and candidates %#",
    async (body) => {
      const client = createReadingAssistant(
        "",
        async () => new Response(JSON.stringify(body)),
      );
      await expect(
        client.suggest(input, new AbortController().signal),
      ).rejects.toThrow("不一致");
    },
  );
  it("reports backend limits without silently inventing a fallback", async () => {
    const client = createReadingAssistant(
      "",
      async () =>
        new Response(JSON.stringify({ error: { message: "智谱额度受限" } }), {
          status: 429,
        }),
    );
    await expect(
      client.suggest(input, new AbortController().signal),
    ).rejects.toThrow("额度受限");
  });
});
