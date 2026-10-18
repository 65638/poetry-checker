/**
 * 生成平水韵 D2 全量快照：**两条路径并存**，不是覆盖关系。
 *
 *   A  data/normalized/pingshui.full-d2.json               105 部（缺上声三讲）
 *   B  data/normalized/pingshui.full-d2-patched.json       106 部（三讲补丁草案）
 *
 * 运行：
 *   node node_modules/tsx/dist/cli.mjs scripts/data/build-pingshui.ts
 *
 * 规则：
 * - 只读 data/raw 的固定快照与已落盘的维基文库正文；正文只引用路径、摘要与 9 字摘录，
 *   **不转录全文**、不手抄字节。
 * - 不联网、不改写原表、不执行上游脚本。
 * - 不改 reviewStatus、不写 data/releases：两份都是 unverified，结构达标 ≠ 内容审核通过。
 * - 断言先于落盘：任一断言失败即打印原因并 process.exitCode = 1，**不写出**可能有误的文件。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
} from "@poetry/contracts";

import {
  pingshuiSnapshotFromCwr,
  type CwrRhymeTable,
} from "../../packages/lexicon/src/adapters/chinese-word-rhyme.js";
import {
  businessContentDigest,
  canonicalJson,
  sha256Hex,
} from "../../packages/lexicon/src/digest.js";
import {
  PINGSHUI_GATE,
  checkCompleteness,
  defineSnapshot,
  makeCandidateId,
  type CompletenessReport,
} from "../../packages/lexicon/src/index.js";
import type {
  LexiconSnapshot,
  SnapshotInput,
} from "../../packages/lexicon/src/snapshot.js";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const RAW_CWR = path.join(ROOT, "data", "raw", "chinese_word_rhyme");
const WIKITEXT_REL = "data/raw/wikisource/PingshuiYun-8264804.wikitext";
const WIKITEXT_FILE = path.join(ROOT, WIKITEXT_REL);
const OUT_DIR = path.join(ROOT, "data", "normalized");

/** 原表固定提交（未改版本）。 */
const CWR_REVISION = "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18";
const CWR_DATA_PATH = "data/Pingshui_Rhyme.json";

const A_VERSION = "pingshui-cwr-ff0e9c1-d2-full";
const B_VERSION = "pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft";

/** 已核事实：落盘字节身份（由人在真实文件上核对后提供，此处只做回归断言）。 */
const WIKITEXT_OLDID = "8264804";
const WIKITEXT_SHA256 =
  "f0297bff7b66cde18bcb2644b5d9c6320ac90253f63a8aa178e489170a810ce2";
const WIKITEXT_BYTES = 37073;
const WIKITEXT_LINES = 658;
/** 只知日期、不知时刻；契约要求 ISO datetime，故以当日 00:00:00Z 承载日期信息。
 *  retrievedAt 由 digest.ts 的 withoutVolatileFields 剥离，不参与业务内容摘要。 */
const WIKITEXT_RETRIEVED_AT = "2026-10-18T00:00:00.000Z";

/** 三讲证据的审核状态由补丁文件的人审签结果决定（数据驱动，不硬编码）。 */
function readSanJiangEvidenceReviewStatus(): "approved" | "unverified" {
  const patchPath = path.join(
    ROOT,
    "data",
    "patches",
    "pingshui-shang-sanj-jiang.draft.json",
  );
  if (!existsSync(patchPath)) return "unverified";
  const patch = JSON.parse(readFileSync(patchPath, "utf8")) as {
    reviewStatus?: string;
    review?: { conclusion?: string } | null;
    publishedAt?: string | null;
  };
  const signed =
    patch.reviewStatus === "approved" && patch.review?.conclusion === "approve";
  // 补丁已人审签，但整库未 approved、也未发布；因此只升级该条证据的状态，
  // 快照级 reviewStatus 与 releaseGatePassed 均不因此改变。
  return signed ? "approved" : "unverified";
}

const SANJ_JIANG_EVIDENCE_REVIEW_STATUS = readSanJiangEvidenceReviewStatus();

/** 底本（繁体）上声三讲正文，wikitext 第 200 行；该韵目无【詞】段。 */
const SANJ_JIANG_BASE_TEXT = "講港棒蚌項缿玤傋耩";
/** 繁→简 仅此两字不同形，其余七字简繁同形。 */
const TRAD_TO_SIMP: Readonly<Record<string, string>> = { 講: "讲", 項: "项" };
/** 原表已收录者（上声一董，Pingshui_Rhyme.json:4372）；补丁只新增其三讲归属。 */
const PRE_EXISTING_CHARACTER = "玤";

const SANJ_JIANG_BUCKET = "上";
const SANJ_JIANG_NAME = "三讲";
const SANJ_JIANG_TONE_CLASS = "shang";
const SANJ_JIANG_GROUP_ID = `group:pingshui:${SANJ_JIANG_BUCKET}:${SANJ_JIANG_NAME}`;
const SANJ_JIANG_EVIDENCE_ID = `ev:pingshui:${SANJ_JIANG_BUCKET}:${SANJ_JIANG_NAME}`;
const WIKISOURCE_SOURCE_ID = "src:wikisource:pingshuiyun";

const SANJ_JIANG_BASE_CHARS = [...SANJ_JIANG_BASE_TEXT];
const SANJ_JIANG_CHARS = SANJ_JIANG_BASE_CHARS.map(
  (character) => TRAD_TO_SIMP[character] ?? character,
);

const A_NOTICE =
  "平水韵全量候选（105 部）：源自 chinese_word_rhyme 固定提交 ff0e9c13 的原表转载，" +
  "仅登记韵部归属与声类；反切、义项、今读一律为 null。" +
  "该提交上声仅 28 部、缺「三讲」，按纪律不用占位补齐，故发布门槛必然不通过" +
  "（releaseGatePassed=false）。用途：复现「缺三讲 → 门槛失败」。reviewStatus=unverified，" +
  "未经人审签，不得作为发布数据。";

const B_NOTICE =
  "平水韵全量候选（106 部，含上声三讲补丁草案）：在 105 部快照上追加「三讲」9 条归属，" +
  "结构可达 106 部且无空部；但补丁仍为 draft、全库 reviewStatus=unverified，未经人审签，" +
  "releaseGatePassed 仍为 false，不得进 data/releases。" +
  `上声三讲底本为维基文库《平水韻》oldid ${WIKITEXT_OLDID} 的繁体正文「${SANJ_JIANG_BASE_TEXT}」` +
  "（该韵目无【詞】段）；底本为繁体，此处仅做繁→简转换（講→讲、項→项），" +
  "不得声称底本原文即简体。" +
  `「${PRE_EXISTING_CHARACTER}」原已收于上声一董，本补丁只新增其「三讲」归属，未删除原归属。`;

const failures: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${message}`);
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function countLines(text: string): number {
  const parts = text.split("\n");
  return text.endsWith("\n") ? parts.length - 1 : parts.length;
}

/** 多归部字形数：同一字形拥有 >1 条候选。 */
function multiGroupCharacterCount(
  candidates: readonly ReadingCandidate[],
): number {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(
      candidate.character,
      (counts.get(candidate.character) ?? 0) + 1,
    );
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function printReport(
  tag: string,
  relativeOutput: string,
  snapshot: LexiconSnapshot,
  report: CompletenessReport,
): void {
  section(`快照 ${tag}：${relativeOutput}`);
  console.log(`dataVersion：${snapshot.dataVersion}`);
  console.log(`reviewStatus：${snapshot.reviewStatus}`);
  console.log(`门槛：${report.label}`);
  console.log(
    `韵部数：${report.groupCount} / 应有 ${report.expectedGroupCount}`,
  );
  console.log(`bucketCounts：${JSON.stringify(report.bucketCounts)}`);
  console.log(
    `expectedBucketCounts：${JSON.stringify(report.expectedBucketCounts)}`,
  );
  console.log(`missingGroups：${report.missingGroups.join(",") || "（无）"}`);
  console.log(`emptyGroups：${report.emptyGroups.join(",") || "（无）"}`);
  console.log(
    `unexpectedGroups：${report.unexpectedGroups.join(",") || "（无）"}`,
  );
  console.log(`候选数：${snapshot.candidates.length}`);
  console.log(
    `多归部字形数：${multiGroupCharacterCount(snapshot.candidates)}`,
  );
  console.log(`韵部数（groups 数组）：${snapshot.groups.length}`);
  console.log(`证据数：${snapshot.evidence.length}`);
  console.log(
    `来源 ID：${snapshot.sources.map((source) => source.id).join(", ")}`,
  );
  console.log(`releaseGatePassed：${report.releaseGatePassed ? "是" : "否"}`);
  console.log(`业务内容摘要：${businessContentDigest(snapshot)}`);
  console.log(`规范化 JSON 摘要：${sha256Hex(canonicalJson(snapshot))}`);
}

function buildSanJiangGroup(): RhymeGroup {
  return {
    id: SANJ_JIANG_GROUP_ID,
    book: "pingshui",
    name: SANJ_JIANG_NAME,
    toneClass: SANJ_JIANG_TONE_CLASS,
    evidenceIds: [SANJ_JIANG_EVIDENCE_ID],
  };
}

function buildSanJiangEvidence(): Evidence {
  return {
    id: SANJ_JIANG_EVIDENCE_ID,
    sourceId: WIKISOURCE_SOURCE_ID,
    kind: "rhyme_entry",
    locator: `${WIKITEXT_REL} 第 198-200 行（上聲三{{++|講}} / ${SANJ_JIANG_BASE_TEXT}）`,
    assertion:
      `维基文库《平水韻》oldid ${WIKITEXT_OLDID}（${WIKITEXT_REL} 第 200 行）` +
      `上聲三講正文为「${SANJ_JIANG_BASE_TEXT}」共 ${SANJ_JIANG_BASE_CHARS.length} 字，该韵目无【詞】段。` +
      "底本为繁体，此处仅做繁→简转换（講→讲、項→项），不得声称底本原文即简体。" +
      `「${PRE_EXISTING_CHARACTER}」原表已收于上声一董（Pingshui_Rhyme.json:4372），` +
      "本补丁新增其三讲归属并保留原归属。",
    excerpt: SANJ_JIANG_BASE_TEXT,
    reviewStatus: SANJ_JIANG_EVIDENCE_REVIEW_STATUS,
  };
}

function buildWikisourceSource(): SourceRecord {
  return {
    id: WIKISOURCE_SOURCE_ID,
    title: "维基文库《平水韻》（上声三讲补缺依据，底本为繁体）",
    edition: `维基文库页面 oldid ${WIKITEXT_OLDID}`,
    url: `https://zh.wikisource.org/w/index.php?oldid=${WIKITEXT_OLDID}`,
    license:
      "字节事实 {{PD-old}}+{{wikipedia}}（页脚第 655-656 行）；渲染版权框未核；可用性未定",
    snapshotSha256: WIKITEXT_SHA256,
    revision: WIKITEXT_OLDID,
    retrievedAt: WIKITEXT_RETRIEVED_AT,
  };
}

function buildSanJiangCandidates(): ReadingCandidate[] {
  return SANJ_JIANG_CHARS.map((character) => ({
    id: makeCandidateId(
      "pingshui",
      character,
      SANJ_JIANG_TONE_CLASS,
      SANJ_JIANG_NAME,
    ),
    character,
    book: "pingshui" as const,
    toneClass: SANJ_JIANG_TONE_CLASS as ReadingCandidate["toneClass"],
    tone: "Z" as const,
    groupIds: [SANJ_JIANG_GROUP_ID],
    gloss: null,
    modernReading: null,
    fanqie: null,
    evidenceIds: [SANJ_JIANG_EVIDENCE_ID],
  }));
}

function main(): void {
  section("输入检查（落盘字节身份）");
  check(
    existsSync(WIKITEXT_FILE),
    `维基文库快照存在：${WIKITEXT_REL}`,
  );
  if (!existsSync(WIKITEXT_FILE)) {
    console.error("\n输入缺失，无法构建 106 部补丁路径；请先落盘维基文库正文。");
    process.exitCode = 1;
    return;
  }
  const wikitextBytes = readFileSync(WIKITEXT_FILE);
  const wikitextText = wikitextBytes.toString("utf8");
  check(
    wikitextBytes.length === WIKITEXT_BYTES,
    `字节数 ${wikitextBytes.length} == 登记值 ${WIKITEXT_BYTES}`,
  );
  check(
    sha256Bytes(wikitextBytes) === WIKITEXT_SHA256,
    "SHA-256 与登记值一致",
  );
  check(
    countLines(wikitextText) === WIKITEXT_LINES,
    `行数 ${countLines(wikitextText)} == 登记值 ${WIKITEXT_LINES}`,
  );
  check(
    wikitextText.includes("上聲三{{++|講}}"),
    "第 198 行的韵目标题「上聲三{{++|講}}」可检索到",
  );
  check(
    wikitextText.includes(SANJ_JIANG_BASE_TEXT),
    `三讲正文摘录「${SANJ_JIANG_BASE_TEXT}」可检索到（9 字，不转录全文）`,
  );
  check(
    SANJ_JIANG_BASE_CHARS.length === 9,
    `三讲正文为 9 字（实际 ${SANJ_JIANG_BASE_CHARS.length}）`,
  );

  section("读取原表");
  const cwrFile = path.join(RAW_CWR, "Pingshui_Rhyme.json");
  const cwrBytes = readFileSync(cwrFile);
  const table = JSON.parse(cwrBytes.toString("utf8")) as CwrRhymeTable;
  console.log(`原表：data/raw/chinese_word_rhyme/Pingshui_Rhyme.json`);
  console.log(`原表 SHA-256：${sha256Bytes(cwrBytes)}`);

  // ---- A：105 部（缺三讲） ----
  const aInputBase: SnapshotInput = {
    ...pingshuiSnapshotFromCwr(table, {
      dataVersion: A_VERSION,
      sourceId: "src:chinese_word_rhyme:pingshui",
      revision: CWR_REVISION,
      dataPath: CWR_DATA_PATH,
      snapshotSha256: sha256Bytes(cwrBytes),
      retrievedAt: null,
      license: "MIT（上游转载授权链未核实）",
    }),
    notice: A_NOTICE,
  };
  const aSnapshot = defineSnapshot(aInputBase);
  const aReport = checkCompleteness(aSnapshot, PINGSHUI_GATE);

  // ---- B：106 部（三讲补丁草案）——由 A 的副本追加，A 不受影响 ----
  const base = structuredClone(aInputBase);
  const bInput: SnapshotInput = {
    dataVersion: B_VERSION,
    book: base.book,
    reviewStatus: base.reviewStatus,
    notice: B_NOTICE,
    candidates: [...base.candidates, ...buildSanJiangCandidates()],
    groups: [...base.groups, buildSanJiangGroup()],
    evidence: [...base.evidence, buildSanJiangEvidence()],
    sources: [...base.sources, buildWikisourceSource()],
  };
  const bSnapshot = defineSnapshot(bInput);
  const bReport = checkCompleteness(bSnapshot, PINGSHUI_GATE);

  const aRelative = path.join("data", "normalized", "pingshui.full-d2.json");
  const bRelative = path.join(
    "data",
    "normalized",
    "pingshui.full-d2-patched.json",
  );

  printReport("A（105 部，缺三讲）", aRelative, aSnapshot, aReport);
  printReport("B（106 部，三讲补丁草案）", bRelative, bSnapshot, bReport);

  // ---- 断言 ----
  section("断言");

  check(
    aReport.groupCount === 105,
    `A 韵部数 105（实际 ${aReport.groupCount}）`,
  );
  check(
    aReport.missingGroups.includes(SANJ_JIANG_NAME),
    `A 缺失韵目含「${SANJ_JIANG_NAME}」（实际 ${aReport.missingGroups.join(",") || "无"}）`,
  );
  check(aReport.releaseGatePassed === false, "A releaseGatePassed === false");

  check(
    bReport.groupCount === 106,
    `B 韵部数 106（实际 ${bReport.groupCount}）`,
  );
  check(
    bReport.missingGroups.length === 0,
    `B missingGroups 为空（实际 ${bReport.missingGroups.join(",") || "空"}）`,
  );
  check(
    bReport.emptyGroups.length === 0,
    `B emptyGroups 为空（实际 ${bReport.emptyGroups.join(",") || "空"}）`,
  );
  check(
    bReport.unexpectedGroups.length === 0,
    `B unexpectedGroups 为空（实际 ${bReport.unexpectedGroups.join(",") || "空"}）`,
  );

  check(
    bReport.releaseGatePassed === false,
    "B releaseGatePassed === false（reviewStatus 仍 unverified，未经人审签不得通过）",
  );
  check(
    aSnapshot.reviewStatus === "unverified" &&
      bSnapshot.reviewStatus === "unverified",
    "两份 reviewStatus 均为 unverified（整库未批准，未被改动）",
  );
  const sanJiangEvidence = bSnapshot.evidence.find(
    (item) => item.id === SANJ_JIANG_EVIDENCE_ID,
  );
  check(
    sanJiangEvidence?.reviewStatus === SANJ_JIANG_EVIDENCE_REVIEW_STATUS,
    `三讲证据状态与补丁人审签结果一致（补丁=${SANJ_JIANG_EVIDENCE_REVIEW_STATUS}，证据=${sanJiangEvidence?.reviewStatus}）`,
  );
  check(
    bSnapshot.evidence.filter((item) => item.reviewStatus === "approved").length ===
      (SANJ_JIANG_EVIDENCE_REVIEW_STATUS === "approved" ? 1 : 0),
    "只有三讲 1 条证据 approved，其余证据仍 unverified（不得批量升级）",
  );

  // 三讲 9 字：原表已有的只有「玤」，其余 8 个为新增
  const aCharacters = new Set(
    aSnapshot.candidates.map((candidate) => candidate.character),
  );
  const preExisting = SANJ_JIANG_CHARS.filter((character) =>
    aCharacters.has(character),
  );
  check(
    preExisting.length === 1 && preExisting[0] === PRE_EXISTING_CHARACTER,
    `三讲 9 字中原表已有的只有「${PRE_EXISTING_CHARACTER}」（实际 ${preExisting.join("") || "无"}）`,
  );
  const newCharacters = SANJ_JIANG_CHARS.filter(
    (character) => !aCharacters.has(character),
  );
  check(
    newCharacters.length === 8,
    `净增新字形 8 个（实际 ${newCharacters.length}：${newCharacters.join("")}）`,
  );

  // 归属净增 9 条：8 新字 + 「玤」1 条新归属
  const membershipDelta =
    bSnapshot.candidates.length - aSnapshot.candidates.length;
  check(
    membershipDelta === 9,
    `归属净增 9 条（实际 ${membershipDelta}）`,
  );

  // 「玤」不得从一董删除
  const fenGroups = bSnapshot.candidates
    .filter((candidate) => candidate.character === PRE_EXISTING_CHARACTER)
    .flatMap((candidate) => candidate.groupIds);
  check(
    fenGroups.includes(`group:pingshui:${SANJ_JIANG_BUCKET}:一董`),
    `「${PRE_EXISTING_CHARACTER}」保留上声一董归属（实际 ${fenGroups.join(",")}）`,
  );
  check(
    fenGroups.includes(SANJ_JIANG_GROUP_ID),
    `「${PRE_EXISTING_CHARACTER}」新增三讲归属（实际 ${fenGroups.join(",")}）`,
  );

  // 三讲非空且成员数 == 9
  const sanJiangMembers = bSnapshot.candidates.filter((candidate) =>
    candidate.groupIds.includes(SANJ_JIANG_GROUP_ID),
  ).length;
  check(
    sanJiangMembers === 9,
    `三讲成员 9 条（实际 ${sanJiangMembers}）`,
  );

  // 候选 ID 唯一（defineSnapshot 已校验引用完整性，这里显式再确认 9 条新 ID）
  const newIds = SANJ_JIANG_CHARS.map((character) =>
    makeCandidateId(
      "pingshui",
      character,
      SANJ_JIANG_TONE_CLASS,
      SANJ_JIANG_NAME,
    ),
  );
  check(
    new Set(newIds).size === newIds.length,
    "9 条三讲候选 ID 互不相同",
  );
  check(
    new Set(bSnapshot.candidates.map((candidate) => candidate.id)).size ===
      bSnapshot.candidates.length,
    "B 全部候选 ID 唯一",
  );

  // 不写 data/releases
  for (const relative of [aRelative, bRelative]) {
    const normalized = relative.split(path.sep).join("/");
    check(
      normalized.startsWith("data/normalized/") &&
        !normalized.includes("releases"),
      `输出路径不是 data/releases：${normalized}`,
    );
  }

  if (failures.length > 0) {
    section("断言失败（未写出任何文件）");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error("\n请先修正数据或常量，再重新构建。");
    process.exitCode = 1;
    return;
  }

  // ---- 落盘 ----
  section("写出");
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [relative, snapshot] of [
    [aRelative, aSnapshot],
    [bRelative, bSnapshot],
  ] as const) {
    const target = path.join(ROOT, relative);
    writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(`写出 ${relative.replaceAll(path.sep, "/")}`);
  }

  section("汇总");
  console.log("A：105/106，缺三讲，门槛失败 —— 用于复现缺部。");
  console.log("B：106/106，无空部，但 reviewStatus=unverified → 门槛仍失败。");
  console.log(
    "结构达标不等于内容审核通过；两份均未进 data/releases，补丁仍未生效。",
  );
}

main();
