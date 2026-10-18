/**
 * 中华新韵（十四韵）全量快照 → data/normalized/xinyun.full-d2.json
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/build-xinyun.ts
 *
 * 身份：**项目重建表，非官方原始字表**。
 * - 归部规则与拼音正规化来自 packages/lexicon/src/xinyun/（不在这里重写规则）。
 * - 读音源为固定提交的 pinyin-data，只取**本调**；语流变调一律不当格律本调。
 * - 轻声本调不明：丢弃并计入报告，**不默认归平**。
 * - 候选表 Xinyun_Rhyme_FourRhyme_Edition.json 仅作对照，不作导入底本。
 * - reviewStatus 固定 unverified；不写 data/releases；断言先于落盘。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

/** 去掉调号、保留 ü（lü 不能并成 lu）；用于 modernReading.pinyin。 */
const TONE_COMBINING_MARKS = new Set(["\u0304", "\u0301", "\u030C", "\u0300"]);
function tonelessPinyin(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  const numbered = /^([a-züv:]+)([1-5])$/u.exec(lowered);
  if (numbered !== null) {
    return (numbered[1] ?? "").replace(/u:|v/gu, "ü");
  }
  const stripped = [...lowered.normalize("NFD")]
    .filter((mark) => !TONE_COMBINING_MARKS.has(mark))
    .join("");
  return stripped.normalize("NFC");
}

import path from "node:path";

import type {
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
  Tone,
} from "@poetry/contracts";

import {
  XINYUN_GATE,
  XINYUN_GENERATOR_VERSION,
  XINYUN_RULES_VERSION,
  XINYUN_RULE_PROVENANCE,
  assignYun,
  checkCompleteness,
  defineSnapshot,
  makeCandidateId,
} from "../../packages/lexicon/src/index.js";
import type { SnapshotInput } from "../../packages/lexicon/src/snapshot.js";
import { parsePinyin } from "../../packages/lexicon/src/xinyun/pinyin.js";

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

const PINYIN_REL = "data/raw/pinyin-data/pinyin.txt";
const OUT_REL = "data/normalized/xinyun.full-d2.json";
const DATA_VERSION = "xinyun-rebuild-d2-full";
const PINYIN_REVISION = "fa9761fff402f8560196b1ba085c437c52b56d7c";
const PINYIN_TAG = "v0.15.0";
const SOURCE_ID = "src:pinyin-data";

const TONE_NAME: Readonly<Record<string, string>> = {
  yinping: "阴平",
  yangping: "阳平",
  shang: "上声",
  qu: "去声",
};

const TONE_OF_CLASS: Readonly<Record<string, Tone>> = {
  yinping: "P",
  yangping: "P",
  shang: "Z",
  qu: "Z",
};

const NOTICE =
  "中华新韵（十四韵，项目重建表，非官方原始字表）：归部由本项目编码的十四韵规则 + 固定提交的 " +
  `pinyin-data 读音源重建（规则版本 ${XINYUN_RULES_VERSION}，生成器 ${XINYUN_GENERATOR_VERSION}）。` +
  `规则出处状态=${XINYUN_RULE_PROVENANCE.status}：权威规则文本（发布机构、版次、页码）尚未取得；` +
  "与中华通韵（十六韵）不可互换。" +
  "声调按普通话本调：一/二声为平（P），三/四声为仄（Z）；轻声本调不明者已丢弃计数，不默认归平。" +
  "「一」等字的语流变调不作为格律本调，冲突另见 data/patches/xinyun-yi-conflict.draft.json。" +
  "「er」归十二齐为待核实项。" +
  "入声到今音只按具体字与读音建立联系，不按旧韵部整体映射；本表不含古入声标记。" +
  "reviewStatus=unverified，未经人审签，不得作为发布数据。";

interface CharReading {
  character: string;
  readings: string[];
}

function parsePinyinFile(text: string): CharReading[] {
  const rows: CharReading[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("U+")) continue;
    const match = /^U\+([0-9A-Fa-f]+):\s*([^#]+?)\s*(?:#.*)?$/u.exec(line);
    if (match === null) continue;
    const code = match[1];
    const readings = match[2];
    if (code === undefined || readings === undefined) continue;
    const character = String.fromCodePoint(Number.parseInt(code, 16));
    rows.push({
      character,
      readings: readings
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    });
  }
  return rows;
}

function main(): void {
  section("输入检查");
  const pinyinFile = path.join(ROOT, PINYIN_REL);
  check(existsSync(pinyinFile), `读音源存在：${PINYIN_REL}`);
  if (!existsSync(pinyinFile)) {
    finish("（输入缺失，未生成）");
    return;
  }
  const pinyinBytes = readFileSync(pinyinFile);
  const pinyinDigest = sha256Bytes(pinyinBytes);
  console.log(`读音源 SHA-256：${pinyinDigest}`);
  const registered = manifestDigestFor(PINYIN_REL);
  check(
    registered === pinyinDigest,
    `读音源摘要与 manifest 登记值一致（manifest=${registered ?? "null"}）`,
  );

  section("重建（规则 + 读音源）");
  const rows = parsePinyinFile(pinyinBytes.toString("utf8"));
  /** groupName → 字形 → 源读音集合（"无调号拼音#调值"）。保留每个具体读音，不把「同归部」当「同读音」。 */
  const members = new Map<string, Map<string, Set<string>>>();
  const perCharacterGroups = new Map<string, Set<string>>();
  const unmappedReasons = new Map<string, number>();
  /** 同 (字形, 子卷) 多个读音：候选只能承载一条 modernReading，其余必须列出，不得静默丢弃。 */
  const readingCollisions: { character: string; groupName: string; readings: string[] }[] = [];
  let readings = 0;
  let mappedReadings = 0;
  let neutralReadings = 0;
  let ruleUnverifiedReadings = 0;

  for (const row of rows) {
    for (const raw of row.readings) {
      readings += 1;
      const parsed = parsePinyin(raw);
      if (!parsed.ok) {
        unmappedReasons.set(
          parsed.reason,
          (unmappedReasons.get(parsed.reason) ?? 0) + 1,
        );
        continue;
      }
      const assignment = assignYun(parsed.syllable);
      if (!assignment.ok) {
        unmappedReasons.set(
          assignment.reason,
          (unmappedReasons.get(assignment.reason) ?? 0) + 1,
        );
        continue;
      }
      mappedReadings += 1;
      const { yun, toneClass, ruleUnverified } = assignment.assignment;
      if (ruleUnverified) ruleUnverifiedReadings += 1;
      if (toneClass === "neutral") {
        // 轻声：本调不明，丢弃计数，不默认归平，也不建候选。
        neutralReadings += 1;
        continue;
      }
      const toneName = TONE_NAME[toneClass];
      if (toneName === undefined) {
        unmappedReasons.set(
          "UNKNOWN_TONE_CLASS",
          (unmappedReasons.get("UNKNOWN_TONE_CLASS") ?? 0) + 1,
        );
        continue;
      }
      const groupName = `${yun}·${toneName}`;
      const bucket = members.get(groupName) ?? new Map<string, Set<string>>();
      const charReadings = bucket.get(row.character) ?? new Set<string>();
      charReadings.add(`${tonelessPinyin(parsed.syllable.raw)}#${parsed.syllable.toneNumber}`);
      bucket.set(row.character, charReadings);
      members.set(groupName, bucket);
      const groups = perCharacterGroups.get(row.character) ?? new Set<string>();
      groups.add(groupName);
      perCharacterGroups.set(row.character, groups);
    }
  }

  console.log(`读音源字符 ${rows.length}；读音 ${readings}；已归部 ${mappedReadings}`);
  console.log(
    `未映射 ${readings - mappedReadings}；轻声丢弃 ${neutralReadings}（按读音计）；规则待核实影响 ${ruleUnverifiedReadings}`,
  );
  console.log(`覆盖字形 ${perCharacterGroups.size}；子卷 ${members.size}`);
  for (const [reason, count] of [...unmappedReasons.entries()].sort()) {
    console.log(`  未映射原因 ${reason}：${count}`);
  }

  const source: SourceRecord = {
    id: SOURCE_ID,
    title: "pinyin-data（现代读音主表，用于中华新韵重建表）",
    edition: `${PINYIN_TAG}（提交 ${PINYIN_REVISION}）`,
    url: `https://raw.githubusercontent.com/mozillazg/pinyin-data/${PINYIN_REVISION}/pinyin.txt`,
    license: "MIT（只覆盖该仓库整理成果，不覆盖十四韵规则本身）",
    snapshotSha256: pinyinDigest,
    revision: PINYIN_REVISION,
    retrievedAt: null,
  };

  const groups: RhymeGroup[] = [];
  const evidence: Evidence[] = [];
  const candidates: ReadingCandidate[] = [];
  const seenCandidateIds = new Set<string>();

  for (const groupName of [...members.keys()].sort()) {
    const yun = groupName.split("·")[0] ?? groupName;
    const toneName = groupName.split("·")[1] ?? "";
    const toneClass = Object.keys(TONE_NAME).find(
      (key) => TONE_NAME[key] === toneName,
    );
    if (toneClass === undefined) {
      check(false, `未知声调子卷「${groupName}」`);
      continue;
    }
    const tone = TONE_OF_CLASS[toneClass];
    if (tone === undefined) {
      check(false, `声调类 ${toneClass} 无对应平仄`);
      continue;
    }
    const byCharacter = members.get(groupName) ?? new Map<string, Set<string>>();
    const characters = [...byCharacter.keys()].sort();
    const groupId = `group:xinyun:${yun}:${groupName}`;
    const evidenceId = `ev:xinyun:${yun}:${groupName}`;
    const locator = `${PINYIN_REL}（${PINYIN_TAG}）+ 十四韵规则 ${XINYUN_RULES_VERSION} → ${groupName}`;

    groups.push({
      id: groupId,
      book: "xinyun",
      name: groupName,
      toneClass,
      evidenceIds: [evidenceId],
    });
    evidence.push({
      id: evidenceId,
      sourceId: SOURCE_ID,
      kind: "dictionary",
      locator,
      assertion:
        `按本调归部：${groupName} 收录 ${characters.length} 个字形；` +
        `声调类 ${toneClass} → 平仄 ${tone}。该归部为项目重建表结论，十四韵规则权威文本待核实。`,
      excerpt: null,
      reviewStatus: "unverified",
    });

    for (const character of characters) {
      const id = makeCandidateId("xinyun", character, toneClass, groupName);
      if (seenCandidateIds.has(id)) continue;
      seenCandidateIds.add(id);
      const readings = [
        ...(byCharacter.get(character) ?? new Set<string>()),
      ].sort();
      const [pinyin = "", toneText = ""] = (readings[0] ?? "").split("#");
      if (readings.length > 1) {
         readingCollisions.push({ character, groupName, readings });
      }
      candidates.push({
        id,
        character,
        book: "xinyun",
        toneClass: toneClass as ReadingCandidate["toneClass"],
        tone,
        groupIds: [groupId],
        gloss: null,
        modernReading: {
          pinyin,
          toneNumber: Number(toneText) as 1 | 2 | 3 | 4 | 5,
          evidenceIds: [evidenceId],
        },
        fanqie: null,
        evidenceIds: [evidenceId],
      });
    }
  }

  if (readingCollisions.length > 0) {
    const collisionPath = path.join(
      ROOT,
      "data",
      "patches",
      "xinyun-reading-collisions.dev.json",
    );
    writeFileSync(
      collisionPath,
      `${JSON.stringify(
        {
          title: "同(字形,子卷)多读音清单（候选只承载一条 modernReading，其余在此列明）",
          generatedBy: "scripts/data/build-xinyun.ts",
          note: "不得把「同归部」当成「同读音」：这些字形在该子卷下有多个源读音，未合并、未丢弃。",
          count: readingCollisions.length,
          items: readingCollisions,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(
      `同(字,子卷)多读音 ${readingCollisions.length} 组，已写入 ${path.relative(ROOT, collisionPath)}`,
    );
  } else {
    console.log("同(字,子卷)多读音 0 组");
  }

  const input: SnapshotInput = {
    dataVersion: DATA_VERSION,
    book: "xinyun",
    reviewStatus: "unverified",
    notice: NOTICE,
    candidates,
    groups,
    evidence,
    sources: [source],
  };
  const snapshot = defineSnapshot(input);
  const report = checkCompleteness(snapshot, XINYUN_GATE);

  printSnapshotReport(
    "中华新韵（十四韵，项目重建表）",
    OUT_REL,
    snapshot,
    report,
  );

  section("断言");
  check(report.groupCount === 56, `子卷数 56（实际 ${report.groupCount}）`);
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

  const gateNames = new Set(XINYUN_GATE.groups.map((entry) => entry.name));
  const actualNames = new Set(snapshot.groups.map((group) => group.name));
  check(
    [...gateNames].every((name) => actualNames.has(name)) &&
      [...actualNames].every((name) => gateNames.has(name)),
    "子卷名称集合与 XINYUN_GATE 逐字一致",
  );

  // 本调映射：一二声 P、三四声 Z；不得出现 neutral
  const neutralCandidates = snapshot.candidates.filter(
    (candidate) => candidate.toneClass === "neutral" || candidate.tone === null,
  );
  check(
    neutralCandidates.length === 0,
    `没有 tone=null 或 neutral 的候选（轻声已丢弃计数，实际 ${neutralCandidates.length} 条）`,
  );
  const wrongTone = snapshot.candidates.filter((candidate) => {
    if (candidate.toneClass === "yinping" || candidate.toneClass === "yangping")
      return candidate.tone !== "P";
    if (candidate.toneClass === "shang" || candidate.toneClass === "qu")
      return candidate.tone !== "Z";
    return true;
  });
  check(
    wrongTone.length === 0,
    `本调平仄映射正确（一二声 P、三四声 Z；异常 ${wrongTone.length} 条）`,
  );

  // 「一」的 yì（去声）是语流变调嫌疑，属**已登记未裁决冲突**。
  // 纪律要求保留原候选与冲突证据，故此处断言它存在并被单列，而不是被静默删除。
  const yiCandidates = snapshot.candidates.filter(
    (candidate) => candidate.character === "一",
  );
  const yiQu = yiCandidates.filter((candidate) => candidate.toneClass === "qu");
  check(
    yiCandidates.length >= 2,
    `「一」保留多候选（实际 ${yiCandidates.length} 条：${yiCandidates.map((candidate) => candidate.toneClass).join("/")}）`,
  );
  check(
    yiQu.length === 1,
    `「一」的去声候选被保留而非删除（实际 ${yiQu.length} 条）`,
  );
  const conflictFile = path.join(
    ROOT,
    "data",
    "patches",
    "xinyun-yi-conflict.draft.json",
  );
  check(
    existsSync(conflictFile),
    "「一」冲突登记文件存在：data/patches/xinyun-yi-conflict.draft.json",
  );
  if (existsSync(conflictFile)) {
    const conflict = JSON.parse(readFileSync(conflictFile, "utf8")) as {
      resolution?: unknown;
      target?: { character?: string };
    };
    check(conflict.target?.character === "一", "冲突登记指向「一」");
    check(
      conflict.resolution === null,
      "冲突尚未裁决（resolution === null），不得默认采用任一声调",
    );
  }

  // modernReading 必须承载具体源读音，且与声调类一致
  const missingModern = snapshot.candidates.filter(
    (candidate) => candidate.modernReading === null,
  );
  check(
    missingModern.length === 0,
    `全部候选都带 modernReading（缺失 ${missingModern.length} 条）`,
  );
  const toneMarkedPinyin = snapshot.candidates.filter((candidate) =>
    /[\u0300-\u036f]/u.test(candidate.modernReading?.pinyin ?? ""),
  );
  check(
    toneMarkedPinyin.length === 0,
    `modernReading.pinyin 为去调号写法（带调号 ${toneMarkedPinyin.length} 条）`,
  );
  const expectedToneNumber: Record<string, number> = {
    yinping: 1,
    yangping: 2,
    shang: 3,
    qu: 4,
  };
  const toneNumberMismatch = snapshot.candidates.filter((candidate) => {
    const expected = expectedToneNumber[candidate.toneClass];
    return (
      expected !== undefined && candidate.modernReading?.toneNumber !== expected
    );
  });
  check(
    toneNumberMismatch.length === 0,
    `modernReading.toneNumber 与声调类一致（异常 ${toneNumberMismatch.length} 条）`,
  );
  check(
    snapshot.candidates.every(
      (candidate) => (candidate.modernReading?.pinyin ?? "") !== "",
    ),
    "modernReading.pinyin 均非空（不得用同归部代替同读音）",
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
  writeFileSync(
    path.join(ROOT, OUT_REL),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
  console.log(`写出 ${OUT_REL}`);

  finish(
    "新韵重建快照已落盘；结构达标（14 韵 / 56 子卷、无空卷），但这是项目重建表、" +
      "规则出处 unverified、reviewStatus=unverified，releaseGatePassed=false，未进 data/releases。",
  );
}

main();
