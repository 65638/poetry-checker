#!/usr/bin/env node
/* global fetch, AbortSignal, process, console, setTimeout */
/**
 * D3 九格金标准验收（E 维护）。
 *
 * 三首固定作品 × 平水/词林/新韵 = 9 格，逐格真实 HTTP 请求 /api/v1/analyze。
 * 目标：证据齐备时 200 且结论诚实；不预设三库同调、不预设全部 pass。
 *
 * 用法：
 *   node tests/integration/e2e/d3-acceptance-api.mjs --api-url http://127.0.0.1:3000
 *   node tests/integration/e2e/d3-acceptance-api.mjs --spawn        # 自起服务（随机空闲端口）
 *   node tests/integration/e2e/d3-acceptance-api.mjs --spawn --out results.json
 *
 * 约定：不杀非自身进程；不假定 3000 空闲；超时 20s；失败退出码 1；结果 JSON 含 SHA 与时间。
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

const POEMS = [
  {
    id: "dengguanquelou",
    title: "登鹳雀楼",
    text: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
    expectFormFamily: "regulated",
    expectFormId: "wujue",
    expectSummaryNotPass: false,
  },
  {
    id: "jingyesi",
    title: "静夜思",
    text: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
    expectFormFamily: "ancient",
    expectFormId: null,
    expectSummaryNotPass: false,
  },
  {
    id: "huanghelou",
    title: "黄鹤楼",
    text: "昔人已乘黄鹤去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。",
    expectFormFamily: "regulated",
    expectFormId: "qilv",
    expectSummaryNotPass: true,
  },
];

const BOOKS = ["pingshui", "cilin", "xinyun"];

function parseArgs(argv) {
  const args = { apiUrl: null, spawn: false, out: null, timeoutMs: 20000 };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--api-url") args.apiUrl = argv[++i];
    else if (key === "--spawn") args.spawn = true;
    else if (key === "--out") args.out = argv[++i];
    else if (key === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (key === "--help" || key === "-h") args.help = true;
  }
  return args;
}

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/healthz`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return true;
    } catch {
      /* 服务尚未起来 */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function startServer() {
  const nodeBin = process.env.NODE_BIN || process.execPath;
  const tsxCli = join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs");
  if (!existsSync(tsxCli))
    throw new Error(
      `找不到 tsx：${tsxCli}（先 pnpm install --frozen-lockfile）`,
    );
  const port = await freePort();
  const child = spawn(nodeBin, [tsxCli, "apps/api/src/server.ts"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (d) => logs.push(String(d)));
  child.stderr.on("data", (d) => logs.push(String(d)));
  const baseUrl = `http://127.0.0.1:${port}`;
  const ok = await waitForHealth(baseUrl, 25000);
  if (!ok) {
    child.kill();
    throw new Error(`服务未在超时内就绪；日志：\n${logs.join("")}`);
  }
  return { child, baseUrl, logs, port };
}

async function analyze(baseUrl, book, text, timeoutMs) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}/api/v1/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      rhymeBook: book,
      genreHint: "auto",
      formHint: "auto",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { nonJson: bodyText.slice(0, 300) };
  }
  return { status: res.status, body, ms: Date.now() - started };
}

/** 校验单格，返回 {ok, issues[], facts{}} */
function checkCell(poem, book, res) {
  const issues = [];
  const body = res.body ?? {};
  if (res.status === 503 && body?.error?.code === "DATA_NOT_READY") {
    return {
      ok: false,
      blocked: true,
      issues: [`BLOCKED：该韵书数据未就绪（DATA_NOT_READY），不是判定错误`],
      facts: { http: 503 },
    };
  }
  if (res.status !== 200) {
    issues.push(
      `HTTP ${res.status}（期望 200）: ${body?.error?.code ?? JSON.stringify(body).slice(0, 120)}`,
    );
    return { ok: false, issues, facts: {} };
  }
  const genre = body.genre ?? {};
  const summary = body.summary ?? {};
  const prosody = body.prosody ?? {};
  const tokens = body.poem?.tokens ?? [];
  const evidence = body.provenance?.evidence ?? [];
  const rules = body.provenance?.rules ?? [];

  // 1) 契约字段与版本
  for (const key of [
    "inputHash",
    "genre",
    "prosody",
    "summary",
    "provenance",
    "policy",
  ]) {
    if (!(key in body)) issues.push(`响应缺少 ${key}`);
  }
  if (body.poem?.book !== book)
    issues.push(`poem.book=${body.poem?.book}，期望 ${book}`);
  if (!evidence.length) issues.push("证据为空（provenance.evidence 长度 0）");
  if (!rules.length) issues.push("规则为空（provenance.rules 长度 0）");

  // 2) 体裁（不是唯一依据，只是其中一条）
  if (genre.formFamily !== poem.expectFormFamily) {
    issues.push(
      `genre.formFamily=${genre.formFamily}，期望 ${poem.expectFormFamily}`,
    );
  }
  if ((genre.formId ?? null) !== poem.expectFormId) {
    issues.push(`genre.formId=${genre.formId}，期望 ${poem.expectFormId}`);
  }

  // 3) 九格差异：同一首在三库之间不应被强制相同
  const toneOf = (tokenId) =>
    tokens.find((t) => t.tokenId === tokenId)?.tone ?? null;

  if (poem.id === "huanghelou" && book === "pingshui") {
    // 13 号第 8 条：空取平声，三平尾成立，作古风式律诗特征保留，不判出律
    const tail = ["l4c5", "l4c6", "l4c7"].map((id) => ({
      id,
      tone: toneOf(id),
    }));
    const ppp = tail.every((t) => t.tone === "P");
    if (!ppp)
      issues.push(
        `三平尾不成立：${JSON.stringify(tail)}（13 号第 8 条要求 l4c5=空 取平）`,
      );
    const tailFindings = (prosody.checks ?? []).filter(
      (c) =>
        String(c.ruleId ?? "").startsWith("TAIL.SANPING") &&
        (c.locations ?? []).some((l) => l.line === 4),
    );
    const bad = tailFindings.filter(
      (c) => c.status === "error" || c.status === "fail",
    );
    if (bad.length)
      issues.push(
        `三平尾被判 ${bad.map((c) => c.status).join("/")}，但 13 号第 8 条要求不判出律`,
      );
    if (!tailFindings.length)
      issues.push("没有 TAIL.SANPING 相关检查记录（无法证明特例被显式处理）");
    if (
      tailFindings.length &&
      !tailFindings.every((c) => (c.evidenceIds ?? []).length > 0)
    ) {
      issues.push("三平尾特例缺少 evidenceIds（“有依据”不满足）");
    }
    // 其他偏离必须保留：黄鹤楼整体不应是 pass
    if (summary.status === "pass")
      issues.push("summary=pass，但黄鹤楼存在特殊拗律，其他偏离应保留可见");
  }

  if (poem.expectSummaryNotPass && summary.status === "pass") {
    issues.push(`summary=pass 与预期不符（${poem.title}）`);
  }

  return {
    ok: issues.length === 0,
    issues,
    facts: {
      http: res.status,
      ms: res.ms,
      formFamily: genre.formFamily,
      formId: genre.formId ?? null,
      summary: summary.status,
      evidence: evidence.length,
      rules: rules.length,
      checks: (prosody.checks ?? []).length,
      inputHash: body.inputHash?.slice(0, 12) ?? null,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      "node tests/integration/e2e/d3-acceptance-api.mjs [--api-url URL | --spawn] [--out FILE] [--timeout-ms N]",
    );
    return 0;
  }

  let server = null;
  let baseUrl = args.apiUrl;
  if (!baseUrl) {
    if (!args.spawn) {
      console.error(
        "需要 --api-url（已在运行的真实 API）或 --spawn（自起开发服务）",
      );
      return 2;
    }
    server = await startServer();
    baseUrl = server.baseUrl;
  }

  const readyz = await fetch(`${baseUrl}/readyz`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.json())
    .catch(() => null);
  const versions = readyz?.versions ?? {};
  const dataVersions = Object.entries(versions).map(
    ([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`,
  );
  const mode =
    dataVersions.length === 0
      ? "未声明（readyz 无 versions）"
      : dataVersions.some((v) => v.includes("fixture"))
        ? "fixture/开发模式（结论不得当作已审核）"
        : "真实数据模式";

  console.log(`API: ${baseUrl}`);
  console.log(`readyz: ${dataVersions.join(" ") || "(无 versions)"}`);
  console.log(`模式: ${mode}`);
  console.log("");

  const rows = [];
  const results = [];
  let failures = 0;
  let blocked = 0;
  for (const poem of POEMS) {
    for (const book of BOOKS) {
      const res = await analyze(baseUrl, book, poem.text, args.timeoutMs);
      const check = checkCell(poem, book, res);
      if (!check.ok && !check.blocked) failures += 1;
      if (check.blocked) blocked += 1;
      rows.push({
        poem: poem.title,
        book,
        ...check.facts,
        ok: check.ok,
        issues: check.issues,
      });
      results.push({ poem: poem.id, book, status: res.status, ...check });
      console.log(
        `[${check.ok ? "PASS" : check.blocked ? "BLOCKED" : "FAIL"}] ${poem.title} / ${book}  ` +
          `http=${check.facts.http ?? res.status} summary=${check.facts.summary ?? "-"} ` +
          `form=${check.facts.formFamily ?? "-"}/${check.facts.formId ?? "null"} ` +
          `ev=${check.facts.evidence ?? 0} rules=${check.facts.rules ?? 0}`,
      );
      for (const issue of check.issues) console.log(`        · ${issue}`);
    }
  }

  console.log("");
  console.log("=== 九格总览 ===");
  for (const row of rows) {
    console.log(
      `${row.poem.padEnd(6)} ${row.book.padEnd(9)} ` +
        `http=${String(row.http ?? "-").padEnd(4)} summary=${String(row.summary ?? "-").padEnd(12)} ` +
        `form=${row.formFamily ?? "-"}/${row.formId ?? "null"} ev=${row.evidence ?? 0} ${row.ok ? "ok" : "FAIL"}`,
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    apiUrl: baseUrl,
    apiUrlSha256: createHash("sha256")
      .update(baseUrl)
      .digest("hex")
      .slice(0, 12),
    mode,
    dataVersions,
    repoRoot: REPO_ROOT,
    node: process.version,
    failures,
    total: rows.length,
    results,
  };
  const outPath = args.out
    ? resolve(args.out)
    : join(REPO_ROOT, "tests/integration/e2e/d3-acceptance-last.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\n结果已写入: ${outPath}`);

  if (server) {
    server.child.kill();
  }
  console.log(
    `\n九格：通过 ${rows.length - failures - blocked}，阻断 ${blocked}，判错 ${failures}`,
  );
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("验收脚本异常：", err?.message ?? err);
    process.exit(1);
  });
