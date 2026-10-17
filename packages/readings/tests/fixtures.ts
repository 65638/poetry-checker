/**
 * D1 测试专用合成数据。
 *
 * 这些对象**不是真实韵书数据**，不得进入发布路径、不得当作语言学结论：
 * - 来源标题、证言、韵部 ID 全部带 synthetic 标记；
 * - 平仄取值是为覆盖状态组合而设的测试设定，不代表真实平水韵考证；
 * - 真实候选 ID 由 A 提供，本文件里的 ID 只在测试里有效。
 */
import type {
  BookId,
  ContextRule,
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
} from "@poetry/contracts";
import type { LookupResult, Tone } from "@poetry/contracts";

export const SYNTHETIC_SOURCE: SourceRecord = {
  id: "src-synthetic-d1",
  title: "D1 合成测试来源（非真实韵书）",
  edition: null,
  url: null,
  license: "synthetic-fixture-only",
  snapshotSha256: null,
  revision: "fixture-1",
  retrievedAt: null,
};

export const APPROVED_EVIDENCE: Evidence = {
  id: "ev-synthetic-approved",
  sourceId: SYNTHETIC_SOURCE.id,
  kind: "rhyme_entry",
  locator: "fixture/synthetic#approved",
  assertion: "合成测试记录：仅验证候选传播流程，不是真实韵书证言",
  excerpt: null,
  reviewStatus: "approved",
};

export const UNVERIFIED_EVIDENCE: Evidence = {
  id: "ev-synthetic-unverified",
  sourceId: SYNTHETIC_SOURCE.id,
  kind: "context",
  locator: "fixture/synthetic#unverified",
  assertion: "合成测试记录：未经审核，只能用于待核查材料",
  excerpt: null,
  reviewStatus: "unverified",
};

/** 语境规则专用证据：用来验证“规则命中后证据会传播到字位”。 */
export const RULE_EVIDENCE: Evidence = {
  id: "ev-synthetic-rule-approved",
  sourceId: SYNTHETIC_SOURCE.id,
  kind: "context",
  locator: "fixture/synthetic#rule",
  assertion: "合成测试记录：用于验证语境规则的证据传播，不是真实词义考证",
  excerpt: null,
  reviewStatus: "approved",
};

export const SYNTHETIC_GROUPS: RhymeGroup[] = [
  {
    id: "grp-synthetic-a",
    book: "pingshui",
    name: "合成韵部 A（非真实韵部）",
    toneClass: "ping",
    evidenceIds: [APPROVED_EVIDENCE.id],
  },
  {
    id: "grp-synthetic-b",
    book: "pingshui",
    name: "合成韵部 B（非真实韵部）",
    toneClass: "ze",
    evidenceIds: [APPROVED_EVIDENCE.id],
  },
];

export interface CandidateSpec {
  id: string;
  character: string;
  tone: Tone | null;
  toneClass?: ReadingCandidate["toneClass"];
  book?: BookId;
  groupIds?: string[];
  evidenceIds?: string[];
  gloss?: string | null;
}

export function syntheticCandidate(spec: CandidateSpec): ReadingCandidate {
  const toneClass =
    spec.toneClass ??
    (spec.tone === "P"
      ? "ping"
      : spec.tone === "Z"
        ? "ze_unspecified"
        : "neutral");
  return {
    id: spec.id,
    character: spec.character,
    book: spec.book ?? "pingshui",
    toneClass,
    tone: spec.tone,
    groupIds: spec.groupIds ?? [],
    gloss: spec.gloss ?? null,
    modernReading: null,
    fanqie: null,
    evidenceIds: spec.evidenceIds ?? [APPROVED_EVIDENCE.id],
  };
}

export interface LookupSpec {
  entries: Array<{ character: string; candidates: ReadingCandidate[] }>;
  missing?: string[];
  book?: BookId;
  dataVersion?: string;
  groups?: RhymeGroup[];
  evidence?: Evidence[];
  sources?: SourceRecord[];
}

export function syntheticLookup(spec: LookupSpec): LookupResult {
  return {
    book: spec.book ?? "pingshui",
    dataVersion: spec.dataVersion ?? "synthetic-d1",
    entries: spec.entries,
    missing: spec.missing ?? [],
    groups: spec.groups ?? SYNTHETIC_GROUPS,
    evidence: spec.evidence ?? [
      APPROVED_EVIDENCE,
      UNVERIFIED_EVIDENCE,
      RULE_EVIDENCE,
    ],
    sources: spec.sources ?? [SYNTHETIC_SOURCE],
  };
}

/**
 * 登鹳雀楼二十字的合成候选表。
 *
 * 「更」故意给平、仄两个候选，「行」「长」「重」等留给状态测试单独构造，
 * 避免把真实语文学结论混进 fixture。
 */
export function dengGuanQueLouLookup(): LookupResult {
  const single = (character: string, tone: Tone) => ({
    character,
    candidates: [
      syntheticCandidate({
        id: `c-${character}-${tone}`,
        character,
        tone,
      }),
    ],
  });

  return syntheticLookup({
    entries: [
      single("白", "Z"),
      single("日", "Z"),
      single("依", "P"),
      single("山", "P"),
      single("尽", "Z"),
      single("黄", "P"),
      single("河", "P"),
      single("入", "Z"),
      single("海", "Z"),
      single("流", "P"),
      single("欲", "Z"),
      single("穷", "P"),
      single("千", "P"),
      single("里", "Z"),
      single("目", "Z"),
      {
        character: "更",
        candidates: [
          syntheticCandidate({ id: "c-更-P", character: "更", tone: "P" }),
          syntheticCandidate({ id: "c-更-Z", character: "更", tone: "Z" }),
        ],
      },
      single("上", "Z"),
      single("一", "Z"),
      single("层", "P"),
      single("楼", "P"),
    ],
    // 标题里的「鹳」「雀」「登」留给缺字用例；这里是 lookup 明确声明缺字。
    missing: ["鹳", "雀", "登"],
  });
}

export const PUNCTUATED_DENG_GUAN_QUE_LOU =
  "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。";

export const FOUR_LINE_DENG_GUAN_QUE_LOU =
  "白日依山尽\n黄河入海流\n欲穷千里目\n更上一层楼";

/** 只有一个候选且证据已审核：用于「唯一候选」用例。 */
export function singleCandidateLookup(
  character: string,
  tone: Tone,
): LookupResult {
  return syntheticLookup({
    entries: [
      {
        character,
        candidates: [
          syntheticCandidate({
            id: `c-${character}-${tone}`,
            character,
            tone,
          }),
        ],
      },
    ],
  });
}

/** 不同读音、平仄并存。 */
export function pingZeLookup(character: string): LookupResult {
  return syntheticLookup({
    entries: [
      {
        character,
        candidates: [
          syntheticCandidate({
            id: `c-${character}-P`,
            character,
            tone: "P",
            groupIds: ["grp-synthetic-a"],
          }),
          syntheticCandidate({
            id: `c-${character}-Z`,
            character,
            tone: "Z",
            toneClass: "qu",
            groupIds: ["grp-synthetic-b"],
          }),
        ],
      },
    ],
  });
}

/** 两个不同读音，但平仄都是仄。 */
export function twoZeLookup(character: string): LookupResult {
  return syntheticLookup({
    entries: [
      {
        character,
        candidates: [
          syntheticCandidate({
            id: `c-${character}-qu`,
            character,
            tone: "Z",
            toneClass: "qu",
            groupIds: ["grp-synthetic-b"],
          }),
          syntheticCandidate({
            id: `c-${character}-ru`,
            character,
            tone: "Z",
            toneClass: "ru",
            groupIds: ["grp-synthetic-b"],
          }),
        ],
      },
    ],
  });
}

/** 一个已知平声候选 + 一个声调未知候选。 */
export function pingPlusUnknownLookup(character: string): LookupResult {
  return syntheticLookup({
    entries: [
      {
        character,
        candidates: [
          syntheticCandidate({
            id: `c-${character}-P`,
            character,
            tone: "P",
            groupIds: ["grp-synthetic-a"],
          }),
          syntheticCandidate({
            id: `c-${character}-unknown`,
            character,
            tone: null,
            toneClass: "neutral",
          }),
        ],
      },
    ],
  });
}

/**
 * 合成语境规则：reviewStatus 可切换，用于证明 unverified 不参与选音。
 * targetOffset 按短语码点从 0 计。
 */
export function contextRule(spec: {
  id: string;
  target: string;
  exactPhrases: string[];
  targetOffset: number;
  selectCandidateIds: string[];
  reviewStatus?: ContextRule["reviewStatus"];
  sense?: string;
  book?: BookId;
  evidenceIds?: string[];
}): ContextRule {
  return {
    id: spec.id,
    target: spec.target,
    exactPhrases: spec.exactPhrases,
    targetOffset: spec.targetOffset,
    sense: spec.sense ?? "合成测试语境",
    book: spec.book ?? "pingshui",
    selectCandidateIds: spec.selectCandidateIds,
    negativeExamples: [],
    // 语境规则必须引用 kind="context" 的已审核证据；韵书归部证据不能顶替。
    evidenceIds: spec.evidenceIds ?? [RULE_EVIDENCE.id],
    reviewStatus: spec.reviewStatus ?? "approved",
  };
}

/** 深冻结，用于验证两个函数都不改输入。 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === "object") deepFreeze(child);
  }
  return Object.freeze(value);
}
