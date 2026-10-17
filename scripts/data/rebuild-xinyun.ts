/**
 * 中华新韵（十四韵，项目重建表）生成器。
 *
 *   node --conditions=development scripts/data/rebuild-xinyun.ts [--full]
 *
 * 输入（只读本地快照，不联网）：
 *   data/raw/pinyin-data/pinyin.txt                读音源，只取本调候选
 *   data/raw/chinese_word_rhyme/Xinyun_Rhyme_FourRhyme_Edition.json   仅作对照，不作导入底本
 *
 * 输出：
 *   data/patches/xinyun-rebuild-report.dev.json    覆盖/未映射/冲突与绑定信息（默认）
 *   data/normalized/xinyun.rebuild.dev.json        完整重建表（仅 --full）
 *
 * 该表是“项目重建表，非官方原始字表”，reviewStatus 一律 unverified，不得作为已审核发布数据。
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  businessContentDigest,
  canonicalJson,
} from "../../packages/lexicon/src/digest.js";
import {
  XINYUN_GENERATOR_VERSION,
  XINYUN_RULES_VERSION,
  XINYUN_RULE_PROVENANCE,
  assignYun,
} from "../../packages/lexicon/src/xinyun/rules.js";
import { parsePinyin } from "../../packages/lexicon/src/xinyun/pinyin.js";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PINYIN_FILE = path.join(ROOT, "data", "raw", "pinyin-data", "pinyin.txt");
const CANDIDATE_FILE = path.join(
  ROOT,
  "data",
  "raw",
  "chinese_word_rhyme",
  "Xinyun_Rhyme_FourRhyme_Edition.json",
);

const REBUILD_VERSION = "xinyun-rebuild-d1";
const PATCH_VERSION = "xinyun-patch-d1-draft";
const PINYIN_DATA = {
  repo: "mozillazg/pinyin-data",
  tag: "v0.15.0",
  revision: "fa9761fff402f8560196b1ba085c437c52b56d7c",
  license: "MIT",
  revisionNote:
    "GitHub API 不可达，标签经 git ls-remote 解析为上述提交；该提交与标签两处取回的 pinyin.txt/LICENSE 摘要与本地快照一致。",
};

const TONE_CLASS_NAME: Record<string, string> = {
  yinping: "阴平",
  yangping: "阳平",
  shang: "上声",
  qu: "去声",
  neutral: "轻声",
};

interface CharReading {
  character: string;
  readings: string[];
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
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

function candidateIndex(): Map<string, Set<string>> {
  const table = JSON.parse(
    readFileSync(CANDIDATE_FILE).toString("utf8"),
  ) as Record<string, Record<string, string[]>>;
  const index = new Map<string, Set<string>>();
  for (const [yun, tones] of Object.entries(table)) {
    for (const [tone, characters] of Object.entries(tones)) {
      for (const character of characters) {
        const key = `${yun}·${tone}`;
        const bucket = index.get(character);
        if (bucket === undefined) index.set(character, new Set([key]));
        else bucket.add(key);
      }
    }
  }
  return index;
}

function main(): void {
  const withFull = process.argv.includes("--full");
  const pinyinBytes = readFileSync(PINYIN_FILE);
  const rows = parsePinyinFile(pinyinBytes.toString("utf8"));

  const members = new Map<string, string[]>();
  const unmapped = new Map<string, { count: number; samples: string[] }>();
  const perCharacter = new Map<string, Set<string>>();
  const noteUnmapped = (reason: string, sample: string): void => {
    const bucket = unmapped.get(reason) ?? { count: 0, samples: [] };
    bucket.count += 1;
    if (bucket.samples.length < 20) bucket.samples.push(sample);
    unmapped.set(reason, bucket);
  };
  let readings = 0;
  let mappedReadings = 0;
  let neutralReadings = 0;
  let ruleUnverifiedReadings = 0;

  for (const row of rows) {
    for (const raw of row.readings) {
      readings += 1;
      const parsed = parsePinyin(raw);
      if (!parsed.ok) {
        noteUnmapped(parsed.reason, `${row.character}:${raw}`);
        continue;
      }
      const assignment = assignYun(parsed.syllable);
      if (!assignment.ok) {
        noteUnmapped(
          assignment.reason,
          `${row.character}:${raw}（${assignment.detail}）`,
        );
        continue;
      }
      mappedReadings += 1;
      const { yun, toneClass, ruleUnverified } = assignment.assignment;
      if (ruleUnverified) ruleUnverifiedReadings += 1;
      if (toneClass === "neutral") {
        neutralReadings += 1;
        continue;
      }
      const groupName = `${yun}·${TONE_CLASS_NAME[toneClass] ?? toneClass}`;
      const bucket = members.get(groupName) ?? [];
      bucket.push(row.character);
      members.set(groupName, bucket);

      const keys = perCharacter.get(row.character) ?? new Set<string>();
      keys.add(groupName);
      perCharacter.set(row.character, keys);
    }
  }

  for (const [groupName, characters] of members) {
    members.set(groupName, [...new Set(characters)].sort());
  }

  const groupCounts: Record<string, number> = {};
  const sortedGroups = [...members.keys()].sort();
  for (const name of sortedGroups)
    groupCounts[name] = members.get(name)?.length ?? 0;

  const rebuild = {
    groups: sortedGroups.map((name) => ({
      name,
      members: members.get(name) ?? [],
    })),
  };

  const candidates = candidateIndex();
  let conflicts = 0;
  let extra = 0;
  let absent = 0;
  const conflictSamples: string[] = [];
  for (const [character, keys] of [...perCharacter.entries()].sort(
    ([a], [b]) => (a < b ? -1 : 1),
  )) {
    const reference = candidates.get(character);
    if (reference === undefined) continue;
    const onlyRebuild = [...keys].filter((key) => !reference.has(key)).sort();
    const onlyCandidate = [...reference].filter((key) => !keys.has(key)).sort();
    if (onlyRebuild.length === 0 && onlyCandidate.length === 0) continue;
    conflicts += 1;
    extra += onlyRebuild.length;
    absent += onlyCandidate.length;
    if (conflictSamples.length < 30) {
      conflictSamples.push(
        `${character}|重建:${onlyRebuild.join(",") || "-"}|候选表:${onlyCandidate.join(",") || "-"}`,
      );
    }
  }

  const descriptor = {
    note: "项目重建表，非官方原始字表；规则出处待核实。",
    generatorVersion: XINYUN_GENERATOR_VERSION,
    rulesVersion: XINYUN_RULES_VERSION,
    rulesProvenance: XINYUN_RULE_PROVENANCE,
    rebuildVersion: REBUILD_VERSION,
    patchVersion: PATCH_VERSION,
    readingSource: {
      ...PINYIN_DATA,
      snapshotSha256: sha256(pinyinBytes.toString("utf8")),
      file: "data/raw/pinyin-data/pinyin.txt",
    },
    businessDigest: businessContentDigest(rebuild),
  };

  const report = {
    descriptor,
    coverage: {
      sourceCharacters: rows.length,
      readings,
      mappedReadings,
      unmappedReadings: readings - mappedReadings,
      neutralReadingsDropped: neutralReadings,
      ruleUnverifiedReadings,
      charactersWithAssignment: perCharacter.size,
      groups: sortedGroups.length,
      groupCounts,
    },
    unmapped: Object.fromEntries([...unmapped.entries()].sort()),
    candidateTableComparison: {
      comparedCharacters: perCharacter.size,
      conflictedCharacters: conflicts,
      rebuildOnlyMemberships: extra,
      candidateOnlyMemberships: absent,
      samples: conflictSamples,
    },
  };

  mkdirSync(path.join(ROOT, "data", "patches"), { recursive: true });
  const reportPath = path.join(
    ROOT,
    "data",
    "patches",
    "xinyun-rebuild-report.dev.json",
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  let fullPath: string | null = null;
  if (withFull) {
    mkdirSync(path.join(ROOT, "data", "normalized"), { recursive: true });
    fullPath = path.join(ROOT, "data", "normalized", "xinyun.rebuild.dev.json");
    writeFileSync(
      fullPath,
      `${JSON.stringify({ descriptor, groups: rebuild.groups }, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(
    `读音源字符 ${rows.length}；读音 ${readings}；已归部 ${mappedReadings}`,
  );
  console.log(
    `未映射读音 ${readings - mappedReadings}；轻声丢弃 ${neutralReadings}；规则待核实影响读音 ${ruleUnverifiedReadings}`,
  );
  console.log(`覆盖字形 ${perCharacter.size}；子卷 ${sortedGroups.length}`);
  console.log(
    `与候选表对照：冲突字形 ${conflicts}；仅重建有 ${extra}；仅候选表有 ${absent}`,
  );
  console.log(`业务内容摘要：${descriptor.businessDigest}`);
  console.log(`报告：${path.relative(ROOT, reportPath)}`);
  if (fullPath !== null)
    console.log(`完整表：${path.relative(ROOT, fullPath)}`);
  console.log(
    `规范化长度（用于复核摘要稳定性）：${canonicalJson(rebuild).length}`,
  );
}

main();
