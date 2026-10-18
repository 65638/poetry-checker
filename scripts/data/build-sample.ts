/**
 * 生成“真实七字小样本”快照（开发/待审核身份，不是发布包）。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/build-sample.ts
 *
 * 只从 data/raw 的固定快照读取，不联网、不改写原表；输出可重复，业务摘要稳定。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pingshuiSnapshotFromCwr } from "../../packages/lexicon/src/adapters/chinese-word-rhyme.js";
import {
  businessContentDigest,
  canonicalJson,
  sha256Hex,
} from "../../packages/lexicon/src/digest.js";
import type { SnapshotInput } from "../../packages/lexicon/src/snapshot.js";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const RAW_DIR = path.join(ROOT, "data", "raw", "chinese_word_rhyme");
const OUT_DIR = path.join(ROOT, "data", "normalized");

/** 与任务书一致的七字真实小样本。 */
export const SAMPLE_CHARACTERS = [
  "白",
  "一",
  "更",
  "流",
  "楼",
  "雪",
  "物",
] as const;

const REVISION = "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18";
const DATA_VERSION = "sample-pingshui-cwr-ff0e9c1-d1";

function readApprovedEvidenceIds(): readonly string[] {
  const file = path.join(ROOT, "data", "reviews", "approved-evidence.json");
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    approvedEvidenceIds?: string[];
  };
  return parsed.approvedEvidenceIds ?? [];
}

function sha256(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function main(): void {
  const file = path.join(RAW_DIR, "Pingshui_Rhyme.json");
  const bytes = readFileSync(file);
  const table = JSON.parse(bytes.toString("utf8")) as Record<
    string,
    Record<string, string[]>
  >;

  const full = pingshuiSnapshotFromCwr(table, {
    dataVersion: DATA_VERSION,
    sourceId: "src:chinese_word_rhyme:pingshui",
    approvedEvidenceIds: readApprovedEvidenceIds(),
    revision: REVISION,
    dataPath: "data/Pingshui_Rhyme.json",
    snapshotSha256: sha256(bytes),
    retrievedAt: null,
    license: "MIT（上游转载授权待核实）",
  });

  const wanted = new Set<string>(SAMPLE_CHARACTERS);
  const candidates = full.candidates.filter((candidate) =>
    wanted.has(candidate.character),
  );
  const groupIds = new Set(
    candidates.flatMap((candidate) => candidate.groupIds),
  );
  const groups = full.groups.filter((group) => groupIds.has(group.id));
  const evidenceIds = new Set([
    ...candidates.flatMap((candidate) => candidate.evidenceIds),
    ...groups.flatMap((group) => group.evidenceIds),
  ]);
  const evidence = full.evidence.filter((item) => evidenceIds.has(item.id));
  const sourceIds = new Set(evidence.map((item) => item.sourceId));
  const sources = full.sources.filter((source) => sourceIds.has(source.id));

  const sample: SnapshotInput = {
    dataVersion: DATA_VERSION,
    book: "pingshui",
    reviewStatus: "unverified",
    notice:
      "真实七字小样本（白、一、更、流、楼、雪、物）：数据取自 chinese_word_rhyme 固定提交的平水韵原表，" +
      "仅登记韵部归属与声类；反切、义项、今读一律为 null。开发/待审核身份，不是全量发布数据，" +
      "也不代表 106 部门槛已通过（该提交缺上声三讲）。",
    candidates,
    groups,
    evidence,
    sources,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const target = path.join(OUT_DIR, "pingshui.sample-d1.json");
  const text = `${JSON.stringify(sample, null, 2)}\n`;
  writeFileSync(target, text, "utf8");

  const missingCharacters = SAMPLE_CHARACTERS.filter(
    (character) =>
      !candidates.some((candidate) => candidate.character === character),
  );

  console.log(`输出：${path.relative(ROOT, target)}`);
  console.log(`dataVersion：${sample.dataVersion}`);
  console.log(
    `候选 ${candidates.length} 条；韵部 ${groups.length} 个；证据 ${evidence.length} 条`,
  );
  console.log(
    `未取到真实条目的样本字：${missingCharacters.join("") || "（无）"}`,
  );
  console.log(`业务内容摘要：${businessContentDigest(sample)}`);
  console.log(`规范化 JSON 摘要：${sha256Hex(canonicalJson(sample))}`);
  console.log(`文件字节摘要：${sha256Hex(text)}`);
}

main();
