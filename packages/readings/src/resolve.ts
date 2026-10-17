import type {
  AnnotatedPoem,
  AnnotatedToken,
  ContextRule,
  LookupResult,
  ParsedPoem,
  ParsedToken,
  ReadingCandidate,
  ReadingOverride,
  Tone,
} from "@poetry/contracts";
import { ReadingsError } from "./errors.js";

/** AnnotatedPoem 新增的 notice code；不允许未审核规则静默生效或静默消失。 */
export const CONTEXT_NOTICE_CODES = [
  "CONTEXT_RULE_UNVERIFIED_IGNORED",
] as const;

export type ContextNoticeCode = (typeof CONTEXT_NOTICE_CODES)[number];

export interface ResolveReadingsInput {
  poem: ParsedPoem;
  lookup: LookupResult;
  overrides: ReadingOverride[];
  contextRules: ContextRule[];
}

/** 一条命中某字位的语境规则。 */
interface RuleHit {
  ruleId: string;
  phrase: string;
  sense: string;
  /** 短语码点长度；用于“最长精确词组优先”。 */
  length: number;
  selectCandidateIds: readonly string[];
  evidenceIds: readonly string[];
}

interface RuleHits {
  approved: Map<string, RuleHit[]>;
  unverified: Map<string, RuleHit[]>;
}

interface Selection {
  effectiveCandidateIds: string[];
  readingStatus: AnnotatedToken["readingStatus"];
  selectedReadingId: string | null;
  selectionMethod: AnnotatedToken["selectionMethod"];
  reason: string;
  ruleEvidenceIds: readonly string[];
}

/**
 * 把 A 提供的候选传播成逐字标注。
 *
 * 优先级固定：用户覆盖 → 已审核语境规则 → 唯一候选 → 保留歧义。
 * 本模块不读格律模板、不看押韵位置、不按“哪个读音更合律”挑读音。
 */
export function resolveReadings(input: ResolveReadingsInput): AnnotatedPoem {
  const { poem, lookup, overrides, contextRules } = input;

  assertPoemIntegrity(poem);

  const candidatesByCharacter = buildCandidateIndex(lookup);
  const approvedEvidenceIds = new Set(
    lookup.evidence
      .filter((evidence) => evidence.reviewStatus === "approved")
      .map((evidence) => evidence.id),
  );

  const orderedTokens = [...poem.tokens].sort(
    (left, right) => left.line - right.line || left.column - right.column,
  );
  const overrideByTokenId = indexOverrides(overrides, orderedTokens);
  const ruleHits = collectRuleHits(orderedTokens, contextRules, lookup.book);

  const notices = poem.notices.map((notice) => ({ ...notice }));
  const tokenById = new Map(
    orderedTokens.map((token) => [token.tokenId, token]),
  );

  const annotatedTokens = orderedTokens.map((token) => {
    const candidates = candidatesByCharacter.get(token.text) ?? [];
    const selection = selectReading({
      token,
      candidates,
      lookup,
      approvedEvidenceIds,
      overrideReadingId: overrideByTokenId.get(token.tokenId),
      approvedHits: ruleHits.approved.get(token.tokenId) ?? [],
    });

    const effectiveCandidates = candidates.filter((candidate) =>
      selection.effectiveCandidateIds.includes(candidate.id),
    );
    const toneState = deriveToneState(effectiveCandidates);
    const evidenceIds = uniqueInOrder([
      ...effectiveCandidates.flatMap((candidate) => candidate.evidenceIds),
      ...selection.ruleEvidenceIds,
    ]).filter((evidenceId) => approvedEvidenceIds.has(evidenceId));

    return {
      ...token,
      candidates,
      effectiveCandidateIds: selection.effectiveCandidateIds,
      readingStatus: selection.readingStatus,
      selectedReadingId: selection.selectedReadingId,
      selectionMethod: selection.selectionMethod,
      possibleTones: toneState.possibleTones,
      toneStatus: toneState.toneStatus,
      tone: toneState.tone,
      reason: selection.reason,
      evidenceIds,
    } satisfies AnnotatedToken;
  });

  // 未审核规则命中：不参与选音，但必须留下痕迹，不能被悄悄忽略。
  for (const [tokenId, hits] of ruleHits.unverified) {
    const token = tokenById.get(tokenId);
    if (token === undefined) continue;
    for (const hit of hits) {
      notices.push({
        code: "CONTEXT_RULE_UNVERIFIED_IGNORED",
        message: `未审核语境规则 ${hit.ruleId} 命中「${hit.phrase}」：reviewStatus=unverified，不参与自动选音`,
        startUtf16: token.startUtf16,
        endUtf16: token.endUtf16,
      });
    }
  }

  return {
    originalText: poem.originalText,
    inputHash: poem.inputHash,
    lines: poem.lines.map((line) => ({
      line: line.line,
      text: line.text,
      tokenIds: [...line.tokenIds],
    })),
    tokens: annotatedTokens,
    quality: poem.quality,
    notices,
    book: lookup.book,
  };
}

function selectReading(input: {
  token: ParsedToken;
  candidates: readonly ReadingCandidate[];
  lookup: LookupResult;
  approvedEvidenceIds: ReadonlySet<string>;
  overrideReadingId: string | undefined;
  approvedHits: readonly RuleHit[];
}): Selection {
  const {
    token,
    candidates,
    lookup,
    approvedEvidenceIds,
    overrideReadingId,
    approvedHits,
  } = input;
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  // 1. 用户覆盖优先；但必须指向当前原字、当前韵书下真实存在的候选。
  if (overrideReadingId !== undefined) {
    if (!candidateIds.has(overrideReadingId)) {
      throw new ReadingsError(
        "OVERRIDE_READING_UNKNOWN",
        `字位 ${token.tokenId}（${token.text}）在《${lookup.book}》中没有候选 ${overrideReadingId}：不接受别字、别书或不存在的候选 ID`,
        {
          tokenId: token.tokenId,
          readingId: overrideReadingId,
          book: lookup.book,
        },
      );
    }
    return {
      effectiveCandidateIds: [overrideReadingId],
      readingStatus: "resolved",
      selectedReadingId: overrideReadingId,
      selectionMethod: "user",
      reason: `用户指定读音 ${overrideReadingId}（人工覆盖，非系统推断）`,
      ruleEvidenceIds: [],
    };
  }

  // 2. 已审核语境规则：最长精确词组优先；同优先级冲突保留歧义。
  if (approvedHits.length > 0) {
    const longest = Math.max(...approvedHits.map((hit) => hit.length));
    const top = approvedHits.filter((hit) => hit.length === longest);
    const selected = new Set<string>();
    for (const hit of top) {
      for (const candidateId of hit.selectCandidateIds) {
        if (!candidateIds.has(candidateId)) {
          throw new ReadingsError(
            "CONTEXT_RULE_STALE",
            `语境规则 ${hit.ruleId} 指向候选 ${candidateId}，但字位 ${token.tokenId}（${token.text}）的候选里没有它：规则与当前数据版本脱节，拒绝生效`,
            {
              ruleId: hit.ruleId,
              tokenId: token.tokenId,
              readingId: candidateId,
            },
          );
        }
        selected.add(candidateId);
      }
    }
    const ruleIds = uniqueInOrder(top.map((hit) => hit.ruleId));
    const phrases = uniqueInOrder(top.map((hit) => hit.phrase));
    const senses = uniqueInOrder(top.map((hit) => hit.sense));
    const ruleEvidenceIds = uniqueInOrder(
      top.flatMap((hit) => [...hit.evidenceIds]),
    );

    if (selected.size === 1) {
      const only = [...selected][0];
      if (only !== undefined) {
        return {
          effectiveCandidateIds: [only],
          readingStatus: "resolved",
          selectedReadingId: only,
          selectionMethod: "context_rule",
          reason: `命中已审核语境规则 ${ruleIds.join("、")}「${phrases.join("、")}」（${senses.join("；")}），选定候选 ${only}`,
          ruleEvidenceIds,
        };
      }
    }
    return {
      effectiveCandidateIds: [...selected].sort(),
      readingStatus: "ambiguous",
      selectedReadingId: null,
      selectionMethod: "unresolved",
      reason: `同优先级语境规则冲突（${ruleIds.join("、")}）：保留候选 ${[...selected].sort().join("、")}，不任选`,
      ruleEvidenceIds,
    };
  }

  // 3. 没有候选：明确未知，不补造读音。
  if (candidates.length === 0) {
    const declaredMissing = lookup.missing.includes(token.text);
    return {
      effectiveCandidateIds: [],
      readingStatus: "unknown",
      selectedReadingId: null,
      selectionMethod: "unresolved",
      reason: declaredMissing
        ? `lookup.missing 声明「${token.text}」在《${lookup.book}》未收：无候选可用，按未知处理`
        : `lookup 未覆盖「${token.text}」（entries 与 missing 都没有）：按未知处理，不补造读音`,
      ruleEvidenceIds: [],
    };
  }

  // 4. 唯一候选：仍要标明证据是否已审核，不把未核实来源说成确定事实。
  if (candidates.length === 1) {
    const only = candidates[0];
    if (only === undefined) {
      // candidates.length === 1 保证不可达；防御式保持可解释错误。
      throw new ReadingsError(
        "LOOKUP_ENTRY_DUPLICATE",
        `字位 ${token.tokenId}（${token.text}）的候选读取失败`,
        { tokenId: token.tokenId },
      );
    }
    const hasApprovedEvidence = only.evidenceIds.some((evidenceId) =>
      approvedEvidenceIds.has(evidenceId),
    );
    return {
      effectiveCandidateIds: [only.id],
      readingStatus: "resolved",
      selectedReadingId: only.id,
      selectionMethod: "unique",
      reason: hasApprovedEvidence
        ? `唯一候选 ${only.id}：当前取值唯一，平仄按该候选推导`
        : `唯一候选 ${only.id}：该候选尚无已审核证据，只能作为待核实结论，不得当作已核实的发布事实`,
      ruleEvidenceIds: [],
    };
  }

  // 5. 多个候选：全部保留，等 D2 的语境证据或用户覆盖。
  const allIds = candidates.map((candidate) => candidate.id);
  return {
    effectiveCandidateIds: allIds,
    readingStatus: "ambiguous",
    selectedReadingId: null,
    selectionMethod: "unresolved",
    reason: `保留 ${allIds.length} 个候选（${allIds.join("、")}）：当前语境证据不足，不给确定读音`,
    ruleEvidenceIds: [],
  };
}

/**
 * 平仄状态必须由全部有效候选一致推导：
 * 任一有效候选声调未知 → unknown；全部同调 → resolved；平仄并存 → ambiguous。
 */
function deriveToneState(candidates: readonly ReadingCandidate[]): {
  possibleTones: Tone[];
  toneStatus: AnnotatedToken["toneStatus"];
  tone: Tone | null;
} {
  const known = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.tone === null ? [] : [candidate.tone],
      ),
    ),
  ].sort() as Tone[];
  const hasUnknownTone =
    candidates.length === 0 ||
    candidates.some((candidate) => candidate.tone === null);

  if (hasUnknownTone) {
    return { possibleTones: known, toneStatus: "unknown", tone: null };
  }
  if (known.length === 1) {
    return {
      possibleTones: known,
      toneStatus: "resolved",
      tone: known[0] ?? null,
    };
  }
  return { possibleTones: known, toneStatus: "ambiguous", tone: null };
}

function assertPoemIntegrity(poem: ParsedPoem): void {
  const seen = new Set<string>();
  for (const token of poem.tokens) {
    if (seen.has(token.tokenId)) {
      throw new ReadingsError(
        "POEM_TOKEN_DUPLICATE",
        `poem.tokens 里字位 ${token.tokenId} 重复：无法确定标注对象`,
        { tokenId: token.tokenId },
      );
    }
    seen.add(token.tokenId);

    const slice = poem.originalText.slice(token.startUtf16, token.endUtf16);
    if (slice !== token.text) {
      throw new ReadingsError(
        "POEM_TOKEN_SLICE_MISMATCH",
        `字位 ${token.tokenId} 的原文区间 [${token.startUtf16}, ${token.endUtf16}) 切出「${slice}」，与 token.text「${token.text}」不一致`,
        { tokenId: token.tokenId },
      );
    }
  }
}

function buildCandidateIndex(
  lookup: LookupResult,
): Map<string, ReadingCandidate[]> {
  const evidenceIds = new Set(lookup.evidence.map((evidence) => evidence.id));
  const index = new Map<string, ReadingCandidate[]>();

  for (const entry of lookup.entries) {
    if ([...entry.character].length !== 1) {
      throw new ReadingsError(
        "LOOKUP_CANDIDATE_CHARACTER_MISMATCH",
        `lookup.entries 的 character「${entry.character}」不是单个 Unicode 码点`,
        { character: entry.character },
      );
    }
    if (index.has(entry.character)) {
      throw new ReadingsError(
        "LOOKUP_ENTRY_DUPLICATE",
        `lookup.entries 里「${entry.character}」出现多条记录`,
        { character: entry.character },
      );
    }
    const seen = new Set<string>();
    for (const candidate of entry.candidates) {
      if (
        [...candidate.character].length !== 1 ||
        candidate.character !== entry.character
      ) {
        throw new ReadingsError(
          "LOOKUP_CANDIDATE_CHARACTER_MISMATCH",
          `候选 ${candidate.id} 的 character「${candidate.character}」与所属 entry「${entry.character}」不符`,
          { candidateId: candidate.id, character: candidate.character },
        );
      }
      if (candidate.book !== lookup.book) {
        throw new ReadingsError(
          "LOOKUP_CANDIDATE_BOOK_MISMATCH",
          `候选 ${candidate.id} 属于《${candidate.book}》，本次 lookup 为《${lookup.book}》：不接受跨书候选`,
          { candidateId: candidate.id, book: candidate.book },
        );
      }
      if (seen.has(candidate.id)) {
        throw new ReadingsError(
          "LOOKUP_CANDIDATE_DUPLICATE",
          `「${entry.character}」下候选 ID ${candidate.id} 重复`,
          { character: entry.character, candidateId: candidate.id },
        );
      }
      seen.add(candidate.id);
      for (const evidenceId of candidate.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          throw new ReadingsError(
            "LOOKUP_EVIDENCE_UNKNOWN",
            `候选 ${candidate.id} 引用不存在的证据 ${evidenceId}`,
            { candidateId: candidate.id, evidenceId },
          );
        }
      }
    }
    index.set(entry.character, entry.candidates);
  }

  return index;
}

function indexOverrides(
  overrides: readonly ReadingOverride[],
  tokens: readonly ParsedToken[],
): Map<string, string> {
  const knownTokenIds = new Set(tokens.map((token) => token.tokenId));
  const byTokenId = new Map<string, string>();
  for (const override of overrides) {
    if (!knownTokenIds.has(override.tokenId)) {
      throw new ReadingsError(
        "OVERRIDE_TOKEN_UNKNOWN",
        `人工覆盖指向不存在的字位 ${override.tokenId}`,
        { tokenId: override.tokenId },
      );
    }
    if (byTokenId.has(override.tokenId)) {
      throw new ReadingsError(
        "OVERRIDE_DUPLICATE_TOKEN",
        `字位 ${override.tokenId} 被覆盖两次：同一字位只接受一个覆盖`,
        { tokenId: override.tokenId },
      );
    }
    byTokenId.set(override.tokenId, override.readingId);
  }
  return byTokenId;
}

function collectRuleHits(
  tokens: readonly ParsedToken[],
  contextRules: readonly ContextRule[],
  book: LookupResult["book"],
): RuleHits {
  const approved = new Map<string, RuleHit[]>();
  const unverified = new Map<string, RuleHit[]>();

  const applicableRules = contextRules.filter((rule) => rule.book === book);
  for (const rule of applicableRules) {
    assertRuleStructure(rule);
  }

  const tokensByLine = new Map<number, ParsedToken[]>();
  for (const token of tokens) {
    const bucket = tokensByLine.get(token.line);
    if (bucket === undefined) tokensByLine.set(token.line, [token]);
    else bucket.push(token);
  }

  for (const lineTokens of tokensByLine.values()) {
    const characters = lineTokens.map((token) => token.text);
    for (const rule of applicableRules) {
      for (const phrase of rule.exactPhrases) {
        const phraseCharacters = [...phrase];
        if (phraseCharacters.length === 0) continue;
        if (phraseCharacters.length > characters.length) continue;
        for (
          let start = 0;
          start + phraseCharacters.length <= characters.length;
          start += 1
        ) {
          if (!matchesAt(characters, phraseCharacters, start)) continue;
          const targetToken = lineTokens[start + rule.targetOffset];
          if (targetToken === undefined) {
            throw new ReadingsError(
              "CONTEXT_RULE_INVALID",
              `语境规则 ${rule.id} 的 targetOffset ${rule.targetOffset} 落到了短语「${phrase}」之外`,
              { ruleId: rule.id },
            );
          }
          const hit: RuleHit = {
            ruleId: rule.id,
            phrase,
            sense: rule.sense,
            length: phraseCharacters.length,
            selectCandidateIds: rule.selectCandidateIds,
            evidenceIds: rule.evidenceIds,
          };
          const bucket =
            rule.reviewStatus === "approved" ? approved : unverified;
          const existing = bucket.get(targetToken.tokenId);
          if (existing === undefined) bucket.set(targetToken.tokenId, [hit]);
          else existing.push(hit);
        }
      }
    }
  }

  return { approved, unverified };
}

function assertRuleStructure(rule: ContextRule): void {
  if (rule.exactPhrases.length === 0) {
    throw new ReadingsError(
      "CONTEXT_RULE_INVALID",
      `语境规则 ${rule.id} 没有任何 exactPhrases：无法匹配，也说明规则未完成`,
      { ruleId: rule.id },
    );
  }
  if (rule.selectCandidateIds.length === 0) {
    throw new ReadingsError(
      "CONTEXT_RULE_INVALID",
      `语境规则 ${rule.id} 没有 selectCandidateIds：命中后无法选择候选`,
      { ruleId: rule.id },
    );
  }
  for (const phrase of rule.exactPhrases) {
    const phraseCharacters = [...phrase];
    const target = phraseCharacters[rule.targetOffset];
    if (target === undefined) {
      throw new ReadingsError(
        "CONTEXT_RULE_INVALID",
        `语境规则 ${rule.id} 的 targetOffset ${rule.targetOffset} 超出短语「${phrase}」的码点范围`,
        { ruleId: rule.id },
      );
    }
    if (target !== rule.target) {
      throw new ReadingsError(
        "CONTEXT_RULE_INVALID",
        `语境规则 ${rule.id} 在短语「${phrase}」偏移 ${rule.targetOffset} 处是「${target}」，与 target「${rule.target}」不符：应拆成多条规则`,
        { ruleId: rule.id },
      );
    }
  }
}

function matchesAt(
  characters: readonly string[],
  phraseCharacters: readonly string[],
  start: number,
): boolean {
  for (let index = 0; index < phraseCharacters.length; index += 1) {
    if (characters[start + index] !== phraseCharacters[index]) return false;
  }
  return true;
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
