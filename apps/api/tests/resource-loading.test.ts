import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadResources,
  loadSupplementalResources,
  validateResourceReferences,
} from "../src/resources.js";
import { analyze } from "../src/orchestrator.js";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const paths = [
  "rules/evidence/teaching-v1.json",
  "data/context/evidence.json",
  "data/context/sources.json",
  "data/context/rules.json",
  "data/works/evidence.json",
  "data/works/sources.json",
  "data/works/metadata.json",
  "rules/cards/teaching-v1.json",
];
const temporary: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "poetry-resource-test-"));
  temporary.push(root);
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repo, path), join(root, path));
  }
  return root;
}
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe("真实资源加载与失败闭合", () => {
  it("B 的十条语境规则、证据、来源和作品/运行卡都加载并闭合", () => {
    const resources = loadResources();
    expect(resources.loadErrors).toEqual([]);
    expect(resources.contextRules).toHaveLength(10);
    expect(resources.ruleCards).toHaveLength(10);
    expect(
      resources.works.filter((work) => work.reviewStatus === "approved"),
    ).toHaveLength(3);
    expect(validateResourceReferences(resources)).toEqual([]);
    for (const rule of resources.contextRules) {
      for (const id of rule.evidenceIds)
        expect(
          resources.evidenceRegistry.find((item) => item.id === id)?.kind,
        ).toBe("context");
    }
    expect(resources.ready).toBe(false); // 不把模块接线成功当成全量发布通过。
  });
  it("坏 JSON、非数组、Schema 缺字段均记录具体文件，不能悄悄当空资源", () => {
    for (const content of ["{bad", "{}", '[{"id":"missing-fields"}]']) {
      const root = fixture();
      writeFileSync(join(root, "data/context/rules.json"), content);
      const result = loadSupplementalResources(root);
      expect(result.contextRules).toEqual([]);
      expect(result.errors.join(";")).toContain("data/context/rules.json");
    }
  });
  it("缺文件、悬空来源、悬空卡片证据及已审规则引用未审证据都不可静默放行", () => {
    const root = fixture();
    rmSync(join(root, "data/context/evidence.json"));
    expect(loadSupplementalResources(root).errors.join(";")).toContain(
      "data/context/evidence.json",
    );
    const resources = structuredClone(loadResources());
    resources.sourceRegistry = [];
    resources.ruleCards[0]!.evidenceIds = ["ev:missing"];
    const id = resources.contextRules[0]!.evidenceIds[0];
    resources.evidenceRegistry.find((item) => item.id === id)!.reviewStatus =
      "unverified";
    const errors = validateResourceReferences(resources).join(";");
    expect(errors).toContain("缺少来源");
    expect(errors).toContain("ev:missing");
    expect(errors).toContain("context 证据无效");
  });
  it("加载故障在分析入口返回 503，而非继续生成看似完整的报告", async () => {
    const resources = { ...loadResources(), loadErrors: ["资源冲突：test"] };
    const result = await analyze(
      {
        text: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
        rhymeBook: "pingshui",
        genreHint: "auto",
        formHint: "auto",
        ruleSet: "teaching-v1",
        readingOverrides: [],
      },
      resources,
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.status).toBe(503);
      expect(result.body.error.message).toContain("资源冲突：test");
    }
  });
  it("固定来源字节与登记 SHA-256 一致", async () => {
    const { createHash } = await import("node:crypto");
    const sourceReport = JSON.parse(
      readFileSync(join(repo, "data/works/source-fetch-report.json"), "utf8"),
    ) as Array<{ id: string; path: string }>;
    const resources = loadResources();
    for (const source of sourceReport) {
      const hash = createHash("sha256")
        .update(readFileSync(join(repo, source.path)))
        .digest("hex");
      expect(
        resources.sourceRegistry.find(
          (item) => item.id === `src:wikisource:work:${source.id}`,
        )?.snapshotSha256,
      ).toBe(hash);
    }
  });

  it("实际原文的所选版本与逐字差异记录一致，原件哈希可复算", async () => {
    const { createHash } = await import("node:crypto");
    const closure = JSON.parse(
      readFileSync(join(repo, "data/works/review-closure.json"), "utf8"),
    ) as {
      works: Array<{
        workId: string;
        sourceText: string;
        adoptedText: string;
        characterDifferences: Array<{
          position: number;
          source: string;
          adopted: string;
        }>;
        recordFiles: Array<{ path: string; sha256: string }>;
      }>;
    };
    const fetches = JSON.parse(
      readFileSync(join(repo, "data/works/source-fetch-report.json"), "utf8"),
    ) as Array<{ id: string; path: string }>;
    const han = (text: string) =>
      [...text].filter((char) => /\p{Script=Han}/u.test(char));
    for (const work of closure.works) {
      const path = fetches.find(
        (item) => work.workId === `work:${item.id}`,
      )!.path;
      let raw = readFileSync(join(repo, path), "utf8");
      if (work.workId === "work:jingyesi")
        raw = raw.split("===唐詩三百首===")[1]!.split("===全唐詩===")[0]!;
      const poem = /<poem\b[^>]*>([\s\S]*?)<\/poem>/u
        .exec(raw)![1]!
        .replace(/<ref>[\s\S]*?<\/ref>/gu, "")
        .replace(/\{\{另\|([^|}]+)\|[^}]+\}\}/gu, "$1")
        .replace(/<[^>]+>/gu, "");
      expect(han(poem)).toEqual(han(work.sourceText));
      const mapped = han(work.sourceText);
      for (const diff of work.characterDifferences) {
        expect(mapped[diff.position - 1]).toBe(diff.source);
        mapped[diff.position - 1] = diff.adopted;
      }
      expect(mapped).toEqual(han(work.adoptedText));
      for (const record of work.recordFiles)
        expect(
          createHash("sha256")
            .update(readFileSync(join(repo, record.path)))
            .digest("hex"),
        ).toBe(record.sha256);
    }
  });
});
