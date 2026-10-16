import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import {
  AnalyzeRequestSchema,
  AnalysisResponseSchema,
  type AnalysisResponse,
  RhymeBooksResponseSchema,
} from "@poetry/contracts";

const fixtureNames = [
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
] as const;
type FixtureName = (typeof fixtureNames)[number];

function loadFixture(name: FixtureName): AnalysisResponse {
  const raw = readFileSync(
    new URL(`../../../fixtures/contracts/${name}.json`, import.meta.url),
    "utf8",
  );
  return AnalysisResponseSchema.parse(JSON.parse(raw));
}

const fixtures = Object.fromEntries(
  fixtureNames.map((name) => [name, loadFixture(name)]),
) as Record<FixtureName, AnalysisResponse>;

const fixtureVersions = fixtures.needs_review.versions;

function dataNotReady(what: string) {
  return {
    error: {
      code: "DATA_NOT_READY",
      message: `${what}尚未接入真实数据；当前服务为 D1 开发 mock，详见 apps/api/README.md`,
      fieldErrors: [] as Array<{ path: string; message: string }>,
    },
  };
}

function errorBody(code: string, message: string) {
  return {
    error: {
      code,
      message,
      fieldErrors: [] as Array<{ path: string; message: string }>,
    },
  };
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async () => ({
    status: "ready",
    versions: fixtureVersions,
  }));

  app.get("/api/v1/rhyme-books", async () =>
    RhymeBooksResponseSchema.parse({
      books: [
        {
          id: "pingshui",
          name: "平水韵",
          dataVersion: "fixture-only",
          groupCount: 0,
          coverageNotice: "开发 mock：真实字表由队员 A 接入后提供韵部数量",
        },
        {
          id: "cilin",
          name: "词林正韵",
          dataVersion: "fixture-only",
          groupCount: 0,
          coverageNotice: "开发 mock：真实字表由队员 A 接入后提供韵部数量",
        },
        {
          id: "xinyun",
          name: "中华新韵",
          dataVersion: "fixture-only",
          groupCount: 0,
          coverageNotice: "开发 mock：真实字表由队员 A 接入后提供韵部数量",
        },
      ],
    }),
  );

  app.get("/api/v1/characters/:char", async (_request, reply) => {
    return reply.status(503).send(dataNotReady("单字查询"));
  });

  app.get("/api/v1/rules/:ruleId", async (_request, reply) => {
    return reply.status(503).send(dataNotReady("规则卡查询"));
  });

  app.get("/api/v1/sources/:sourceId", async (_request, reply) => {
    return reply.status(503).send(dataNotReady("来源查询"));
  });

  app.post("/api/v1/analyze", async (request, reply) => {
    const raw = request.body;
    if (typeof raw === "object" && raw !== null && "text" in raw) {
      const text = (raw as { text?: unknown }).text;
      if (typeof text === "string") {
        if ([...text].length > 2000) {
          return reply.status(413).send(errorBody("PAYLOAD_TOO_LARGE", "正文超过 2,000 个 Unicode 码点上限"));
        }
        if (text.split("\n").length > 100) {
          return reply.status(413).send(errorBody("PAYLOAD_TOO_LARGE", "诗句超过 100 行上限"));
        }
      }
    }

    const parsed = AnalyzeRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return reply.status(422).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求不符合公共契约 AnalyzeRequest",
          fieldErrors: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }
    const body = parsed.data;

    let name: FixtureName = "needs_review";
    for (const candidate of fixtureNames) {
      if (fixtures[candidate].poem.originalText === body.text) {
        name = candidate;
        break;
      }
    }
    const fixture = fixtures[name];
    const inputHash = createHash("sha256").update(body.text, "utf8").digest("hex");
    const toneBasis = body.rhymeBook === "xinyun" ? "mandarin_base" : "historical";
    const response: AnalysisResponse = {
      ...fixture,
      inputHash,
      policy: { ...fixture.policy, rhymeBook: body.rhymeBook, toneBasis },
      poem: { ...fixture.poem, book: body.rhymeBook, inputHash },
    };

    const checked = AnalysisResponseSchema.safeParse(response);
    if (!checked.success) {
      return reply
        .status(500)
        .send(errorBody("INTERNAL_ERROR", "mock 响应未通过 AnalysisResponse 校验"));
    }
    return reply.send(checked.data);
  });

  app.setErrorHandler((error, _request, reply) => {
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (status >= 500) {
      reply.status(500).send(errorBody("INTERNAL_ERROR", "服务内部错误，详情见服务端日志"));
      app.log.error(error);
      return;
    }
    reply.status(status).send({
      error: {
        code: "BAD_REQUEST",
        message: error.message,
        fieldErrors: [],
      },
    });
  });

  return app;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const port = Number(process.env.PORT ?? 3000);
  const app = buildApp();
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`[poetry-api] D1 开发 mock 已启动: http://127.0.0.1:${port}`);
  console.log("[poetry-api] analyze 返回契约 fixture；characters/rules/sources 返回 503（数据未就绪）");
}
