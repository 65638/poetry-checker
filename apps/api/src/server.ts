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
import {
  loadResources,
  lookupCharactersByBook,
  type Resources,
} from "./resources.js";
import { toLexiconErrorResponse } from "./lexicon-errors.js";
import { analyze } from "./orchestrator.js";

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
      message: `${what}；资源或审核尚未就绪，详见 apps/api/README.md`,
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

function mapModuleErrorForServer(
  error: unknown,
): { status: number; body: unknown } | null {
  const mapped = toLexiconErrorResponse(error);
  return mapped === null ? null : { status: mapped.status, body: mapped.body };
}

export function buildApp(options?: { resources?: Resources }): FastifyInstance {
  const app = Fastify({ logger: false });
  // 真实编排默认启用；POETRY_DEV_MOCK=1 时显式回退 fixture mock（开发联调专用）
  const devMock = process.env.POETRY_DEV_MOCK === "1";
  const resources: Resources = options?.resources ?? loadResources();
  const realReady = resources.ready;

  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_req, reply) => {
    // Diagnostics live in headers so contract-v1's strict 503 ErrorResponse stays valid.
    const versions = devMock
      ? fixtureVersions
      : {
          data: Object.values(resources.snapshots)
            .map((x) => `${x.book}=${x.dataVersion}`)
            .join(","),
          rules: "teaching-v1+reviewed-works-v1",
          context:
            resources.contextRules.length > 0
              ? `context-rules:${resources.contextRules.length}`
              : "none-loaded",
          works:
            resources.works.length > 0
              ? `works:${resources.works.length}`
              : "none-loaded",
        };
    reply.header("X-Poetry-Mode", devMock ? "mock" : "real");
    reply.header(
      "X-Poetry-Versions",
      encodeURIComponent(JSON.stringify(versions)),
    );
    if (devMock) {
      return { status: "ready", versions };
    }
    if (!realReady) {
      return reply
        .status(503)
        .send(dataNotReady(resources.notReadyReasons.join("；")));
    }
    return {
      status: "ready",
      versions,
    };
  });

  app.get("/api/v1/rhyme-books", async () => {
    if (!devMock) {
      return RhymeBooksResponseSchema.parse({
        books: (["pingshui", "cilin", "xinyun"] as const).map((id) => {
          const snap = resources.snapshots[id];
          return {
            id,
            name:
              id === "pingshui"
                ? "平水韵"
                : id === "cilin"
                  ? "词林正韵"
                  : "中华新韵",
            dataVersion: snap?.dataVersion ?? "not-loaded",
            groupCount: snap?.mainGroups ?? 0,
            coverageNotice:
              snap === undefined
                ? "未装载：manifest 缺失或文件不可读"
                : `${snap.reviewStatus === "approved" ? "已审核" : "未审核（开发联调口径）"}：主部 ${snap.mainGroups}` +
                  (snap.subGroups !== snap.mainGroups
                    ? `／声类子卷 ${snap.subGroups}`
                    : ""),
          };
        }),
      });
    }
    return RhymeBooksResponseSchema.parse({
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
    });
  });

  app.get("/api/v1/characters/:char", async (request, reply) => {
    if (devMock) return reply.status(503).send(dataNotReady("单字查询"));
    const { char } = request.params as { char: string };
    if ([...char].length !== 1) {
      return reply
        .status(422)
        .send(errorBody("VALIDATION_ERROR", "路径参数必须是单个 Unicode 码点"));
    }
    const book = (request.query as { book?: string }).book;
    if (book !== "pingshui" && book !== "cilin" && book !== "xinyun") {
      return reply
        .status(422)
        .send(errorBody("VALIDATION_ERROR", "book 参数必须是三韵书之一"));
    }
    const dataVersion = resources.snapshots[book]?.dataVersion;
    if (dataVersion === undefined) {
      return reply.status(503).send(dataNotReady(`韵书 ${book} 无已装载版本`));
    }
    try {
      const lookup = await lookupCharactersByBook(char, book, dataVersion);
      return reply.send(lookup);
    } catch (error) {
      const mapped = mapModuleErrorForServer(error);
      if (mapped !== null) return reply.status(mapped.status).send(mapped.body);
      return reply.status(500).send(errorBody("INTERNAL_ERROR", "查询失败"));
    }
  });

  app.get("/api/v1/rules/:ruleId", async (request, reply) => {
    if (devMock) return reply.status(503).send(dataNotReady("规则卡查询"));
    if (resources.ruleCards.length === 0) {
      return reply
        .status(503)
        .send(
          dataNotReady(
            "规则卡库未装载（C 的 rules/cards/teaching-v1.json 未发布）",
          ),
        );
    }
    const { ruleId } = request.params as { ruleId: string };
    const rule = resources.ruleCards.find((r) => r.id === ruleId);
    if (rule === undefined)
      return reply
        .status(404)
        .send(errorBody("NOT_FOUND", `已装载规则目录中不存在 ${ruleId}`));
    // 证据=规则卡 evidenceIds ∪ 该规则的已审特例审批证据（如 TAIL.SANPING
    // 的 ctx:j03b2:08，13_ 第二批第 8 条），详情页可一并追溯。
    const evIds = new Set(rule.evidenceIds);
    for (const ex of resources.reviewedWorkExceptions) {
      if (ex.ruleId === ruleId && ex.reviewStatus === "approved") {
        evIds.add(ex.approval.evidenceId);
      }
    }
    return reply.send({
      rule,
      evidence: resources.evidenceRegistry.filter((e) => evIds.has(e.id)),
      sources: resources.sourceRegistry,
    });
  });

  app.get("/api/v1/sources/:sourceId", async (request, reply) => {
    if (devMock) return reply.status(503).send(dataNotReady("来源查询"));
    const { sourceId } = request.params as { sourceId: string };
    const known = resources.sourceRegistry.some((x) => x.id === sourceId);
    if (!known) {
      return reply
        .status(404)
        .send(errorBody("NOT_FOUND", `已加载资源中不存在来源 ${sourceId}`));
    }
    return reply
      .status(503)
      .send(
        dataNotReady(`来源 ${sourceId} 的装载明细待 A 发布含证据快照后提供`),
      );
  });

  app.post("/api/v1/analyze", async (request, reply) => {
    if (!devMock) {
      const parsedReq = AnalyzeRequestSchema.safeParse(request.body);
      if (!parsedReq.success) {
        return reply.status(422).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "请求不符合公共契约 AnalyzeRequest",
            fieldErrors: parsedReq.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        });
      }
      const result = await analyze(parsedReq.data, resources);
      if (result.kind === "error")
        return reply.status(result.status).send(result.body);
      return reply.send(result.response);
    }
    const raw = request.body;
    if (typeof raw === "object" && raw !== null && "text" in raw) {
      const text = (raw as { text?: unknown }).text;
      if (typeof text === "string") {
        if ([...text].length > 2000) {
          return reply
            .status(413)
            .send(
              errorBody(
                "PAYLOAD_TOO_LARGE",
                "正文超过 2,000 个 Unicode 码点上限",
              ),
            );
        }
        if (text.split("\n").length > 100) {
          return reply
            .status(413)
            .send(errorBody("PAYLOAD_TOO_LARGE", "诗句超过 100 行上限"));
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
    const inputHash = createHash("sha256")
      .update(body.text, "utf8")
      .digest("hex");
    const toneBasis =
      body.rhymeBook === "xinyun" ? "mandarin_base" : "historical";
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
        .send(
          errorBody("INTERNAL_ERROR", "mock 响应未通过 AnalysisResponse 校验"),
        );
    }
    return reply.send(checked.data);
  });

  app.setErrorHandler((error, _request, reply) => {
    const status =
      typeof error.statusCode === "number" ? error.statusCode : 500;
    if (status >= 500) {
      reply
        .status(500)
        .send(errorBody("INTERNAL_ERROR", "服务内部错误，详情见服务端日志"));
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
  console.log(
    "[poetry-api] analyze 返回契约 fixture；characters/rules/sources 返回 503（数据未就绪）",
  );
}
