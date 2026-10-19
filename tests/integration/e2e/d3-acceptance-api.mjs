#!/usr/bin/env node
/** E 的九格独立验收。真实 HTTP；数据阻断、判错、未运行分别记录。 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AnalysisResponseSchema, ErrorResponseSchema } from "@poetry/contracts";
import { checkReportClosure } from "@poetry/prosody";
import {
  REPO_ROOT,
  revision,
  startApi,
  readiness,
} from "../../../scripts/acceptance-runtime.mjs";

export const POEMS = ["dengguanquelou", "jingyesi", "huanghelou"].map((id) => {
  const canonical = JSON.parse(
    readFileSync(join(REPO_ROOT, "tests/golden/cases", `${id}.json`), "utf8"),
  );
  return {
    id,
    title: canonical.title,
    text: canonical.text,
    expectFormFamily: id === "jingyesi" ? "ancient" : "regulated",
    expectFormId:
      id === "jingyesi" ? null : id === "dengguanquelou" ? "wujue" : "qilv",
  };
});
const BOOKS = ["pingshui", "cilin", "xinyun"];

/** 0=全部完成；1=判错/执行错误；2=仅数据阻断（并非全部验收通过）。 */
export function acceptanceExitCode(failures, blocked) {
  return failures > 0 ? 1 : blocked > 0 ? 2 : 0;
}

export function checkCell(poem, book, res) {
  const body = res.body ?? {};
  if (
    res.status === 503 &&
    ErrorResponseSchema.safeParse(body).success &&
    body.error.code === "DATA_NOT_READY"
  ) {
    return {
      ok: false,
      blocked: true,
      issues: [body.error.message],
      facts: { http: 503, code: body.error.code },
    };
  }
  if (res.status !== 200) {
    return {
      ok: false,
      issues: [`HTTP ${res.status}: ${body.error?.code ?? "非标准错误体"}`],
      facts: { http: res.status },
    };
  }
  const parsed = AnalysisResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (i) => `Schema ${i.path.join(".")}: ${i.message}`,
      ),
      facts: { http: 200, schema: "fail" },
    };
  }
  const { genre, summary, prosody, provenance, poem: annotated } = parsed.data;
  const issues = [];
  const require = (condition, message) => {
    if (!condition) issues.push(message);
  };
  require(annotated.book === book &&
    body.policy.rhymeBook === book, "响应韵书与请求不同");
  require(annotated.originalText ===
    poem.text, "响应正文与 canonical 请求不同");
  require(body.inputHash ===
    createHash("sha256")
      .update(poem.text)
      .digest("hex"), "inputHash 与请求正文不同");
  require(genre.formFamily ===
    poem.expectFormFamily, `体裁应为 ${poem.expectFormFamily}`);
  require(genre.formId === poem.expectFormId, `体式应为 ${poem.expectFormId}`);
  require(!Object.values(body.versions).some((v) =>
    /fixture|mock/i.test(v),
  ), "真实验收收到合成版本");
  const closure = checkReportClosure(prosody, annotated);
  issues.push(...closure.problems.map((p) => `引用未闭合: ${p.detail}`));
  const evidence = new Map(provenance.evidence.map((e) => [e.id, e]));
  const sourceIds = new Set(provenance.sources.map((s) => s.id));
  require(provenance.rules.length > 0, "规则卡为空");
  for (const e of provenance.evidence)
    require(sourceIds.has(e.sourceId), `证据缺来源: ${e.id}`);
  for (const token of annotated.tokens) {
    for (const id of token.effectiveCandidateIds) {
      const candidate = token.candidates.find((c) => c.id === id);
      require(candidate?.evidenceIds.some(
        (eid) => evidence.get(eid)?.reviewStatus === "approved",
      ), `有效候选缺已审依据: ${id}`);
    }
  }
  for (const finding of prosody.checks) {
    require(provenance.rules.some(
      (r) => r.id === finding.ruleId,
    ), `诊断缺规则卡: ${finding.id}`);
    for (const id of finding.evidenceIds)
      require(evidence.has(id), `诊断缺证据: ${id}`);
  }
  if (poem.id === "dengguanquelou" && book === "pingshui")
    require(summary.status === "pass", "平水登鹳雀楼应为 pass");
  if (poem.id === "jingyesi")
    require(summary.status === "not_applicable", "静夜思应保留古体不适用");
  if (poem.id === "huanghelou" && book === "pingshui") {
    const ids = ["l4c5", "l4c6", "l4c7"];
    require(ids.every((id) => {
      const t = annotated.tokens.find((t) => t.tokenId === id);
      return t?.toneStatus === "resolved" && t.tone === "P";
    }), "空悠悠必须保持 PPP");
    const tails = prosody.checks.filter(
      (c) =>
        c.ruleId === "TAIL.SANPING" && c.locations.some((l) => l.line === 4),
    );
    require(tails.length === 1, "须保留一条精确三平尾特例记录");
    for (const f of tails) {
      require(f.status === "not_applicable" &&
        f.severity ===
          "info", "特例须 not_applicable/info，不能是 error 或伪造 pass");
      require(JSON.stringify(f.locations.map((l) => l.tokenId)) ===
        JSON.stringify(ids), "特例范围必须为 l4c5–l4c7");
      require(JSON.stringify(f.observed) === '["P","P","P"]' &&
        f.resolvedBy === null, "PPP 观察须保留；特例不是拗救");
      const approval = evidence.get("ctx:j03b2:08");
      require(f.evidenceIds.includes("ctx:j03b2:08") &&
        approval?.reviewStatus === "approved" &&
        approval.sourceId === "src:j03-review-batch2" &&
        sourceIds.has(approval.sourceId), "特例须引用第 13 号第 8 条已审来源");
    }
    require(prosody.checks.some(
      (c) =>
        c.ruleId !== "TAIL.SANPING" &&
        c.status === "fail" &&
        c.severity === "error",
    ), "其他明确偏离必须保留");
    require(summary.status === "fail", "本固定平水黄鹤楼仍按其他偏离推导 fail");
  }
  return {
    ok: issues.length === 0,
    blocked: false,
    issues,
    facts: {
      http: 200,
      schema: "pass",
      ms: res.ms,
      formFamily: genre.formFamily,
      formId: genre.formId,
      summary: summary.status,
      evidence: provenance.evidence.length,
      rules: provenance.rules.length,
      versions: body.versions,
      inputHash: body.inputHash,
      reviewedTail: prosody.checks
        .filter(
          (c) =>
            c.ruleId === "TAIL.SANPING" &&
            c.locations.some((l) => l.line === 4),
        )
        .map((c) => ({
          status: c.status,
          severity: c.severity,
          observed: c.observed,
          evidenceIds: c.evidenceIds,
        })),
    },
  };
}

function parseArgs(argv) {
  const args = {
    spawn: false,
    apiUrl: null,
    out: join(REPO_ROOT, "artifacts/acceptance/d3-api.json"),
    timeoutMs: 20000,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--spawn") args.spawn = true;
    else if (key === "--api-url") args.apiUrl = argv[++i];
    else if (key === "--out") args.out = argv[++i];
    else if (key === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (key === "--help" || key === "-h") args.help = true;
    else throw new Error(`未知参数 ${key}`);
  }
  if (
    !args.help &&
    (args.spawn === Boolean(args.apiUrl) ||
      !args.out ||
      !Number.isFinite(args.timeoutMs) ||
      args.timeoutMs <= 0)
  ) {
    throw new Error(
      "选择 --spawn 或 --api-url URL 之一；timeout-ms 须为正数，out 须有路径",
    );
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "node tests/integration/e2e/d3-acceptance-api.mjs [--spawn | --api-url URL] [--out FILE] [--timeout-ms N]",
    );
    return 0;
  }
  let server;
  const rev = revision();
  const payload = {
    generatedAt: new Date().toISOString(),
    runnerRevision: rev,
    serverRevision: args.spawn ? rev : null,
    node: process.version,
    results: [],
    total: 9,
  };
  try {
    if (args.spawn) server = await startApi(args.timeoutMs);
    const baseUrl = server?.baseUrl ?? args.apiUrl;
    payload.apiUrl = baseUrl;
    payload.readiness = await readiness(baseUrl);
    if (payload.readiness.mode !== "real")
      throw new Error(`真实模式未确认: ${payload.readiness.mode}`);
    for (const poem of POEMS) {
      for (const book of BOOKS) {
        let check;
        try {
          const start = Date.now();
          const res = await fetch(`${baseUrl}/api/v1/analyze`, {
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
            signal: AbortSignal.timeout(args.timeoutMs),
          });
          check = checkCell(poem, book, {
            status: res.status,
            body: await res.json(),
            ms: Date.now() - start,
          });
        } catch (err) {
          check = {
            ok: false,
            blocked: false,
            issues: [err.message],
            facts: {},
          };
        }
        payload.results.push({ poem: poem.id, book, ...check });
        console.log(
          `[${check.ok ? "PASS" : check.blocked ? "BLOCKED" : "FAIL"}] ${poem.title}/${book} HTTP ${check.facts.http ?? "-"} ${check.facts.summary ?? ""}`,
        );
        if (!check.ok) console.log(check.issues.join("\n"));
      }
    }
  } catch (err) {
    payload.runnerError = err.message;
  } finally {
    if (server) await server.stop();
    payload.passed = payload.results.filter((r) => r.ok).length;
    payload.blocked = payload.results.filter((r) => r.blocked).length;
    payload.failures =
      payload.results.filter((r) => !r.ok && !r.blocked).length +
      (payload.runnerError ? 1 : 0);
    payload.unrun = payload.total - payload.results.length;
    payload.exitCode = acceptanceExitCode(payload.failures, payload.blocked);
    const out = resolve(args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
    console.log(
      `九格：通过 ${payload.passed} / 阻断 ${payload.blocked} / 判错或执行错误 ${payload.failures} / 未运行 ${payload.unrun}；exit ${payload.exitCode}\n${out}`,
    );
  }
  return payload.exitCode;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}
