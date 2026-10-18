/**
 * 词林正韵全量快照（19 部 / 33 子卷）→ data/normalized/cilin.full-d2.json
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/build-cilin.ts
 *
 * 规则：
 * - 只读 data/raw 的固定快照，不联网、不改写原表、不执行上游脚本。
 * - 来源只标「仄声」的记录一律保留 ze_unspecified，**不臆补上/去**。
 * - 韵部（第 N 部）与子卷（第 N 部·平/仄/入声）分开表达，不凑空记录。
 * - 不与平水做无依据的一字一部合并。
 * - reviewStatus 固定 unverified；不写 data/releases；断言先于落盘。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
  Tone,
} from "@poetry/contracts";

import {
  CILIN_GATE,
  checkCompleteness,
  defineSnapshot,
  makeCandidateId,
} from "../../packages/lexicon/src/index.js";
import type { SnapshotInput } from "../../packages/lexicon/src/snapshot.js";

import {
  ROOT,
  check,
  failures,
  finish,
  manifestDigestFor,
  printSnapshotReport,
  section,
  sha256Bytes,
} from "./snapshot-report.js";

const RAW_REL = "data/raw/chinese_word_rhyme/Cilin_Rhyme.json";
const OUT_REL = "data/normalized/cilin.full-d2.json";
const DATA_VERSION = "cilin-cwr-ff0e9c1-d2-full";
const CWR_REVISION = "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18";
const SOURCE_ID = "src:chinese_word_rhyme";

/** 词林子卷声类 → 契约声类与本调。 */
const TONE_MAP: Readonly<
  Record<string, { toneClass: ReadingCandidate["toneClass"]; tone: Tone }>
> = {
  平声: { toneClass: "ping", tone: "P" },
  仄声: { toneClass: "ze_unspecified", tone: "Z" },
  入声: { toneClass: "ru", tone: "Z" },
};

const NOTICE =
  "词林正韵全量候选（19 部 / 33 子卷）：源自 chinese_word_rhyme 固定提交 ff0e9c13 的原表转载，" +
  "仅登记部/声归属与平仄；反切、义项、今读一律为 null。" +
  "前 14 部分平/仄两个子卷，第 15–19 部只标入声。" +
  "来源仅标「仄声」的记录一律保留 ze_unspecified（不改写成上声或去声，也不臆测具体古声类）。" +
  "本表不与平水韵做无依据的一字一部合并。" +
  "reviewStatus=unverified，未经人审签，不得作为发布数据，也不得据此启用词牌或允许平仄通押。";

type CilinTable = Record<string, Record<string, string[]>>;

function main(): void {
  section("输入检查");
  const rawFile = path.join(ROOT, RAW_REL);
  check(existsSync(rawFile), `原表存在：${RAW_REL}`);
  if (!existsSync(rawFile)) {
    finish("（输入缺失，未生成）");
    return;
  }
  const rawBytes = readFileSync(rawFile);
  const rawDigest = sha256Bytes(rawBytes);
  console.log(`原表 SHA-256：${rawDigest}`);
  const registered = manifestDigestFor(RAW_REL);
  check(
    registered !== null,
    `manifest 已登记该快照摘要（${registered ?? "未登记"}）`,
  );
  check(
    registered === rawDigest,
    `原表摘要与 manifest 登记值一致（manifest=${registered ?? "null"}）`,
  );

  const table = JSON.parse(rawBytes.toString("utf8")) as CilinTable;
  const ordinals = Object.keys(table);

  section("构建快照");
  const sources: SourceRecord[] = [
    {
      id: SOURCE_ID,
      title: "chinese_word_rhyme（Cilin_Rhyme.json）",
      edition: `提交 ${CWR_REVISION} · Cilin_Rhyme.json`,
      url: `https://raw.githubusercontent.com/charlesix59/chinese_word_rhyme/${CWR_REVISION}/data/Cilin_Rhyme.json`,
      license: "MIT（上游转载授权链未核实）",
      snapshotSha256: rawDigest,
      revision: CWR_REVISION,
      retrievedAt: null,
    },
  ];
  const groups: RhymeGroup[] = [];
  const evidence: Evidence[] = [];
  const candidates: ReadingCandidate[] = [];
  const seenCandidateIds = new Set<string>();
  const subVolumeCounts = new Map<string, number>();

  for (const [ordinal, tones] of Object.entries(table)) {
    for (const [toneName, characters] of Object.entries(tones)) {
      const mapping = TONE_MAP[toneName];
      if (mapping === undefined) {
        check(false, `未知子卷声类「${ordinal}·${toneName}」`);
        continue;
      }
      const groupName = `${ordinal}·${toneName}`;
      const groupId = `group:cilin:${ordinal}:${groupName}`;
      const evidenceId = `ev:cilin:${ordinal}:${groupName}`;
      const locator = `${RAW_REL} ${ordinal}/${toneName}`;
      const unique = [...new Set(characters)];

      subVolumeCounts.set(toneName, (subVolumeCounts.get(toneName) ?? 0) + 1);

      groups.push({
        id: groupId,
        book: "cilin",
        name: groupName,
        toneClass: mapping.toneClass,
        evidenceIds: [evidenceId],
      });
      evidence.push({
        id: evidenceId,
        sourceId: SOURCE_ID,
        kind: "rhyme_entry",
        locator,
        assertion:
          `${locator} 共收录 ${unique.length} 个字形（原表条目 ${characters.length} 条）；` +
          (toneName === "仄声"
            ? "来源只标仄声，故保留 ze_unspecified，不臆补上声或去声。"
            : `声类按来源标为 ${mapping.toneClass}。`),
        excerpt: null,
        reviewStatus: "unverified",
      });

      for (const character of unique) {
        const id = makeCandidateId(
          "cilin",
          character,
          mapping.toneClass,
          groupName,
        );
        if (seenCandidateIds.has(id)) continue;
        seenCandidateIds.add(id);
        candidates.push({
          id,
          character,
          book: "cilin",
          toneClass: mapping.toneClass,
          tone: mapping.tone,
          groupIds: [groupId],
          gloss: null,
          modernReading: null,
          fanqie: null,
          evidenceIds: [evidenceId],
        });
      }
    }
  }

  const input: SnapshotInput = {
    dataVersion: DATA_VERSION,
    book: "cilin",
    reviewStatus: "unverified",
    notice: NOTICE,
    candidates,
    groups,
    evidence,
    sources,
  };
  const snapshot = defineSnapshot(input);
  const report = checkCompleteness(snapshot, CILIN_GATE);

  printSnapshotReport("词林正韵（19 部 / 33 子卷）", OUT_REL, snapshot, report);

  section("断言");
  check(ordinals.length === 19, `部数 19（实际 ${ordinals.length}）`);
  check(report.groupCount === 33, `子卷数 33（实际 ${report.groupCount}）`);
  check(
    subVolumeCounts.get("平声") === 14 &&
      subVolumeCounts.get("仄声") === 14 &&
      subVolumeCounts.get("入声") === 5,
    `子卷分布 平声 14 / 仄声 14 / 入声 5（实际 平声 ${subVolumeCounts.get("平声") ?? 0} / 仄声 ${subVolumeCounts.get("仄声") ?? 0} / 入声 ${subVolumeCounts.get("入声") ?? 0}）`,
  );
  check(
    report.missingGroups.length === 0,
    `missingGroups 为空（实际 [${report.missingGroups.join(",")}]）`,
  );
  check(
    report.emptyGroups.length === 0,
    `emptyGroups 为空（实际 [${report.emptyGroups.join(",")}]）`,
  );
  check(
    report.unexpectedGroups.length === 0,
    `unexpectedGroups 为空（实际 [${report.unexpectedGroups.join(",")}]）`,
  );
  check(
    snapshot.reviewStatus === "unverified",
    "reviewStatus 仍为 unverified（未被改动）",
  );
  check(
    report.releaseGatePassed === false,
    "releaseGatePassed === false（未 approved，不得通过）",
  );

  // 仄声不得被臆补成上/去
  const guessed = snapshot.candidates.filter(
    (candidate) => candidate.toneClass === "shang" || candidate.toneClass === "qu",
  );
  check(
    guessed.length === 0,
    `没有任何候选被臆补成上声/去声（实际 ${guessed.length} 条）`,
  );
  const zeCandidates = snapshot.candidates.filter(
    (candidate) => candidate.toneClass === "ze_unspecified",
  );
  check(
    zeCandidates.length > 0 &&
      zeCandidates.every((candidate) => candidate.tone === "Z"),
    `ze_unspecified 候选一律 tone=Z（共 ${zeCandidates.length} 条）`,
  );
  const pingCandidates = snapshot.candidates.filter(
    (candidate) => candidate.toneClass === "ping",
  );
  check(
    pingCandidates.every((candidate) => candidate.tone === "P"),
    `ping 候选一律 tone=P（共 ${pingCandidates.length} 条）`,
  );
  const ruCandidates = snapshot.candidates.filter(
    (candidate) => candidate.toneClass === "ru",
  );
  check(
    ruCandidates.every((candidate) => candidate.tone === "Z"),
    `ru 候选一律 tone=Z（共 ${ruCandidates.length} 条）`,
  );

  check(
    new Set(snapshot.candidates.map((candidate) => candidate.id)).size ===
      snapshot.candidates.length,
    "全部候选 ID 唯一",
  );
  check(
    OUT_REL.startsWith("data/normalized/"),
    `输出路径不是 data/releases：${OUT_REL}`,
  );

  if (failures.length > 0) {
    finish("（断言未通过，未写出任何文件）");
    return;
  }

  section("写出");
  mkdirSync(path.join(ROOT, "data", "normalized"), { recursive: true });
  const target = path.join(ROOT, OUT_REL);
  writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`写出 ${OUT_REL}`);

  finish(
    "词林快照已落盘；结构达标（19 部 / 33 子卷、无空卷），但 reviewStatus=unverified，" +
      "evidence 未审核，releaseGatePassed=false，未进 data/releases。",
  );
}

main();
