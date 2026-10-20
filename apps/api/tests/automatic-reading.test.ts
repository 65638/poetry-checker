import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { AnalysisResponseSchema } from "@poetry/contracts";
import { buildApp } from "../src/server.js";
import { loadResources } from "../src/resources.js";
import type { ReadingAssistantOptions } from "../src/reading-assistant.js";

const resources = loadResources();
const payload = {
  text: "更上一层楼。",
  rhymeBook: "pingshui",
  genreHint: "auto",
  formHint: "auto",
  ruleSet: "teaching-v1",
  readingOverrides: [],
};
const modelResponse = (suggestions: unknown[]) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify({ suggestions }) },
        },
      ],
    }),
  );
const choose: typeof fetch = async (_url, init) => {
  const data = JSON.parse(
    JSON.parse(init!.body as string).messages[1].content,
  ) as {
    targets: Array<{
      tokenId: string;
      candidates: Array<{ id: string; toneClass: string }>;
    }>;
  };
  return modelResponse(
    data.targets.map((target) => ({
      tokenId: target.tokenId,
      candidateId: (target.candidates.find(
        (candidate) => candidate.toneClass === "qu",
      ) ?? target.candidates[0])!.id,
      pronunciation: "gèng",
      reason: "受控模型：按语义选择。",
    })),
  );
};
async function withApp(
  options: ReadingAssistantOptions,
  run: (app: ReturnType<typeof buildApp>) => Promise<void>,
) {
  const app = buildApp({
    resources,
    readingAssistant: { apiKey: "test-only-key", fetcher: choose, ...options },
  });
  try {
    await run(app);
  } finally {
    await app.close();
  }
}
const post = (
  app: ReturnType<typeof buildApp>,
  input: Record<string, unknown> = payload,
) => app.inject({ method: "POST", url: "/api/v1/analyze", payload: input });

describe("global automatic reference analysis", () => {
  it("automatically applies GLM choices without manufacturing user overrides or approving evidence", async () => {
    const before = JSON.stringify(resources);
    const fetcher = vi.fn<typeof fetch>(choose);
    await withApp({ fetcher }, async (app) => {
      const response = await post(app);
      expect(response.statusCode).toBe(200);
      const report = AnalysisResponseSchema.parse(response.json());
      expect(report.readingAssistant).toMatchObject({
        state: "applied",
        appliedTokenIds: ["l1c1", "l1c2"],
      });
      expect(report.poem.tokens[0]).toMatchObject({
        selectionMethod: "model",
        selectedReadingId: "pingshui:更:qu:二十四敬",
      });
      expect(report.poem.tokens[0]!.reason).toContain("GLM自动辨音");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(resources)).toBe(before);
      expect(
        report.provenance.evidence.some(
          (item) => item.reviewStatus === "unverified",
        ),
      ).toBe(true);
    });
  });
  it("analyzes all positions beyond the former 24-position UI cap", async () => {
    const fetcher = vi.fn<typeof fetch>(choose);
    await withApp({ fetcher }, async (app) => {
      const response = await post(app, { ...payload, text: "更".repeat(49) });
      expect(response.statusCode).toBe(200);
      expect(response.json().readingAssistant.state).toBe("applied");
      expect(response.json().readingAssistant.appliedTokenIds).toHaveLength(49);
      expect(fetcher).toHaveBeenCalledTimes(3);
    });
  });
  it("keeps explicit user corrections above automatic model choices", async () => {
    const fetcher = vi.fn<typeof fetch>(choose);
    await withApp({ fetcher }, async (app) => {
      const response = await post(app, {
        ...payload,
        text: "更",
        inputHash: createHash("sha256").update("更").digest("hex"),
        readingOverrides: [
          { tokenId: "l1c1", readingId: "pingshui:更:ping:八庚" },
        ],
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().poem.tokens[0].selectionMethod).toBe("user");
      expect(response.json().readingAssistant.state).toBe("not_needed");
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
  it.each(["pingshui", "cilin", "xinyun"])(
    "returns a real %s report without a Key or approval step",
    async (rhymeBook) => {
      const fetcher = vi.fn<typeof fetch>();
      await withApp({ apiKey: "", fetcher }, async (app) => {
        const response = await post(app, { ...payload, rhymeBook });
        expect(response.statusCode).toBe(200);
        const report = AnalysisResponseSchema.parse(response.json());
        expect(report.policy.notice).toContain("参考分析");
        expect(report.readingAssistant?.state).toBe("unavailable");
        expect(fetcher).not.toHaveBeenCalled();
      });
    },
  );
  it.each([401, 429, 500])(
    "falls back to real local analysis on upstream HTTP %i",
    async (status) => {
      await withApp(
        {
          fetcher: async () =>
            new Response("private failure test-only-key", { status }),
        },
        async (app) => {
          const response = await post(app);
          expect(response.statusCode).toBe(200);
          expect(response.json().readingAssistant.state).toBe("unavailable");
          expect(response.body).not.toContain("test-only-key");
          expect(
            response
              .json()
              .poem.tokens.some(
                (token: { selectionMethod: string }) =>
                  token.selectionMethod === "model",
              ),
          ).toBe(false);
        },
      );
    },
  );
  it("rejects a fabricated model choice and returns the original local interpretation", async () => {
    await withApp(
      {
        fetcher: async () =>
          modelResponse([
            {
              tokenId: "l1c1",
              candidateId: "fabricated",
              pronunciation: "gèng",
              reason: "test",
            },
          ]),
      },
      async (app) => {
        const response = await post(app, { ...payload, text: "更" });
        expect(response.statusCode).toBe(200);
        expect(response.json().readingAssistant.state).toBe("unavailable");
        expect(response.json().poem.tokens[0].selectionMethod).toBe(
          "unresolved",
        );
      },
    );
  });
  it("bounds the complete model phase and still returns a report after timeout", async () => {
    let aborted = false;
    await withApp(
      {
        analysisTimeoutMs: 25,
        fetcher: async (_url, init) =>
          new Promise((_resolve, reject) => {
            init!.signal!.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new Error("aborted"));
              },
              { once: true },
            );
          }),
      },
      async (app) => {
        const response = await post(app);
        expect(response.statusCode).toBe(200);
        expect(response.json().readingAssistant.state).toBe("unavailable");
        expect(aborted).toBe(true);
      },
    );
  });
  it("preserves completed batches when a later batch fails", async () => {
    let calls = 0;
    await withApp(
      {
        fetcher: async (...args) =>
          ++calls === 1
            ? choose(...args)
            : new Response("unavailable", { status: 500 }),
      },
      async (app) => {
        const response = await post(app, { ...payload, text: "更".repeat(25) });
        expect(response.statusCode).toBe(200);
        expect(response.json().readingAssistant).toMatchObject({
          state: "partial",
        });
        expect(response.json().readingAssistant.appliedTokenIds).toHaveLength(
          24,
        );
        expect(response.json().poem.tokens[24].selectionMethod).toBe(
          "unresolved",
        );
      },
    );
  });
});
