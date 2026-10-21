/**
 * 快照定义、注册前的结构与引用校验。
 *
 * 快照是 A 侧的开发中间物：一组候选、韵部、证据、来源，绑定一个 dataVersion。
 * 记录本身直接复用 @poetry/contracts 的类型，不另建第二套公共类型。
 */
import type {
  BookId,
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
} from "@poetry/contracts";

import { LexiconError } from "./errors.js";

/** 快照的审核身份。fixture 只能出现在测试路径，不能进入发布数据。 */
export type SnapshotReviewStatus = "fixture" | "unverified" | "approved";

export interface LexiconSnapshot {
  readonly dataVersion: string;
  readonly book: BookId;
  readonly reviewStatus: SnapshotReviewStatus;
  /** 覆盖范围说明；重建表必须在此写明“非官方原始字表”。 */
  readonly notice: string;
  readonly candidates: readonly ReadingCandidate[];
  readonly groups: readonly RhymeGroup[];
  readonly evidence: readonly Evidence[];
  readonly sources: readonly SourceRecord[];
}

export interface SnapshotInput {
  dataVersion: string;
  book: BookId;
  reviewStatus: SnapshotReviewStatus;
  notice: string;
  candidates: readonly ReadingCandidate[];
  groups: readonly RhymeGroup[];
  evidence: readonly Evidence[];
  sources: readonly SourceRecord[];
}

// Only snapshots frozen recursively by this module are safe index-cache keys.
// Object.isFrozen on the outer object/arrays alone cannot prove that records
// (and therefore their character/id fields) are immutable.
const definedSnapshots = new WeakSet<LexiconSnapshot>();
export function isDefinedSnapshot(snapshot: LexiconSnapshot): boolean {
  return definedSnapshots.has(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated].sort();
}

/** 候选 ID 的稳定命名规则：书:字:声类:韵目，可被证据与报告长期引用。 */
export function makeCandidateId(
  book: BookId,
  character: string,
  toneClass: string,
  groupName: string,
): string {
  return `${book}:${character}:${toneClass}:${groupName}`;
}

/**
 * 校验快照内部引用完整性并冻结。
 *
 * 只“结构能 parse”不算完整：候选指向的韵部、证据，证据指向的来源，都必须能解析。
 */
export function assertSnapshotIntegrity(snapshot: LexiconSnapshot): void {
  const problems: string[] = [];

  for (const [label, ids] of [
    ["candidates", snapshot.candidates.map((c) => c.id)],
    ["groups", snapshot.groups.map((g) => g.id)],
    ["evidence", snapshot.evidence.map((e) => e.id)],
    ["sources", snapshot.sources.map((s) => s.id)],
  ] as const) {
    const repeated = duplicates(ids);
    if (repeated.length > 0) {
      problems.push(`${label} 存在重复 ID：${repeated.join(",")}`);
    }
  }

  const groupIds = new Set(snapshot.groups.map((g) => g.id));
  const evidenceIds = new Set(snapshot.evidence.map((e) => e.id));
  const sourceIds = new Set(snapshot.sources.map((s) => s.id));

  for (const candidate of snapshot.candidates) {
    if (candidate.book !== snapshot.book) {
      problems.push(
        `候选 ${candidate.id} 的韵书 ${candidate.book} 与快照 ${snapshot.book} 不一致`,
      );
    }
    if (candidate.groupIds.length === 0) {
      problems.push(`候选 ${candidate.id} 没有归部`);
    }
    for (const groupId of candidate.groupIds) {
      if (!groupIds.has(groupId)) {
        problems.push(`候选 ${candidate.id} 引用了不存在的韵部 ${groupId}`);
      }
    }
    if (candidate.evidenceIds.length === 0) {
      problems.push(`候选 ${candidate.id} 没有证据`);
    }
    for (const evidenceId of [
      ...candidate.evidenceIds,
      ...(candidate.modernReading?.evidenceIds ?? []),
      ...(candidate.fanqie?.evidenceIds ?? []),
    ]) {
      if (!evidenceIds.has(evidenceId)) {
        problems.push(`候选 ${candidate.id} 引用了不存在的证据 ${evidenceId}`);
      }
    }
  }

  for (const group of snapshot.groups) {
    if (group.book !== snapshot.book) {
      problems.push(`韵部 ${group.id} 的韵书与快照不一致`);
    }
    if (group.evidenceIds.length === 0) {
      problems.push(`韵部 ${group.id} 没有证据`);
    }
    for (const evidenceId of group.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        problems.push(`韵部 ${group.id} 引用了不存在的证据 ${evidenceId}`);
      }
    }
  }

  for (const evidence of snapshot.evidence) {
    if (!sourceIds.has(evidence.sourceId)) {
      problems.push(
        `证据 ${evidence.id} 引用了不存在的来源 ${evidence.sourceId}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new LexiconError(
      "LEXICON_REFERENCE_UNRESOLVED",
      `快照 ${snapshot.dataVersion} 引用不完整`,
      problems.sort(),
    );
  }
}

export function defineSnapshot(input: SnapshotInput): LexiconSnapshot {
  if (input.dataVersion.trim().length === 0) {
    throw new LexiconError("LEXICON_INVALID_INPUT", "dataVersion 不能为空");
  }
  const snapshot: LexiconSnapshot = {
    dataVersion: input.dataVersion,
    book: input.book,
    reviewStatus: input.reviewStatus,
    notice: input.notice,
    candidates: [...input.candidates],
    groups: [...input.groups],
    evidence: [...input.evidence],
    sources: [...input.sources],
  };
  assertSnapshotIntegrity(snapshot);
  deepFreeze(snapshot);
  definedSnapshots.add(snapshot);
  return snapshot;
}
