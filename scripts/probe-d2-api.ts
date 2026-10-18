/** 真实资源探针：三首 503 也记录；--require-golden 对未完成验收返回非零。 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  AnalysisResponseSchema,
  AnalyzeRequestSchema,
} from "@poetry/contracts";
import { buildApp } from "../apps/api/src/server.js";
import { loadResources } from "../apps/api/src/resources.js";

delete process.env.POETRY_DEV_MOCK;
const root = fileURLToPath(new URL("..", import.meta.url));
const app = buildApp();
const resources = loadResources();
const cases = ["dengguanquelou", "jingyesi", "huanghelou"];
const results = [];
try {
  for (const name of cases) {
    const golden = JSON.parse(
      readFileSync(join(root, `tests/golden/cases/${name}.json`), "utf8"),
    ) as {
      title: string;
      text: string;
      request: Record<string, unknown>;
      assertions: Array<{ path: string; equals: unknown }>;
    };
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: AnalyzeRequestSchema.parse({
        ...golden.request,
        text: golden.text,
      }),
    });
    const body: unknown = response.json();
    const parsed = AnalysisResponseSchema.safeParse(body);
    const assertions = golden.assertions.map((assertion) => {
      let actual: unknown = parsed.success ? parsed.data : undefined;
      for (const key of assertion.path.split("."))
        actual =
          actual !== null && typeof actual === "object"
            ? (actual as Record<string, unknown>)[key]
            : undefined;
      return {
        ...assertion,
        actual: actual ?? null,
        pass: JSON.stringify(actual) === JSON.stringify(assertion.equals),
      };
    });
    results.push({
      title: golden.title,
      http: response.statusCode,
      schemaValid: parsed.success,
      assertions,
      body,
    });
  }
  // 使用真正已审的字形走完接口；这是接线输入，不是名篇金标准。
  const smoke = await app.inject({
    method: "POST",
    url: "/api/v1/analyze",
    payload: {
      text: "白一更流楼雪物",
      rhymeBook: "pingshui",
      genreHint: "auto",
      formHint: "auto",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    },
  });
  const ready = await app.inject({ method: "GET", url: "/readyz" });
  const report = {
    mode: "real-no-fixture",
    dataVersions: resources.snapshots,
    loadErrors: resources.loadErrors,
    goldenPassed: results.filter(
      (item) =>
        item.http === 200 &&
        item.schemaValid &&
        item.assertions.every((assertion) => assertion.pass),
    ).length,
    goldenTotal: results.length,
    readiness: { http: ready.statusCode, body: ready.json() },
    approvedCharactersSmoke: {
      purpose: "真实已审字形接线输入，不是名篇验收",
      http: smoke.statusCode,
      body: smoke.json(),
    },
    results,
  };
  writeFileSync(
    join(root, "data/reviews/d2-real-api-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        loadErrors: report.loadErrors,
        goldenPassed: report.goldenPassed,
        goldenTotal: report.goldenTotal,
        readiness: ready.statusCode,
        approvedCharactersSmoke: smoke.statusCode,
        results: results.map((item) => ({
          title: item.title,
          http: item.http,
        })),
      },
      null,
      2,
    ),
  );
  if (
    smoke.statusCode !== 200 ||
    !AnalysisResponseSchema.safeParse(smoke.json()).success ||
    resources.loadErrors.length > 0 ||
    (process.argv.includes("--require-golden") && report.goldenPassed !== 3)
  )
    process.exitCode = 1;
} finally {
  await app.close();
}
