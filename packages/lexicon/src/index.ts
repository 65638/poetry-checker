/**
 * @poetry/lexicon 公共入口。
 *
 * 唯一公共查询函数与契约一致，快照通过显式注册注入：
 *   const result = await lookupCharacters({ characters, rhymeBook, dataVersion })
 *
 * 未注册的 dataVersion 抛 LexiconError('LEXICON_VERSION_NOT_FOUND')，不回退、不返回空成功。
 */
import { LexiconError, isLexiconError } from "./errors.js";
import {
  createLexicon,
  lookupInSnapshot,
  type Lexicon,
  type LookupRequest,
} from "./lookup.js";
import {
  assertSnapshotIntegrity,
  defineSnapshot,
  makeCandidateId,
  type LexiconSnapshot,
  type SnapshotInput,
  type SnapshotReviewStatus,
} from "./snapshot.js";
import {
  CILIN_GATE,
  PINGSHUI_GATE,
  XINYUN_GATE,
  checkCompleteness,
  gateFor,
  type BookGate,
  type CompletenessIssue,
  type CompletenessReport,
  type GroupGate,
} from "./completeness.js";
import {
  isApicalInitial,
  parsePinyin,
  type PinyinParseResult,
  type PinyinRejectReason,
  type Syllable,
  type ToneNumber,
} from "./xinyun/pinyin.js";
import {
  XINYUN_GENERATOR_VERSION,
  XINYUN_RULES_VERSION,
  XINYUN_RULE_PROVENANCE,
  assignYun,
  describeAssignFailure,
  toneOfToneClass,
  type XinyunAssignFailure,
  type XinyunAssignResult,
  type XinyunToneClass,
  type YunAssignment,
} from "./xinyun/rules.js";

/** 进程内默认注册表。API 启动时用 registerSnapshot 注入真实数据包。 */
const defaultLexicon: Lexicon = createLexicon();

export function lookupCharacters(input: LookupRequest) {
  return defaultLexicon.lookupCharacters(input);
}

export function registerSnapshot(input: SnapshotInput): LexiconSnapshot {
  return defaultLexicon.registerSnapshot(input);
}

export function registerSnapshots(
  inputs: readonly SnapshotInput[],
): LexiconSnapshot[] {
  return inputs.map((input) => defaultLexicon.registerSnapshot(input));
}

export function dataVersions(): string[] {
  return defaultLexicon.dataVersions();
}

/**
 * 从 JSON（data/normalized、data/releases）装载快照。
 * 只做结构守卫，不做内容审核：审核状态由 reviewStatus 字段携带。
 */
export function deserializeSnapshot(value: unknown): LexiconSnapshot {
  if (value === null || typeof value !== "object") {
    throw new LexiconError("LEXICON_INVALID_INPUT", "快照必须是对象");
  }
  const record = value as Record<string, unknown>;
  const arrayField = (key: string): unknown[] => {
    const field = record[key];
    if (!Array.isArray(field)) {
      throw new LexiconError(
        "LEXICON_INVALID_INPUT",
        `快照字段 ${key} 必须是数组`,
      );
    }
    return field;
  };
  const dataVersion = record.dataVersion;
  const book = record.book;
  const reviewStatus = record.reviewStatus;
  const notice = record.notice;
  if (typeof dataVersion !== "string" || typeof notice !== "string") {
    throw new LexiconError(
      "LEXICON_INVALID_INPUT",
      "快照必须含字符串 dataVersion 与 notice",
    );
  }
  if (book !== "pingshui" && book !== "cilin" && book !== "xinyun") {
    throw new LexiconError(
      "LEXICON_INVALID_INPUT",
      `未知韵书：${String(book)}`,
    );
  }
  if (
    reviewStatus !== "fixture" &&
    reviewStatus !== "unverified" &&
    reviewStatus !== "approved"
  ) {
    throw new LexiconError(
      "LEXICON_INVALID_INPUT",
      `未知审核状态：${String(reviewStatus)}`,
    );
  }
  return defineSnapshot({
    dataVersion,
    book,
    reviewStatus: reviewStatus as SnapshotReviewStatus,
    notice,
    candidates: arrayField("candidates") as SnapshotInput["candidates"],
    groups: arrayField("groups") as SnapshotInput["groups"],
    evidence: arrayField("evidence") as SnapshotInput["evidence"],
    sources: arrayField("sources") as SnapshotInput["sources"],
  });
}

export {
  CILIN_GATE,
  LexiconError,
  PINGSHUI_GATE,
  XINYUN_GENERATOR_VERSION,
  XINYUN_GATE,
  XINYUN_RULES_VERSION,
  XINYUN_RULE_PROVENANCE,
  assertSnapshotIntegrity,
  assignYun,
  checkCompleteness,
  createLexicon,
  defineSnapshot,
  describeAssignFailure,
  gateFor,
  isApicalInitial,
  isLexiconError,
  lookupInSnapshot,
  makeCandidateId,
  parsePinyin,
  toneOfToneClass,
};

export type {
  BookGate,
  CompletenessIssue,
  CompletenessReport,
  GroupGate,
  Lexicon,
  LexiconSnapshot,
  LookupRequest,
  PinyinParseResult,
  PinyinRejectReason,
  SnapshotInput,
  SnapshotReviewStatus,
  Syllable,
  ToneNumber,
  XinyunAssignFailure,
  XinyunAssignResult,
  XinyunToneClass,
  YunAssignment,
};
