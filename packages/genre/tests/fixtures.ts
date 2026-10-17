/**
 * 合成测试输入（M5 / 队员 E，D1）。
 *
 * 全部为合成数据：字面构造“平/仄”与占位字，只验证结构与算法。
 * 不代表任何真实作品、读音、体裁或语言学真值；不得进入真实分析路径。
 */
import { createHash } from "node:crypto";
import type {
  AnnotatedPoem,
  AnnotatedToken,
  BookId,
  FormId,
  ReadingCandidate,
  TemplateCandidate,
  Tone,
  WorkMetadata,
} from "@poetry/contracts";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const BOOK: BookId = "pingshui";

const FORM_LINES: Readonly<Record<FormId, number>> = {
  wujue: 4,
  qijue: 4,
  wulv: 8,
  qilv: 8,
};

const FORM_CHARS: Readonly<Record<FormId, number>> = {
  wujue: 5,
  qijue: 7,
  wulv: 5,
  qilv: 7,
};

export interface TokenSpec {
  char: string;
  tone: Tone | null;
}

function buildCandidate(
  id: string,
  character: string,
  tone: Tone,
): ReadingCandidate {
  return {
    id,
    character,
    book: BOOK,
    toneClass: tone === "P" ? "ping" : "ze_unspecified",
    tone,
    groupIds: [],
    gloss: null,
    modernReading: null,
    fanqie: null,
    evidenceIds: [],
  };
}

/** 按行构造合法 AnnotatedPoem；tone=null 的字位表示“无候选/未知”。 */
export function makeAnnotatedPoem(
  lines: TokenSpec[][],
  quality: "ok" | "needs_review" = "ok",
): AnnotatedPoem {
  const lineTexts = lines.map((line) => line.map((spec) => spec.char).join(""));
  const originalText = lineTexts.join("\n");

  const lineOffsets: number[] = [];
  let cursor = 0;
  for (const text of lineTexts) {
    lineOffsets.push(cursor);
    cursor += text.length + 1;
  }

  const tokens: AnnotatedToken[] = [];
  const poemLines = lines.map((line, lineIndex) => {
    const tokenIds: string[] = [];
    const lineStart = lineOffsets[lineIndex] ?? 0;
    let local = 0;
    line.forEach((spec, columnIndex) => {
      const tokenId = `l${lineIndex + 1}c${columnIndex + 1}`;
      const start = lineStart + local;
      const end = start + spec.char.length;
      local = end - lineStart;
      tokenIds.push(tokenId);

      if (spec.tone === null) {
        tokens.push({
          tokenId,
          text: spec.char,
          line: lineIndex + 1,
          column: columnIndex + 1,
          startUtf16: start,
          endUtf16: end,
          candidates: [],
          effectiveCandidateIds: [],
          readingStatus: "unknown",
          selectedReadingId: null,
          selectionMethod: "unresolved",
          possibleTones: [],
          toneStatus: "unknown",
          tone: null,
          reason: "合成样本：无候选",
          evidenceIds: [],
        });
        return;
      }

      const candidate = buildCandidate(`${tokenId}-c1`, spec.char, spec.tone);
      tokens.push({
        tokenId,
        text: spec.char,
        line: lineIndex + 1,
        column: columnIndex + 1,
        startUtf16: start,
        endUtf16: end,
        candidates: [candidate],
        effectiveCandidateIds: [candidate.id],
        readingStatus: "resolved",
        selectedReadingId: candidate.id,
        selectionMethod: "unique",
        possibleTones: [spec.tone],
        toneStatus: "resolved",
        tone: spec.tone,
        reason: "合成样本：唯一候选",
        evidenceIds: [],
      });
    });

    return { line: lineIndex + 1, text: lineTexts[lineIndex] ?? "", tokenIds };
  });

  return {
    originalText,
    inputHash: sha256Hex(originalText),
    lines: poemLines,
    tokens,
    quality,
    notices: [],
    book: BOOK,
  };
}

/** 句数 × 每句字数固定的合成诗（平仄交替，仅用于形制与分支测试）。 */
export function makeRegularPoem(
  lineCount: number,
  chars: number,
  quality: "ok" | "needs_review" = "ok",
): AnnotatedPoem {
  const lines: TokenSpec[][] = Array.from(
    { length: lineCount },
    (_, lineIndex) =>
      Array.from({ length: chars }, (_, charIndex) => ({
        char: "字",
        tone:
          (lineIndex + charIndex) % 2 === 0 ? ("P" as const) : ("Z" as const),
      })),
  );
  return makeAnnotatedPoem(lines, quality);
}

/** 合法 TemplateCandidate；默认只有 toneFit，其余特征为空（对齐当前底座）。 */
export function makeTemplateCandidate(options: {
  id: string;
  formId: FormId;
  toneFit?: number | null;
  relationFit?: number | null;
  rhymeFit?: number | null;
  parallelismFit?: number | null;
  score?: number | null;
  evaluatedKeyRate?: number;
}): TemplateCandidate {
  const lineCount = FORM_LINES[options.formId];
  const chars = FORM_CHARS[options.formId];
  return {
    id: options.id,
    formId: options.formId,
    lineTypes: Array.from({ length: lineCount }, (_, index) =>
      index % 2 === 0 ? ("A" as const) : ("B" as const),
    ),
    expectedTones: Array.from({ length: lineCount }, () =>
      Array.from({ length: chars }, () => ["P", "Z"] as Tone[]),
    ),
    requiredRhymeLines: Array.from(
      { length: lineCount / 2 },
      (_, index) => (index + 1) * 2,
    ),
    evaluatedKeyRate: options.evaluatedKeyRate ?? 1,
    features: {
      toneFit: options.toneFit ?? 0.5,
      relationFit: options.relationFit ?? null,
      rhymeFit: options.rhymeFit ?? null,
      parallelismFit: options.parallelismFit ?? null,
    },
    score: options.score ?? null,
  };
}

/** 特征齐全的候选：用于并列、低吻合与“未实现的高吻合分支”。 */
export function makeCompleteCandidate(options: {
  id: string;
  formId: FormId;
  score: number;
  toneFit?: number;
  relationFit?: number;
  rhymeFit?: number;
  parallelismFit?: number;
}): TemplateCandidate {
  return makeTemplateCandidate({
    id: options.id,
    formId: options.formId,
    toneFit: options.toneFit ?? 0.92,
    relationFit: options.relationFit ?? 0.9,
    rhymeFit: options.rhymeFit ?? 0.9,
    parallelismFit: options.parallelismFit ?? 0.9,
    score: options.score,
  });
}

/** 作品元数据：approve 与否由调用方显式给出，避免默认值被误当已审核。 */
export function makeWorkMetadata(options: {
  id: string;
  title: string;
  text?: string;
  formFamily: "regulated" | "ancient" | "undetermined" | "unsupported";
  formId?: FormId | null;
  historicalTags?: string[];
  reviewStatus?: "approved" | "unverified";
  evidenceIds?: string[];
}): WorkMetadata {
  return {
    id: options.id,
    title: options.title,
    author: null,
    approvedTextFingerprints:
      options.text === undefined ? [] : [sha256Hex(options.text)],
    formFamily: options.formFamily,
    formId: options.formId ?? null,
    historicalTags: options.historicalTags ?? [],
    evidenceIds: options.evidenceIds ?? [],
    reviewStatus: options.reviewStatus ?? "unverified",
  };
}
