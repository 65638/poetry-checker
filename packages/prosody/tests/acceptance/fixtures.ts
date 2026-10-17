import { createHash } from "node:crypto";
import type {
  AnnotatedPoem,
  AnnotatedToken,
  BookId,
  ReadingCandidate,
  Tone,
} from "@poetry/contracts";
import { AnnotatedPoemSchema } from "@poetry/contracts";

// 本文件全部样本为独立合成的测试构造：
// 字形不承载真实读音，P/Z 与韵部完全由构造参数指定（合成，非真实韵书）。
// 下方的预期表均为手工书写并逐条人工核对，不调用被测模板生成器产生答案。

export interface SyntheticReadingSpec {
  tone: Tone | null;
  groupIds: string[];
}

export interface SyntheticTokenSpec {
  text: string;
  /** 显式列出每个候选；缺省时按 tones 每个声调生成一个候选；两者都缺省表示无候选（unknown）。 */
  readings?: SyntheticReadingSpec[];
  tones?: Tone[];
  reason?: string;
}

export type LineType = "A" | "B" | "C" | "D";

// 手工模板基线（组长 D1 指令第五节；C 任务书第 3 节）：不取自 getTemplates 输出。
export const BASE_PATTERNS: Record<5 | 7, Record<LineType, string>> = {
  5: { A: "ZZPPZ", B: "PPZZP", C: "PPPZZ", D: "ZZZPP" },
  7: { A: "PPZZPPZ", B: "ZZPPZZP", C: "ZZPPPZZ", D: "PPZZZPP" },
};

export interface SequenceSpec {
  start: "ping" | "ze";
  firstLineRhymes: boolean;
  lineTypes: readonly LineType[];
}

// 八句序列手工表（绝句取前四句）。起式按第二字判定，不按第一字。
export const SEQUENCES: readonly SequenceSpec[] = [
  { start: "ze", firstLineRhymes: false, lineTypes: ["A", "B", "C", "D", "A", "B", "C", "D"] },
  { start: "ze", firstLineRhymes: true, lineTypes: ["D", "B", "C", "D", "A", "B", "C", "D"] },
  { start: "ping", firstLineRhymes: false, lineTypes: ["C", "D", "A", "B", "C", "D", "A", "B"] },
  { start: "ping", firstLineRhymes: true, lineTypes: ["B", "D", "A", "B", "C", "D", "A", "B"] },
];

export type FormId = "wujue" | "qijue" | "wulv" | "qilv";

export const FORM_SHAPES: Record<FormId, { width: 5 | 7; lineCount: 4 | 8 }> = {
  wujue: { width: 5, lineCount: 4 },
  qijue: { width: 7, lineCount: 4 },
  wulv: { width: 5, lineCount: 8 },
  qilv: { width: 7, lineCount: 8 },
};

export function expectedTemplateId(
  formId: FormId,
  sequence: SequenceSpec,
  width: 5 | 7,
): string {
  return `${formId}-${startForWidth(width, sequence.start)}-${sequence.firstLineRhymes ? "rhymed" : "unrhymed"}`;
}

/** 起式按第二字：同一句型序列在五言与七言下的起式名称相反（sequence.start 为五言名称）。 */
export function startForWidth(width: 5 | 7, fiveCharStart: "ping" | "ze"): "ping" | "ze" {
  return width === 7 ? (fiveCharStart === "ping" ? "ze" : "ping") : fiveCharStart;
}

export function expectedRhymeLines(lineCount: 4 | 8, firstLineRhymes: boolean): number[] {
  const even = Array.from({ length: lineCount / 2 }, (_, index) => (index + 1) * 2);
  return firstLineRhymes ? [1, ...even] : even;
}

export function expectedCanonicalTones(
  width: 5 | 7,
  lineTypes: readonly LineType[],
  lineCount: 4 | 8,
): Tone[][] {
  return lineTypes.slice(0, lineCount).map((type) => [...BASE_PATTERNS[width][type]] as Tone[]);
}

function buildToken(
  tokenId: string,
  text: string,
  line: number,
  column: number,
  startUtf16: number,
  endUtf16: number,
  readings: SyntheticReadingSpec[],
  reason: string,
  book: BookId,
): AnnotatedToken {
  const candidates: ReadingCandidate[] = readings.map((reading, index) => ({
    id: `synthetic:reading:${tokenId}:${index}`,
    character: text,
    book,
    toneClass:
      reading.tone === "P" ? "ping" : reading.tone === "Z" ? "ze_unspecified" : "neutral",
    tone: reading.tone,
    groupIds: [...reading.groupIds],
    gloss: "合成接口测试候选，非真实韵书条目",
    modernReading: null,
    fanqie: null,
    evidenceIds: [`synthetic:evidence:${tokenId}`],
  }));
  const effectiveCandidateIds = candidates.map((candidate) => candidate.id);
  const known = [
    ...new Set(
      candidates.flatMap((candidate) => (candidate.tone === null ? [] : [candidate.tone])),
    ),
  ].sort();
  const unknown =
    candidates.length === 0 || candidates.some((candidate) => candidate.tone === null);
  const toneStatus = unknown ? "unknown" : known.length === 1 ? "resolved" : "ambiguous";
  const selected = candidates.length === 1 ? candidates[0] : undefined;
  return {
    tokenId,
    text,
    line,
    column,
    startUtf16,
    endUtf16,
    candidates,
    effectiveCandidateIds,
    readingStatus:
      candidates.length === 0 ? "unknown" : candidates.length === 1 ? "resolved" : "ambiguous",
    selectedReadingId: selected?.id ?? null,
    selectionMethod: selected ? "unique" : "unresolved",
    possibleTones: known,
    toneStatus,
    tone: toneStatus === "resolved" ? (known[0] ?? null) : null,
    reason,
    evidenceIds: [...new Set(candidates.flatMap((candidate) => candidate.evidenceIds))],
  };
}

export function makeAnnotatedPoem(
  lines: SyntheticTokenSpec[][],
  book: BookId = "pingshui",
): AnnotatedPoem {
  const tokens: AnnotatedToken[] = [];
  let cursor = 0;
  const lineRecords = lines.map((specs, lineIndex) => {
    const line = lineIndex + 1;
    const tokenIds: string[] = [];
    for (const [columnIndex, spec] of specs.entries()) {
      const column = columnIndex + 1;
      const tokenId = `l${line}c${column}`;
      const readings =
        spec.readings ??
        (spec.tones ?? []).map((tone) => ({ tone, groupIds: [`synthetic:group:${tone}`] }));
      tokens.push(
        buildToken(
          tokenId,
          spec.text,
          line,
          column,
          cursor,
          cursor + spec.text.length,
          readings,
          spec.reason ?? "合成测试候选，P/Z 与归部由构造指定",
          book,
        ),
      );
      tokenIds.push(tokenId);
      cursor += spec.text.length;
    }
    cursor += 1; // 行间换行符占 1 个 UTF-16 单元
    return { line, text: specs.map((spec) => spec.text).join(""), tokenIds };
  });
  const originalText = lineRecords.map((record) => record.text).join("\n");
  return AnnotatedPoemSchema.parse({
    originalText,
    inputHash: createHash("sha256").update(originalText, "utf8").digest("hex"),
    lines: lineRecords,
    tokens,
    quality: "ok",
    notices: [],
    book,
  });
}

/** 以指定字位替换候选集合（位置不变），返回通过 Schema 校验的新样本。 */
export function overrideToken(
  poem: AnnotatedPoem,
  tokenId: string,
  override: { readings: SyntheticReadingSpec[]; reason?: string },
): AnnotatedPoem {
  const tokens = poem.tokens.map((token) => {
    if (token.tokenId !== tokenId) return token;
    return buildToken(
      token.tokenId,
      token.text,
      token.line,
      token.column,
      token.startUtf16,
      token.endUtf16,
      override.readings,
      override.reason ?? "合成测试候选（覆盖构造），P/Z 与归部由构造指定",
      poem.book,
    );
  });
  return AnnotatedPoemSchema.parse({ ...poem, tokens });
}

/** 以手工基线构建“正格合成诗”：每字一个候选，P/Z 与正格一致，韵部为合成占位。 */
export function makeSyntheticPoem(
  lineTypes: LineType[],
  width: 5 | 7,
  book: BookId = "pingshui",
): AnnotatedPoem {
  return makeAnnotatedPoem(
    lineTypes.map((type) =>
      [...BASE_PATTERNS[width][type]].map((tone) => ({
        text: tone === "P" ? "平" : "仄",
        tones: [tone as Tone],
      })),
    ),
    book,
  );
}
