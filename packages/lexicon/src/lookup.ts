/**
 * 查询适配器：显式版本注册、批量去重、稳定排序、多候选保留、引用可解析。
 *
 * 公共入口签名与契约一致：
 *   lookupCharacters({ characters, rhymeBook, dataVersion }): Promise<LookupResult>
 * 快照通过显式注册注入，公共函数不增加第四个参数。
 */
import { LookupResultSchema } from "@poetry/contracts";
import type {
  BookId,
  Evidence,
  LookupResult,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
} from "@poetry/contracts";

import { LexiconError } from "./errors.js";
import {
  defineSnapshot,
  type LexiconSnapshot,
  type SnapshotInput,
} from "./snapshot.js";

export interface LookupRequest {
  characters: string[];
  rhymeBook: BookId;
  dataVersion: string;
}

export interface Lexicon {
  lookupCharacters(input: LookupRequest): Promise<LookupResult>;
  registerSnapshot(input: SnapshotInput): LexiconSnapshot;
  /** 已注册的 dataVersion，升序；供 /rhyme-books 与联调排查使用。 */
  dataVersions(): string[];
  snapshotOf(dataVersion: string): LexiconSnapshot | undefined;
}

function codePointOrder(value: string): number {
  const first = [...value][0];
  return first === undefined ? 0 : (first.codePointAt(0) ?? 0);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortById<T extends { id: string }>(items: Iterable<T>): T[] {
  return [...items].sort((a, b) => compareStrings(a.id, b.id));
}

/**
 * 校验入参并返回去重、按码位升序的字符表。
 *
 * 去重与排序都在副本上完成，不修改调用方传入的数组。
 */
function uniqueCharacters(characters: readonly string[]): string[] {
  if (!Array.isArray(characters)) {
    throw new LexiconError(
      "LEXICON_INVALID_INPUT",
      "characters 必须是字符串数组",
    );
  }
  const seen = new Set<string>();
  for (const character of characters) {
    if (typeof character !== "string") {
      throw new LexiconError(
        "LEXICON_INVALID_INPUT",
        "characters 只能包含字符串",
      );
    }
    if ([...character].length !== 1) {
      throw new LexiconError(
        "LEXICON_INVALID_INPUT",
        `每个元素必须是单个 Unicode 码点：${JSON.stringify(character)}`,
      );
    }
    seen.add(character);
  }
  return [...seen].sort((a, b) => codePointOrder(a) - codePointOrder(b));
}

function referencedEvidenceIds(
  candidate: ReadingCandidate,
  group: RhymeGroup | undefined,
): string[] {
  return [
    ...candidate.evidenceIds,
    ...(candidate.modernReading?.evidenceIds ?? []),
    ...(candidate.fanqie?.evidenceIds ?? []),
    ...(group?.evidenceIds ?? []),
  ];
}

interface SnapshotIndex {
  byCharacter: Map<string, ReadingCandidate[]>;
  groupById: Map<string, RhymeGroup>;
  evidenceById: Map<string, Evidence>;
  sourceById: Map<string, SourceRecord>;
}
// defineSnapshot deep-freezes its result. Keep one index for that exact object,
// rather than rescanning every candidate for every single-character lookup.
// Weak keys let old versions be collected; mutable caller inputs are never cached.
const snapshotIndexes = new WeakMap<LexiconSnapshot, SnapshotIndex>();
function indexSnapshot(snapshot: LexiconSnapshot): SnapshotIndex {
  const cached = snapshotIndexes.get(snapshot);
  if (cached) return cached;
  const byCharacter = new Map<string, ReadingCandidate[]>();
  for (const candidate of snapshot.candidates) {
    const bucket = byCharacter.get(candidate.character);
    if (bucket) bucket.push(candidate);
    else byCharacter.set(candidate.character, [candidate]);
  }
  const index = {
    byCharacter,
    groupById: new Map(snapshot.groups.map((group) => [group.id, group])),
    evidenceById: new Map(snapshot.evidence.map((item) => [item.id, item])),
    sourceById: new Map(snapshot.sources.map((item) => [item.id, item])),
  };
  if (
    Object.isFrozen(snapshot) &&
    [
      snapshot.candidates,
      snapshot.groups,
      snapshot.evidence,
      snapshot.sources,
    ].every(Object.isFrozen)
  )
    snapshotIndexes.set(snapshot, index);
  return index;
}

/**
 * 在给定快照上执行查询。同步纯函数，便于测试与复用。
 */
export function lookupInSnapshot(
  snapshot: LexiconSnapshot,
  request: LookupRequest,
): LookupResult {
  if (request.rhymeBook !== snapshot.book) {
    throw new LexiconError(
      "LEXICON_BOOK_MISMATCH",
      `dataVersion ${snapshot.dataVersion} 属于 ${snapshot.book}，不能用于 ${request.rhymeBook}`,
    );
  }

  const characters = uniqueCharacters(request.characters);

  const { byCharacter, groupById, evidenceById, sourceById } =
    indexSnapshot(snapshot);

  const entries: LookupResult["entries"] = [];
  const missing: string[] = [];
  const usedGroups = new Map<string, RhymeGroup>();
  const usedEvidence = new Map<string, Evidence>();
  const usedSources = new Map<string, SourceRecord>();

  for (const character of characters) {
    const candidates = byCharacter.get(character);
    if (candidates === undefined || candidates.length === 0) {
      // 未收录：只进 missing，不创建默认候选、不补默认声调或拼音。
      missing.push(character);
      continue;
    }
    const sorted = [...candidates].sort((a, b) => compareStrings(a.id, b.id));
    for (const candidate of sorted) {
      for (const groupId of candidate.groupIds) {
        const group = groupById.get(groupId);
        if (group !== undefined) usedGroups.set(group.id, group);
      }
      const firstGroupId = candidate.groupIds[0];
      const firstGroup =
        firstGroupId === undefined ? undefined : groupById.get(firstGroupId);
      for (const evidenceId of referencedEvidenceIds(candidate, firstGroup)) {
        const evidence = evidenceById.get(evidenceId);
        if (evidence !== undefined) usedEvidence.set(evidence.id, evidence);
      }
    }
    entries.push({ character, candidates: sorted });
  }

  for (const group of usedGroups.values()) {
    for (const evidenceId of group.evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (evidence !== undefined) usedEvidence.set(evidence.id, evidence);
    }
  }
  for (const evidence of usedEvidence.values()) {
    const source = sourceById.get(evidence.sourceId);
    if (source !== undefined) usedSources.set(source.id, source);
  }

  const result = {
    book: snapshot.book,
    dataVersion: snapshot.dataVersion,
    entries,
    missing,
    groups: sortById(usedGroups.values()),
    evidence: sortById(usedEvidence.values()),
    sources: sortById(usedSources.values()),
  };

  const parsed = LookupResultSchema.safeParse(result);
  if (!parsed.success) {
    throw new LexiconError(
      "LEXICON_INVALID_RESULT",
      `dataVersion ${snapshot.dataVersion} 的查询结果不符合 LookupResult`,
      parsed.error.issues.map(
        (issue: { path: readonly PropertyKey[]; message: string }) =>
          `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      ),
    );
  }
  return result;
}

export function createLexicon(initial: readonly SnapshotInput[] = []): Lexicon {
  const registry = new Map<string, LexiconSnapshot>();

  const lexicon: Lexicon = {
    registerSnapshot(input: SnapshotInput): LexiconSnapshot {
      const snapshot = defineSnapshot(input);
      const existing = registry.get(snapshot.dataVersion);
      if (existing !== undefined) {
        throw new LexiconError(
          "LEXICON_DUPLICATE_ID",
          `dataVersion 已注册，不能静默覆盖：${snapshot.dataVersion}`,
        );
      }
      registry.set(snapshot.dataVersion, snapshot);
      return snapshot;
    },
    async lookupCharacters(input: LookupRequest): Promise<LookupResult> {
      const snapshot = registry.get(input.dataVersion);
      if (snapshot === undefined) {
        // 未知版本不允许回退到其他版本，也不返回空结果冒充成功。
        throw new LexiconError(
          "LEXICON_VERSION_NOT_FOUND",
          `未注册的 dataVersion：${input.dataVersion}`,
          [`已注册：${[...registry.keys()].sort().join(",") || "（空）"}`],
        );
      }
      return lookupInSnapshot(snapshot, input);
    },
    dataVersions(): string[] {
      return [...registry.keys()].sort();
    },
    snapshotOf(dataVersion: string): LexiconSnapshot | undefined {
      return registry.get(dataVersion);
    },
  };

  for (const input of initial) lexicon.registerSnapshot(input);
  return lexicon;
}
