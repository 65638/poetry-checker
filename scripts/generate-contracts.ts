import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnalysisResponseSchema,
  AnalyzeRequestSchema,
  createOpenApiDocument,
} from "@poetry/contracts";
import { getTemplates } from "@poetry/prosody";
import { makeFixture } from "../packages/contracts/tests/fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const files: Record<string, unknown> = {
  "artifacts/openapi.json": createOpenApiDocument(),
  "rules/templates/teaching-v1.json": {
    status: "base-templates-only",
    templates: getTemplates(),
  },
  "fixtures/contracts/request.json": AnalyzeRequestSchema.parse({
    text: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
    rhymeBook: "pingshui",
    genreHint: "auto",
    formHint: "auto",
    ruleSet: "teaching-v1",
    readingOverrides: [],
  }),
};
for (const status of [
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
] as const) {
  files[`fixtures/contracts/${status}.json`] = AnalysisResponseSchema.parse(
    makeFixture(status),
  );
}
for (const [relative, data] of Object.entries(files)) {
  const path = resolve(root, relative);
  const content = JSON.stringify(data, null, 2) + "\n";
  if (check) {
    if ((await readFile(path, "utf8")) !== content)
      throw new Error(
        `生成物不同步：${relative}；运行 pnpm generate:contracts`,
      );
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
}
console.log(
  `${check ? "已核对" : "已生成"} ${Object.keys(files).length} 个契约/模板文件；fixture 仅用于结构和界面测试。`,
);
