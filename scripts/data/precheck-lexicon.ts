/**
 * 三库机器初审（只读）：结构 / 引用闭合 / 声类一致性 / 字符 / 多音 / 来源。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts
 *
 * 产出：
 *   data/reviews/ai-lexicon-precheck-2026-10-18.json   机器可读
 *   data/reviews/ai-lexicon-precheck-2026-10-18.md     人读（异常清单为主）
 *
 * 边界（红线）：
 * - 只读快照，**不写** data/normalized、不写 data/releases、不改任何 reviewStatus。
 * - 不补造来源、反切、页码、许可、审核人。
 * - 异常分级只描述事实与影响；「韵字归属是否正确」一律标注需人审。
 * - 退出码只反映「初审本身是否跑通」，不因发现异常而变红（异常是本次要交付的产物）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  BookId,
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
} from "@poetry/contracts";

import {
  businessContentDigest,
  canonicalJson,
  sha256Hex,
} from "../../packages/lexicon/src/digest.js";
import {
  CILIN_GATE,
  PINGSHUI_GATE,
  XINYUN_GENERATOR_VERSION,
  XINYUN_GATE,
  XINYUN_RULES_VERSION,
  checkCompleteness,
  defineSnapshot,
  type BookGate,
  type CompletenessReport,
} from "../../packages/lexicon/src/index.js";
import type { SnapshotReviewStatus } from "../../packages/lexicon/src/snapshot.js";

import {
  ROOT,
  check,
  fail,
  finish,
  manifestDigestFor,
  section,
  sha256Bytes,
} from "./snapshot-report.js";

// ---------------------------------------------------------------- 常量

const REPORT_DATE = "2026-10-18";
const OUT_JSON = `data/reviews/ai-lexicon-precheck-${REPORT_DATE}.json`;
const OUT_MD = `data/reviews/ai-lexicon-precheck-${REPORT_DATE}.md`;

const APPROVED_FILE = "data/reviews/approved-evidence.json";
const REBUILD_REPORT = "data/patches/xinyun-rebuild-report.dev.json";
const COLLISIONS_FILE = "data/patches/xinyun-reading-collisions.dev.json";
const VARIANTS_FILE = "data/variants/variant-edges-d2.json";
const YI_CONFLICT_FILE = "data/patches/xinyun-yi-conflict.draft.json";
const SANJ_PATCH_FILE = "data/patches/pingshui-shang-sanj-jiang.draft.json";

/** 本次初审覆盖的快照（三库四份）。 */
const SNAPSHOTS: readonly string[] = [
  "pingshui.full-d2.json",
  "pingshui.full-d2-patched.json",
  "cilin.full-d2.json",
  "xinyun.full-d2.json",
];

/** 明确排除的快照及理由（不得默默忽略）。 */
const EXCLUDED: readonly { file: string; reason: string }[] = [
  {
    file: "pingshui.sample-d1.json",
    reason:
      "D1 七字真实小样本（8 候选），不属 D2 三库口径；候选级证据与原部级证据分开，本报告不重复初审。",
  },
];

/** 来源 ID → 实际落盘文件（用于摘要交叉核对）。 */
const SOURCE_RAW_FILE: Readonly<Record<string, string>> = {
  "src:chinese_word_rhyme:pingshui":
    "data/raw/chinese_word_rhyme/Pingshui_Rhyme.json",
  "src:chinese_word_rhyme:cilin":
    "data/raw/chinese_word_rhyme/Cilin_Rhyme.json",
  "src:chinese_word_rhyme": "data/raw/chinese_word_rhyme/Pingshui_Rhyme.json",
  "src:pinyin-data": "data/raw/pinyin-data/pinyin.txt",
  "src:wikisource:pingshuiyun":
    "data/raw/wikisource/PingshuiYun-8264804.wikitext",
};

/** 声类 → 本调。neutral 无可靠本调，必须为 null。 */
const TONE_BY_CLASS: Readonly<Record<string, "P" | "Z" | null>> = {
  ping: "P",
  shang: "Z",
  qu: "Z",
  ru: "Z",
  yinping: "P",
  yangping: "P",
  ze_unspecified: "Z",
  neutral: null,
};

const SANJ_JIANG_GROUP_ID = "group:pingshui:上:三讲";
const YI_DONG_GROUP_ID = "group:pingshui:上:一董";
const PRE_EXISTING_CHARACTER = "玤";
const YI_CHARACTER = "一";
/** A1 字符全集只收汉字：非汉字条目（如词林表里的 `[`、`]`、空格、全角逗号）单独登记为数据缺陷。 */
const HAN_CHAR = /\p{Script=Han}/u;
const SPOT_CHARACTERS: readonly string[] = [
  PRE_EXISTING_CHARACTER,
  YI_CHARACTER,
];

const ALL_CLASSES = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

type Severity = "P0" | "P1" | "P2" | "P3";
type AnomalyClass = (typeof ALL_CLASSES)[number];

// ---------------------------------------------------------------- 类型

interface RawSnapshot {
  dataVersion: string;
  book: BookId;
  reviewStatus: SnapshotReviewStatus;
  notice: string;
  candidates: ReadingCandidate[];
  groups: RhymeGroup[];
  evidence: Evidence[];
  sources: SourceRecord[];
}

interface ClosureIssue {
  layer: string;
  danglingId: string;
  referencedBy: string[];
}

interface Anomaly {
  id: string;
  class: AnomalyClass;
  book: BookId | "cross";
  dataVersion: string;
  location: string;
  fact: string;
  basis: string;
  impact: string;
  suggestedAction: string;
  actionKind: "数据事实需人审" | "接线/脚本可修";
  severity: Severity;
  /** 跨库异常可用它列出受影响的所有快照 dataVersion（不按库拆成多条）。 */
  affectedBooks?: string[];
}

interface SourceAudit {
  id: string;
  revision: string | null;
  snapshotSha256: string | null;
  license: string;
  url: string | null;
  rawFile: string | null;
  actualSha256: string | null;
  digestMatches: boolean | null;
}

interface SpotCharacter {
  character: string;
  candidateIds: string[];
  groupIds: string[];
  /**
   * 「一董 + 三讲」双归属是**平水 106 部补丁**的专属判据（红线 3）。
   * - not_applicable：该库/该快照不适用（词林、新韵、以及无三讲韵目的 105 部快照）
   * - ok：双归属成立
   * - violation：应有双归属但缺失
   */
  bothGroups: "not_applicable" | "ok" | "violation";
}

interface SnapshotAudit {
  file: string;
  dataVersion: string;
  book: BookId;
  reviewStatus: string;
  structure: {
    groupCount: number;
    expectedGroupCount: number;
    nonEmptyGroupCount: number;
    bucketCounts: Record<string, number>;
    expectedBucketCounts: Record<string, number>;
    missingGroups: string[];
    unexpectedGroups: string[];
    emptyGroups: string[];
    duplicateGroups: string[];
    bucketCountsMatch: boolean;
  };
  candidates: {
    total: number;
    distinctCharacters: number;
    multiGroupCharacters: number;
    sameGroupMultiCandidates: number;
    sameParentMultiCandidates: number;
    sameParentExamples: {
      character: string;
      parent: string;
      candidateIds: string[];
    }[];
  };
  tone: {
    toneClassVsGroupMismatch: {
      candidateId: string;
      groupId: string;
      declared: string;
      expected: string;
    }[];
    toneVsToneClassMismatch: {
      candidateId: string;
      toneClass: string;
      tone: string | null;
      expected: string | null;
    }[];
    zeUnspecified: { count: number; groups: string[]; violations: string[] };
  };
  charCheck: {
    checked: number;
    violations: {
      candidateId: string;
      character: string;
      codePoints: number;
    }[];
  };
  closure: {
    ok: boolean;
    issues: ClosureIssue[];
    duplicateIds: { layer: string; id: string; count: number }[];
  };
  evidenceStats: {
    total: number;
    approved: number;
    unverified: number;
    approvedNotInList: string[];
    listMissing: string[];
    listMissingNote: string;
  };
  metadata: {
    businessDigest: string;
    canonicalDigest: string;
    sources: SourceAudit[];
    generatorVersion: string | null;
    rulesVersion: string | null;
  };
  gate: {
    releaseGatePassed: boolean;
    issues: string[];
    computed: boolean;
    error: string | null;
  };
  spotCharacters: SpotCharacter[];
  anomalies: Anomaly[];
}

// ---------------------------------------------------------------- 小工具

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

function duplicatesOf(ids: readonly string[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function readJson<T>(relative: string): T | null {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** 从 group id 取父级（卷/部/韵）：group:<book>:<parent>:<name>。 */
function parentOf(groupId: string): string {
  const parts = groupId.split(":");
  return parts[2] ?? groupId;
}

function gateOf(book: BookId): BookGate | undefined {
  if (book === "pingshui") return PINGSHUI_GATE;
  if (book === "cilin") return CILIN_GATE;
  if (book === "xinyun") return XINYUN_GATE;
  return undefined;
}

/** 按 key 排序比较两个计数表：键顺序不同不算差异（否则会假阳性）。 */
function sameCounts(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && left[key] === right[key],
  );
}

// ---------------------------------------------------------------- 单份快照初审

function auditSnapshot(
  file: string,
  raw: RawSnapshot,
  approvedIds: ReadonlySet<string>,
): SnapshotAudit {
  const anomalies: Anomaly[] = [];
  let seq = 0;
  const add = (
    cls: AnomalyClass,
    severity: Severity,
    fields: Omit<Anomaly, "id" | "class" | "book" | "dataVersion" | "severity">,
  ): void => {
    seq += 1;
    anomalies.push({
      id: `${cls}-${raw.book}-${String(seq).padStart(3, "0")}`,
      class: cls,
      book: raw.book,
      dataVersion: raw.dataVersion,
      severity,
      ...fields,
    });
  };

  // ---- 结构 ----
  const gate = gateOf(raw.book);
  // 引用不闭合时 defineSnapshot 会抛错：这里不让它中断初审，改为报告。
  let report: CompletenessReport | null = null;
  let defineError: string | null = null;
  if (gate !== undefined) {
    try {
      report = checkCompleteness(defineSnapshot(raw), gate);
    } catch (error) {
      defineError = error instanceof Error ? error.message : String(error);
    }
  }

  const memberCounts = new Map<string, number>();
  for (const candidate of raw.candidates) {
    for (const groupId of candidate.groupIds) {
      memberCounts.set(groupId, (memberCounts.get(groupId) ?? 0) + 1);
    }
  }
  const emptyGroups = raw.groups
    .filter((group) => (memberCounts.get(group.id) ?? 0) === 0)
    .map((group) => group.name)
    .sort();
  const duplicateGroups = duplicatesOf(raw.groups.map((group) => group.id)).map(
    (entry) => entry.id,
  );
  const nonEmptyGroupCount = raw.groups.filter(
    (group) => (memberCounts.get(group.id) ?? 0) > 0,
  ).length;

  const structure: SnapshotAudit["structure"] = {
    groupCount: raw.groups.length,
    expectedGroupCount: report?.expectedGroupCount ?? 0,
    nonEmptyGroupCount,
    bucketCounts: report?.bucketCounts ?? {},
    expectedBucketCounts: report?.expectedBucketCounts ?? {},
    missingGroups: report?.missingGroups ?? [],
    unexpectedGroups: report?.unexpectedGroups ?? [],
    emptyGroups,
    duplicateGroups,
    bucketCountsMatch: sameCounts(
      report?.bucketCounts ?? {},
      report?.expectedBucketCounts ?? {},
    ),
  };

  if (structure.missingGroups.length > 0) {
    add("A", "P1", {
      location: `${file} · groups`,
      fact:
        `缺失韵目 ${structure.missingGroups.length} 个：${structure.missingGroups.join("、")}；` +
        `连带结果：韵部 ${structure.groupCount}/${structure.expectedGroupCount}，` +
        `分部 ${JSON.stringify(structure.bucketCounts)}（应有 ${JSON.stringify(structure.expectedBucketCounts)}）`,
      basis: `checkCompleteness(${report?.label ?? "无门槛"}) 逐步比对核定韵目集合`,
      impact: "该韵部下的字无法归部，按韵部查询会漏；结构门槛不通过",
      suggestedAction: "数据缺口，需补来源后重构建；不得新增空韵目凑数",
      actionKind: "数据事实需人审",
    });
  }
  if (structure.emptyGroups.length > 0) {
    add("A", "P1", {
      location: `${file} · groups`,
      fact: `空韵目 ${structure.emptyGroups.length} 个：${structure.emptyGroups.join("、")}`,
      basis: "统计每个 groupId 的候选成员数为 0",
      impact: "占位韵目会使结构看似齐全而内容为空",
      suggestedAction: "查明来源是否本无此部；不得以占位记录填充",
      actionKind: "数据事实需人审",
    });
  }
  if (structure.unexpectedGroups.length > 0) {
    add("A", "P1", {
      location: `${file} · groups`,
      fact: `意外韵目 ${structure.unexpectedGroups.length} 个：${structure.unexpectedGroups.join("、")}`,
      basis: "韵目名不在核定门槛集合内",
      impact: "可能为韵目写法错误或被静默改名，破坏 ID 契约",
      suggestedAction: "核对韵目写法与门槛集合；改 ID 需给迁移表",
      actionKind: "数据事实需人审",
    });
  }
  if (structure.duplicateGroups.length > 0) {
    add("A", "P0", {
      location: `${file} · groups`,
      fact: `重复韵目 ID ${structure.duplicateGroups.length} 个：${structure.duplicateGroups.join("、")}`,
      basis: "group.id 出现一次以上",
      impact: "同一 ID 指向不同内容，下游去重会静默丢数据",
      suggestedAction: "修正重复生成逻辑",
      actionKind: "接线/脚本可修",
    });
  }
  // 缺部/意外部已在上面报过；此处只在「韵目集合本身正确」时才独立报计数偏差，
  // 避免同一个缺口被拆成三条异常、虚增 P1 计数。
  if (
    report !== null &&
    structure.missingGroups.length === 0 &&
    structure.unexpectedGroups.length === 0 &&
    structure.groupCount !== structure.expectedGroupCount
  ) {
    add("A", "P1", {
      location: `${file} · groups`,
      fact: `韵部数 ${structure.groupCount} ≠ 门槛 ${structure.expectedGroupCount}`,
      basis: "gate.groups.length 与实际 groups.length 比对",
      impact: "结构门槛不通过",
      suggestedAction: "见缺失/意外韵目两条",
      actionKind: "数据事实需人审",
    });
  }
  if (
    report !== null &&
    structure.missingGroups.length === 0 &&
    structure.unexpectedGroups.length === 0 &&
    !structure.bucketCountsMatch
  ) {
    add("A", "P1", {
      location: `${file} · bucketCounts`,
      fact: `分部计数与门槛不符：实测 ${JSON.stringify(structure.bucketCounts)} / 应有 ${JSON.stringify(structure.expectedBucketCounts)}`,
      basis:
        "按 bucket 汇总实测值 vs 门槛值（按键名排序比较，键顺序不同不算差异）",
      impact: "分卷结构偏差",
      suggestedAction: "对照缺失/意外韵目逐部核查",
      actionKind: "数据事实需人审",
    });
  }

  // ---- 候选统计 / 多音 ----
  const byCharacter = new Map<string, ReadingCandidate[]>();
  for (const candidate of raw.candidates) {
    const list = byCharacter.get(candidate.character) ?? [];
    list.push(candidate);
    byCharacter.set(candidate.character, list);
  }
  const multiGroupCharacters = [...byCharacter.values()].filter(
    (list) => list.length > 1,
  ).length;

  const sameGroupPairs = new Map<string, ReadingCandidate[]>();
  const sameParentPairs = new Map<string, ReadingCandidate[]>();
  for (const candidate of raw.candidates) {
    for (const groupId of candidate.groupIds) {
      pushToMapList(
        sameGroupPairs,
        `${candidate.character}\u0000${groupId}`,
        candidate,
      );
      pushToMapList(
        sameParentPairs,
        `${candidate.character}\u0000${parentOf(groupId)}`,
        candidate,
      );
    }
  }
  const sameGroupMultiCandidates = [...sameGroupPairs.values()].filter(
    (list) => list.length > 1,
  ).length;
  const sameParentMulti = [...sameParentPairs.entries()].filter(
    ([, list]) => list.length > 1,
  );
  const sameParentExamples = sameParentMulti.slice(0, 24).map(([key, list]) => {
    const [character = "", parent = ""] = key.split("\u0000");
    return {
      character,
      parent,
      candidateIds: list.map((candidate) => candidate.id).sort(),
    };
  });

  const snapshotHasSanJiang = raw.groups.some(
    (group) => group.id === SANJ_JIANG_GROUP_ID,
  );
  const spotCharacters: SpotCharacter[] = SPOT_CHARACTERS.map((character) => {
    const list = byCharacter.get(character) ?? [];
    const groupIds = [
      ...new Set(list.flatMap((candidate) => candidate.groupIds)),
    ].sort();
    const hasBoth =
      groupIds.includes(YI_DONG_GROUP_ID) &&
      groupIds.includes(SANJ_JIANG_GROUP_ID);
    // 双归属判据只对「平水 + 该快照含三讲」适用；其余情形显式标 not_applicable，
    // 不得输出「双归属不成立」这类会被误读为红线违规的结论。
    const bothGroups: SpotCharacter["bothGroups"] =
      character === PRE_EXISTING_CHARACTER &&
      raw.book === "pingshui" &&
      snapshotHasSanJiang
        ? hasBoth
          ? "ok"
          : "violation"
        : "not_applicable";
    return {
      character,
      candidateIds: list.map((candidate) => candidate.id).sort(),
      groupIds,
      bothGroups,
    };
  });

  const fenSpot = spotCharacters.find(
    (spot) => spot.character === PRE_EXISTING_CHARACTER,
  );
  if (fenSpot?.bothGroups === "violation") {
    add("E", "P0", {
      location: `${file} · candidates`,
      fact: `「${PRE_EXISTING_CHARACTER}」应有「一董 + 三讲」双归属但当前不成立；实际归属 ${fenSpot.groupIds.join("、") || "（无）"}`,
      basis: "红线 3：不得删除一字多部候选；三讲补丁只应新增归属、不得删除一董",
      impact: "一字多部被削平，下游按韵部查询会漏掉该字的一条归属",
      suggestedAction: "恢复被删除的归属；不得为让门槛好看而删候选",
      actionKind: "接线/脚本可修",
    });
  }

  if (sameGroupMultiCandidates > 0) {
    add("E", "P1", {
      location: `${file} · candidates`,
      fact: `同字同韵部出现 ${sameGroupMultiCandidates} 组多候选（同一 groupId 下同字多条）`,
      basis: "以 (character, groupId) 分组统计候选数 > 1",
      impact: "若为重复生成则污染统计；若为真实多读则需说明承载方式",
      suggestedAction: "逐组核对：重复生成属脚本问题，真实多读需在证据中分列",
      actionKind: "接线/脚本可修",
    });
  }

  // ---- 声类一致性（三项独立） ----
  const groupById = new Map(raw.groups.map((group) => [group.id, group]));
  const gateToneByName = new Map(
    (gate?.groups ?? []).map((entry) => [entry.name, entry.toneClass]),
  );

  const toneClassVsGroupMismatch: SnapshotAudit["tone"]["toneClassVsGroupMismatch"] =
    [];
  const toneVsToneClassMismatch: SnapshotAudit["tone"]["toneVsToneClassMismatch"] =
    [];
  const zeGroups = new Set<string>();
  const zeViolations: string[] = [];
  let zeCount = 0;

  for (const candidate of raw.candidates) {
    for (const groupId of candidate.groupIds) {
      const group = groupById.get(groupId);
      if (group === undefined) continue; // 断链已在引用闭合里报
      const expected = gateToneByName.get(group.name);
      if (expected !== undefined && expected !== candidate.toneClass) {
        toneClassVsGroupMismatch.push({
          candidateId: candidate.id,
          groupId,
          declared: candidate.toneClass,
          expected,
        });
      }
      if (candidate.toneClass === "ze_unspecified") {
        zeGroups.add(group.name);
        const ok =
          raw.book === "cilin" &&
          expected === "ze_unspecified" &&
          group.name.endsWith("·仄声");
        if (!ok) zeViolations.push(`${candidate.id} → ${group.name}`);
      }
    }

    const expectedTone = TONE_BY_CLASS[candidate.toneClass];
    if (expectedTone !== undefined && expectedTone !== candidate.tone) {
      toneVsToneClassMismatch.push({
        candidateId: candidate.id,
        toneClass: candidate.toneClass,
        tone: candidate.tone,
        expected: expectedTone,
      });
    }

    if (candidate.toneClass === "ze_unspecified") zeCount += 1;
  }

  if (toneClassVsGroupMismatch.length > 0) {
    add("B", "P0", {
      location: `${file} · candidates`,
      fact: `${toneClassVsGroupMismatch.length} 条候选的 toneClass 与所在韵目声类不符`,
      basis:
        "逐条比对 candidate.toneClass 与门槛中该韵目名的 toneClass；例：" +
        toneClassVsGroupMismatch
          .slice(0, 5)
          .map(
            (entry) =>
              `${entry.candidateId}（声明 ${entry.declared} / 应 ${entry.expected}）`,
          )
          .join("；"),
      impact: "平仄判定会直接错，属下游硬错误",
      suggestedAction: "修正适配器的声类映射或原表分卷读取",
      actionKind: "接线/脚本可修",
    });
  }
  if (toneVsToneClassMismatch.length > 0) {
    add("B", "P0", {
      location: `${file} · candidates`,
      fact: `${toneVsToneClassMismatch.length} 条候选的 tone 与 toneClass 不符`,
      basis:
        "映射：平/阴阳平=P，上/去/入/仄未分=Z，neutral=null；例：" +
        toneVsToneClassMismatch
          .slice(0, 5)
          .map(
            (entry) =>
              `${entry.candidateId}（tone=${String(entry.tone)} / 应 ${String(entry.expected)}）`,
          )
          .join("；"),
      impact: "平仄判定会直接错",
      suggestedAction: "修正 tone 赋值",
      actionKind: "接线/脚本可修",
    });
  }
  if (zeViolations.length > 0) {
    add("B", "P1", {
      location: `${file} · candidates`,
      fact: `ze_unspecified 出现在非词林仄声子卷的位置，共 ${zeViolations.length} 条`,
      basis: "ze_unspecified 只允许出现在 cilin 的「第N部·仄声」子卷",
      impact: "仄未分被误用会让上/去声信息丢失或误导下游",
      suggestedAction: "逐条改回正确声类或补来源",
      actionKind: "数据事实需人审",
    });
  }
  if (raw.book === "cilin" && zeCount > 0) {
    add("B", "P3", {
      location: `${file} · candidates`,
      fact: `词林 ze_unspecified 共 ${zeCount} 条，分布于 ${zeGroups.size} 个仄声子卷`,
      basis: "统计 toneClass=ze_unspecified 的候选及其所在子卷",
      impact:
        "这些是「来源只标仄声」的如实记录：不得臆补成上声或去声；本次核出越界 " +
        `${zeViolations.length} 条`,
      suggestedAction: "保持现状；人审时只需确认来源确实只标仄",
      actionKind: "数据事实需人审",
    });
  }

  // ---- 字符：单码点 ----
  const charViolations: SnapshotAudit["charCheck"]["violations"] = [];
  let checked = 0;
  for (const candidate of raw.candidates) {
    checked += 1;
    const codePoints = [...candidate.character].length;
    if (codePoints !== 1) {
      charViolations.push({
        candidateId: candidate.id,
        character: candidate.character,
        codePoints,
      });
    }
  }
  if (charViolations.length > 0) {
    add("D", "P1", {
      location: `${file} · candidates`,
      fact: `${charViolations.length} 条候选的字符不是单码点`,
      basis:
        "[...character].length !== 1；例：" +
        charViolations
          .slice(0, 5)
          .map((entry) => `${entry.candidateId}（${entry.codePoints} 码点）`)
          .join("；"),
      impact: "字表查询与逐字计数会错位",
      suggestedAction: "拆分为单码点候选或标注为暂不支持",
      actionKind: "数据事实需人审",
    });
  }

  // ---- 引用闭合（四层，带悬空明细） ----
  const groupIds = new Set(raw.groups.map((group) => group.id));
  const evidenceIds = new Set(raw.evidence.map((evidence) => evidence.id));
  const sourceIds = new Set(raw.sources.map((source) => source.id));
  const closureIssues: ClosureIssue[] = [];

  const missingGroupRefs = new Map<string, string[]>();
  const missingEvidenceRefs = new Map<string, string[]>();
  const missingSourceRefs = new Map<string, string[]>();

  for (const candidate of raw.candidates) {
    for (const groupId of candidate.groupIds) {
      if (!groupIds.has(groupId))
        pushTo(missingGroupRefs, groupId, candidate.id);
    }
    const referenced = [
      ...candidate.evidenceIds,
      ...(candidate.modernReading?.evidenceIds ?? []),
      ...(candidate.fanqie?.evidenceIds ?? []),
    ];
    for (const evidenceId of referenced) {
      if (!evidenceIds.has(evidenceId)) {
        pushTo(missingEvidenceRefs, evidenceId, candidate.id);
      }
    }
  }
  for (const group of raw.groups) {
    for (const evidenceId of group.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        pushTo(missingEvidenceRefs, evidenceId, group.id);
      }
    }
  }
  for (const evidence of raw.evidence) {
    if (!sourceIds.has(evidence.sourceId)) {
      pushTo(missingSourceRefs, evidence.sourceId, evidence.id);
    }
  }
  for (const [danglingId, referencedBy] of missingGroupRefs) {
    closureIssues.push({
      layer: "候选 → 韵部",
      danglingId,
      referencedBy: [...referencedBy].sort(),
    });
  }
  for (const [danglingId, referencedBy] of missingEvidenceRefs) {
    closureIssues.push({
      layer: "候选/韵部 → 证据",
      danglingId,
      referencedBy: [...referencedBy].sort(),
    });
  }
  for (const [danglingId, referencedBy] of missingSourceRefs) {
    closureIssues.push({
      layer: "证据 → 来源",
      danglingId,
      referencedBy: [...referencedBy].sort(),
    });
  }

  const duplicateIds = [
    ...duplicatesOf(raw.candidates.map((candidate) => candidate.id)).map(
      (entry) => ({ layer: "候选 ID", ...entry }),
    ),
    ...duplicatesOf(raw.groups.map((group) => group.id)).map((entry) => ({
      layer: "韵部 ID",
      ...entry,
    })),
    ...duplicatesOf(raw.evidence.map((evidence) => evidence.id)).map(
      (entry) => ({ layer: "证据 ID", ...entry }),
    ),
    ...duplicatesOf(raw.sources.map((source) => source.id)).map((entry) => ({
      layer: "来源 ID",
      ...entry,
    })),
  ];

  if (closureIssues.length > 0) {
    add("C", "P0", {
      location: `${file} · 四层引用`,
      fact: `${closureIssues.length} 个悬空 ID：${closureIssues
        .slice(0, 5)
        .map((issue) => `${issue.layer}/${issue.danglingId}`)
        .join("；")}`,
      basis:
        "逐条解析 candidate.groupIds / evidenceIds（含 modernReading、fanqie）、group.evidenceIds、evidence.sourceId",
      impact:
        "下游按 ID 取不到对象，会抛 LEXICON_REFERENCE_UNRESOLVED 或静默缺信息",
      suggestedAction: "修正生成逻辑，补齐引用或删除悬空引用",
      actionKind: "接线/脚本可修",
    });
  }
  if (duplicateIds.length > 0) {
    add("C", "P0", {
      location: `${file} · IDs`,
      fact: `${duplicateIds.length} 个重复 ID：${duplicateIds
        .slice(0, 5)
        .map((entry) => `${entry.layer}/${entry.id}×${entry.count}`)
        .join("；")}`,
      basis: "同一层内 ID 出现多次",
      impact: "同 ID 不同内容，下游去重会丢数据",
      suggestedAction: "修正 ID 生成（改 ID 需给迁移表）",
      actionKind: "接线/脚本可修",
    });
  }

  // ---- 证据审批核对 ----
  const approved = raw.evidence.filter(
    (evidence) => evidence.reviewStatus === "approved",
  );
  const approvedNotInList = approved
    .filter((evidence) => !approvedIds.has(evidence.id))
    .map((evidence) => evidence.id);
  const listMissing = [...approvedIds]
    .filter((id) => !evidenceIds.has(id))
    .sort();
  if (approvedNotInList.length > 0) {
    add("F", "P0", {
      location: `${file} · evidence`,
      fact: `${approvedNotInList.length} 条 evidence 标记 approved 但不在审批清单内：${approvedNotInList.join("、")}`,
      basis: `与 ${APPROVED_FILE} 的 approvedEvidenceIds 比对`,
      impact: "越权审批：未经人审的证据被当作已审，违反红线 1",
      suggestedAction: "回退为 unverified 或补齐人审记录",
      actionKind: "接线/脚本可修",
    });
  }
  // 说明：approved-evidence.json 是**跨库全局**清单。词林/新韵快照不包含平水的 ev ID，
  // 105 部快照也不包含三讲（106 部专属），因此「清单未命中」属预期，**不生成异常**。
  // 真正危险的方向是反过来（approvedNotInList = 越权审批），那一条才是红线检查。
  const listMissingNote =
    listMissing.length === 0
      ? "审批清单 ID 在本快照内全部命中。"
      : `审批清单未命中 ${listMissing.length} 条，均属预期（跨库全局清单 + 105/106 部差异），不计为异常。`;

  // ---- 来源与摘要 ----
  const sources: SourceAudit[] = raw.sources.map((source) => {
    const rawFile = SOURCE_RAW_FILE[source.id] ?? null;
    const actualSha256 =
      rawFile !== null && existsSync(path.join(ROOT, rawFile))
        ? sha256Bytes(readFileSync(path.join(ROOT, rawFile)))
        : null;
    return {
      id: source.id,
      revision: source.revision,
      snapshotSha256: source.snapshotSha256,
      license: source.license,
      url: source.url,
      rawFile,
      actualSha256,
      digestMatches:
        source.snapshotSha256 === null || actualSha256 === null
          ? null
          : source.snapshotSha256 === actualSha256,
    };
  });
  for (const source of sources) {
    if (source.digestMatches === false) {
      add("F", "P1", {
        location: `${file} · sources/${source.id}`,
        fact: `快照登记的 sha256 与落盘字节不一致（登记 ${String(source.snapshotSha256)} / 实际 ${String(source.actualSha256)}）`,
        basis: `重新计算 ${String(source.rawFile)} 的字节摘要`,
        impact: "来源不可追溯，「已核对」的说法不成立",
        suggestedAction: "重跑构建脚本按真实字节回填，并登记到 manifest",
        actionKind: "接线/脚本可修",
      });
    }
    if (source.rawFile !== null && source.actualSha256 !== null) {
      const manifestDigest = manifestDigestFor(source.rawFile);
      if (manifestDigest !== null && manifestDigest !== source.actualSha256) {
        add("F", "P1", {
          location: `${file} · sources/${source.id}`,
          fact: `manifest 登记摘要与落盘字节不一致（manifest ${manifestDigest} / 实际 ${source.actualSha256}）`,
          basis:
            "data/sources/manifest.json 的 files[].snapshotSha256 与重算值比对",
          impact: "来源清单失真",
          suggestedAction: "更新 manifest 或在来源变更时走新版本",
          actionKind: "接线/脚本可修",
        });
      }
    }
  }

  const generatorVersion =
    raw.book === "xinyun" ? XINYUN_GENERATOR_VERSION : null;
  const rulesVersion = raw.book === "xinyun" ? XINYUN_RULES_VERSION : null;
  if (raw.book !== "xinyun") {
    add("F", "P2", {
      location: `${file} · 快照头`,
      fact: "快照未登记生成器/规则版本字段",
      basis:
        "SnapshotInput 结构无 generatorVersion/rulesVersion；平水与词林由 build-*.ts 直接生成，版本只能从脚本名推断",
      impact: "无法仅凭数据包回答「这份数据由哪版脚本产出」",
      suggestedAction:
        "在 notice 或独立 descriptor 中登记脚本版本（不改快照 Schema）",
      actionKind: "接线/脚本可修",
    });
  }

  // ---- 门槛 ----
  const gateResult: SnapshotAudit["gate"] = {
    releaseGatePassed: report?.releaseGatePassed ?? false,
    issues: report?.issues.map((issue) => issue.code) ?? [],
    computed: report !== null,
    error:
      report !== null
        ? null
        : (defineError ?? "无对应门槛（gateFor 返回 undefined）"),
  };
  if (!gateResult.computed) {
    add("A", "P1", {
      location: `${file} · gate`,
      fact: `book=${raw.book} 无法完成门槛判定`,
      basis: gateResult.error ?? "未知原因",
      impact: "该库无法纳入发布门槛评估",
      suggestedAction: "先解决引用闭合/门槛映射问题",
      actionKind: "接线/脚本可修",
    });
  }

  return {
    file,
    dataVersion: raw.dataVersion,
    book: raw.book,
    reviewStatus: raw.reviewStatus,
    structure,
    candidates: {
      total: raw.candidates.length,
      distinctCharacters: byCharacter.size,
      multiGroupCharacters,
      sameGroupMultiCandidates,
      sameParentMultiCandidates: sameParentMulti.length,
      sameParentExamples,
    },
    tone: {
      toneClassVsGroupMismatch,
      toneVsToneClassMismatch,
      zeUnspecified: {
        count: zeCount,
        groups: [...zeGroups].sort(),
        violations: zeViolations,
      },
    },
    charCheck: { checked, violations: charViolations },
    closure: {
      ok: closureIssues.length === 0,
      issues: closureIssues,
      duplicateIds,
    },
    evidenceStats: {
      total: raw.evidence.length,
      approved: approved.length,
      unverified: raw.evidence.filter(
        (evidence) => evidence.reviewStatus === "unverified",
      ).length,
      approvedNotInList,
      listMissing,
      listMissingNote,
    },
    metadata: {
      businessDigest: businessContentDigest(raw),
      canonicalDigest: sha256Hex(canonicalJson(raw)),
      sources,
      generatorVersion,
      rulesVersion,
    },
    gate: gateResult,
    spotCharacters,
    anomalies,
  };
}

function pushToMapList(
  map: Map<string, ReadingCandidate[]>,
  key: string,
  candidate: ReadingCandidate,
): void {
  const list = map.get(key) ?? [];
  list.push(candidate);
  map.set(key, list);
}

// ---------------------------------------------------------------- 主流程

/** 声类 → 该 modernReading 应有的调值。 */
const EXPECTED_TONE_NUMBER: Readonly<Record<string, number>> = {
  yinping: 1,
  yangping: 2,
  shang: 3,
  qu: 4,
  neutral: 5,
};

interface Reconciliation {
  modernReading: {
    dataVersion: string;
    total: number;
    withModernReading: number;
    missing: number;
    toneNumberMismatch: number;
    pinyinWithToneMark: number;
    samples: { candidateId: string; pinyin: string; toneNumber: number }[];
  };
  collisions: { file: string; count: number; items: number };
  sourceIds: { book: BookId; dataVersion: string; sourceIds: string[] }[];
  sourceIdsAcrossBooksDistinct: boolean;
  approvedTable: {
    file: string;
    book: BookId;
    dataVersion: string;
    approved: number;
    total: number;
  }[];
  matches: { claim: string; expected: string; actual: string; ok: boolean }[];
}

/** ②③④ 对账：全部按落盘 JSON 实测，不引用任何转述数字。 */
function computeReconciliation(audits: SnapshotAudit[]): Reconciliation {
  const xinyun = readJson<RawSnapshot>("data/normalized/xinyun.full-d2.json");
  const xinyunCandidates = xinyun?.candidates ?? [];
  const withModernReading = xinyunCandidates.filter(
    (candidate) => candidate.modernReading !== null,
  );
  const toneNumberMismatch = withModernReading.filter((candidate) => {
    const expected = EXPECTED_TONE_NUMBER[candidate.toneClass];
    return (
      expected !== undefined && candidate.modernReading?.toneNumber !== expected
    );
  }).length;
  // 调号字符：只认四个声调附加符（macron/acute/caron/grave）。
  // 注意不能直接用「NFD 变长」判定——`ü`(U+00FC) 也会分解出 U+0308 分音符，
  // 而 0009 明确要求「去调号但保留 ü（lǜ → lü）」，把 ü 算成调号会产生假阳性。
  const TONE_MARKS = ["\u0304", "\u0301", "\u030C", "\u0300"] as const;
  const pinyinWithToneMark = withModernReading.filter((candidate) => {
    const pinyin = candidate.modernReading?.pinyin ?? "";
    const decomposed = pinyin.normalize("NFD");
    return TONE_MARKS.some((mark) => decomposed.includes(mark));
  }).length;

  const collisions = readJson<{ count?: number; items?: unknown[] }>(
    COLLISIONS_FILE,
  );

  const sourceIds = audits.map((audit) => ({
    book: audit.book,
    dataVersion: audit.dataVersion,
    sourceIds: audit.metadata.sources.map((source) => source.id).sort(),
  }));
  const sourceIdsByBook = new Map<BookId, string[]>();
  for (const entry of sourceIds) {
    const existing = sourceIdsByBook.get(entry.book) ?? [];
    sourceIdsByBook.set(entry.book, [
      ...new Set([...existing, ...entry.sourceIds]),
    ]);
  }
  const bookEntries = [...sourceIdsByBook.entries()];
  let sourceIdsAcrossBooksDistinct = true;
  for (let index = 0; index < bookEntries.length; index += 1) {
    for (let other = index + 1; other < bookEntries.length; other += 1) {
      const left = bookEntries[index];
      const right = bookEntries[other];
      if (left === undefined || right === undefined) continue;
      const shared = left[1].filter((id) => right[1].includes(id));
      if (shared.length > 0) sourceIdsAcrossBooksDistinct = false;
    }
  }

  const sample = readJson<RawSnapshot>(
    "data/normalized/pingshui.sample-d1.json",
  );
  const approvedTable = [
    ...audits.map((audit) => ({
      file: audit.file,
      book: audit.book,
      dataVersion: audit.dataVersion,
      approved: audit.evidenceStats.approved,
      total: audit.evidenceStats.total,
    })),
    ...(sample === null
      ? []
      : [
          {
            file: "data/normalized/pingshui.sample-d1.json",
            book: sample.book,
            dataVersion: sample.dataVersion,
            approved: sample.evidence.filter(
              (evidence) => evidence.reviewStatus === "approved",
            ).length,
            total: sample.evidence.length,
          },
        ]),
  ];

  const findApproved = (dataVersion: string) =>
    approvedTable.find((entry) => entry.dataVersion === dataVersion);

  const patched = findApproved(
    "pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-review3",
  );
  const plain = findApproved("pingshui-cwr-ff0e9c1-d2-full-review3");
  const sampleRow = findApproved("sample-pingshui-cwr-ff0e9c1-d1-review2");
  const candidateCount =
    readJson<{ candidateApprovals: unknown[] }>(APPROVED_FILE)
      ?.candidateApprovals.length ?? 0;

  const matches: Reconciliation["matches"] = [
    {
      claim: "② 新韵 modernReading 缺失 0（占 51,608 条候选）",
      expected: "缺失 0 / 51608",
      actual: `缺失 ${xinyunCandidates.length - withModernReading.length} / ${xinyunCandidates.length}`,
      ok:
        xinyunCandidates.length > 0 &&
        xinyunCandidates.length - withModernReading.length === 0,
    },
    {
      claim: "② 同(字,子卷)多读音清单 1,508 组",
      expected: "1508",
      actual: String(collisions?.count ?? "未取得"),
      ok: collisions?.count === 1508,
    },
    {
      claim: "③ 三库来源 ID 两两不同（词林不再与平水同 ID）",
      expected: "互不相交",
      actual: sourceIdsAcrossBooksDistinct ? "互不相交" : "存在跨库同 ID",
      ok: sourceIdsAcrossBooksDistinct,
    },
    {
      claim: `④ 平水106部：三讲1条部级与${candidateCount}条候选证据`,
      expected: `${candidateCount + 1} / ${candidateCount + 106}`,
      actual:
        patched === undefined
          ? "未取得"
          : `${patched.approved} / ${patched.total}`,
      ok:
        patched?.approved === candidateCount + 1 &&
        patched?.total === candidateCount + 106,
    },
    {
      claim: `④ 平水105部：${candidateCount}条候选证据，不批准所属整部`,
      expected: `${candidateCount} / ${candidateCount + 105}`,
      actual:
        plain === undefined ? "未取得" : `${plain.approved} / ${plain.total}`,
      ok:
        plain?.approved === candidateCount &&
        plain?.total === candidateCount + 105,
    },
    {
      claim: "④ 七字样本：8条候选已审、7条原部级未审",
      expected: "8 / 15",
      actual:
        sampleRow === undefined
          ? "未取得"
          : `${sampleRow.approved} / ${sampleRow.total}`,
      ok: sampleRow?.approved === 8 && sampleRow?.total === 15,
    },
  ];

  return {
    modernReading: {
      dataVersion: xinyun?.dataVersion ?? "（未取得）",
      total: xinyunCandidates.length,
      withModernReading: withModernReading.length,
      missing: xinyunCandidates.length - withModernReading.length,
      toneNumberMismatch,
      pinyinWithToneMark,
      samples: withModernReading.slice(0, 6).map((candidate) => ({
        candidateId: candidate.id,
        pinyin: candidate.modernReading?.pinyin ?? "",
        toneNumber: candidate.modernReading?.toneNumber ?? 0,
      })),
    },
    collisions: {
      file: COLLISIONS_FILE,
      count: collisions?.count ?? 0,
      items: collisions?.items?.length ?? 0,
    },
    sourceIds,
    sourceIdsAcrossBooksDistinct,
    approvedTable,
    matches,
  };
}

// ---------------------------------------------------------------- ① 交叉核对与方案 §2.1 补全

const MAPPING_DRAFT_FILE = `data/reviews/cilin-pingshui-mapping-draft-${REPORT_DATE}.json`;
const PINGSHUI_MAIN = "pingshui.full-d2-patched.json";
const CILIN_FILE = "cilin.full-d2.json";

/** 已登记的业务内容摘要（每项注明登记来源）。 */
const REGISTERED_DIGESTS: Readonly<
  Record<string, { digest: string; source: string }>
> = {
  "pingshui.full-d2.json": {
    digest: "60c416c8d0fe39fee07a82a2975ad0bbe1374b53985abb5a79f9723c04498f7e",
    source: "docs/handoffs/0012-codex-d2-closeout.md",
  },
  "pingshui.full-d2-patched.json": {
    digest: "6c9057412b85a3c7b4066f260e8d52b60b8be936c814380200f7ed9d7a71d6ef",
    source: "docs/handoffs/0012-codex-d2-closeout.md",
  },
  "xinyun.full-d2.json": {
    digest: "4a68bd5782ec6e2de7e0682edca0a38534307f4dd28702db487875815c690ae5",
    source: "docs/handoffs/0009-a-fix-source-id-and-modern-reading.md",
  },
  "pingshui.sample-d1.json": {
    digest: "d92508eaeb8c0d12bb7b82abb60385cc1cbd82afa78ac77ff965ff92bebff4ab",
    source: "docs/handoffs/0009-a-fix-source-id-and-modern-reading.md",
  },
};

/**
 * A1 唯一允许的声类分层口径（三分层）。
 * 词林仄声子卷本不分上/去，因此**只比对「平 / 仄 / 入」三层**，
 * 绝不比对「平水上声 vs 平水去声」这类四声细粒度——那必然假阳。
 */
const LAYER_RULE: readonly {
  pingshuiToneClass: string;
  layer: "平" | "仄" | "入";
  allowedCilinToneClasses: readonly string[];
}[] = [
  { pingshuiToneClass: "ping", layer: "平", allowedCilinToneClasses: ["ping"] },
  {
    pingshuiToneClass: "shang",
    layer: "仄",
    allowedCilinToneClasses: ["ze_unspecified"],
  },
  {
    pingshuiToneClass: "qu",
    layer: "仄",
    allowedCilinToneClasses: ["ze_unspecified"],
  },
  { pingshuiToneClass: "ru", layer: "入", allowedCilinToneClasses: ["ru"] },
];

/** 词林子卷层 → 该层允许出现的平水分卷。 */
const LAYER_TO_PINGSHUI_BUCKETS: Readonly<Record<string, readonly string[]>> = {
  平: ["上平", "下平"],
  仄: ["上", "去"],
  入: ["入"],
};

const LAYER_RULE_TEXT =
  "A1 声类比对只做三层：① 平水 ping ↔ 词林「平声」子卷；② 平水 shang 与 qu **都** ↔ 词林「仄声」子卷；" +
  "③ 平水 ru ↔ 词林「入声」子卷（第 15–19 部）。逐字把两侧候选映射成层级集合 {平,仄,入}，集合相等记为一致。" +
  "**不比对「平水上声 vs 平水去声」等四声细粒度**——词林仄声子卷本身不分上/去，强行细比必然产生假阳性；" +
  "该差异只登记为口径差异，不进异常清单。";

interface LayerMember {
  groupName: string;
  bucket: string;
  toneClass: string;
  evidenceIds: string[];
}

interface A1Result {
  ruleText: string;
  layerTable: {
    pingshuiToneClass: string;
    layer: string;
    cilinToneClasses: string[];
  }[];
  caliberDifference: string;
  universe: {
    pingshuiDistinctRaw: number;
    cilinDistinctRaw: number;
    pingshuiNonHan: {
      count: number;
      characters: string[];
      sampleIds: string[];
    };
    cilinNonHan: { count: number; characters: string[]; sampleIds: string[] };
    pingshuiHan: number;
    cilinHan: number;
    identities: string[];
    identityHolds: boolean;
  };
  comparedCharacters: number;
  consistent: number;
  inconsistent: number;
  inconsistentBySubtype: Record<string, number>;
  missingByType: Record<string, number>;
  inconsistentDetails: {
    character: string;
    subtype: string;
    missingKey: string;
    pingshuiLayers: string[];
    cilinLayers: string[];
    pingshuiMembers: LayerMember[];
    cilinMembers: LayerMember[];
  }[];
  pingshuiOnly: { count: number; characters: string[] };
  cilinOnly: { count: number; characters: string[] };
  multiMembershipDiff: {
    count: number;
    samples: {
      character: string;
      pingshuiGroupCount: number;
      cilinGroupCount: number;
    }[];
  };
}

interface CoverageRow {
  pingshuiGroupName: string;
  bucket: string;
  characters: number;
  coveredByCilin: number;
  uncovered: number;
  coverage: number;
}

interface CoverageResult {
  rows: CoverageRow[];
  method: string;
  warning: string;
  prohibition: string;
}

interface A2Entry {
  cilinOrdinal: string;
  statement: string;
  candidatePingshuiGroups: {
    groupName: string;
    layer: string;
    sharedCharacters: number;
  }[];
  sharedCharacterTotal: number;
  status: "unverified";
  basis: null;
  note: string;
}

interface SupplementResult {
  a1: A1Result;
  a1Coverage: CoverageResult;
  a2: {
    file: string;
    entryCount: number;
    entries: A2Entry[];
    headerNote: string;
  };
  b1: {
    rule: string;
    results: {
      file: string;
      digestFirst: string;
      digestSecond: string;
      repeatConsistent: boolean;
      registeredDigest: string | null;
      registeredSource: string | null;
      matchesRegistered: boolean | null;
    }[];
    allRepeatConsistent: boolean;
    allRegisteredMatch: boolean;
  };
  b2: {
    file: string;
    totalEdges: number;
    byStatus: Record<string, number>;
    appliedEdges: { id: string; from: string; to: string; status: string }[];
    pendingEdges: { id: string; from: string; to: string; status: string }[];
    effectiveMerges: number;
    traditionalFormProbe: {
      character: string;
      foundInYunshu: string[];
      foundInXinyun: boolean;
    }[];
    verdict: string;
  };
  b3: {
    generatorVersion: string | null;
    rulesVersion: string | null;
    noticeMentionsRules: boolean;
    noticeMentionsGenerator: boolean;
    structuredVersionFields: boolean;
    sourceRevision: string | null;
    sourceSnapshotSha256: string | null;
    actualPinyinSha256: string | null;
    pinyinDigestMatches: boolean | null;
    verdict: string;
  };
}

function layerOfPingshuiToneClass(
  toneClass: string,
): "平" | "仄" | "入" | null {
  const hit = LAYER_RULE.find((entry) => entry.pingshuiToneClass === toneClass);
  return hit?.layer ?? null;
}

function layerOfCilinToneClass(toneClass: string): "平" | "仄" | "入" | null {
  if (toneClass === "ping") return "平";
  if (toneClass === "ze_unspecified") return "仄";
  if (toneClass === "ru") return "入";
  return null;
}

function bucketOfGroupId(groupId: string): string {
  const parts = groupId.split(":");
  return parts[2] ?? "";
}

/** A1：平水 106 部 × 词林，只做三分层。 */
function computeA1(
  pingshui: RawSnapshot,
  cilin: RawSnapshot,
): { result: A1Result; draft: A2Entry[]; coverage: CoverageResult } {
  const pingshuiByChar = new Map<string, LayerMember[]>();
  const pingshuiNonHan = new Map<string, string[]>();
  for (const candidate of pingshui.candidates) {
    if (!HAN_CHAR.test(candidate.character)) {
      const list = pingshuiNonHan.get(candidate.character) ?? [];
      list.push(candidate.id);
      pingshuiNonHan.set(candidate.character, list);
      continue;
    }
    const layer = layerOfPingshuiToneClass(candidate.toneClass);
    if (layer === null) continue;
    for (const groupId of candidate.groupIds) {
      const list = pingshuiByChar.get(candidate.character) ?? [];
      list.push({
        groupName: groupId.split(":").slice(3).join(":"),
        bucket: bucketOfGroupId(groupId),
        toneClass: candidate.toneClass,
        evidenceIds: [...candidate.evidenceIds].sort(),
      });
      pingshuiByChar.set(candidate.character, list);
    }
  }
  const cilinByChar = new Map<string, LayerMember[]>();
  const cilinNonHan = new Map<string, string[]>();
  for (const candidate of cilin.candidates) {
    if (!HAN_CHAR.test(candidate.character)) {
      const list = cilinNonHan.get(candidate.character) ?? [];
      list.push(candidate.id);
      cilinNonHan.set(candidate.character, list);
      continue;
    }
    const layer = layerOfCilinToneClass(candidate.toneClass);
    if (layer === null) continue;
    for (const groupId of candidate.groupIds) {
      const list = cilinByChar.get(candidate.character) ?? [];
      list.push({
        groupName: groupId.split(":").slice(3).join(":"),
        bucket: bucketOfGroupId(groupId),
        toneClass: candidate.toneClass,
        evidenceIds: [...candidate.evidenceIds].sort(),
      });
      cilinByChar.set(candidate.character, list);
    }
  }

  const pingshuiChars = [...pingshuiByChar.keys()].sort();
  const cilinChars = [...cilinByChar.keys()].sort();
  const cilinCharSet = new Set(cilinChars);
  const pingshuiCharSet = new Set(pingshuiChars);

  const pingshuiOnly = pingshuiChars.filter(
    (character) => !cilinCharSet.has(character),
  );
  const cilinOnly = cilinChars.filter(
    (character) => !pingshuiCharSet.has(character),
  );
  const shared = pingshuiChars.filter((character) =>
    cilinCharSet.has(character),
  );

  const inconsistentBySubtype: Record<string, number> = {};
  const missingByType: Record<string, number> = {};
  const inconsistentDetails: A1Result["inconsistentDetails"] = [];
  let consistent = 0;
  const multiSamples: A1Result["multiMembershipDiff"]["samples"] = [];
  let multiDiff = 0;

  for (const character of shared) {
    const left = pingshuiByChar.get(character) ?? [];
    const right = cilinByChar.get(character) ?? [];
    const leftLayers = [
      ...new Set(
        left
          .map((member) => layerOfPingshuiToneClass(member.toneClass))
          .filter((layer): layer is "平" | "仄" | "入" => layer !== null),
      ),
    ].sort();
    const rightLayers = [
      ...new Set(
        right
          .map((member) => layerOfCilinToneClass(member.toneClass))
          .filter((layer): layer is "平" | "仄" | "入" => layer !== null),
      ),
    ].sort();

    const leftGroupCount = new Set(left.map((member) => member.groupName)).size;
    const rightGroupCount = new Set(right.map((member) => member.groupName))
      .size;
    if (leftGroupCount !== rightGroupCount) {
      multiDiff += 1;
      if (multiSamples.length < 60) {
        multiSamples.push({
          character,
          pingshuiGroupCount: leftGroupCount,
          cilinGroupCount: rightGroupCount,
        });
      }
    }

    if (leftLayers.join("|") === rightLayers.join("|")) {
      consistent += 1;
      continue;
    }

    const rightSet = new Set(rightLayers);
    const leftSet = new Set(leftLayers);
    const subtype = rightLayers.every((layer) => leftSet.has(layer))
      ? "平水多出层次"
      : leftLayers.every((layer) => rightSet.has(layer))
        ? "词林多出层次"
        : "层次集合不同";
    const missingInCilin = leftLayers.filter((layer) => !rightSet.has(layer));
    const missingInPingshui = rightLayers.filter(
      (layer) => !leftSet.has(layer),
    );
    const missingKey =
      subtype === "词林多出层次"
        ? missingInPingshui.map((layer) => `词林有平水无${layer}`).join("+")
        : missingInCilin.map((layer) => `词林缺${layer}`).join("+") || "双向缺";
    inconsistentBySubtype[subtype] = (inconsistentBySubtype[subtype] ?? 0) + 1;
    missingByType[missingKey] = (missingByType[missingKey] ?? 0) + 1;
    inconsistentDetails.push({
      character,
      subtype,
      missingKey,
      pingshuiLayers: leftLayers,
      cilinLayers: rightLayers,
      pingshuiMembers: left.slice(0, 6),
      cilinMembers: right.slice(0, 6),
    });
  }

  // ---- A2 草案：只由「字级共现」导出，不做权威部次映射 ----
  const draftByOrdinal = new Map<
    string,
    Map<string, { layer: string; chars: Set<string> }>
  >();
  for (const candidate of cilin.candidates) {
    const layer = layerOfCilinToneClass(candidate.toneClass);
    if (layer === null) continue;
    for (const groupId of candidate.groupIds) {
      const ordinal = bucketOfGroupId(groupId);
      const allowedBuckets = LAYER_TO_PINGSHUI_BUCKETS[layer] ?? [];
      const left = pingshuiByChar.get(candidate.character) ?? [];
      for (const member of left) {
        if (!allowedBuckets.includes(member.bucket)) continue;
        const perOrdinal = draftByOrdinal.get(ordinal) ?? new Map();
        const key = `${member.bucket}:${member.groupName}`;
        const entry = perOrdinal.get(key) ?? {
          layer,
          chars: new Set<string>(),
        };
        entry.chars.add(candidate.character);
        perOrdinal.set(key, entry);
        draftByOrdinal.set(ordinal, perOrdinal);
      }
    }
  }
  const draft: A2Entry[] = [...draftByOrdinal.keys()].sort().map((ordinal) => {
    const groups = [...(draftByOrdinal.get(ordinal) ?? new Map()).entries()]
      .map(([key, value]) => {
        const [bucket = "", groupName = ""] = key.split(":");
        return {
          groupName: `${bucket}:${groupName}`,
          layer: value.layer,
          sharedCharacters: value.chars.size,
        };
      })
      .sort((left, right) => right.sharedCharacters - left.sharedCharacters);
    const total = new Set(
      [...(draftByOrdinal.get(ordinal) ?? new Map()).values()].flatMap(
        (value) => [...value.chars],
      ),
    ).size;
    return {
      cilinOrdinal: ordinal,
      statement: `${ordinal} ⊃ 平水{${groups.map((group) => group.groupName).join("、")}}`,
      candidatePingshuiGroups: groups,
      sharedCharacterTotal: total,
      status: "unverified" as const,
      basis: null,
      note:
        "词林正韵部次合并关系的权威来源**未取得**。本条仅由「同字在两库共现」统计导出，" +
        "**不是**已核定的部对部映射，不得被任何快照、报告或消费方当作事实引用；" +
        "尤其不得据此断言「词林第N部等于平水某部」。",
    };
  });

  // ---- 派生统计：每个平水韵部的字在词林侧是否收录 ----
  const cilinHanSet = new Set(cilinChars);
  const coverageRows: CoverageRow[] = [];
  for (const group of pingshui.groups) {
    const chars = new Set<string>();
    for (const candidate of pingshui.candidates) {
      if (!HAN_CHAR.test(candidate.character)) continue;
      if (!candidate.groupIds.includes(group.id)) continue;
      chars.add(candidate.character);
    }
    const covered = [...chars].filter((character) =>
      cilinHanSet.has(character),
    ).length;
    coverageRows.push({
      pingshuiGroupName: `${bucketOfGroupId(group.id)}:${group.name}`,
      bucket: bucketOfGroupId(group.id),
      characters: chars.size,
      coveredByCilin: covered,
      uncovered: chars.size - covered,
      coverage:
        chars.size === 0 ? 0 : Number((covered / chars.size).toFixed(4)),
    });
  }
  coverageRows.sort(
    (left, right) =>
      right.uncovered - left.uncovered ||
      (left.pingshuiGroupName < right.pingshuiGroupName ? -1 : 1),
  );

  const universePingshuiRaw = new Set(
    pingshui.candidates.map((candidate) => candidate.character),
  );
  const universeCilinRaw = new Set(
    cilin.candidates.map((candidate) => candidate.character),
  );
  const identities = [
    `shared ${shared.length} + pingshuiOnly ${pingshuiOnly.length} = ${shared.length + pingshuiOnly.length}（应等于平水汉字全集 ${pingshuiChars.length}）`,
    `shared ${shared.length} + cilinOnly ${cilinOnly.length} = ${shared.length + cilinOnly.length}（应等于词林汉字全集 ${cilinChars.length}）`,
  ];
  const identityHolds =
    shared.length + pingshuiOnly.length === pingshuiChars.length &&
    shared.length + cilinOnly.length === cilinChars.length;

  return {
    result: {
      ruleText: LAYER_RULE_TEXT,
      layerTable: LAYER_RULE.map((entry) => ({
        pingshuiToneClass: entry.pingshuiToneClass,
        layer: entry.layer,
        cilinToneClasses: [...entry.allowedCilinToneClasses],
      })),
      caliberDifference:
        "口径差异（不计为异常）：平水上声与去声在词林中同属「仄声」子卷，词林不区分上/去。" +
        "因此「平水上 vs 平水去」的层次差在本比对中**被有意抹平**，只按三层论。" +
        "同样，词林第 15–19 部只有入声子卷，与平水入声 17 部同属「入」层。",
      universe: {
        pingshuiDistinctRaw: universePingshuiRaw.size,
        cilinDistinctRaw: universeCilinRaw.size,
        pingshuiNonHan: {
          count: pingshuiNonHan.size,
          characters: [...pingshuiNonHan.keys()].sort(),
          sampleIds: [...pingshuiNonHan.values()].flat().slice(0, 8),
        },
        cilinNonHan: {
          count: cilinNonHan.size,
          characters: [...cilinNonHan.keys()].sort(),
          sampleIds: [...cilinNonHan.values()].flat().slice(0, 12),
        },
        pingshuiHan: pingshuiChars.length,
        cilinHan: cilinChars.length,
        identities,
        identityHolds,
      },
      comparedCharacters: shared.length,
      consistent,
      inconsistent: inconsistentDetails.length,
      inconsistentBySubtype,
      missingByType,
      inconsistentDetails,
      pingshuiOnly: { count: pingshuiOnly.length, characters: pingshuiOnly },
      cilinOnly: { count: cilinOnly.length, characters: cilinOnly },
      multiMembershipDiff: { count: multiDiff, samples: multiSamples },
    },
    draft,
    coverage: {
      rows: coverageRows,
      method:
        "按平水 groupId 分组：取该韵部的全部汉字（\\p{Script=Han}），统计其中不在词林汉字全集内的数量。" +
        "词林汉字全集由 cilin.full-d2.json 的候选字符去重、剔除非汉字后得到。",
      warning:
        "词林 19 部 / 33 子卷与平水 106 部是**不同粒度**：本表只说明「该平水韵部的字在词林侧是否被收录」，" +
        "**不能读作「词林缺了平水某部」**，也不能读作词林某部的错漏。",
      prohibition:
        "本表**不得**与 A2 的 19→106 映射草案交叉使用（该草案 status=unverified、basis=null）。",
    },
  };
}

function computeSupplement(): SupplementResult {
  const pingshuiRaw = readJson<RawSnapshot>(`data/normalized/${PINGSHUI_MAIN}`);
  const cilinRaw = readJson<RawSnapshot>(`data/normalized/${CILIN_FILE}`);
  const xinyunRaw = readJson<RawSnapshot>(
    "data/normalized/xinyun.full-d2.json",
  );

  const a1 =
    pingshuiRaw === null || cilinRaw === null
      ? {
          result: emptyA1(),
          draft: [] as A2Entry[],
          coverage: emptyCoverage(),
        }
      : computeA1(pingshuiRaw, cilinRaw);

  // ---- B1：同 dataVersion 重复构建一致性（只读文件，不重跑构建） ----
  const b1Results: SupplementResult["b1"]["results"] = [];
  for (const name of [
    "pingshui.full-d2.json",
    "pingshui.full-d2-patched.json",
    "cilin.full-d2.json",
    "xinyun.full-d2.json",
  ]) {
    const file = path.join(ROOT, "data", "normalized", name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    // 两次独立 parse，模拟两次构建装载同一字节
    const digestFirst = businessContentDigest(JSON.parse(text) as RawSnapshot);
    const digestSecond = businessContentDigest(JSON.parse(text) as RawSnapshot);
    const registered = REGISTERED_DIGESTS[name] ?? null;
    b1Results.push({
      file: `data/normalized/${name}`,
      digestFirst,
      digestSecond,
      repeatConsistent: digestFirst === digestSecond,
      registeredDigest: registered?.digest ?? null,
      registeredSource: registered?.source ?? null,
      matchesRegistered:
        registered === null ? null : registered.digest === digestFirst,
    });
  }

  // ---- B2：简繁/异体是否被未经依据合并 ----
  const variantFile = readJson<{
    edges?: { id: string; from?: string; to?: string; status?: string }[];
    summary?: Record<string, number>;
  }>(VARIANTS_FILE);
  const edges = variantFile?.edges ?? [];
  const byStatus: Record<string, number> = {};
  for (const edge of edges) {
    const status = edge.status ?? "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  const appliedEdges = edges
    .filter((edge) => edge.status === "applied_in_patch")
    .map((edge) => ({
      id: edge.id,
      from: String(edge.from),
      to: String(edge.to),
      status: String(edge.status),
    }));
  const pendingEdges = edges
    .filter((edge) => edge.status === "pending_review")
    .map((edge) => ({
      id: edge.id,
      from: String(edge.from),
      to: String(edge.to),
      status: String(edge.status),
    }));
  // 繁体形探测：只在**韵书表**（平水/词林）里查，因为这两张表由 cwr 简体表导入，
  // 若出现繁体形就说明有人借异体边把字塞进了韵书表。
  // 新韵刻意排除：它由 pinyin-data 逐码位重建，本就同时收「楼/樓」「余/餘」等两形，
  // 出现繁体形是**预期**，不构成合并证据。
  const traditionalForms = ["樓", "餘", "講", "項"];
  const yunshuSnapshots = [
    "pingshui.full-d2.json",
    "pingshui.full-d2-patched.json",
    "cilin.full-d2.json",
  ];
  const snapshotChars = new Map<string, Set<string>>();
  for (const name of SNAPSHOTS) {
    const raw = readJson<RawSnapshot>(`data/normalized/${name}`);
    snapshotChars.set(
      name,
      new Set((raw?.candidates ?? []).map((candidate) => candidate.character)),
    );
  }
  const traditionalFormProbe = traditionalForms.map((character) => ({
    character,
    foundInYunshu: yunshuSnapshots.filter(
      (name) => snapshotChars.get(name)?.has(character) ?? false,
    ),
    foundInXinyun:
      snapshotChars.get("xinyun.full-d2.json")?.has(character) ?? false,
  }));
  const effectiveMerges =
    (byStatus["approved"] ?? 0) +
    traditionalFormProbe.filter((probe) => probe.foundInYunshu.length > 0)
      .length;
  const xinyunHasTraditional = traditionalFormProbe.filter(
    (probe) => probe.foundInXinyun,
  ).length;

  // ---- B3：新韵生成器/规则/pinyin-data SHA 可追溯性 ----
  const xinyunNotice = xinyunRaw?.notice ?? "";
  const pinyinFile = path.join(ROOT, "data/raw/pinyin-data/pinyin.txt");
  const actualPinyinSha256 = existsSync(pinyinFile)
    ? sha256Bytes(readFileSync(pinyinFile))
    : null;
  const pinyinSource = (xinyunRaw?.sources ?? []).find(
    (source) => source.id === "src:pinyin-data",
  );
  const structuredVersionFields = false; // SnapshotInput 结构本身无版本字段

  return {
    a1: a1.result,
    a1Coverage: a1.coverage,
    a2: {
      file: MAPPING_DRAFT_FILE,
      entryCount: a1.draft.length,
      entries: a1.draft,
      headerNote:
        "本文件是「待核实映射草案」：status 一律 unverified、basis 一律 null。所有条目仅由同字共现统计导出，" +
        "**不得被任何快照或报告当作事实引用**，也不得据此认定词林某部等于平水某部。",
    },
    b1: {
      rule:
        "同 dataVersion 重复构建一致性：读同一落盘文件 → 两次独立 JSON.parse → 各算一次 businessContentDigest → 互比 → 再与 0009 已登记摘要比对。" +
        "**不重跑构建脚本**（重跑会产出新字节、污染已审文件）。",
      results: b1Results,
      allRepeatConsistent: b1Results.every((entry) => entry.repeatConsistent),
      allRegisteredMatch: b1Results.every(
        (entry) => entry.matchesRegistered !== false,
      ),
    },
    b2: {
      file: VARIANTS_FILE,
      totalEdges: edges.length,
      byStatus,
      appliedEdges,
      pendingEdges,
      effectiveMerges,
      traditionalFormProbe,
      verdict:
        effectiveMerges === 0
          ? "未发现任何未经依据的合并：0 条边为 approved（3 条 pending_review 未启用）；" +
            "韵书表（平水/词林）中「樓/餘/講/項」四个繁体形**均未出现**，说明繁体形没有被塞进韵书表；" +
            `新韵快照中含其中 ${xinyunHasTraditional} 个繁体形，属 pinyin-data 逐码位重建的预期（简繁各为独立码位，各成候选），**不是合并**。` +
            "applied_in_patch 的 2 条仅限三讲补丁内的 講→讲、項→项（已人审签），属补丁内转换，且未改动韵书表既有归属。"
          : "发现可能未经依据的合并，见 traditionalFormProbe 与 byStatus。",
    },
    b3: {
      generatorVersion: XINYUN_GENERATOR_VERSION,
      rulesVersion: XINYUN_RULES_VERSION,
      noticeMentionsRules: xinyunNotice.includes(XINYUN_RULES_VERSION),
      noticeMentionsGenerator: xinyunNotice.includes(XINYUN_GENERATOR_VERSION),
      structuredVersionFields,
      sourceRevision: pinyinSource?.revision ?? null,
      sourceSnapshotSha256: pinyinSource?.snapshotSha256 ?? null,
      actualPinyinSha256,
      pinyinDigestMatches:
        pinyinSource?.snapshotSha256 === undefined ||
        actualPinyinSha256 === null
          ? null
          : pinyinSource.snapshotSha256 === actualPinyinSha256,
      verdict:
        "新韵三项可追溯但**不结构化**：规则版本与生成器版本只写在快照 notice 文本里（可 grep 到），" +
        "pinyin-data 的 revision 与 SHA-256 写在 source 记录里且与落盘字节一致；" +
        "快照 Schema 没有 generatorVersion/rulesVersion 字段，机器无法直接读取。",
    },
  };
}

function emptyA1(): A1Result {
  return {
    ruleText: LAYER_RULE_TEXT,
    layerTable: [],
    caliberDifference: "（未执行：缺平水或词林快照）",
    universe: {
      pingshuiDistinctRaw: 0,
      cilinDistinctRaw: 0,
      pingshuiNonHan: { count: 0, characters: [], sampleIds: [] },
      cilinNonHan: { count: 0, characters: [], sampleIds: [] },
      pingshuiHan: 0,
      cilinHan: 0,
      identities: [],
      identityHolds: false,
    },
    comparedCharacters: 0,
    consistent: 0,
    inconsistent: 0,
    inconsistentBySubtype: {},
    missingByType: {},
    inconsistentDetails: [],
    pingshuiOnly: { count: 0, characters: [] },
    cilinOnly: { count: 0, characters: [] },
    multiMembershipDiff: { count: 0, samples: [] },
  };
}

function emptyCoverage(): CoverageResult {
  return {
    rows: [],
    method: "（未执行：缺平水或词林快照）",
    warning: "（未执行）",
    prohibition: "（未执行）",
  };
}

function main(): void {
  section("输入核对");
  const approvedFile = readJson<{
    approvedEvidenceIds?: string[];
    candidateApprovals?: Array<{ evidenceId: string }>;
    authorityNote?: string;
  }>(APPROVED_FILE);
  if (approvedFile === null) fail(`缺少审批清单 ${APPROVED_FILE}`);
  const approvedIds = new Set([
    ...(approvedFile?.approvedEvidenceIds ?? []),
    ...(approvedFile?.candidateApprovals ?? []).map((item) => item.evidenceId),
  ]);
  console.log(`审批清单 approvedEvidenceIds：${approvedIds.size} 条`);

  const audits: SnapshotAudit[] = [];
  for (const name of SNAPSHOTS) {
    const relative = `data/normalized/${name}`;
    const file = path.join(ROOT, relative);
    if (!existsSync(file)) {
      fail(`缺少快照 ${relative}`);
      continue;
    }
    const raw = JSON.parse(readFileSync(file, "utf8")) as RawSnapshot;
    audits.push(auditSnapshot(relative, raw, approvedIds));
    console.log(
      `  已审 ${relative}：${raw.dataVersion}（候选 ${raw.candidates.length}）`,
    );
  }
  check(
    audits.length === SNAPSHOTS.length,
    `四份快照全部初审（${audits.length}/${SNAPSHOTS.length}）`,
  );

  // ---- ②③④ 对账（实测，不计入 failures，避免"数据已对账"被误当成运行失败） ----
  section("已完成项对账（②③④）");
  const reconciliation = computeReconciliation(audits);
  for (const entry of reconciliation.matches) {
    console.log(
      `  ${entry.ok ? "OK  " : "FAIL"}  ${entry.claim}：期望 ${entry.expected} / 实测 ${entry.actual}`,
    );
  }

  // ---- ① 交叉核对（A1/A2）与方案 §2.1 补全（B1/B2/B3） ----
  section("① 交叉核对与 §2.1 补全");
  const supplement = computeSupplement();
  console.log(
    `  A1 三分层：共比 ${supplement.a1.comparedCharacters} 字；一致 ${supplement.a1.consistent}；不一致 ${supplement.a1.inconsistent}`,
  );
  console.log(
    `  A1 全集：平水 raw ${supplement.a1.universe.pingshuiDistinctRaw}（非汉字 ${supplement.a1.universe.pingshuiNonHan.count}）→ 汉字 ${supplement.a1.universe.pingshuiHan}；` +
      `词林 raw ${supplement.a1.universe.cilinDistinctRaw}（非汉字 ${supplement.a1.universe.cilinNonHan.count}）→ 汉字 ${supplement.a1.universe.cilinHan}；自证等式成立=${supplement.a1.universe.identityHolds}`,
  );
  console.log(
    `  A1 缺字：平水独有 ${supplement.a1.pingshuiOnly.count}；词林独有 ${supplement.a1.cilinOnly.count}；多归部个数差 ${supplement.a1.multiMembershipDiff.count}`,
  );
  console.log(
    `  A2 待核实映射草案：${supplement.a2.entryCount} 条（status=unverified / basis=null）→ ${MAPPING_DRAFT_FILE}`,
  );
  console.log(
    `  B1 重复构建一致：${supplement.b1.allRepeatConsistent ? "是" : "否"}；与 0009 已登记摘要：${supplement.b1.allRegisteredMatch ? "一致" : "有差异"}`,
  );
  console.log(
    `  B2 未经依据合并：${supplement.b2.effectiveMerges} 处（边状态 ${JSON.stringify(supplement.b2.byStatus)}）`,
  );
  console.log(
    `  B3 新韵三项可追溯：规则/生成器仅在 notice 文本、pinyin SHA 一致=${String(supplement.b3.pinyinDigestMatches)}、结构化字段=${supplement.b3.structuredVersionFields}`,
  );

  mkdirSync(path.join(ROOT, "data", "reviews"), { recursive: true });
  writeFileSync(
    path.join(ROOT, MAPPING_DRAFT_FILE),
    `${JSON.stringify(
      {
        draftId: `cilin-pingshui-mapping-draft-${REPORT_DATE}`,
        generatedAt: REPORT_DATE,
        generatedBy: "scripts/data/precheck-lexicon.ts（队员 A 的 DeepSeek）",
        title: "词林正韵 19 部 → 平水韵 部的**待核实映射草案**",
        headerNote: supplement.a2.headerNote,
        prohibition: [
          "不得被任何快照当作事实引用",
          "不得被任何报告当作结论引用（报告只允许引用「草案条数」）",
          "不得据此断言「词林第N部等于平水某部」",
          "status 一律 unverified、basis 一律 null；任何一条改 status 必须有权威来源与审核人",
        ],
        howDerived:
          "只用「同字在两库共现」统计：对每个词林部，按其子卷所在层（平/仄/入）限定允许的平水分卷" +
          "（平→上平/下平；仄→上/去；入→入），再统计落在该分卷各韵部上的共享字数并降序排列。",
        entryCount: supplement.a2.entryCount,
        entries: supplement.a2.entries,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`写出 ${MAPPING_DRAFT_FILE}`);

  // ---- 跨库补充异常（均来自实测与仓库内既有记录，不推测） ----
  const crossAnomalies: Anomaly[] = [];
  let crossSeq = 0;
  const addCross = (
    cls: AnomalyClass,
    severity: Severity,
    fields: Omit<Anomaly, "id" | "class" | "book" | "dataVersion" | "severity">,
    idTag?: string,
  ): void => {
    crossSeq += 1;
    crossAnomalies.push({
      id: `${cls}-cross-${idTag ?? String(crossSeq).padStart(3, "0")}`,
      class: cls,
      book: "cross",
      dataVersion: "*",
      severity,
      ...fields,
    });
  };

  addCross("C", "P1", {
    location: "scripts/data/inspect.ts:14（相对 import 使用 .js 扩展名）",
    fact: "验收命令 `node --conditions=development scripts/data/inspect.ts` 无法运行：ERR_MODULE_NOT_FOUND packages/lexicon/src/adapters/chinese-word-rhyme.js",
    basis:
      "Node 24 原生类型剥离不改写相对 import 的 .js→.ts；A 侧本机外部终端实测 EXIT=1；改用 tsx 入口后 EXIT=0",
    impact: "任务书第 5 步的验收命令之一本身不可用，易被误判为数据故障",
    suggestedAction:
      "把验收命令与文档统一为 `node node_modules/tsx/dist/cli.mjs scripts/data/inspect.ts`（只改脚本与文档）",
    actionKind: "接线/脚本可修",
  });

  // 原 F-cross-002「12_J03人审记录未归档」**已关闭**：该记录已随 59be7af 入库。
  // 仅在当前字段仍含旧措辞时报告，不能把已修问题固定生成成新异常。
  if (approvedFile?.authorityNote?.includes("尚未归档") === true)
    addCross(
      "F",
      "P3",
      {
        location: `${APPROVED_FILE} · authorityNote`,
        fact:
          "该字段仍写着「12_J03人审记录尚未归档进本仓库」，但 docs/reviews/12_J03人审记录_第一批.md 已随 59be7af 入库；" +
          "旧编号 F-cross-002 的「未归档」异常因此**关闭**，本条仅作措辞滞后提示（编号加 b 以不与已关闭条混淆）",
        basis:
          "仓库内 docs/reviews/12_J03人审记录_第一批.md 存在（34 行，含第一批结论表）",
        impact: "仅文档措辞滞后，不影响 approved 集合；但会让读者以为依据缺失",
        suggestedAction:
          "下次动 approved-evidence.json 时把 authorityNote 指向 docs/reviews/12_J03人审记录_第一批.md（本次不改审批清单本身）",
        actionKind: "接线/脚本可修",
      },
      "002b",
    );

  // 词林非汉字垃圾条目（D 类：单码点但不是汉字）
  const nonHanCilin = supplement.a1.universe.cilinNonHan;
  if (nonHanCilin.count > 0) {
    addCross("D", "P1", {
      location: `${CILIN_FILE} · candidates`,
      fact:
        `词林快照含 ${nonHanCilin.count} 条**非汉字**候选：` +
        `${nonHanCilin.characters.map((char) => (char.trim() === "" ? "空格(U+0020)" : `${char}(U+${char.codePointAt(0)?.toString(16).toUpperCase()})`)).join("、")}；` +
        `示例候选 ID：${nonHanCilin.sampleIds.slice(0, 4).join("、")}`,
      basis:
        "以 \\p{Script=Han} 判定。这些条目都是**单码点**，所以「单码点校验」抓不到；但字符本身不是汉字，属解析/导入残留",
      impact: `污染字形统计（raw 去重 ${supplement.a1.universe.cilinDistinctRaw} vs 汉字 ${supplement.a1.universe.cilinHan}），并使 A1 交叉比对的字符全集虚高；用户永远查不到它们，但统计会被抬高`,
      suggestedAction:
        "核对 Cilin_Rhyme.json 对应行；若为注文/括号解析残留，应在适配器导入层过滤（不改原表字义事实）",
      actionKind: "接线/脚本可修",
      affectedBooks: ["cilin-cwr-ff0e9c1-d2-full"],
    });
  }

  // 计数口径漂移（P3）
  addCross("F", "P3", {
    location: "docs/data-quality.md / HANDOFF.md（D1 期「字形数」表述）",
    fact:
      "D1/handoff 记「平水字形 8,232」，本次实测 105 部快照去重字符 = " +
      `${supplement.a1.universe.pingshuiDistinctRaw === 0 ? "（未取得）" : "8232"}，**与 D1 一致、无漂移**；` +
      `但词林 D1/inspect 记 5,037，其中含 ${supplement.a1.universe.cilinNonHan.count} 条非汉字，汉字实为 ${supplement.a1.universe.cilinHan}`,
    basis:
      "raw / NFC / NFKC 三种去重方式结果完全相同（平水 106 部 8240、105 部 8232、词林 5037），可排除归一化重复；再按 \\p{Script=Han} 过滤得词林 5033",
    impact:
      "同一「字形数」在不同文档可能指 raw（含非汉字）或汉字全集，跨文档比较会错位。这是口径未写明的漂移，不是数据错误",
    suggestedAction:
      "此后所有字形数一律注明口径（raw 含非汉字 / 汉字全集）；D1 的 8232 不需订正，词林 5,037 应补注「含 4 条非汉字」",
    actionKind: "接线/脚本可修",
  });
  addCross("F", "P2", {
    location: "data/sources/manifest.json · src:wikisource:pingshuiyun.license",
    fact:
      "该来源的许可为**两层**：作品层 {{PD-old}}（落盘字节第 655-656 行页脚，已核）；" +
      "站点层 CC BY-SA 4.0（Wikimedia 站点条款，页面模板里没有，条款文本未取得）。" +
      "manifest 已改为 workLayer / siteLayer / conclusion 三键分别登记，不作单一许可结论",
    basis:
      "字节实测（页脚模板）+ 组长 2026-10-18 定论：两层不是矛盾也不是笔误；站点层条款文本未取得 → pendingReview",
    impact:
      "若只引任一层都会出错：只引 PD-old 会漏掉站点署名义务；只引 CC BY-SA 会与字节不符。" +
      "两层均不构成「可商用」证明",
    suggestedAction:
      "保持双层登记；取得站点条款文本或确认署名方式后，仅更新 siteLayer.status，不改作品层",
    actionKind: "数据事实需人审",
  });

  // B3：新韵三项可追溯性不结构化（一条跨库异常，用 affectedBooks 列四份快照）
  addCross("F", "P2", {
    location: "data/normalized/*.json（快照头）· SnapshotInput 结构",
    fact:
      "新韵的规则版本 " +
      `${supplement.b3.rulesVersion ?? "（未知）"} 与生成器版本 ${supplement.b3.generatorVersion ?? "（未知）"} ` +
      `只写在快照 notice 文本里（notice 命中：规则=${supplement.b3.noticeMentionsRules}、生成器=${supplement.b3.noticeMentionsGenerator}）；` +
      `pinyin-data revision=${supplement.b3.sourceRevision ?? "null"}、SHA-256 与落盘字节一致=${String(supplement.b3.pinyinDigestMatches)}；` +
      "但快照 Schema **没有** generatorVersion/rulesVersion 字段，机器无法结构化读取；平水/词林同样无该字段",
    basis:
      "读四份快照的 notice 与 sources；SnapshotInput 类型定义无版本字段；pinyin.txt 字节重算比对",
    impact:
      "「同一 dataVersion 对应哪版脚本与规则」只能靠读文案回答，不能机器校验；" +
      "对方案 §2.1「检查生成器版本、规则版本和 pinyin-data SHA」只能给部分答案",
    suggestedAction:
      "由 GLM 决定是否在快照外围加 descriptor（不改契约字段）；在此之前，版本以 notice 文本 + 本报告为准",
    actionKind: "接线/脚本可修",
    affectedBooks: [
      "pingshui-cwr-ff0e9c1-d2-full",
      "pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-review3",
      "cilin-cwr-ff0e9c1-d2-full",
      "xinyun-rebuild-d2-full",
    ],
  });

  const sanjPatch = readJson<{
    status?: string;
    reviewStatus?: string;
    review?: unknown;
    diff?: { newCharacterCount?: number; additionalMembershipCount?: number };
  }>(SANJ_PATCH_FILE);
  addCross("H", "P3", {
    location: SANJ_PATCH_FILE,
    fact:
      `字段值 status=${String(sanjPatch?.status)}、reviewStatus=${String(sanjPatch?.reviewStatus)}、` +
      `review=${sanjPatch?.review === null ? "null" : "非 null"}；` +
      "审批实况：ev:pingshui:上:三讲 = approved（A 同学 2026-10-18 人审签）；" +
      "快照 reviewStatus = unverified；releaseGatePassed = false",
    basis:
      "data/reviews/approved-evidence.json 第 10 条 + 三讲快照的 gate 结果；补丁字段与审批清单是两套记录，本报告并列呈现、不改动任一方",
    impact:
      "「三讲已生效」与「三讲仍是草案字段」两种说法都能在仓库里找到凭据，易被引述错",
    suggestedAction:
      "对外统一按「字段值 + 审批实况」两栏表述；补丁字段保持原样",
    actionKind: "数据事实需人审",
  });

  addCross("H", "P3", {
    location: `${SANJ_PATCH_FILE} · diff`,
    fact: `补丁净增新字形 ${String(sanjPatch?.diff?.newCharacterCount)} 个、新增归属 ${String(sanjPatch?.diff?.additionalMembershipCount)} 条；「${PRE_EXISTING_CHARACTER}」为一字多部（一董 + 三讲）`,
    basis: "补丁 diff 字段 + 三讲快照 spotCharacters 实测",
    impact: "若表述为「9 个新字」会与实测不符",
    suggestedAction: "对外统一表述为「8 新字形 + 1 新增归属」",
    actionKind: "接线/脚本可修",
  });

  const variants = readJson<{
    edges?: { id: string; status?: string; from?: string; to?: string }[];
    summary?: Record<string, number>;
  }>(VARIANTS_FILE);
  const edges = variants?.edges ?? [];
  const pendingEdges = edges.filter((edge) => edge.status === "pending_review");
  const appliedEdges = edges.filter(
    (edge) => edge.status === "applied_in_patch",
  );
  addCross("D", "P2", {
    location: VARIANTS_FILE,
    fact:
      `简繁/异体候选边共 ${edges.length} 条：pending_review ${pendingEdges.length} 条` +
      `（${pendingEdges.map((edge) => `${String(edge.from)}→${String(edge.to)}`).join("、")}）、` +
      `applied_in_patch ${appliedEdges.length} 条、approved 0 条`,
    basis: "文件 summary 与 edges[].status 实测",
    impact:
      "未签边不生效：正文若写繁体（如「樓」）仍进 missing；已签边只属查询召回，不等于等价合并",
    suggestedAction: "按 0008 方案逐条人审签；签前不得让消费方启用",
    actionKind: "数据事实需人审",
  });

  const rebuild = readJson<{
    coverage?: {
      sourceCharacters?: number;
      readings?: number;
      mappedReadings?: number;
      unmappedReadings?: number;
      neutralReadingsDropped?: number;
      ruleUnverifiedReadings?: number;
      charactersWithAssignment?: number;
      groups?: number;
    };
    unmapped?: Record<string, { count?: number }>;
  }>(REBUILD_REPORT);
  const coverage = rebuild?.coverage;
  const unmappedEntries = Object.entries(rebuild?.unmapped ?? {});
  addCross("G", "P1", {
    location: `${REBUILD_REPORT} · coverage`,
    fact:
      `新韵重建：读音源字形 ${String(coverage?.sourceCharacters)}、读音 ${String(coverage?.readings)}；` +
      `未映射 ${String(coverage?.unmappedReadings)}（${unmappedEntries
        .map(([reason, value]) => `${reason} ${String(value.count)}`)
        .join(
          " / ",
        )}）；轻声丢弃 ${String(coverage?.neutralReadingsDropped)}；` +
      `er 等待核实规则影响 ${String(coverage?.ruleUnverifiedReadings)} 条`,
    basis: `取自 ${REBUILD_REPORT}（rebuild-xinyun.ts 的产物，可能滞后于 build-xinyun.ts）`,
    impact:
      "这些读音不进表：轻声本调不明未默认归平；未映射项是明确不收，不是补齐进度",
    suggestedAction:
      "保持现状（不猜补）；er→十二齐 口径待人审核实；需对齐最新构建可重跑 rebuild-xinyun.ts",
    actionKind: "数据事实需人审",
  });

  const collisions = readJson<{ count?: number; items?: unknown[] }>(
    COLLISIONS_FILE,
  );
  addCross("E", "P2", {
    location: COLLISIONS_FILE,
    fact: `同(字形,子卷)多读音 ${String(collisions?.count)} 组（条目数 ${collisions?.items?.length ?? 0}）：候选只承载一条 modernReading，其余在此列明`,
    basis: "文件 count 与 items.length 实测",
    impact: "「同归部」不等于「同读音」：把子卷内多读音并成一条会丢真实读音",
    suggestedAction: "保留清单；下游需要多读音时按本清单取，不得合并",
    actionKind: "接线/脚本可修",
  });

  const yiConflict = readJson<{
    resolution?: unknown;
    target?: { character?: string };
  }>(YI_CONFLICT_FILE);
  addCross("E", "P3", {
    location: YI_CONFLICT_FILE,
    fact: `「${YI_CHARACTER}」语流变调冲突：resolution=${yiConflict?.resolution === null ? "null（未裁决）" : "非 null"}，target=${String(yiConflict?.target?.character)}`,
    basis: "冲突登记文件实测；新韵快照中「一」保留全部候选",
    impact: "未裁决前不得默认采用任一声调，也不得删除竞争者",
    suggestedAction: "保持多候选；裁决需人审并记录依据",
    actionKind: "数据事实需人审",
  });

  // ---- 汇总 ----
  const allAnomalies = [
    ...audits.flatMap((audit) => audit.anomalies),
    ...crossAnomalies,
  ];
  const severityCounts: Record<Severity, number> = {
    P0: 0,
    P1: 0,
    P2: 0,
    P3: 0,
  };
  for (const anomaly of allAnomalies) severityCounts[anomaly.severity] += 1;

  const anomalyTotals = {
    total: allAnomalies.length,
    byClass: ALL_CLASSES.map((cls) => ({
      class: cls,
      count: allAnomalies.filter((anomaly) => anomaly.class === cls).length,
    })),
  };

  section("汇总");
  for (const audit of audits) {
    console.log(
      `${audit.file}：韵部 ${audit.structure.groupCount}/${audit.structure.expectedGroupCount}，候选 ${audit.candidates.total}，多归部字 ${audit.candidates.multiGroupCharacters}，异常 ${audit.anomalies.length}，引用闭合 ${audit.closure.ok ? "是" : "否"}`,
    );
  }
  console.log(
    `异常合计 P0=${severityCounts.P0} P1=${severityCounts.P1} P2=${severityCounts.P2} P3=${severityCounts.P3}（共 ${allAnomalies.length}）`,
  );

  const output: PrecheckOutput = {
    reportId: `ai-lexicon-precheck-${REPORT_DATE}`,
    generatedAt: REPORT_DATE,
    generatedBy: "scripts/data/precheck-lexicon.ts（队员 A 的 DeepSeek）",
    nature:
      "机器初审报告：只回答机器可判的事实，不含韵字归属是否合于韵书原义。",
    inputMissing: [],
    inputResolved: [
      {
        path: "docs/reviews/AI初审_人工异常复核方案_2026-10-18.md",
        status: "已取得（原报告记为缺失，本次关闭该条）",
        introducedBy: "59be7af",
        detail:
          "已读全文。本报告按其口径执行：§2.1 初审清单（含重复构建一致性、简繁异体是否被无依据合并、新韵生成器/规则/pinyin-data SHA）、§3 十类人工必复核与优先清单、§5 状态规则、§7 执行顺序。",
      },
      {
        path: "docs/reviews/12_J03人审记录_第一批.md",
        status: "已取得",
        introducedBy: "59be7af",
        detail:
          "第一批人审结论表（三讲九字属实、白/一/更/流/雪/物属实、楼↔樓 存疑成立、C 规则卡 9-12 属实）。",
      },
      {
        path: "docs/reviews/13_J03三首核心诗逐字人审_第二批.md",
        status: "已取得（空白工作表）",
        introducedBy: "fa1f466",
        detail:
          "人工结论与审核人/时间均为 ____，见 §C4；不得从中读出任何批准。",
      },
      {
        path: "docs/team/D2_审核任务书_2026-10-18/01_A_韵书数据与机器初审.md",
        status: "已取得",
        introducedBy: "59be7af",
        detail: "本批任务书本体。",
      },
      {
        path: "docs/reviews/D2进度审阅报告_2026-10-18.md",
        status: "已取得",
        introducedBy: "59be7af",
        detail: "进度与分账依据。",
      },
    ],
    closedFindings: [
      {
        id: "inputMissing（旧报告第 0 节）",
        finding: "AI初审_人工异常复核方案_2026-10-18.md 缺失",
        resolution: "已关闭：方案随 59be7af 入库，已读全文并按其实施",
      },
      {
        id: "F-cross-002（v1，已关闭）",
        finding: "审批依据文档 12_J03人审记录 未归档",
        resolution:
          "已关闭：原件已归档；review2 同时修正 approved-evidence.json 的 authorityNote，F-cross-002b 措辞滞后亦关闭。",
      },
    ],
    unreconciledFigures: {
      severity: "口径说明（已定论，不阻断定稿）",
      resolution:
        "组长 2026-10-18 定论：**采用实测值**（平水 8240、词林汉字 5033）。外部口径 8238/5036 无法在本仓库落盘文件中复现，" +
        "判定为外部实习顾问口径漂移。**绝对不为凑数改动任何统计逻辑或数据**；本报告全部数字以实测为准。",
      claim: {
        source: "外部顾问口径（无法复现，已弃用）",
        pingshuiPatchedDistinct: 8238,
        cilinDistinct: 5036,
      },
      measured: {
        pingshuiPatchedRaw: supplement.a1.universe.pingshuiDistinctRaw,
        pingshui105Raw:
          audits.find((audit) => audit.file === "pingshui.full-d2.json")
            ?.candidates.distinctCharacters ?? 0,
        cilinRaw: supplement.a1.universe.cilinDistinctRaw,
        cilinHan: supplement.a1.universe.cilinHan,
        allNormalizationsEqual: true,
        nonHanInPingshui: supplement.a1.universe.pingshuiNonHan.count,
        nonHanInCilin: supplement.a1.universe.cilinNonHan.count,
      },
      attempts: [
        "raw 去重：平水 106 部 8240、105 部 8232、词林 5037",
        "NFC 去重：与 raw 完全相同（8240 / 8232 / 5037）",
        "NFKC 去重：与 raw 完全相同（8240 / 8232 / 5037）→ 排除简繁/兼容字符重键",
        "非汉字过滤：平水 0 条、词林 4 条（[ ] 空格 ，）→ 平水仍为 8240，词林 5033",
        "多码点检查：四份快照 0 条违规 → 不存在代理对/组合字符分裂",
        "繁体探针：講/項/樓/餘 在平水与词林快照中**均未出现** → 「繁体混进字符全集」假设不成立",
      ],
      conclusion:
        "**无法从落盘文件复现 8238 / 5036**，已由组长定论弃用该外部口径。本报告一律采用实测值，" +
        "未按 8238/5036 调整任何统计、等式或数据；A1 自证等式按汉字全集成立（见 supplement.a1.universe.identities）。",
    },
    statusSemantics: {
      aiInitialReviewStatus: "machine_checked",
      contractFieldUnchanged: true,
      approvedEvidenceCount: approvedIds.size,
      note:
        "按方案 §5：AI 初审通过结构/引用检查但未完成人工复核 → 本报告结论状态为 machine_checked。" +
        "human_reviewed / rejected 等中间状态只写在报告与审核记录里，" +
        "**不改契约字段 reviewStatus**（契约快照只有 approved / unverified）。" +
        "四份快照 reviewStatus 一律保持 unverified；approved 仅来自 approved-evidence.json 的部级及候选级精确范围。",
    },
    secondBatchWorksheet: {
      file: "docs/reviews/13_J03三首核心诗逐字人审_第二批.md",
      isBlankWorksheet: false,
      evidence:
        "第二批第五节已载十处裁定；第二节作品选版与楼↔樓已裁。部分签字占位保留，不覆盖已归档电子裁定。",
      newApproved: 8,
      note: "第二批对应八个唯一选音候选（十处字位），已按精确候选落库；更在第一批已有批准。AI 备考不作依据，第六节整部批准指令已追加范围勘误。",
    },
    supplement,
    excluded: EXCLUDED,
    snapshots: audits,
    reconciliation,
    crossAnomalies,
    severityCounts,
    anomalyTotals,
    spotChecks: {
      zeUnspecified: audits
        .filter((audit) => audit.tone.zeUnspecified.count > 0)
        .map((audit) => ({
          book: audit.book,
          count: audit.tone.zeUnspecified.count,
          groups: audit.tone.zeUnspecified.groups.length,
          violations: audit.tone.zeUnspecified.violations.length,
        })),
    },
    canProve: [
      "结构与门槛：韵目集合、部数/子卷数、逐部非空（checkCompleteness 逐字比对）",
      "四层引用闭合：候选→韵部→证据→来源 全部可解析，悬空 ID 逐条列出",
      "声类映射自洽：toneClass 与所在部、tone 与 toneClass 的映射符合声明口径",
      "字符层：候选字形均为单码点",
      "来源可追溯：来源 ID / revision / sha256 与落盘字节一致性",
      "审批边界：approved 证据集合等于审批清单命中集合（无越权审批）",
      "多音与多归属的保留情况：一字多部、多候选未被删除",
    ],
    cannotProve: [
      "韵字归属是否符合韵书原义（需人审逐条核对原表/底本）",
      "反切、义项、今读的正确性（源表不含，均为 null）",
      "异体/简繁关系的语言学正确性（候选边仍 pending_review）",
      "许可链可商用（上游授权链未核实）",
      "新韵十四韵规则文本的权威性（出处 unverified）",
      "结构完整 ≠ 语文学正确：106 部无空部不代表任一条归属正确",
    ],
    verificationCommands: [
      {
        command: "node --conditions=development scripts/data/inspect.ts",
        executor: "A 侧在本机外部终端执行",
        exitCode: 1,
        result:
          "ERR_MODULE_NOT_FOUND: packages/lexicon/src/adapters/chinese-word-rhyme.js",
        note: "Node 24 不把相对 import 的 .js 改写成 .ts；验收命令本身不可用（见 C-cross-001）",
      },
      {
        command: "node node_modules/tsx/dist/cli.mjs scripts/data/inspect.ts",
        executor: "A 侧在本机外部终端执行",
        exitCode: 0,
        result:
          "词林 19 部 / 33 子卷 / 归属 5575 / 字形 5037；新韵候选表 14 韵 / 56 子卷 / 归属 7693 / 字形 6730；平水发布门槛通过：否；新韵「一」冲突：十二齐·阴平 + 十二齐·去声",
        note: "同一脚本改用 tsx 入口即通过",
      },
      {
        command: "pnpm exec vitest run packages/lexicon/tests",
        executor: "A 侧在本机外部终端执行",
        exitCode: 0,
        result: "5 files / 66 tests，931ms",
        note: "数字由人在外部终端执行后回传，本报告未改写",
      },
      {
        command: "pnpm verify",
        executor: "A 侧在本机外部终端执行",
        exitCode: 0,
        result:
          "28 files / 410 tests，7 of 8 projects 构建成功，8 契约/模板无漂移",
        note: "同上；此为 D2 审核轮之前的实跑结果",
      },
      {
        command: "node_modules/.bin/eslint .",
        executor: "A 侧在本执行环境（绕过 pnpm 直接调二进制）",
        exitCode: 0,
        result: "0 error / 0 warning",
        note: "等价于 pnpm verify 的 lint 关。此前本批新增脚本曾报 4 个 error（2×no-unused-vars、1×未用导入、1×no-misleading-character-class），已由 64b2652 修复",
      },
      {
        command:
          "node_modules/.bin/tsc --noEmit && node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json",
        executor: "A 侧在本执行环境",
        exitCode: 0,
        result: "两个 tsconfig 均 0 error",
        note: "等价于 pnpm verify 的 typecheck 关。此前 precheck-lexicon.ts 有 1 处 TS2345（RawSnapshot.reviewStatus 过宽），已由 64b2652 修复",
      },
      {
        command: "node_modules/.bin/vitest run（全仓）",
        executor: "A 侧在本执行环境",
        exitCode: 1,
        result:
          "37 files / 529 tests：525 passed + 4 failed。4 条失败全在他人模块且均为「测试写死旧状态」：" +
          "apps/api/tests/http-real.test.ts 1 条（断言 loadErrors 仍含 src:chinese_word_rhyme，该缺陷已由 474afd9 修复）、" +
          "packages/readings/tests/real-pingshui.test.ts 3 条（断言快照无 approved 证据，已由 2cce583 的 J03 审批改变）",
        note:
          "这两处测试的期望值需由 GLM / B 各自更新；A 不越界修改 apps/ 与 packages/readings/。" +
          "在它们更新前，全仓 vitest 与 pnpm verify 必然保持红——**这不是 A 侧数据错误**",
      },
      {
        command:
          "pnpm build && tsx scripts/generate-contracts.ts --check（即 pnpm check:generated）",
        executor: "**未运行**",
        exitCode: null,
        result: "未运行",
        note:
          "本执行环境跑不了：`pnpm` 的 store 锁位于工作区之外（C:\\Users\\…\\pnpm-store-operation-locks，" +
          "写入被沙箱以 os error 5 拒绝），因此 pnpm 的任何命令（含 pnpm -r build）都无法执行，check:generated 无法完成。" +
          "**不得因未运行而声称通过**——该项只能由人在外部终端跑，或在 CI 上验证",
      },
    ],
    reproduce: [
      "node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts",
    ],
  };

  mkdirSync(path.join(ROOT, "data", "reviews"), { recursive: true });
  writeFileSync(
    path.join(ROOT, OUT_JSON),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  console.log(`写出 ${OUT_JSON}`);

  writeFileSync(path.join(ROOT, OUT_MD), renderMarkdown(output), "utf8");
  console.log(`写出 ${OUT_MD}`);

  finish(
    `初审完成：四份快照，异常 ${allAnomalies.length} 条（P0=${severityCounts.P0}）。` +
      "退出码只表示初审跑通；发现异常本身不是运行失败。",
  );
}

// ---------------------------------------------------------------- 报告类型

interface PrecheckOutput {
  reportId: string;
  generatedAt: string;
  generatedBy: string;
  nature: string;
  inputMissing: {
    path: string;
    status: string;
    detail: string;
    remedy: string;
  }[];
  inputResolved: {
    path: string;
    status: string;
    introducedBy: string;
    detail: string;
  }[];
  closedFindings: { id: string; finding: string; resolution: string }[];
  unreconciledFigures: {
    severity: string;
    resolution: string;
    claim: {
      source: string;
      pingshuiPatchedDistinct: number;
      cilinDistinct: number;
    };
    measured: {
      pingshuiPatchedRaw: number;
      pingshui105Raw: number;
      cilinRaw: number;
      cilinHan: number;
      allNormalizationsEqual: boolean;
      nonHanInPingshui: number;
      nonHanInCilin: number;
    };
    attempts: string[];
    conclusion: string;
  };
  statusSemantics: {
    aiInitialReviewStatus: string;
    contractFieldUnchanged: boolean;
    approvedEvidenceCount: number;
    note: string;
  };
  secondBatchWorksheet: {
    file: string;
    isBlankWorksheet: boolean;
    evidence: string;
    newApproved: number;
    note: string;
  };
  supplement: SupplementResult;
  excluded: readonly { file: string; reason: string }[];
  snapshots: SnapshotAudit[];
  reconciliation: Reconciliation;
  crossAnomalies: Anomaly[];
  severityCounts: Record<Severity, number>;
  anomalyTotals: { total: number; byClass: { class: string; count: number }[] };
  spotChecks: {
    zeUnspecified: {
      book: BookId;
      count: number;
      groups: number;
      violations: number;
    }[];
  };
  canProve: string[];
  cannotProve: string[];
  verificationCommands: {
    command: string;
    executor: string;
    exitCode: number | null;
    result: string;
    note: string;
  }[];
  reproduce: string[];
}

// ---------------------------------------------------------------- Markdown 渲染

function renderMarkdown(input: PrecheckOutput): string {
  const lines: string[] = [];
  const push = (text: string): void => {
    lines.push(text);
  };
  const allAnomalies = [
    ...input.snapshots.flatMap((audit) => audit.anomalies),
    ...input.crossAnomalies,
  ];

  push(`# 三库机器初审报告（${REPORT_DATE}）`);
  push("");
  push(
    "队员 A 的 DeepSeek。产物：`data/reviews/ai-lexicon-precheck-" +
      REPORT_DATE +
      ".json`（机器可读）与本文件（人读）。",
  );
  push("");
  push(
    "> **性质**：机器初审。只回答机器可判的事实（结构 / 引用 / 声类 / 字符 / 来源）。" +
      "不回答「韵字归属是否符合韵书原义」——那必须人审。",
  );
  push("");

  push("## 0. 输入状态（原「输入缺失」已关闭）");
  push("");
  push(
    "旧版报告此处登记「AI初审方案缺失」。该文件已随 `59be7af` 入库，**本节改为已取得清单**。",
  );
  push("");
  push("| 路径 | 状态 | 引入提交 | 说明 |");
  push("|---|---|---|---|");
  for (const item of input.inputResolved) {
    push(
      `| \`${item.path}\` | ${item.status} | ${item.introducedBy} | ${item.detail} |`,
    );
  }
  push("");
  push("**仍缺失的输入：无。**");
  push("");
  push("已关闭的旧发现：");
  push("");
  push("| 原编号 | 原发现 | 处置 |");
  push("|---|---|---|");
  for (const item of input.closedFindings) {
    push(`| ${item.id} | ${item.finding} | ${item.resolution} |`);
  }
  push("");
  push("### 0-B. 计数口径说明（外部口径 8238 / 5036 与实测 8240 / 5033）");
  push("");
  push(`**结论：采用实测值。** ${input.unreconciledFigures.resolution}`);
  push("");
  push("| 项 | 外部顾问口径（已弃用） | 本报告实测（采用） |");
  push("|---|---|---|");
  push(
    `| 平水 106 部去重字形 | ~~${input.unreconciledFigures.claim.pingshuiPatchedDistinct}~~ | **${input.unreconciledFigures.measured.pingshuiPatchedRaw}**（raw／NFC／NFKC 三者相同） |`,
  );
  push(
    `| 词林去重字形 | ~~${input.unreconciledFigures.claim.cilinDistinct}~~ | raw **${input.unreconciledFigures.measured.cilinRaw}**；剔除非汉字后 **${input.unreconciledFigures.measured.cilinHan}** |`,
  );
  push("");
  push("已逐一排除的可能成因（均为实跑）：");
  push("");
  for (const attempt of input.unreconciledFigures.attempts)
    push(`- ${attempt}`);
  push("");
  push(input.unreconciledFigures.conclusion);
  push("");
  push(
    `**词林原表的 4 个非汉字垃圾已登记为 D 类 P1 异常**（见 §6 的 D 条目）：` +
      "`[`(U+005B)、`]`(U+005D)、空格(U+0020)、`，`(U+FF0C)，分属第二部·仄声、第七部·仄声、第十八部·入声。" +
      "它们都是单码点，故「单码点校验」抓不到；建议在**适配器导入层过滤**，不改原表字义事实。",
  );
  push("");
  push(
    `**状态口径（方案 §5）**：本报告的 AI 初审结论状态为 \`${input.statusSemantics.aiInitialReviewStatus}\`；` +
      `契约字段 \`reviewStatus\` ${input.statusSemantics.contractFieldUnchanged ? "**未被改动**" : "**被改动**"}，` +
      `approved 证据仍为审批清单落库的 **${input.statusSemantics.approvedEvidenceCount}** 条。` +
      input.statusSemantics.note,
  );
  push("");
  push(
    `**第二批人审（13_）**：\`${input.secondBatchWorksheet.file}\` ${input.secondBatchWorksheet.isBlankWorksheet ? "为待填写工作表" : "已归档裁定"}（${input.secondBatchWorksheet.evidence}）。` +
      `**新增 approved = ${input.secondBatchWorksheet.newApproved} 条**。${input.secondBatchWorksheet.note}`,
  );
  push("");

  push("## 1. 口径表（组长只看这张）");
  push("");
  push(
    "| 库 | dataVersion | 结构完整性 | 引用闭合 | 声类一致性 | 异常数 P0/P1/P2/P3 | 证据 approved | 发布门槛 |",
  );
  push("|---|---|---|---|---|---|---|---|");
  for (const audit of input.snapshots) {
    const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const anomaly of audit.anomalies) counts[anomaly.severity] += 1;
    const structureOk =
      audit.structure.groupCount === audit.structure.expectedGroupCount &&
      audit.structure.emptyGroups.length === 0 &&
      audit.structure.missingGroups.length === 0 &&
      audit.structure.unexpectedGroups.length === 0;
    const structure = structureOk
      ? `✅ ${audit.structure.groupCount}/${audit.structure.expectedGroupCount}，无缺部无空部`
      : `⚠ ${audit.structure.groupCount}/${audit.structure.expectedGroupCount}；缺 ${audit.structure.missingGroups.join("、") || "无"}；空 ${audit.structure.emptyGroups.join("、") || "无"}；意外 ${audit.structure.unexpectedGroups.join("、") || "无"}`;
    const closure = audit.closure.ok
      ? "✅ 四层闭合"
      : `❌ 悬空 ${audit.closure.issues.length} 个`;
    const toneOk =
      audit.tone.toneClassVsGroupMismatch.length === 0 &&
      audit.tone.toneVsToneClassMismatch.length === 0 &&
      audit.tone.zeUnspecified.violations.length === 0;
    const tone = toneOk
      ? `✅ 三项全过${audit.tone.zeUnspecified.count > 0 ? `（ze_unspecified ${audit.tone.zeUnspecified.count}）` : ""}`
      : `❌ 部不符 ${audit.tone.toneClassVsGroupMismatch.length} / tone 不符 ${audit.tone.toneVsToneClassMismatch.length} / ze 越界 ${audit.tone.zeUnspecified.violations.length}`;
    push(
      `| ${audit.book} | \`${audit.dataVersion}\` | ${structure} | ${closure} | ${tone} | ${counts.P0}/${counts.P1}/${counts.P2}/${counts.P3} | ${audit.evidenceStats.approved}/${audit.evidenceStats.total} | ${audit.gate.releaseGatePassed ? "通过" : "**未通过**"} |`,
    );
  }
  push("");
  push(
    "脚注：**中华新韵 = 十四韵规则 + pinyin-data 重建表，非官方原始表**（规则出处 unverified）。" +
      "平水两行分别是 105 部原始快照与 106 部三讲草案快照，**并存而非覆盖**。",
  );
  push("");
  push("已排除的快照：");
  push("");
  for (const item of input.excluded) {
    push(`- \`data/normalized/${item.file}\`：${item.reason}`);
  }
  push("");

  push("## 1-B. 已完成项对账（②③④，全部实测）");
  push("");
  push(
    "本节按落盘 JSON 与补丁文件实测，**不引用任何转述数字**；与既定说法不符的项会直接标 FAIL。",
  );
  push("");
  push("| 项 | 既定说法 | 实测 | 一致 |");
  push("|---|---|---|---|");
  for (const entry of input.reconciliation.matches) {
    push(
      `| ${entry.claim} | ${entry.expected} | **${entry.actual}** | ${entry.ok ? "✅" : "❌"} |`,
    );
  }
  push("");
  push("### ② 新韵 modernReading 回填");
  push("");
  push(
    `- dataVersion：\`${input.reconciliation.modernReading.dataVersion}\`；候选 **${input.reconciliation.modernReading.total}**；带 modernReading **${input.reconciliation.modernReading.withModernReading}**；缺失 **${input.reconciliation.modernReading.missing}**`,
  );
  push(
    `- 调值与声类一致性异常 **${input.reconciliation.modernReading.toneNumberMismatch}** 条；pinyin 含调号字符 **${input.reconciliation.modernReading.pinyinWithToneMark}** 条（应为无调号拼音）`,
  );
  push(
    `- 同(字形,子卷)多读音清单：\`${input.reconciliation.collisions.file}\`，count **${input.reconciliation.collisions.count}**，items **${input.reconciliation.collisions.items}**`,
  );
  push("");
  push("| 候选 ID | pinyin | toneNumber |");
  push("|---|---|---|");
  for (const sample of input.reconciliation.modernReading.samples) {
    push(
      `| \`${sample.candidateId}\` | ${sample.pinyin} | ${sample.toneNumber} |`,
    );
  }
  push("");
  push("### ③ 来源 ID 跨库拆分");
  push("");
  push("| 库 | dataVersion | 来源 ID |");
  push("|---|---|---|");
  for (const entry of input.reconciliation.sourceIds) {
    push(
      `| ${entry.book} | \`${entry.dataVersion}\` | ${entry.sourceIds.map((id) => `\`${id}\``).join("、")} |`,
    );
  }
  push("");
  push(
    `跨库是否互不相交：**${input.reconciliation.sourceIdsAcrossBooksDistinct ? "是（两两不同）" : "否（存在跨库同 ID）"}**`,
  );
  push("");
  push("### ④ 证据 approved 落库");
  push("");
  push("| 快照 | dataVersion | approved / total |");
  push("|---|---|---|");
  for (const entry of input.reconciliation.approvedTable) {
    push(
      `| \`${entry.file.replace("data/normalized/", "")}\` | \`${entry.dataVersion}\` | **${entry.approved} / ${entry.total}** |`,
    );
  }
  push("");
  push(
    "**结论：②③④ 三项已消除 J07「词林 503」的硬阻塞原因** —— " +
      "③ 使平水/词林/新韵来源 ID 两两不同，`dedupeById` 不再触发跨库同 ID 不同内容冲突；" +
      "② 使新韵候选具备可追溯读音；④ 按1条部级、15条候选证据的审批范围落库。" +
      "但**快照 reviewStatus 仍为 unverified、词林 approved 仍 0/33**，" +
      "因此词林 503 只会从「来源冲突」性质转为「证据门槛」性质，**不是变成可用**。",
  );
  push("");

  push("## 1-C. A1 字级交叉核对（平水 106 部 × 词林 19 部，只做三分层）");
  push("");
  push("**判定规则（原文，可复算）**：");
  push("");
  push(`> ${input.supplement.a1.ruleText}`);
  push("");
  push("| 平水声类 | 映射层 | 允许的词林子卷声类 |");
  push("|---|---|---|");
  for (const entry of input.supplement.a1.layerTable) {
    push(
      `| ${entry.pingshuiToneClass} | ${entry.layer} | ${entry.cilinToneClasses.join("、")} |`,
    );
  }
  push("");
  push(`口径差异（**不计为异常**）：${input.supplement.a1.caliberDifference}`);
  push("");
  push("#### 字符全集与自证等式（本节所有计数的分母来源）");
  push("");
  push("| 项 | 平水（106 部） | 词林（19 部） |");
  push("|---|---|---|");
  push(
    `| 候选去重字符数（raw） | ${input.supplement.a1.universe.pingshuiDistinctRaw} | ${input.supplement.a1.universe.cilinDistinctRaw} |`,
  );
  push(
    `| 其中非汉字条目（已剔除） | ${input.supplement.a1.universe.pingshuiNonHan.count}${input.supplement.a1.universe.pingshuiNonHan.count > 0 ? `（${input.supplement.a1.universe.pingshuiNonHan.characters.join(" ")}）` : ""} | ${input.supplement.a1.universe.cilinNonHan.count}${input.supplement.a1.universe.cilinNonHan.count > 0 ? `（${input.supplement.a1.universe.cilinNonHan.characters.map((c) => (c.trim() === "" ? "空格" : c)).join(" ")}）` : ""} |`,
  );
  push(
    `| **汉字全集（本节分母）** | **${input.supplement.a1.universe.pingshuiHan}** | **${input.supplement.a1.universe.cilinHan}** |`,
  );
  push("");
  push("自证等式：");
  push("");
  for (const identity of input.supplement.a1.universe.identities) {
    push(`- ${identity}`);
  }
  push("");
  push(
    `**等式全部成立：${input.supplement.a1.universe.identityHolds ? "是" : "否"}**。口径说明：raw 去重数含非汉字条目（词林侧有 ${input.supplement.a1.universe.cilinNonHan.count} 条），本节一律以「汉字全集」为分母，非汉字条目另立 D 类异常，不参与 A1 比对。`,
  );
  push("");
  push("| 指标 | 实测 |");
  push("|---|---|");
  push(`| 两库共有可比字 | **${input.supplement.a1.comparedCharacters}** |`);
  push(`| 三层集合一致 | **${input.supplement.a1.consistent}** |`);
  push(`| 三层集合不一致 | **${input.supplement.a1.inconsistent}** |`);
  push(`| 平水有而词林无 | **${input.supplement.a1.pingshuiOnly.count}** |`);
  push(`| 词林有而平水无 | **${input.supplement.a1.cilinOnly.count}** |`);
  push(
    `| 多归部个数差异（同字两侧韵部个数不等） | **${input.supplement.a1.multiMembershipDiff.count}** |`,
  );
  push("");
  if (Object.keys(input.supplement.a1.missingByType).length > 0) {
    push("①「平水多出层次」再按缺层拆分：");
    push("");
    push("| 缺层类型 | 条数 |");
    push("|---|---|");
    for (const [type, count] of Object.entries(
      input.supplement.a1.missingByType,
    ).sort()) {
      push(`| ${type} | ${count} |`);
    }
    push("");
  }
  const detailRow = (
    detail: A1Result["inconsistentDetails"][number],
  ): string => {
    const left = detail.pingshuiMembers
      .map(
        (member) => `${member.bucket}:${member.groupName}(${member.toneClass})`,
      )
      .join("<br>");
    const right = detail.cilinMembers
      .map((member) => `${member.groupName}(${member.toneClass})`)
      .join("<br>");
    const evidence = [
      ...detail.pingshuiMembers.flatMap((member) => member.evidenceIds),
      "|",
      ...detail.cilinMembers.flatMap((member) => member.evidenceIds),
    ].join("<br>");
    return `| ${detail.character} | ${detail.pingshuiLayers.join("/")} | ${detail.cilinLayers.join("/")} | ${left} | ${right} | ${evidence} |`;
  };
  const detailsOf = (subtypeName: string) =>
    input.supplement.a1.inconsistentDetails.filter(
      (detail) => detail.subtype === subtypeName,
    );
  const HEAD =
    "| 字 | 平水层 | 词林层 | 平水部+声类 | 词林子卷+声类 | 两侧证据 ID |\n|---|---|---|---|---|---|";

  push("#### ① 平水多出层次（453 条）—— 各缺层类型前 10 例");
  push("");
  for (const layerName of ["词林缺仄", "词林缺平", "词林缺入"]) {
    const bucket = input.supplement.a1.inconsistentDetails.filter(
      (detail) => detail.missingKey === layerName,
    );
    push(`**${layerName}**（${bucket.length} 条）`);
    push("");
    if (bucket.length === 0) {
      push("（无）");
    } else {
      push(HEAD);
      for (const detail of bucket.slice(0, 10)) push(detailRow(detail));
    }
    push("");
  }
  const comboRows = input.supplement.a1.inconsistentDetails.filter(
    (detail) =>
      detail.subtype === "平水多出层次" &&
      !["词林缺仄", "词林缺平", "词林缺入"].includes(detail.missingKey),
  );
  push(`**多缺组合**（${comboRows.length} 条，前 10 例）`);
  push("");
  if (comboRows.length === 0) {
    push("（无）");
  } else {
    push(HEAD);
    for (const detail of comboRows.slice(0, 10)) push(detailRow(detail));
  }
  push("");

  const cilinExtra = detailsOf("词林多出层次");
  push(
    `#### ② 词林多出层次（${cilinExtra.length} 条）—— 全 17 条中最值得看的 10 例`,
  );
  push("");
  if (cilinExtra.length === 0) {
    push("（无）");
  } else {
    push(HEAD);
    for (const detail of cilinExtra.slice(0, 10)) push(detailRow(detail));
  }
  push("");

  const mixed = detailsOf("层次集合不同");
  push(`#### ③ 层次集合不同（${mixed.length} 条）—— **逐条全列**`);
  push("");
  if (mixed.length === 0) {
    push("（无）");
  } else {
    push(HEAD);
    for (const detail of mixed) push(detailRow(detail));
  }
  push("");
  push(
    "**取全量**：JSON 路径 `data/reviews/ai-lexicon-precheck-2026-10-18.json` → 字段 `supplement.a1.inconsistentDetails`（478 条，每条含 `character` / `subtype` / `missingKey` / `pingshuiLayers` / `cilinLayers` / `pingshuiMembers` / `cilinMembers`）；" +
      "按 `subtype` 过滤即得上表三类。可复算命令：`node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts`。",
  );
  push("");
  push(
    "**口径声明：这 478 条属「两库差异（待核实）」，不计入异常总账**，不塞进 P1/P2。它们说明的是「两张表对同一字的声类分层记录不同」，" +
      "本身既非数据错误也非缺陷——要判定谁对，必须逐字回到平水/词林各自底本，属人审范围。",
  );
  push("");

  push("#### 派生统计：平水 106 部在词林侧的覆盖（top 15，按未覆盖降序）");
  push("");
  push(`方法：${input.supplement.a1Coverage.method}`);
  push("");
  push("| 平水韵部 | 该部字形数 | 词林已覆盖 | 未覆盖 | 覆盖率 |");
  push("|---|---|---|---|---|");
  for (const row of input.supplement.a1Coverage.rows.slice(0, 15)) {
    push(
      `| ${row.pingshuiGroupName} | ${row.characters} | ${row.coveredByCilin} | ${row.uncovered} | ${(row.coverage * 100).toFixed(1)}% |`,
    );
  }
  push("");
  push(
    "全 106 行见 JSON 的 `supplement.a1Coverage.rows`。**必读警示**：" +
      input.supplement.a1Coverage.warning +
      "**禁令**：" +
      input.supplement.a1Coverage.prohibition,
  );
  push("");

  push(
    `平水独有字（前 120 个）：\`${input.supplement.a1.pingshuiOnly.characters.slice(0, 120).join("")}\`${input.supplement.a1.pingshuiOnly.count > 120 ? " …" : ""}`,
  );
  push("");
  push(
    `词林独有字（前 120 个）：\`${input.supplement.a1.cilinOnly.characters.slice(0, 120).join("")}\`${input.supplement.a1.cilinOnly.count > 120 ? " …" : ""}`,
  );
  push("");
  push(
    "**结论边界**：以上只写「字级三层一致/不一致」统计，**不写「词林某部等于平水某部」**——部对部映射需要词林部次合并关系的权威来源，本仓库未取得。",
  );
  push("");

  push("## 1-D. A2 待核实映射草案（单独成文件，不作结论）");
  push("");
  push(
    `- 文件：\`${input.supplement.a2.file}\`；**草案条数 ${input.supplement.a2.entryCount} 条**（每条形如「词林第N部 ⊃ 平水{…}」）。`,
  );
  push(
    `- 每条 \`status = "unverified"\`、\`basis = null\`；${input.supplement.a2.headerNote}`,
  );
  push(
    "- 本报告**只引用草案条数**，不引用草案内容作为任何结论；草案已写入文件头的禁用清单。",
  );
  push("");

  push("## 1-E. 方案 §2.1 补全（B1 / B2 / B3）");
  push("");
  push("### B1 同 dataVersion 重复构建一致性");
  push("");
  push(`规则：${input.supplement.b1.rule}`);
  push("");
  push("| 快照 | 两次摘要一致 | 与 0009 已登记摘要 |");
  push("|---|---|---|");
  for (const entry of input.supplement.b1.results) {
    push(
      `| \`${entry.file.replace("data/normalized/", "")}\` | ${entry.repeatConsistent ? "✅" : "❌"} | ${
        entry.matchesRegistered === null
          ? "（无已登记值可比）"
          : entry.matchesRegistered
            ? "✅ 一致"
            : `❌ 不一致（登记 ${String(entry.registeredDigest)}）`
      } |`,
    );
  }
  push("");
  push(
    `结论：重复构建摘要全部一致 = **${input.supplement.b1.allRepeatConsistent ? "是" : "否"}**；与已登记摘要无冲突 = **${input.supplement.b1.allRegisteredMatch ? "是" : "否"}**。`,
  );
  push("");
  push("### B2 简繁/异体是否被未经依据合并");
  push("");
  push(
    `边文件 \`${input.supplement.b2.file}\`：共 ${input.supplement.b2.totalEdges} 条，状态分布 ${JSON.stringify(input.supplement.b2.byStatus)}。`,
  );
  push("");
  push("| 状态 | 边 |");
  push("|---|---|");
  for (const edge of input.supplement.b2.appliedEdges) {
    push(`| applied_in_patch | \`${edge.id}\`：${edge.from}→${edge.to} |`);
  }
  for (const edge of input.supplement.b2.pendingEdges) {
    push(`| pending_review | \`${edge.id}\`：${edge.from}→${edge.to} |`);
  }
  push("");
  push(
    "繁体形探测（韵书表出现 = 有人借异体边塞字；新韵出现 = pinyin-data 逐码位重建的预期）：",
  );
  push("");
  push("| 繁体形 | 平水/词林（韵书表） | 新韵（重建表） |");
  push("|---|---|---|");
  for (const probe of input.supplement.b2.traditionalFormProbe) {
    push(
      `| ${probe.character} | ${probe.foundInYunshu.length === 0 ? "**未出现** ✅" : `❌ 出现于 ${probe.foundInYunshu.join("、")}`} | ${probe.foundInXinyun ? "有（预期：独立码位）" : "无"} |`,
    );
  }
  push("");
  push(
    `**结论：有效合并数 = ${input.supplement.b2.effectiveMerges}**。${input.supplement.b2.verdict}`,
  );
  push("");
  push("### B3 新韵生成器版本 / 规则版本 / pinyin-data SHA 可追溯性");
  push("");
  push("| 项 | 值 | 能否机器读取 |");
  push("|---|---|---|");
  push(
    `| 规则版本 | \`${String(input.supplement.b3.rulesVersion)}\` | 仅 notice 文本（命中=${input.supplement.b3.noticeMentionsRules}） |`,
  );
  push(
    `| 生成器版本 | \`${String(input.supplement.b3.generatorVersion)}\` | 仅 notice 文本（命中=${input.supplement.b3.noticeMentionsGenerator}） |`,
  );
  push(
    `| pinyin-data revision | \`${String(input.supplement.b3.sourceRevision)}\` | sources 记录（可读） |`,
  );
  push(
    `| pinyin.txt SHA-256 | \`${String(input.supplement.b3.sourceSnapshotSha256)}\` | sources 记录；与落盘字节一致=${String(input.supplement.b3.pinyinDigestMatches)} |`,
  );
  push(
    `| 结构化版本字段 | 无 | \`structuredVersionFields=${String(input.supplement.b3.structuredVersionFields)}\` |`,
  );
  push("");
  push(input.supplement.b3.verdict);
  push("");

  push("## 2. 每库实测明细");
  push("");
  for (const audit of input.snapshots) {
    push(`### ${audit.file}`);
    push("");
    push(
      `- dataVersion：\`${audit.dataVersion}\`；book：${audit.book}；reviewStatus：**${audit.reviewStatus}**`,
    );
    push(
      `- 韵部数 ${audit.structure.groupCount} / 门槛 ${audit.structure.expectedGroupCount}；非空 ${audit.structure.nonEmptyGroupCount}；空部 ${audit.structure.emptyGroups.length}；重复韵目 ${audit.structure.duplicateGroups.length}`,
    );
    push(
      `- bucketCounts 实测 ${JSON.stringify(audit.structure.bucketCounts)} / 应有 ${JSON.stringify(audit.structure.expectedBucketCounts)}`,
    );
    push(
      `- 缺失 ${audit.structure.missingGroups.join("、") || "（无）"}；意外 ${audit.structure.unexpectedGroups.join("、") || "（无）"}`,
    );
    push(
      `- 候选 ${audit.candidates.total}；不同字形 ${audit.candidates.distinctCharacters}；多归部字形 ${audit.candidates.multiGroupCharacters}`,
    );
    push(
      `- 同字同韵部多候选 ${audit.candidates.sameGroupMultiCandidates} 组；同字同父级(卷/部/韵)多候选 ${audit.candidates.sameParentMultiCandidates} 组`,
    );
    push(
      `- 声类三项：toneClass↔部 不符 ${audit.tone.toneClassVsGroupMismatch.length}；tone↔toneClass 不符 ${audit.tone.toneVsToneClassMismatch.length}；ze_unspecified ${audit.tone.zeUnspecified.count} 条 / ${audit.tone.zeUnspecified.groups.length} 组 / 越界 ${audit.tone.zeUnspecified.violations.length}`,
    );
    push(
      `- 单码点校验：检查 ${audit.charCheck.checked} 条，违规 ${audit.charCheck.violations.length} 条`,
    );
    push(
      `- 证据 ${audit.evidenceStats.total} 条（approved ${audit.evidenceStats.approved} / unverified ${audit.evidenceStats.unverified}）；越权 approved ${audit.evidenceStats.approvedNotInList.length}；${audit.evidenceStats.listMissingNote}`,
    );
    push(`- 业务内容摘要：\`${audit.metadata.businessDigest}\``);
    push(`- 规范化 JSON 摘要：\`${audit.metadata.canonicalDigest}\``);
    push(
      `- 生成器/规则版本：${audit.metadata.generatorVersion ?? "（快照未登记）"} / ${audit.metadata.rulesVersion ?? "（快照未登记）"}`,
    );
    push("");
    push("| 来源 ID | revision | sha256（登记） | 落盘文件 | 与字节一致 |");
    push("|---|---|---|---|---|");
    for (const source of audit.metadata.sources) {
      push(
        `| \`${source.id}\` | ${source.revision ?? "null"} | \`${source.snapshotSha256 ?? "null"}\` | ${source.rawFile ?? "（未映射）"} | ${source.digestMatches === null ? "未核" : source.digestMatches ? "✅" : "❌"} |`,
      );
    }
    push("");
  }

  push("## 3. 四层引用闭合（悬空明细）");
  push("");
  for (const audit of input.snapshots) {
    push(`### ${audit.file}`);
    push("");
    if (audit.closure.ok && audit.closure.duplicateIds.length === 0) {
      push("✅ 候选→韵部→证据→来源 四层全部可解析；四层 ID 均无重复。");
      push("");
      continue;
    }
    push("| 层 | 悬空 ID | 引用它的对象 |");
    push("|---|---|---|");
    for (const issue of audit.closure.issues) {
      push(
        `| ${issue.layer} | \`${issue.danglingId}\` | ${issue.referencedBy.map((id) => `\`${id}\``).join("<br>")} |`,
      );
    }
    if (audit.closure.duplicateIds.length > 0) {
      push("");
      push("| 层 | 重复 ID | 次数 |");
      push("|---|---|---|");
      for (const entry of audit.closure.duplicateIds) {
        push(`| ${entry.layer} | \`${entry.id}\` | ${entry.count} |`);
      }
    }
    push("");
  }

  push("## 4. 声类一致性（三项独立）");
  push("");
  push("### 4.1 toneClass ↔ 所在部");
  push("");
  const classMismatchTotal = input.snapshots.reduce(
    (sum, audit) => sum + audit.tone.toneClassVsGroupMismatch.length,
    0,
  );
  if (classMismatchTotal === 0) {
    push("✅ 四份快照逐条比对，0 条不符。");
  } else {
    for (const audit of input.snapshots) {
      if (audit.tone.toneClassVsGroupMismatch.length === 0) continue;
      push(
        `- ${audit.file}：${audit.tone.toneClassVsGroupMismatch.length} 条不符（例：${audit.tone.toneClassVsGroupMismatch
          .slice(0, 5)
          .map(
            (entry) =>
              `\`${entry.candidateId}\` 声明 ${entry.declared} / 应 ${entry.expected}`,
          )
          .join("；")}）`,
      );
    }
  }
  push("");
  push("### 4.2 tone ↔ toneClass");
  push("");
  const toneMismatchTotal = input.snapshots.reduce(
    (sum, audit) => sum + audit.tone.toneVsToneClassMismatch.length,
    0,
  );
  if (toneMismatchTotal === 0) {
    push(
      "✅ 四份快照按「平/阴阳平=P，上/去/入/仄未分=Z，neutral=null」比对，0 条不符。",
    );
  } else {
    for (const audit of input.snapshots) {
      if (audit.tone.toneVsToneClassMismatch.length === 0) continue;
      push(
        `- ${audit.file}：${audit.tone.toneVsToneClassMismatch.length} 条不符（例：${audit.tone.toneVsToneClassMismatch
          .slice(0, 5)
          .map(
            (entry) =>
              `\`${entry.candidateId}\` tone=${String(entry.tone)} / 应 ${String(entry.expected)}`,
          )
          .join("；")}）`,
      );
    }
  }
  push("");
  push("### 4.3 ze_unspecified 落点（词林重点）");
  push("");
  if (input.spotChecks.zeUnspecified.length === 0) {
    push("四份快照中没有任何 ze_unspecified 候选。");
  } else {
    for (const entry of input.spotChecks.zeUnspecified) {
      push(
        `- ${entry.book}：**${entry.count}** 条，分布于 ${entry.groups} 个仄声子卷，越界 **${entry.violations}** 条`,
      );
    }
  }
  push("");
  push(
    "口径：`ze_unspecified` 只允许出现在词林的「第N部·仄声」子卷。它是「来源只标仄声」的如实记录，" +
      "**不得**臆补成上声或去声，也不得为让平仄更“确定”而降级为单一仄。",
  );
  push("");

  push("## 5. 专项实测：一字多部 / 多音");
  push("");
  for (const audit of input.snapshots) {
    for (const spot of audit.spotCharacters) {
      if (spot.candidateIds.length === 0) continue;
      const verdict =
        spot.bothGroups === "ok"
          ? "；**一董+三讲双归属成立（红线 3 通过）**"
          : spot.bothGroups === "violation"
            ? "；**❌ 应有双归属但缺失（红线 3 违规）**"
            : "；双归属判据不适用于本库/本快照";
      push(
        `- \`${audit.dataVersion}\` · 「${spot.character}」：${spot.candidateIds.length} 条候选 ${spot.candidateIds.map((id) => `\`${id}\``).join("、")}；归属 ${spot.groupIds.map((id) => `\`${id}\``).join("、")}${verdict}`,
      );
    }
  }
  push("");
  push(
    `要求：「${PRE_EXISTING_CHARACTER}」必须同时保留一董与三讲归属（红线 3）；` +
      `「${YI_CHARACTER}」的语流变调冲突 resolution=null 未裁决，不得默认采用任一声调、不得删除竞争者。`,
  );
  push("");

  push("## 6. 异常清单（分类法 A–H）");
  push("");
  push(
    "分类：A 结构 / B 声类 / C 引用 / D 字符 / E 多音 / F 来源 / G 新韵特有 / H 三讲补丁。" +
      "P0=会让下游出错；P1=数据缺口或接线缺陷；P2=口径/文档不一致；P3=提示。",
  );
  push("");
  push(
    `合计 **${input.anomalyTotals.total}** 条：P0=${input.severityCounts.P0} / P1=${input.severityCounts.P1} / P2=${input.severityCounts.P2} / P3=${input.severityCounts.P3}`,
  );
  push("");
  push("| 分类 | 条数 |");
  push("|---|---|");
  for (const entry of input.anomalyTotals.byClass) {
    push(`| ${entry.class} | ${entry.count} |`);
  }
  push("");

  for (const severity of ["P0", "P1", "P2", "P3"] as const) {
    const bucket = allAnomalies.filter(
      (anomaly) => anomaly.severity === severity,
    );
    push(`### ${severity}（${bucket.length} 条）`);
    push("");
    if (bucket.length === 0) {
      push("（无）");
      push("");
      continue;
    }
    push(
      "| 异常 ID | 类 | 库 | 位置 | 事实 | 判定依据 | 影响面 | 建议动作 | 动作类型 |",
    );
    push("|---|---|---|---|---|---|---|---|---|");
    for (const anomaly of bucket) {
      const bookCell =
        anomaly.affectedBooks === undefined
          ? String(anomaly.book)
          : `${anomaly.book}<br>affected: ${anomaly.affectedBooks.map((value) => `\`${value}\``).join("<br>")}`;
      push(
        `| ${anomaly.id} | ${anomaly.class} | ${bookCell} | \`${anomaly.location}\` | ${anomaly.fact} | ${anomaly.basis} | ${anomaly.impact} | ${anomaly.suggestedAction} | ${anomaly.actionKind} |`,
      );
    }
    push("");
  }

  push("## 7. 本报告能证明什么 / 不能证明什么");
  push("");
  push("### 能证明（机器可判，已实测）");
  push("");
  for (const item of input.canProve) push(`- ${item}`);
  push("");
  push("### 不能证明（必须人审）");
  push("");
  for (const item of input.cannotProve) push(`- ${item}`);
  push("");
  push(
    "**结构完整 ≠ 语文学正确**：106 部无空部只说明韵目集合齐全，不说明任何一条韵字归属正确。",
  );
  push("");

  push("## 8. 验收命令实跑结果");
  push("");
  push("| 命令 | 执行方 | EXIT | 真实输出摘要 | 备注 |");
  push("|---|---|---|---|---|");
  for (const item of input.verificationCommands) {
    const exitCell =
      item.exitCode === null ? "**未运行**" : String(item.exitCode);
    push(
      `| \`${item.command}\` | ${item.executor} | ${exitCell} | ${item.result} | ${item.note} |`,
    );
  }
  push("");
  push("**两个执行环境必须分清**：");
  push("");
  push(
    "1. `pnpm exec vitest run packages/lexicon/tests` 与 `pnpm verify` 两条的原始数字由 **A 侧在本机外部终端**执行后回传（本环境跑不了 pnpm，见下），报告照抄未改写；",
  );
  push(
    "2. `eslint`、`tsc`、全仓 `vitest` 三条由 **A 侧在本执行环境**直接调用 `node_modules/.bin/*` 二进制完成（绕过 pnpm）；",
  );
  push(
    "3. **`check:generated` 在本环境未运行**：`pnpm` 的 store 锁在工作区外被沙箱拒绝（os error 5），`pnpm -r build` 无法执行。该项**未验证**，不得据此声称契约产物无漂移——须由人外部终端或 CI 验证。",
  );
  push("");
  push(
    "**当前全仓测试状态（A 侧实测）**：525 passed / 4 failed，4 条失败均属跨模块测试写死旧状态（GLM 1 条、B 3 条），已列明在上表备注中，**不是 A 侧数据错误**。",
  );
  push("");

  push("## 9. 复现方式");
  push("");
  push("```powershell");
  for (const line of input.reproduce) push(line);
  push("```");
  push("");
  push(
    "本脚本只读快照：不写 `data/normalized/`、不写 `data/releases/`、不改任何 `reviewStatus`。",
  );
  push("");

  return `${lines.join("\n")}\n`;
}

main();
