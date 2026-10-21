import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/server.js";
import { loadResources } from "../src/resources.js";
import { DEEPSEEK_ENDPOINT } from "../src/model-config.js";

const resources = loadResources();
const input = {
  text: "更上一层楼。",
  rhymeBook: "pingshui",
  targetTokenIds: ["l1c1"],
};
const response = (output: unknown) =>
  new Response(
    JSON.stringify({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(output) } },
      ],
    }),
  );

describe("DeepSeek shares the validated server model paths", () => {
  it("uses the official endpoint and reports the provider in status, readings, analysis and literary tasks", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const payload = JSON.parse(init!.body as string);
      expect(payload).toMatchObject({
        model: "deepseek-flash",
        stream: false,
        response_format: { type: "json_object" },
        thinking: { type: "enabled" },
        reasoning_effort: "low",
      });
      const data = JSON.parse(payload.messages[1].content);
      return response(
        data.task === "critique"
          ? { overview: "受控评议", strengths: [], revisions: [] }
          : {
              suggestions: data.targets.map(
                (target: {
                  tokenId: string;
                  candidates: Array<{ id: string }>;
                }) => ({
                  tokenId: target.tokenId,
                  candidateId: target.candidates[0]!.id,
                  pronunciation: null,
                  reason: "受控测试",
                }),
              ),
            },
      );
    });
    const app = buildApp({
      resources,
      readingAssistant: {
        provider: "deepseek",
        apiKey: "test-private-deepseek",
        fetcher,
      },
    });
    try {
      expect(
        (await app.inject("/api/v1/reading-suggestions/status")).json(),
      ).toEqual({
        configured: true,
        provider: "deepseek",
        model: "deepseek-flash",
      });
      const readings = await app.inject({
        method: "POST",
        url: "/api/v1/reading-suggestions",
        payload: input,
      });
      expect(readings.statusCode).toBe(200);
      expect(readings.json()).toMatchObject({
        provider: "deepseek",
        model: "deepseek-flash",
      });
      const analysis = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload: {
          text: input.text,
          rhymeBook: input.rhymeBook,
          genreHint: "auto",
          formHint: "auto",
          ruleSet: "teaching-v1",
          readingOverrides: [],
        },
      });
      expect(analysis.statusCode).toBe(200);
      expect(analysis.json().readingAssistant).toMatchObject({
        provider: "deepseek",
        model: "deepseek-flash",
        state: "applied",
      });
      expect(analysis.json().readingAssistant.message).not.toContain("GLM");
      const critique = await app.inject({
        method: "POST",
        url: "/api/v1/poetry-assistant",
        payload: {
          task: "critique",
          text: input.text,
          rhymeBook: "pingshui",
          mode: "reading",
          direction: "meaning",
        },
      });
      expect(critique.statusCode).toBe(200);
      expect(critique.json()).toMatchObject({
        provider: "deepseek",
        task: "critique",
      });
      for (const [url, init] of fetcher.mock.calls) {
        expect(url).toBe(DEEPSEEK_ENDPOINT);
        expect(init!.headers).toMatchObject({
          Authorization: "Bearer test-private-deepseek",
        });
        expect(init!.redirect).toBe("error");
      }
      expect(
        [readings.body, analysis.body, critique.body].join(""),
      ).not.toContain("test-private-deepseek");
    } finally {
      await app.close();
    }
  });
  it.each([401, 429])(
    "does not disclose upstream credentials or response bodies on HTTP %i",
    async (status) => {
      const app = buildApp({
        resources,
        readingAssistant: {
          provider: "deepseek",
          apiKey: "test-private-deepseek",
          fetcher: async () =>
            new Response("private upstream test-private-deepseek", { status }),
        },
      });
      try {
        const result = await app.inject({
          method: "POST",
          url: "/api/v1/reading-suggestions",
          payload: input,
        });
        expect(result.json().error.code).toBe(
          status === 401 ? "MODEL_AUTH_ERROR" : "MODEL_RATE_LIMITED",
        );
        expect(result.body).toContain("DeepSeek");
        expect(result.body).not.toMatch(
          /private upstream|test-private-deepseek/,
        );
      } finally {
        await app.close();
      }
    },
  );
  it("rejects invented candidate IDs from DeepSeek", async () => {
    const app = buildApp({
      resources,
      readingAssistant: {
        provider: "deepseek",
        apiKey: "test-private-deepseek",
        fetcher: async () =>
          response({
            suggestions: [
              {
                tokenId: "l1c1",
                candidateId: "invented",
                pronunciation: null,
                reason: "受控测试",
              },
            ],
          }),
      },
    });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/v1/reading-suggestions",
        payload: input,
      });
      expect(result.statusCode).toBe(502);
      expect(result.json().error.code).toBe("MODEL_INVALID_RESPONSE");
    } finally {
      await app.close();
    }
  });
});
