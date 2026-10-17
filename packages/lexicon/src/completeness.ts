/**
 * 完整性检查器：按“准确韵目集合 + 非空内容”判定，而不是只数 groupCount。
 *
 * 关键约定：
 * - 检查器本身永远不抛异常：缺部数据要被检查器“报告缺部”，测试因此可以通过；
 *   数据是否达标由 releaseGatePassed 表达，二者必须分开汇报。
 * - 韵目名称逐字比对；靠占位凑够数字、或韵目写错但数量正好，都必须判不通过。
 */
import type { BookId } from "@poetry/contracts";

import type { LexiconSnapshot } from "./snapshot.js";

export interface GroupGate {
  /** 音系分卷/分声，例如 上平、下平、上、去、入，或词林的 第N部。 */
  bucket: string;
  /** 韵目原文（含声调子卷时用 · 连接），逐字与快照比对。 */
  name: string;
  /** 该卷记录的声类，用于和快照声明比对。 */
  toneClass: string;
}

export interface BookGate {
  book: BookId;
  label: string;
  groups: readonly GroupGate[];
}

export type CompletenessIssueCode =
  | "GROUP_MISSING"
  | "GROUP_UNEXPECTED"
  | "GROUP_EMPTY"
  | "DUPLICATE_GROUP"
  | "TONE_CLASS_MISMATCH"
  | "REVIEW_STATUS_NOT_APPROVED";

export interface CompletenessIssue {
  code: CompletenessIssueCode;
  message: string;
  groupName?: string;
  bucket?: string;
}

export interface CompletenessReport {
  book: BookId;
  dataVersion: string;
  label: string;
  groupCount: number;
  expectedGroupCount: number;
  bucketCounts: Record<string, number>;
  expectedBucketCounts: Record<string, number>;
  missingGroups: string[];
  unexpectedGroups: string[];
  emptyGroups: string[];
  issues: CompletenessIssue[];
  /** 数据发布门槛是否通过。缺部源在这里为 false，但检查器自身仍算工作正常。 */
  releaseGatePassed: boolean;
}

interface BucketSpec {
  bucket: string;
  toneClass: string;
  names: readonly string[];
}

function buildGate(
  book: BookId,
  label: string,
  buckets: readonly BucketSpec[],
): BookGate {
  const groups: GroupGate[] = [];
  for (const { bucket, toneClass, names } of buckets) {
    for (const name of names) groups.push({ bucket, name, toneClass });
  }
  return { book, label, groups };
}

const PINGSHUI_BUCKETS: readonly BucketSpec[] = [
  {
    bucket: "上平",
    toneClass: "ping",
    names: [
      "一东",
      "二冬",
      "三江",
      "四支",
      "五微",
      "六鱼",
      "七虞",
      "八齐",
      "九佳",
      "十灰",
      "十一真",
      "十二文",
      "十三元",
      "十四寒",
      "十五删",
    ],
  },
  {
    bucket: "下平",
    toneClass: "ping",
    names: [
      "一先",
      "二萧",
      "三肴",
      "四豪",
      "五歌",
      "六麻",
      "七阳",
      "八庚",
      "九青",
      "十蒸",
      "十一尤",
      "十二侵",
      "十三覃",
      "十四盐",
      "十五咸",
    ],
  },
  {
    bucket: "上",
    toneClass: "shang",
    names: [
      "一董",
      "二肿",
      "三讲",
      "四纸",
      "五尾",
      "六语",
      "七麌",
      "八荠",
      "九蟹",
      "十贿",
      "十一轸",
      "十二吻",
      "十三阮",
      "十四旱",
      "十五潸",
      "十六铣",
      "十七筱",
      "十八巧",
      "十九皓",
      "二十哿",
      "二十一马",
      "二十二养",
      "二十三梗",
      "二十四迥",
      "二十五有",
      "二十六寝",
      "二十七感",
      "二十八琰",
      "二十九豏",
    ],
  },
  {
    bucket: "去",
    toneClass: "qu",
    names: [
      "一送",
      "二宋",
      "三绛",
      "四寘",
      "五未",
      "六御",
      "七遇",
      "八霁",
      "九泰",
      "十卦",
      "十一队",
      "十二震",
      "十三问",
      "十四愿",
      "十五翰",
      "十六谏",
      "十七霰",
      "十八啸",
      "十九效",
      "二十号",
      "二十一个",
      "二十二祃",
      "二十三漾",
      "二十四敬",
      "二十五径",
      "二十六宥",
      "二十七沁",
      "二十八勘",
      "二十九艳",
      "三十陷",
    ],
  },
  {
    bucket: "入",
    toneClass: "ru",
    names: [
      "入声一屋",
      "入声二沃",
      "入声三觉",
      "入声四质",
      "入声五物",
      "入声六月",
      "入声七曷",
      "入声八黠",
      "入声九屑",
      "入声十药",
      "入声十一陌",
      "入声十二锡",
      "入声十三职",
      "入声十四缉",
      "入声十五合",
      "入声十六叶",
      "入声十七洽",
    ],
  },
];

/** 平水韵发布门槛：上平 15、下平 15、上 29、去 30、入 17，合计 106 部。 */
export const PINGSHUI_GATE: BookGate = buildGate(
  "pingshui",
  "平水韵（106 部）",
  PINGSHUI_BUCKETS,
);

const CILIN_ORDINALS = [
  "第一部",
  "第二部",
  "第三部",
  "第四部",
  "第五部",
  "第六部",
  "第七部",
  "第八部",
  "第九部",
  "第十部",
  "第十一部",
  "第十二部",
  "第十三部",
  "第十四部",
  "第十五部",
  "第十六部",
  "第十七部",
  "第十八部",
  "第十九部",
] as const;

/** 词林正韵：19 部；第 1–14 部分平/仄，第 15–19 部只标入声。 */
export const CILIN_GATE: BookGate = buildGate("cilin", "词林正韵（19 部）", [
  ...CILIN_ORDINALS.slice(0, 14).flatMap((ordinal): BucketSpec[] => [
    { bucket: ordinal, toneClass: "ping", names: [`${ordinal}·平声`] },
    {
      bucket: ordinal,
      toneClass: "ze_unspecified",
      names: [`${ordinal}·仄声`],
    },
  ]),
  ...CILIN_ORDINALS.slice(14).map(
    (ordinal): BucketSpec => ({
      bucket: ordinal,
      toneClass: "ru",
      names: [`${ordinal}·入声`],
    }),
  ),
]);

const XINYUN_NAMES = [
  "一麻",
  "二波",
  "三皆",
  "四开",
  "五微",
  "六豪",
  "七尤",
  "八寒",
  "九文",
  "十唐",
  "十一庚",
  "十二齐",
  "十三支",
  "十四姑",
] as const;

const XINYUN_TONES = [
  { name: "阴平", toneClass: "yinping" },
  { name: "阳平", toneClass: "yangping" },
  { name: "上声", toneClass: "shang" },
  { name: "去声", toneClass: "qu" },
] as const;

/** 中华新韵（十四韵，项目重建表）：14 韵 × 四声，共 56 个子卷，逐卷非空。 */
export const XINYUN_GATE: BookGate = buildGate(
  "xinyun",
  "中华新韵（十四韵，项目重建表）",
  XINYUN_NAMES.flatMap((name): BucketSpec[] =>
    XINYUN_TONES.map((tone) => ({
      bucket: name,
      toneClass: tone.toneClass,
      names: [`${name}·${tone.name}`],
    })),
  ),
);

function expectedBucketCounts(gateValue: BookGate): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of gateValue.groups) {
    counts[entry.bucket] = (counts[entry.bucket] ?? 0) + 1;
  }
  return counts;
}

export function checkCompleteness(
  snapshot: LexiconSnapshot,
  gateValue: BookGate,
): CompletenessReport {
  const issues: CompletenessIssue[] = [];
  const gateByName = new Map(
    gateValue.groups.map((entry) => [entry.name, entry]),
  );

  const presentNames = new Set<string>();
  const duplicated = new Set<string>();
  const emptyGroups: string[] = [];
  const bucketCounts: Record<string, number> = {};

  for (const group of snapshot.groups) {
    if (presentNames.has(group.name)) duplicated.add(group.name);
    presentNames.add(group.name);

    const gateEntry = gateByName.get(group.name);
    if (gateEntry === undefined) {
      issues.push({
        code: "GROUP_UNEXPECTED",
        groupName: group.name,
        message: `韵目不在 ${gateValue.label} 核定集合内：${group.name}`,
      });
      continue;
    }
    bucketCounts[gateEntry.bucket] = (bucketCounts[gateEntry.bucket] ?? 0) + 1;
    if (group.toneClass !== gateEntry.toneClass) {
      issues.push({
        code: "TONE_CLASS_MISMATCH",
        groupName: group.name,
        bucket: gateEntry.bucket,
        message: `韵目 ${group.name} 的声类应为 ${gateEntry.toneClass}，实际 ${String(group.toneClass)}`,
      });
    }
    const members = snapshot.candidates.filter((candidate) =>
      candidate.groupIds.includes(group.id),
    ).length;
    if (members === 0) {
      emptyGroups.push(group.name);
      issues.push({
        code: "GROUP_EMPTY",
        groupName: group.name,
        bucket: gateEntry.bucket,
        message: `韵目 ${group.name} 没有任何记录，不能用占位韵目凑数`,
      });
    }
  }

  for (const name of duplicated) {
    issues.push({
      code: "DUPLICATE_GROUP",
      groupName: name,
      message: `韵目重复：${name}`,
    });
  }

  const missingGroups = gateValue.groups
    .map((entry) => entry.name)
    .filter((name) => !presentNames.has(name))
    .sort();
  for (const name of missingGroups) {
    const gateEntry = gateByName.get(name);
    issues.push({
      code: "GROUP_MISSING",
      groupName: name,
      bucket: gateEntry?.bucket,
      message: `缺少韵目：${gateEntry?.bucket ?? ""}${name}`,
    });
  }

  const unexpectedGroups = snapshot.groups
    .map((group) => group.name)
    .filter((name) => !gateByName.has(name))
    .sort();

  if (snapshot.reviewStatus !== "approved") {
    issues.push({
      code: "REVIEW_STATUS_NOT_APPROVED",
      message: `快照审核状态为 ${snapshot.reviewStatus}，不能作为发布数据`,
    });
  }

  return {
    book: snapshot.book,
    dataVersion: snapshot.dataVersion,
    label: gateValue.label,
    groupCount: snapshot.groups.length,
    expectedGroupCount: gateValue.groups.length,
    bucketCounts,
    expectedBucketCounts: expectedBucketCounts(gateValue),
    missingGroups,
    unexpectedGroups,
    emptyGroups,
    issues,
    releaseGatePassed:
      missingGroups.length === 0 &&
      unexpectedGroups.length === 0 &&
      emptyGroups.length === 0 &&
      duplicated.size === 0 &&
      snapshot.reviewStatus === "approved",
  };
}

export function gateFor(book: BookId): BookGate | undefined {
  if (book === "pingshui") return PINGSHUI_GATE;
  if (book === "cilin") return CILIN_GATE;
  if (book === "xinyun") return XINYUN_GATE;
  return undefined;
}
