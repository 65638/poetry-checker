/**
 * 测试专用合成快照。来源与证据全部为内部合成 ID，明确不作为真实判音依据。
 *
 * 真实七字小样本见 data/normalized/pingshui.sample-d1.json 与 real-sample.test.ts；
 * 本文件不得进入任何发布路径。
 */
import type { Evidence, RhymeGroup, SourceRecord } from "@poetry/contracts";

import type { SnapshotInput } from "../src/snapshot.js";

export const FIXTURE_VERSION = "fixture-lexicon-d1";
export const XINYUN_FIXTURE_VERSION = "fixture-lexicon-xinyun-d1";
export const SYNTHETIC_SOURCE_ID = "src-synthetic-internal";

export const syntheticSource: SourceRecord = {
  id: SYNTHETIC_SOURCE_ID,
  title: "内部合成测试来源（非真实韵书、非判音依据）",
  edition: null,
  url: null,
  license: "internal-test-only",
  snapshotSha256: null,
  revision: null,
  retrievedAt: null,
};

function evidence(
  id: string,
  locator: string,
  assertion: string,
  sourceId: string = SYNTHETIC_SOURCE_ID,
): Evidence {
  return {
    id,
    sourceId,
    kind: "rhyme_entry",
    locator,
    assertion,
    excerpt: null,
    reviewStatus: "unverified",
  };
}

function group(
  id: string,
  name: string,
  toneClass: string,
  evidenceIds: string[],
): RhymeGroup {
  return { id, book: "pingshui", name, toneClass, evidenceIds };
}

/** 平水 fixture：保留“更”的平/去两个候选，不覆盖。 */
export function pingshuiFixture(): SnapshotInput {
  const groups: RhymeGroup[] = [
    group("g-ps-ru-yi", "入声四质", "ru", ["ev-ps-ru-yi"]),
    group("g-ps-ping-geng", "八庚", "ping", ["ev-ps-ping-geng"]),
    group("g-ps-qu-jing", "二十四敬", "qu", ["ev-ps-qu-jing"]),
    group("g-ps-ru-mo", "入声十一陌", "ru", ["ev-ps-ru-mo"]),
    group("g-ps-ping-you", "十一尤", "ping", ["ev-ps-ping-you"]),
    group("g-ps-ru-xie", "入声九屑", "ru", ["ev-ps-ru-xie"]),
    group("g-ps-ru-wu", "入声五物", "ru", ["ev-ps-ru-wu"]),
  ];

  const evidenceList: Evidence[] = [
    evidence("ev-ps-ru-yi", "synthetic 入声部/入声四质", "合成：一 归入声四质"),
    evidence(
      "ev-ps-ping-geng",
      "synthetic 下平声部/八庚",
      "合成：更 归下平八庚",
    ),
    evidence(
      "ev-ps-qu-jing",
      "synthetic 去声部/二十四敬",
      "合成：更 归去声二十四敬",
    ),
    evidence(
      "ev-ps-ru-mo",
      "synthetic 入声部/入声十一陌",
      "合成：白 归入声十一陌",
    ),
    evidence(
      "ev-ps-ping-you",
      "synthetic 下平声部/十一尤",
      "合成：流、楼 归下平十一尤",
    ),
    evidence(
      "ev-ps-ru-xie",
      "synthetic 入声部/入声九屑",
      "合成：雪 归入声九屑",
    ),
    evidence("ev-ps-ru-wu", "synthetic 入声部/入声五物", "合成：物 归入声五物"),
  ];

  const candidate = (
    character: string,
    toneClass: "ping" | "qu" | "ru",
    groupId: string,
    evidenceId: string,
  ) => ({
    id: `${character}-${toneClass}`,
    character,
    book: "pingshui" as const,
    toneClass,
    tone: toneClass === "ping" ? ("P" as const) : ("Z" as const),
    groupIds: [groupId],
    gloss: null,
    modernReading: null,
    fanqie: null,
    evidenceIds: [evidenceId],
  });

  return {
    dataVersion: FIXTURE_VERSION,
    book: "pingshui",
    reviewStatus: "fixture",
    notice: "合成 fixture，仅用于结构与流程验证，不是真实判音依据。",
    candidates: [
      candidate("一", "ru", "g-ps-ru-yi", "ev-ps-ru-yi"),
      candidate("更", "ping", "g-ps-ping-geng", "ev-ps-ping-geng"),
      candidate("更", "qu", "g-ps-qu-jing", "ev-ps-qu-jing"),
      candidate("白", "ru", "g-ps-ru-mo", "ev-ps-ru-mo"),
      candidate("流", "ping", "g-ps-ping-you", "ev-ps-ping-you"),
      candidate("楼", "ping", "g-ps-ping-you", "ev-ps-ping-you"),
      candidate("雪", "ru", "g-ps-ru-xie", "ev-ps-ru-xie"),
      candidate("物", "ru", "g-ps-ru-wu", "ev-ps-ru-wu"),
    ],
    groups,
    evidence: evidenceList,
    sources: [syntheticSource],
  };
}

/** 新韵 fixture：与平水完全独立的证据与来源，用于验证不跨书覆盖。 */
export function xinyunFixture(): SnapshotInput {
  const groups: RhymeGroup[] = [
    {
      id: "g-xy-si-kai-yang",
      book: "xinyun",
      name: "四开·阳平",
      toneClass: "yangping",
      evidenceIds: ["ev-xy-si-kai-yang"],
    },
    {
      id: "g-xy-shi-er-qi-yin",
      book: "xinyun",
      name: "十二齐·阴平",
      toneClass: "yinping",
      evidenceIds: ["ev-xy-shi-er-qi-yin"],
    },
    {
      id: "g-xy-shi-er-qi-qu",
      book: "xinyun",
      name: "十二齐·去声",
      toneClass: "qu",
      evidenceIds: ["ev-xy-shi-er-qi-qu"],
    },
    {
      id: "g-xy-san-jie-shang",
      book: "xinyun",
      name: "三皆·上声",
      toneClass: "shang",
      evidenceIds: ["ev-xy-san-jie-shang"],
    },
    {
      id: "g-xy-shi-si-gu-qu",
      book: "xinyun",
      name: "十四姑·去声",
      toneClass: "qu",
      evidenceIds: ["ev-xy-shi-si-gu-qu"],
    },
    {
      id: "g-xy-shi-yi-geng-yin",
      book: "xinyun",
      name: "十一庚·阴平",
      toneClass: "yinping",
      evidenceIds: ["ev-xy-shi-yi-geng-yin"],
    },
    {
      id: "g-xy-shi-yi-geng-qu",
      book: "xinyun",
      name: "十一庚·去声",
      toneClass: "qu",
      evidenceIds: ["ev-xy-shi-yi-geng-qu"],
    },
  ];

  const xinyunSource: SourceRecord = {
    ...syntheticSource,
    id: "src-synthetic-xinyun",
    title: "内部合成新韵测试来源（项目重建表样例，非官方字表、非判音依据）",
  };

  const evidenceList: Evidence[] = groups.map((item) =>
    evidence(
      item.evidenceIds[0] ?? "ev-xy-missing",
      `synthetic ${item.name}`,
      `合成：${item.name}`,
      xinyunSource.id,
    ),
  );

  const candidate = (
    character: string,
    toneClass: "yangping" | "yinping" | "shang" | "qu",
    groupId: string,
  ) => ({
    id: `${character}-${toneClass}`,
    character,
    book: "xinyun" as const,
    toneClass,
    tone:
      toneClass === "yinping" || toneClass === "yangping"
        ? ("P" as const)
        : ("Z" as const),
    groupIds: [groupId],
    gloss: null,
    modernReading: null,
    fanqie: null,
    evidenceIds: [`ev-${groupId.replace(/^g-/, "")}`],
  });

  return {
    dataVersion: XINYUN_FIXTURE_VERSION,
    book: "xinyun",
    reviewStatus: "fixture",
    notice:
      "合成 fixture：新韵候选结构与冲突身份验证用，不是真实判音依据，也不是官方原始字表。",
    candidates: [
      candidate("白", "yangping", "g-xy-si-kai-yang"),
      candidate("一", "yinping", "g-xy-shi-er-qi-yin"),
      candidate("一", "qu", "g-xy-shi-er-qi-qu"),
      candidate("雪", "shang", "g-xy-san-jie-shang"),
      candidate("物", "qu", "g-xy-shi-si-gu-qu"),
      candidate("更", "yinping", "g-xy-shi-yi-geng-yin"),
      candidate("更", "qu", "g-xy-shi-yi-geng-qu"),
    ],
    groups,
    evidence: evidenceList,
    sources: [xinyunSource],
  };
}
