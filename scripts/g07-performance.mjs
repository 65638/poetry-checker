#!/usr/bin/env node
import { cpus, totalmem, platform, release } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { startApi, revision, readiness } from "./acceptance-runtime.mjs";
import {
  POEMS,
  checkCell,
} from "../tests/integration/e2e/d3-acceptance-api.mjs";

const output = resolve(
  process.argv[2] ?? "artifacts/acceptance/g07-performance.json",
);
const report = {
  generatedAt: new Date().toISOString(),
  revision: revision(),
  node: process.version,
  environment: {
    platform: platform(),
    release: release(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    transport:
      "loopback HTTP; full response body; client-observed API latency; schema checks after timer",
  },
  mode: "real",
  warmupPerPoem: 10,
  requestsPerPoemPerConcurrency: 100,
  cold: [],
  runs: [],
  blockedProbes: [],
  targetP95Ms: 500,
};
let api;
async function request(poem, book = "pingshui") {
  const started = performance.now();
  const response = await fetch(`${api.baseUrl}/api/v1/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: poem.text,
      rhymeBook: book,
      genreHint: "auto",
      formHint: "auto",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    }),
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  const ms = performance.now() - started;
  const body = JSON.parse(raw);
  const checked = checkCell(poem, book, { status: response.status, body, ms });
  return {
    ms,
    http: response.status,
    valid: checked.ok,
    issues: checked.issues,
    versions: body.versions ?? null,
  };
}
function stats(results) {
  const successes = results.filter((r) => r.http === 200 && r.valid);
  const sorted = successes.map((r) => r.ms).sort((a, b) => a - b);
  return {
    total: results.length,
    success200: successes.length,
    blocked503: results.filter((r) => r.http === 503).length,
    failed: results.length - successes.length,
    p50Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.5) - 1] : null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
    maxMs: sorted.at(-1) ?? null,
  };
}
try {
  const started = performance.now();
  api = await startApi();
  report.startupToHealthMs = performance.now() - started;
  report.readiness = await readiness(api.baseUrl);
  if (report.readiness.mode !== "real") throw new Error("expected real API");
  for (const poem of POEMS) {
    report.cold.push({ poem: poem.id, ...(await request(poem)) });
    for (let i = 0; i < report.warmupPerPoem; i++) {
      if (!(await request(poem)).valid)
        throw new Error(`warmup failed: ${poem.id}`);
    }
  }
  for (const concurrency of [1, 4]) {
    const results = [];
    for (const poem of POEMS) {
      const values = [];
      let index = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (index++ < report.requestsPerPoemPerConcurrency) {
            try {
              values.push(await request(poem));
            } catch (error) {
              values.push({ http: null, valid: false, error: error.message });
            }
          }
        }),
      );
      results.push(...values);
      report.runs.push({
        poem: poem.id,
        hanCharacters: [...poem.text].filter((c) => /\p{Script=Han}/u.test(c))
          .length,
        concurrency,
        ...stats(values),
        samples: values,
      });
    }
    console.log(JSON.stringify({ concurrency, ...stats(results) }));
  }
  for (const poem of POEMS)
    for (const book of ["cilin", "xinyun"])
      report.blockedProbes.push({
        poem: poem.id,
        book,
        ...(await request(poem, book)),
      });
  report.passed = report.runs.every(
    (r) => r.failed === 0 && r.p95Ms !== null && r.p95Ms <= 500,
  );
} catch (error) {
  report.error = error.message;
  report.passed = false;
} finally {
  await api?.stop();
  report.exitCode = report.passed ? 0 : 1;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(output);
  process.exitCode = report.exitCode;
}
