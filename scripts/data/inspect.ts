/**
 * 读取本地来源快照并统计（只读，不下载、不改写原表、不执行上游脚本）。
 *
 *   node --experimental-strip-types scripts/data/inspect.ts     # 或用 tsx
 *
 * 报告分三块：来源文件清单、三套原表统计、缺口与未取得项。
 * 缺部数据在这里只被“报告”，不修补、不补空部。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pingshuiSnapshotFromCwr } from "../../packages/lexicon/src/adapters/chinese-word-rhyme.js";
import {
  CILIN_GATE,
  PINGSHUI_GATE,
  XINYUN_GATE,
  checkCompleteness,
  defineSnapshot,
} from "../../packages/lexicon/src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const RAW = path.join(ROOT, "data", "raw");

type Table = Record<string, Record<string, string[]>>;

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function readTable(file: string): Table {
  return JSON.parse(readFileSync(file).toString("utf8")) as Table;
}

function describeFile(relative: string): void {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    console.log(`缺失     ${relative}`);
    return;
  }
  const bytes = statSync(file).size;
  console.log(`${String(bytes).padStart(9)}  ${sha256File(file)}  ${relative}`);
}

function pingshuiStats(): void {
  section("平水韵原表（chinese_word_rhyme 固定提交）");
  const file = path.join(RAW, "chinese_word_rhyme", "Pingshui_Rhyme.json");
  const table = readTable(file);
  const snapshot = defineSnapshot(
    pingshuiSnapshotFromCwr(table, {
      dataVersion: "pingshui-cwr-ff0e9c1-d1",
      revision: "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18",
      dataPath: "data/Pingshui_Rhyme.json",
      snapshotSha256: sha256File(file),
      retrievedAt: null,
      license: "MIT（上游转载授权待核实）",
    }),
  );

  let entries = 0;
  let duplicatedGroups = 0;
  for (const bucket of Object.values(table)) {
    for (const characters of Object.values(bucket)) {
      entries += characters.length;
      if (new Set(characters).size !== characters.length) duplicatedGroups += 1;
    }
  }

  const multiGroup = new Map<string, number>();
  for (const candidate of snapshot.candidates) {
    multiGroup.set(
      candidate.character,
      (multiGroup.get(candidate.character) ?? 0) + 1,
    );
  }
  const multi = [...multiGroup.values()].filter((count) => count > 1).length;

  console.log(
    `卷数 ${Object.keys(table).length}；韵部 ${snapshot.groups.length}；候选 ${snapshot.candidates.length}`,
  );
  console.log(
    `原表条目 ${entries}；内部重复字形的韵部 ${duplicatedGroups} 个；多归部字形 ${multi} 个`,
  );

  const report = checkCompleteness(snapshot, PINGSHUI_GATE);
  console.log(
    `门槛：${report.label}；应有 ${report.expectedGroupCount} 部，实有 ${report.groupCount} 部`,
  );
  console.log(`分部实有：${JSON.stringify(report.bucketCounts)}`);
  console.log(`分部应有：${JSON.stringify(report.expectedBucketCounts)}`);
  console.log(`缺部：${report.missingGroups.join(",") || "（无）"}`);
  console.log(`空部：${report.emptyGroups.join(",") || "（无）"}`);
  console.log(`发布门槛通过：${report.releaseGatePassed ? "是" : "否"}`);
}

function cilinStats(): void {
  section("词林正韵原表");
  const table = readTable(
    path.join(RAW, "chinese_word_rhyme", "Cilin_Rhyme.json"),
  );
  const ordinals = Object.keys(table);
  let memberships = 0;
  const characters = new Set<string>();
  const subBuckets: string[] = [];
  for (const [ordinal, tones] of Object.entries(table)) {
    for (const [tone, list] of Object.entries(tones)) {
      subBuckets.push(`${ordinal}·${tone}`);
      memberships += list.length;
      for (const character of list) characters.add(character);
    }
  }
  console.log(
    `部数 ${ordinals.length}；子卷 ${subBuckets.length}；归属记录 ${memberships}；字形 ${characters.size}`,
  );
  console.log(`分部：${subBuckets.join(" ")}`);
  const expectedNames = new Set(CILIN_GATE.groups.map((entry) => entry.name));
  const actualNames = new Set(subBuckets);
  const missing = [...expectedNames].filter((name) => !actualNames.has(name));
  const unexpected = [...actualNames].filter(
    (name) => !expectedNames.has(name),
  );
  console.log(
    `门槛 ${CILIN_GATE.groups.length} 子卷；缺 ${missing.join(",") || "（无）"}；多 ${unexpected.join(",") || "（无）"}`,
  );
}

function xinyunStats(): void {
  section("中华新韵候选表（仅作对照，不作导入底本）");
  const four = readTable(
    path.join(RAW, "chinese_word_rhyme", "Xinyun_Rhyme_FourRhyme_Edition.json"),
  );
  const coarse = readTable(
    path.join(RAW, "chinese_word_rhyme", "Xinyun_Rhyme.json"),
  );
  const names = Object.keys(four);
  const index = new Map<string, string[]>();
  let memberships = 0;
  for (const [yun, tones] of Object.entries(four)) {
    for (const [tone, list] of Object.entries(tones)) {
      memberships += list.length;
      for (const character of list) {
        const key = `${yun}·${tone}`;
        const bucket = index.get(character);
        if (bucket === undefined) index.set(character, [key]);
        else bucket.push(key);
      }
    }
  }
  const coarseNames = Object.keys(coarse);
  console.log(
    `韵数 ${names.length}；四声子卷 ${Object.values(four).reduce((sum, tones) => sum + Object.keys(tones).length, 0)}；归属记录 ${memberships}；字形 ${index.size}`,
  );
  console.log(`韵目：${names.join(" ")}`);
  console.log(`粗分表韵数 ${coarseNames.length}（平/仄二分）`);

  const expectedNames = new Set(XINYUN_GATE.groups.map((entry) => entry.name));
  const actualNames = new Set<string>();
  for (const [yun, tones] of Object.entries(four)) {
    for (const tone of Object.keys(tones)) actualNames.add(`${yun}·${tone}`);
  }
  const missing = [...expectedNames].filter((name) => !actualNames.has(name));
  const unexpected = [...actualNames].filter(
    (name) => !expectedNames.has(name),
  );
  console.log(
    `门槛 ${XINYUN_GATE.groups.length} 子卷；缺 ${missing.join(",") || "（无）"}；多 ${unexpected.join(",") || "（无）"}`,
  );

  section("新韵候选表的已知冲突（需单列审查）");
  const yi = index.get("一") ?? [];
  console.log(`一 → ${yi.join(" , ")}`);
  const conflictSamples = [...index.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .slice(0, 12)
    .map(([character, bucket]) => `${character}:${bucket.join("+")}`);
  console.log(`多声调字形（前 12 例）：${conflictSamples.join("  ")}`);
}

function gaps(): void {
  section("缺口与未取得项（不填目标数充数）");
  console.log(
    "平水韵上声三讲：源表缺失，未用占位补齐；补丁草案见 data/patches/。",
  );
  console.log(
    "维基文库《平水韻》《詞林正韻》：本机网络不可达（超时），未取得正文与修订号，状态=未核实。",
  );
  console.log("平水/词林的反切、义项、今读：源表不含，一律为 null，未生成。");
  console.log(
    "中华新韵：采用十四韵规则 + pinyin-data 重建，规则权威文本未取得，状态=待核实。",
  );
}

function main(): void {
  section("来源快照清单（data/raw）");
  describeFile("data/raw/chinese_word_rhyme/Pingshui_Rhyme.json");
  describeFile("data/raw/chinese_word_rhyme/Cilin_Rhyme.json");
  describeFile("data/raw/chinese_word_rhyme/Xinyun_Rhyme.json");
  describeFile(
    "data/raw/chinese_word_rhyme/Xinyun_Rhyme_FourRhyme_Edition.json",
  );
  describeFile("data/raw/chinese_word_rhyme/LICENSE");
  describeFile("data/raw/chinese_word_rhyme/README.md");
  describeFile("data/raw/pinyin-data/pinyin.txt");
  describeFile("data/raw/pinyin-data/LICENSE");

  pingshuiStats();
  cilinStats();
  xinyunStats();
  gaps();
}

main();
