// D3-G02：三首 × 三库 = 九组合真实分析矩阵（GLM 维护，唯一探针入口）。
// 用法：node node_modules/tsx/dist/cli.mjs scripts/probe-d3-matrix.ts [--json <path>]
// 输出：控制台表格 + 可选 JSON（HTTP/summary/Schema/版本逐组合记录）。
import { writeFileSync } from "node:fs";
import { buildApp } from "../apps/api/src/server.js";
import { AnalysisResponseSchema } from "@poetry/contracts";
import { readFileSync } from "node:fs";

interface WorkEntry {
  caseId: string;
  title: string;
  text: string;
}

const works = JSON.parse(
  readFileSync("data/works/review-queue.json", "utf8"),
) as { items: WorkEntry[] };
const POEMS: Array<{ key: string; caseId: string; label: string }> = [
  { key: "dengguanquelou", caseId: "golden-dengguanquelou-ps-v1", label: "登鹳雀楼" },
  { key: "jingyesi", caseId: "golden-jingyesi-ps-v1", label: "静夜思" },
  { key: "huanghelou", caseId: "golden-huanghelou-ps-v1", label: "黄鹤楼" },
];
const BOOKS = ["pingshui", "cilin", "xinyun"] as const;

const app = buildApp();
const rows: Array<Record<string, unknown>> = [];

for (const poem of POEMS) {
  const entry = works.items.find((item) => item.caseId === poem.caseId);
  if (entry === undefined) throw new Error(`缺少作品 ${poem.caseId}`);
  for (const book of BOOKS) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: {
        text: entry.text,
        rhymeBook: book,
        genreHint: "auto",
        formHint: "auto",
        ruleSet: "teaching-v1",
        readingOverrides: [],
      },
    });
    const body: unknown = res.json();
    let schema = "-";
    let summary: string;
    let versions = "-";
    if (res.statusCode === 200) {
      const parsed = AnalysisResponseSchema.safeParse(body);
      schema = parsed.success ? "pass" : `fail:${parsed.error.issues[0]?.path.join(".") ?? "?"}`;
      const b = body as { summary?: { status?: string }; versions?: { data?: string } };
      summary = b.summary?.status ?? "-";
      versions = b.versions?.data ?? "-";
    } else {
      const b = body as { error?: { code?: string; message?: string } };
      summary = `${b.error?.code ?? "?"}:${(b.error?.message ?? "").slice(0, 60)}`;
    }
    rows.push({
      poem: poem.label,
      book,
      http: res.statusCode,
      summary,
      schema,
      dataVersion: versions,
    });
  }
}

const header = ["poem", "book", "http", "summary", "schema", "dataVersion"];
const widths = header.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h]).length)));
const line = (cells: Array<string | number | undefined>) =>
  "| " + cells.map((c, i) => String(c ?? "").padEnd(widths[i] ?? 0)).join(" | ") + " |";
console.log(line(header));
console.log("|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|");
for (const r of rows) console.log(line(header.map((h) => r[h] as string | number | undefined)));

const jsonIdx = process.argv.indexOf("--json");
const jsonPath = jsonIdx !== -1 ? process.argv[jsonIdx + 1] : undefined;
if (jsonPath !== undefined) {
  writeFileSync(
    jsonPath,
    JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2),
    "utf8",
  );
  console.log(`json -> ${jsonPath}`);
}
