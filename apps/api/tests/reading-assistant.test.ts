import { describe, expect, it, vi } from "vitest";
import { ReadingSuggestionResponseSchema } from "@poetry/contracts";
import { buildApp } from "../src/server.js";
import { loadResources } from "../src/resources.js";
import {
  DEEPSEEK_ENDPOINT,
  GLM_ENDPOINT,
  createReadingAssistant,
  type ReadingAssistantOptions,
} from "../src/reading-assistant.js";

const resources = loadResources();
const input = {
  text: "更上一层楼。",
  rhymeBook: "pingshui",
  targetTokenIds: ["l1c1"],
};
const candidateId = "pingshui:更:qu:二十四敬";
const choice = {
  tokenId: "l1c1",
  candidateId,
  pronunciation: "gèng",
  reason: "这里是进一步的意思。",
};
const modelResponse = (suggestions: unknown = [choice]) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify({ suggestions }) },
        },
      ],
    }),
    { status: 200 },
  );
async function withApp(
  options: ReadingAssistantOptions,
  run: (app: ReturnType<typeof buildApp>) => Promise<void>,
) {
  const app = buildApp({
    resources,
    readingAssistant: { apiKey: "test-only-key", ...options },
  });
  try {
    await run(app);
  } finally {
    await app.close();
  }
}
const post = (app: ReturnType<typeof buildApp>, payload = input) =>
  app.inject({ method: "POST", url: "/api/v1/reading-suggestions", payload });

describe("GLM reading suggestions preserve candidate and approval boundaries", () => {
  it("uses the longer DeepSeek defaults while preserving explicit test windows", () => {
    const deepseek = createReadingAssistant(resources, {
      provider: "deepseek",
      apiKey: "test-only-key",
    });
    expect(deepseek.analysisTimeoutMs).toBe(90_000);

    const overridden = createReadingAssistant(resources, {
      provider: "deepseek",
      apiKey: "test-only-key",
      timeoutMs: 40,
      analysisTimeoutMs: 25,
    });
    expect(overridden.analysisTimeoutMs).toBe(25);
    expect(DEEPSEEK_ENDPOINT).toBe("https://api.deepseek.com/chat/completions");
  });
  it("supplies independent exact-glyph reading clues for otherwise empty historical candidates", async () => {
    await withApp(
      {
        fetcher: async (_url, init) => {
          const data = JSON.parse(
            JSON.parse(init!.body as string).messages[1].content,
          );
          const target = data.targets[0];
          expect(target.character).toBe("不");
          const entering = target.candidates.find(
            (c: { id: string }) => c.id === "pingshui:不:ru:入声五物",
          );
          const level = target.candidates.find(
            (c: { id: string }) => c.id === "pingshui:不:ping:十一尤",
          );
          expect(entering.modernReading).toBeNull();
          expect(entering.referenceReadings).toContainEqual(
            expect.objectContaining({
              pronunciation: "bù",
              fanqie: "分勿切",
              tone: "入",
            }),
          );
          expect(level.referenceReadings).toContainEqual(
            expect.objectContaining({ pronunciation: "fōu", tone: "平" }),
          );
          return modelResponse([
            {
              ...choice,
              tokenId: "l1c1",
              candidateId: entering.id,
              pronunciation: "bù",
            },
          ]);
        },
      },
      async (app) => {
        const response = await post(app, {
          ...input,
          text: "不能食",
          targetTokenIds: ["l1c1"],
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().suggestions[0].candidate.tone).toBe("Z");
        expect(
          response.json().suggestions[0].candidate.modernReading,
        ).toBeNull();
      },
    );
  });
  const yuId = "xinyun:余:yangping:十二齐·阳平:yu2";
  const xuId = "xinyun:余:yangping:十二齐·阳平";
  const yuInput = {
    text: "空余",
    rhymeBook: "xinyun",
    targetTokenIds: ["l1c2"],
  };
  it.each(["yú", "yu2", "yu", "YÚ", "yu\u0301"])(
    "preserves the valid reading %s with the distinct yu2 candidate",
    async (pronunciation) => {
      await withApp(
        {
          fetcher: async () =>
            modelResponse([
              { ...choice, tokenId: "l1c2", candidateId: yuId, pronunciation },
            ]),
        },
        async (app) => {
          const response = await post(app, yuInput);
          expect(response.statusCode).toBe(200);
          expect(response.json().suggestions[0]).toMatchObject({
            candidateId: yuId,
            pronunciation,
            candidate: { modernReading: { pinyin: "yu", toneNumber: 2 } },
          });
        },
      );
    },
  );
  it.each([
    { candidateId: xuId, pronunciation: "yú" },
    { candidateId: yuId, pronunciation: "xú" },
    { candidateId: yuId, pronunciation: "yù" },
    { candidateId: yuId, pronunciation: "tu2" },
    { candidateId: yuId, pronunciation: "cannot determine" },
  ])(
    "does not silently overwrite a mismatched pronunciation %#",
    async (row) => {
      await withApp(
        {
          fetcher: async () =>
            modelResponse([{ ...choice, tokenId: "l1c2", ...row }]),
        },
        async (app) => {
          const response = await post(app, yuInput);
          expect(response.statusCode).toBe(200);
          expect(response.json().suggestions[0]).toMatchObject({
            candidateId: null,
            pronunciation: null,
            candidate: null,
            reason: expect.stringContaining("不一致"),
          });
        },
      );
    },
  );
  it("keeps valid positions usable beside a mismatched one", async () => {
    await withApp(
      {
        fetcher: async () =>
          modelResponse([
            {
              ...choice,
              tokenId: "l1c1",
              candidateId: xuId,
              pronunciation: "yú",
            },
            {
              ...choice,
              tokenId: "l1c2",
              candidateId: yuId,
              pronunciation: null,
            },
          ]),
      },
      async (app) => {
        const response = await post(app, {
          text: "余余",
          rhymeBook: "xinyun",
          targetTokenIds: ["l1c1", "l1c2"],
        });
        expect(response.statusCode).toBe(200);
        expect(
          response
            .json()
            .suggestions.map(
              (s: { candidateId: string | null }) => s.candidateId,
            ),
        ).toEqual([null, yuId]);
        expect(response.json().suggestions[1].pronunciation).toBe("yu2");
      },
    );
  });
  it("exposes only configuration metadata and never calls upstream without a key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await withApp({ apiKey: "", fetcher }, async (app) => {
      expect(
        (await app.inject("/api/v1/reading-suggestions/status")).json(),
      ).toEqual({
        configured: false,
        provider: "zhipu",
        model: "glm-5.3-flash",
      });
      expect((await post(app)).json().error.code).toBe("MODEL_NOT_CONFIGURED");
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
  it("uses server candidates, official endpoint, thinking enabled, and leaves original analysis untouched", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => modelResponse());
    const before = JSON.stringify(resources.evidenceRegistry);
    await withApp({ fetcher }, async (app) => {
      const response = await post(app);
      expect(response.statusCode).toBe(200);
      const result = ReadingSuggestionResponseSchema.parse(response.json());
      expect(result.suggestions[0]?.candidate?.id).toBe(candidateId);
      expect(result.suggestions[0]?.pronunciation).toBe("gèng");
      const [url, init] = fetcher.mock.calls[0]!;
      expect(url).toBe(GLM_ENDPOINT);
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer test-only-key",
      });
      const request = JSON.parse(init!.body as string);
      expect(request.model).toBe("glm-5.3-flash");
      expect(request.thinking).toEqual({ type: "enabled" });
      expect(request.reasoning_effort).toBe("low");
      expect(
        JSON.parse(request.messages[1].content).targets[0].candidates.map(
          (candidate: { id: string }) => candidate.id,
        ),
      ).toContain(candidateId);
      expect(response.body).not.toContain("test-only-key");
      expect(JSON.stringify(resources.evidenceRegistry)).toBe(before);
      expect((await app.inject("/readyz")).statusCode).toBe(200);
    });
  });
  it.each([
    { rows: [{ ...choice, candidateId: "xinyun:更:fake" }] },
    { rows: [{ ...choice, tokenId: "l9c9" }] },
    { rows: [{ ...choice, candidateId: "pingshui:白:ru:十一陌" }] },
    { rows: [choice, { ...choice, pronunciation: "gēng" }] },
    { rows: [choice, { ...choice, candidateId: null, pronunciation: null }] },
    { rows: [] },
    { rows: [{ ...choice, candidateId: null }] },
  ])(
    "rejects foreign, fabricated, conflicting, missing or inconsistent choices %#",
    async ({ rows }) => {
      await withApp(
        { fetcher: async () => modelResponse(rows) },
        async (app) => {
          const response = await post(app);
          expect(response.statusCode).toBe(502);
          expect(response.json().error.code).toBe("MODEL_INVALID_RESPONSE");
        },
      );
    },
  );
  it("collapses identical repeated decisions even when their reasons differ", async () => {
    await withApp(
      {
        fetcher: async () =>
          modelResponse([choice, { ...choice, reason: "更进一步之义。" }]),
      },
      async (app) => {
        const response = await post(app);
        expect(response.statusCode).toBe(200);
        expect(response.json().suggestions).toHaveLength(1);
        expect(response.json().suggestions[0]).toMatchObject(choice);
      },
    );
  });
  it("keeps valid decisions in a 24-position batch when one position is omitted", async () => {
    let omitLast = false;
    await withApp(
      {
        fetcher: async (_url, init) => {
          const targets = JSON.parse(
            JSON.parse(init!.body as string).messages[1].content,
          ).targets as Array<{ tokenId: string }>;
          const rows = targets.map(({ tokenId }) => ({ ...choice, tokenId }));
          if (omitLast) rows.pop();
          return modelResponse([...rows, { ...rows[9]!, reason: "同上。" }]);
        },
      },
      async (app) => {
        const payload = {
          ...input,
          text: "更".repeat(24),
          targetTokenIds: [] as string[],
        };
        payload.targetTokenIds = Array.from(
          { length: 24 },
          (_, i) => `l1c${i + 1}`,
        );
        const response = await post(app, payload);
        expect(response.statusCode).toBe(200);
        expect(response.json().suggestions).toHaveLength(24);
        omitLast = true;
        const partial = await post(app, payload);
        expect(partial.statusCode).toBe(200);
        expect(partial.json().suggestions).toHaveLength(23);
        expect(
          partial
            .json()
            .suggestions.some(
              (row: { tokenId: string }) => row.tokenId === "l1c24",
            ),
        ).toBe(false);
        expect(partial.json().notice).toContain("AI漏回1个字位");
        expect(partial.json().missingTokenIds).toEqual([]);
      },
    );
  });
  it("allows explicit uncertainty instead of inventing a reading", async () => {
    await withApp(
      {
        fetcher: async () =>
          modelResponse([
            { ...choice, candidateId: null, pronunciation: null },
          ]),
      },
      async (app) => {
        const response = await post(app);
        expect(response.statusCode).toBe(200);
        expect(response.json().suggestions[0]).toMatchObject({
          candidateId: null,
          pronunciation: null,
          candidate: null,
          evidenceApproved: false,
        });
      },
    );
  });
  it("rejects stale/duplicate target IDs and unsupported input before making a paid request", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => modelResponse());
    await withApp({ fetcher }, async (app) => {
      for (const payload of [
        { ...input, targetTokenIds: ["l99c99"] },
        { ...input, targetTokenIds: ["l1c1", "l1c1"] },
        { ...input, text: "abc" },
        { ...input, text: "更".repeat(2001) },
      ]) {
        expect((await post(app, payload)).statusCode).toBe(422);
      }
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
  it("does not call the model for missing characters and retains their token IDs", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await withApp({ fetcher }, async (app) => {
      const response = await post(app, { ...input, text: "𠀀" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        suggestions: [],
        missingTokenIds: ["l1c1"],
      });
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
  it("caps ambiguous positions at 24 and returns a readable truncation marker", async () => {
    const fetcher: typeof fetch = async (_url, init) => {
      const targets = JSON.parse(
        JSON.parse(init!.body as string).messages[1].content,
      ).targets as Array<{ tokenId: string }>;
      expect(targets).toHaveLength(24);
      return modelResponse(
        targets.map(({ tokenId }) => ({ ...choice, tokenId })),
      );
    };
    await withApp({ fetcher }, async (app) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reading-suggestions",
        payload: { text: "更".repeat(25), rhymeBook: "pingshui" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().truncated).toBe(true);
      expect(response.json().suggestions).toHaveLength(24);
    });
  });
  it.each([401, 429, 500])(
    "sanitizes upstream HTTP %i without echoing its body or credentials",
    async (status) => {
      await withApp(
        {
          fetcher: async () =>
            new Response("private provider error test-only-key", { status }),
        },
        async (app) => {
          const response = await post(app);
          expect(response.statusCode).toBe(
            status === 401 ? 503 : status === 429 ? 429 : 502,
          );
          expect(response.body).not.toMatch(
            /private provider error|test-only-key/,
          );
        },
      );
    },
  );
  it("recovers from a temporary provider outage and returns a validated reading result", async () => {
    let calls = 0;
    await withApp(
      {
        fetcher: async () =>
          ++calls === 1
            ? new Response("private temporary failure", {
                status: 503,
                headers: { "Retry-After": "0" },
              })
            : modelResponse(),
      },
      async (app) => {
        const response = await post(app);
        expect(response.statusCode).toBe(200);
        expect(
          ReadingSuggestionResponseSchema.parse(response.json()).suggestions[0]
            ?.candidateId,
        ).toBe(candidateId);
        expect(calls).toBe(2);
        expect(response.body).not.toContain("private temporary failure");
      },
    );
  });
  it("aborts slow inference and recovers on the next call", async () => {
    let count = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      if (++count > 1) return modelResponse();
      return new Promise((_resolve, reject) =>
        init!.signal!.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        ),
      );
    };
    await withApp({ fetcher, timeoutMs: 40 }, async (app) => {
      expect((await post(app)).statusCode).toBe(504);
      expect((await post(app)).statusCode).toBe(200);
    });
  });
  it("does not impose the former ten-per-minute spend cap", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => modelResponse());
    await withApp({ fetcher }, async (app) => {
      for (let i = 0; i < 10; i++)
        expect((await post(app)).statusCode).toBe(200);
      expect((await post(app)).statusCode).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(11);
    });
  });
});
