import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  PoetryAssistantRequestSchema,
  PoetryAssistantResponseSchema,
  RhymeWordsResponseSchema,
} from "@poetry/contracts";
import { buildApp } from "../src/server.js";
import { loadResources } from "../src/resources.js";

const resources = loadResources();
const edit = {
  startTokenId: "l1c4",
  endTokenId: "l1c4",
  original: "远",
  replacement: "长",
  reason: "强调水路绵延。",
  tradeoff: "弱化了距离感。",
};
const critique = {
  task: "critique",
  text: "山高水远。",
  rhymeBook: "pingshui",
  direction: "meaning",
  mode: "writing",
};
const result = {
  overview: "山水构成空间层次。",
  strengths: ["四字简洁。"],
  revisions: [edit],
};
const poem = {
  id: "real-poem",
  title: "静夜思",
  author: "李白",
  dynasty: "唐",
  paragraphs: ["床前明月光，疑是地上霜。", "举头望明月，低头思故乡。"],
  source: "测试请求中的作品",
  sourceUrl: null,
  tags: [],
};
const model = (output: unknown) =>
  new Response(
    JSON.stringify({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(output) } },
      ],
    }),
  );
async function withApp(
  output: unknown,
  run: (
    app: ReturnType<typeof buildApp>,
    fetcher: ReturnType<typeof vi.fn<typeof fetch>>,
  ) => Promise<void>,
  apiKey = "test-only-key",
) {
  const fetcher = vi.fn<typeof fetch>(async () => model(output));
  const app = buildApp({ resources, readingAssistant: { apiKey, fetcher } });
  try {
    await run(app, fetcher);
  } finally {
    await app.close();
  }
}
const post = (
  app: ReturnType<typeof buildApp>,
  payload: Record<string, unknown>,
  path = "poetry-assistant",
) => app.inject({ method: "POST", url: `/api/v1/${path}`, payload });
describe("poetry studio with real lexicon and controlled model", () => {
  it("binds whole-poem revisions to exact token spans and input hash", async () => {
    await withApp(result, async (app, fetcher) => {
      const response = await post(app, critique);
      expect(response.statusCode).toBe(200);
      const body = PoetryAssistantResponseSchema.parse(response.json());
      expect(body.inputHash).toBe(
        createHash("sha256")
          .update(JSON.stringify(PoetryAssistantRequestSchema.parse(critique)))
          .digest("hex"),
      );
      expect(body).toMatchObject({ task: "critique", result });
      const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
      expect(JSON.parse(request.messages[1].content).text).toBe(critique.text);
      expect(JSON.parse(request.messages[1].content).tokens).toHaveLength(4);
      expect(response.body).not.toContain("test-only-key");
    });
  });
  it("passes formal prosody findings to the model instead of asking it to recount them", async () => {
    const prosodyContext = {
      format: "七言八句；起式平起；首句用韵不入韵",
      templateId: "qilv-ping-unrhymed",
      issues: [
        {
          ruleId: "METER.POSITION",
          status: "fail" as const,
          locations: [{ tokenId: "l5c2", line: 5, column: 2, text: "十" }],
          message: "此字平仄与允许集合不符",
        },
        {
          ruleId: "RELATION.NIAN",
          status: "fail" as const,
          locations: [{ tokenId: "l6c2", line: 6, column: 2, text: "更" }],
          message: "失粘；由同字位平仄偏离造成的派生关系问题",
        },
      ],
    };
    await withApp(result, async (app, fetcher) => {
      const response = await post(app, { ...critique, prosodyContext });
      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
      expect(JSON.parse(payload.messages[1].content).prosodyContext).toEqual(
        prosodyContext,
      );
      expect(payload.messages[0].content).toContain("派生影响");
    });
  });
  it.each([
    { ...edit, original: "近" },
    { ...edit, startTokenId: "l9c9" },
    { ...edit, replacement: "长。" },
    {
      ...edit,
      startTokenId: "l1c1",
      endTokenId: "l2c1",
      original: "山高水远。月",
    },
  ])("rejects fabricated spans or punctuation changes %#", async (revision) => {
    await withApp({ ...result, revisions: [revision] }, async (app) => {
      expect(
        (await post(app, { ...critique, text: "山高水远。月明。" })).statusCode,
      ).toBe(502);
    });
  });
  it("keeps original poetry untouched in reading mode", async () => {
    await withApp(result, async (app) =>
      expect(
        (await post(app, { ...critique, mode: "reading" })).statusCode,
      ).toBe(502),
    );
    await withApp({ ...result, revisions: [] }, async (app) =>
      expect(
        (await post(app, { ...critique, mode: "reading" })).statusCode,
      ).toBe(200),
    );
  });
  it("accepts only supplied works and verbatim quotes from the matching work", async () => {
    const input = { task: "search", query: "思乡", poems: [poem] };
    for (const [row, status] of [
      [{ id: poem.id, quote: "低头思故乡", reason: "以月寄乡思。" }, 200],
      [{ id: "invented", quote: "低头思故乡", reason: "test" }, 502],
      [{ id: poem.id, quote: "江上孤舟夜雨声", reason: "test" }, 502],
    ] as const)
      await withApp({ matches: [row] }, async (app) =>
        expect((await post(app, input)).statusCode).toBe(status),
      );
  });
  it("rejects duplicate result IDs and invalid input before calling upstream", async () => {
    const row = { id: poem.id, quote: "低头思故乡", reason: "乡思。" };
    await withApp({ matches: [row, row] }, async (app) =>
      expect(
        (await post(app, { task: "search", query: "思乡", poems: [poem] }))
          .statusCode,
      ).toBe(502),
    );
    await withApp({}, async (app, fetcher) => {
      expect(
        (await post(app, { ...critique, text: "诗".repeat(2001) })).statusCode,
      ).toBe(422);
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
  it("compares exactly the two supplied poems", async () => {
    await withApp(
      {
        overview: "两诗皆写月。",
        aspects: [{ name: "意象", left: "月映山。", right: "月照水。" }],
      },
      async (app, fetcher) => {
        const response = await post(app, {
          task: "compare",
          left: "月映山。",
          right: "月照水。",
        });
        expect(response.statusCode).toBe(200);
        expect(
          JSON.parse(
            JSON.parse(fetcher.mock.calls[0]![1]!.body as string).messages[1]
              .content,
          ),
        ).toMatchObject({
          task: "compare",
          left: "月映山。",
          right: "月照水。",
          contextReferences: {
            left: { readings: [], versions: [] },
            right: { readings: [], versions: [] },
          },
        });
      },
    );
  });
  it("returns source-backed same-group peers and stable disjoint pages without a model key", async () => {
    await withApp(
      {},
      async (app, fetcher) => {
        const seed = (
          await app.inject("/api/v1/characters/流?book=pingshui")
        ).json().entries[0].candidates[0];
        const input = { rhymeBook: "pingshui", readingId: seed.id, limit: 5 };
        const a = RhymeWordsResponseSchema.parse(
          (await post(app, { ...input, offset: 0 }, "rhyme-words")).json(),
        );
        const b = RhymeWordsResponseSchema.parse(
          (await post(app, { ...input, offset: 5 }, "rhyme-words")).json(),
        );
        expect(a.total).toBeGreaterThan(10);
        expect(a.lookup.entries).toHaveLength(5);
        expect(
          a.lookup.entries.every(
            (e) =>
              e.character !== "流" &&
              e.candidates.every((c) =>
                c.groupIds.some((id) => seed.groupIds.includes(id)),
              ),
          ),
        ).toBe(true);
        expect(
          a.lookup.entries.some((e) =>
            b.lookup.entries.some((other) => other.character === e.character),
          ),
        ).toBe(false);
        expect(
          (await post(app, { ...input, rhymeBook: "xinyun" }, "rhyme-words"))
            .statusCode,
        ).toBe(422);
        expect(fetcher).not.toHaveBeenCalled();
      },
      "",
    );
  });
  it("validates semantic rhyme candidates against the real book and selected group", async () => {
    await withApp({ matches: [] }, async (app, fetcher) => {
      const seed = (
        await app.inject("/api/v1/characters/流?book=pingshui")
      ).json().entries[0].candidates[0];
      const peers = (
        await post(
          app,
          { rhymeBook: "pingshui", readingId: seed.id, limit: 3 },
          "rhyme-words",
        )
      ).json();
      const input = {
        task: "rhyme",
        text: "江水流。山水流。",
        rhymeBook: "pingshui",
        targetTokenId: "l2c3",
        readingId: seed.id,
        candidateIds: peers.lookup.entries.flatMap(
          (e: { candidates: { id: string }[] }) =>
            e.candidates.map((c) => c.id),
        ),
      };
      expect((await post(app, input)).statusCode).toBe(200);
      expect(
        JSON.parse(
          JSON.parse(fetcher.mock.calls[0]![1]!.body as string).messages[1]
            .content,
        ).targetToken,
      ).toEqual({ tokenId: "l2c3", text: "流", line: 2 });
      expect(
        (await post(app, { ...input, targetTokenId: "l1c1" })).statusCode,
      ).toBe(422);
      expect(
        (await post(app, { ...input, targetTokenId: "l9c9" })).statusCode,
      ).toBe(422);
      expect(
        (
          await post(app, {
            ...input,
            candidateIds: ["pingshui:山:ping:十五删"],
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (await post(app, { ...input, candidateIds: ["fabricated"] }))
          .statusCode,
      ).toBe(422);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });
  it("degrades explicitly when GLM is unconfigured", async () => {
    await withApp(
      {},
      async (app, fetcher) => {
        expect((await post(app, critique)).statusCode).toBe(503);
        expect(fetcher).not.toHaveBeenCalled();
      },
      "",
    );
  });
});
