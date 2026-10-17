import { createHash } from "node:crypto";
import type { ParseNotice, ParsedPoem, ParsedToken } from "@poetry/contracts";

/**
 * 结束一句的字符。
 *
 * 契约只声明中英文逗号、句号、分号、问号、叹号；换行由 CRLF 归一逻辑单独处理。
 * 顿号、冒号、引号、括号等不在句边界内，属于下面的排版容忍字符。
 */
export const LINE_BOUNDARY_CHARACTERS = [
  "，",
  "。",
  "；",
  "？",
  "！",
  ",",
  ".",
  ";",
  "?",
  "!",
] as const;

/**
 * 排版容忍字符：保留在 originalText 中、不占格律字位、不降级 quality。
 *
 * 这里是唯一的代码白名单；docs/readings.md 与 parse.test.ts 必须同步。
 * 新增字符要同时改三处，不允许用宽泛正则整体吞掉符号。
 */
export const LAYOUT_TOLERANT_CHARACTERS = [
  // 空白：普通空格不占字位，但保留原文范围
  " ",
  "\t",
  "\u00a0",
  "\u3000",
  "\u200b",
  // 引号与括号
  "“",
  "”",
  "‘",
  "’",
  "「",
  "」",
  "『",
  "』",
  "（",
  "）",
  "(",
  ")",
  "《",
  "》",
  "〈",
  "〉",
  "【",
  "】",
  "〔",
  "〕",
  // 句内停顿与装饰符号（不结束句子）
  "、",
  "：",
  ":",
  "·",
  "・",
  "—",
  "–",
  "…",
  "～",
  "~",
  "｜",
  "|",
] as const;

/** ParseNotice 的 code 取值；对外文档与本文件保持同一份定义。 */
export const PARSE_NOTICE_CODES = [
  /** 保留原文的非汉字内容：不占字位，但需要人工确认。 */
  "PARSE_UNSUPPORTED_CHARACTER",
  /** 输入里没有任何汉字（空串或纯标点）。 */
  "PARSE_NO_HAN_TEXT",
  /** 首行结构疑似标题；不做删除，只提示正文范围需确认。 */
  "PARSE_SUSPECTED_TITLE",
  /** 无任何句边界且汉字数超过 7：不擅自按五/七言切分，只提示需要分句。 */
  "PARSE_LINE_SPLIT_UNCERTAIN",
] as const;

export type ParseNoticeCode = (typeof PARSE_NOTICE_CODES)[number];

const HAN_SCRIPT_PATTERN = /\p{Script=Han}/u;
const IDEOGRAPHIC_PATTERN = /\p{Ideographic}/u;
const BOUNDARY_SET: ReadonlySet<string> = new Set(LINE_BOUNDARY_CHARACTERS);
const LAYOUT_SET: ReadonlySet<string> = new Set(LAYOUT_TOLERANT_CHARACTERS);

/**
 * 能否建立格律字位：必须是**表意汉字**，即 Script=Han 且 Ideographic。
 *
 * 只用 Script=Han 不够：`々`(U+3005)、`〻`(U+303B) 重复记号与康熙部首
 * （如 `⼀` U+2F00）都属于 Han Script 但不是表意文字，把它们算成字位会凭空多占一格，
 * 使后续每一列错位。补充平面汉字（`𠀀` U+20000）同时满足两个条件，照常建字位。
 */
export function isHanCharacter(character: string): boolean {
  return (
    HAN_SCRIPT_PATTERN.test(character) && IDEOGRAPHIC_PATTERN.test(character)
  );
}

/** Han Script 但不是表意文字的码点：重复记号、部首等。它们留在原文但不占字位。 */
export function isNonIdeographicHan(character: string): boolean {
  return (
    HAN_SCRIPT_PATTERN.test(character) && !IDEOGRAPHIC_PATTERN.test(character)
  );
}

/** 原始 UTF-8 文本的 SHA-256 小写十六进制。标点/换行变化会改变结果。 */
export function hashOriginalText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface ParseTextInput {
  text: string;
}

/**
 * 把原文解析成逐字标注的骨架。
 *
 * 不变量：
 * 1. originalText 原样保存，任何字符都不删。
 * 2. 只为表意汉字建 token（Script=Han 且 Ideographic）；按码点遍历，
 *    startUtf16/endUtf16 是原文半开区间。
 * 3. 每个 token 满足 originalText.slice(startUtf16, endUtf16) === text。
 * 4. line/column 从 1 起，tokenId 为 l{line}c{column}，标点不占格律字位。
 * 5. 换行与句读都是句边界；连续边界不产生空句。
 * 6. 不做繁简转换、不做 NFKC 归一、不猜标题、不按字数硬断句。
 */
export function parseText(input: ParseTextInput): ParsedPoem {
  const originalText = input.text;
  const inputHash = hashOriginalText(originalText);

  const tokens: ParsedToken[] = [];
  const lines: ParsedPoem["lines"] = [];
  const notices: ParseNotice[] = [];
  let needsReview = false;
  let sawBoundary = false;
  let hanCount = 0;

  let lineNumber = 1;
  let column = 0;
  let currentTokenIds: string[] = [];
  let currentText = "";

  const flushLine = (): void => {
    if (currentTokenIds.length === 0) return;
    lines.push({
      line: lineNumber,
      text: currentText,
      tokenIds: currentTokenIds,
    });
    lineNumber += 1;
    column = 0;
    currentTokenIds = [];
    currentText = "";
  };

  // for...of 按码点迭代；char.length 是 1 或 2 个 UTF-16 码元，
  // 累加得到原文位置，不能用 split("") 拆代理对。
  let offset = 0;
  let previousWasCarriageReturn = false;

  for (const character of originalText) {
    const startUtf16 = offset;
    const endUtf16 = offset + character.length;
    offset = endUtf16;

    // CRLF 视为同一次换行：\r 已经当作边界，紧随的 \n 不再重复处理。
    if (character === "\n" && previousWasCarriageReturn) {
      previousWasCarriageReturn = false;
      continue;
    }
    previousWasCarriageReturn = character === "\r";

    if (character === "\n" || character === "\r") {
      sawBoundary = true;
      flushLine();
      continue;
    }
    if (BOUNDARY_SET.has(character)) {
      sawBoundary = true;
      flushLine();
      continue;
    }
    if (LAYOUT_SET.has(character)) {
      // 白名单排版字符：不占字位，也不进 notice；原文位置仍由 originalText 保留。
      continue;
    }
    if (isHanCharacter(character)) {
      column += 1;
      hanCount += 1;
      const tokenId = `l${lineNumber}c${column}`;
      tokens.push({
        tokenId,
        text: character,
        line: lineNumber,
        column,
        startUtf16,
        endUtf16,
      });
      currentTokenIds.push(tokenId);
      currentText += character;
      continue;
    }

    // 白名单之外的非字位内容：保留原文，记 notice，并要求人工确认。
    // 汉字重复记号与部首单独说明，避免把「不是独立字位」误报成「非汉字」。
    notices.push({
      code: "PARSE_UNSUPPORTED_CHARACTER",
      message: isNonIdeographicHan(character)
        ? `原文中的「${character}」是汉字重复记号/部首，不构成独立字位：已保留原文，需人工确认`
        : `保留原文中的非汉字内容「${character}」：不占格律字位，需人工确认后再分析`,
      startUtf16,
      endUtf16,
    });
    needsReview = true;
  }

  flushLine();

  if (tokens.length === 0) {
    notices.push({
      code: "PARSE_NO_HAN_TEXT",
      message: "原文没有可标注的汉字：不构造空诗句，请求校验层应拒绝无汉字输入",
      startUtf16: 0,
      endUtf16: originalText.length,
    });
    return {
      originalText,
      inputHash,
      lines: [],
      tokens: [],
      quality: "needs_review",
      notices,
    };
  }

  const firstLine = lines[0];
  const secondLine = lines[1];
  if (firstLine !== undefined && secondLine !== undefined) {
    const firstCount = firstLine.tokenIds.length;
    const secondCount = secondLine.tokenIds.length;
    // 保守启发式：首行明显短于第二行且不超过 8 字时提示“疑似标题”。
    // 只提示，不删除；不做作品识别，也不推断作者。
    if (firstCount <= 8 && firstCount < secondCount) {
      const range = tokenRange(firstLine.tokenIds, tokens);
      notices.push({
        code: "PARSE_SUSPECTED_TITLE",
        message:
          "首行结构疑似标题或题记：已原样保留，未删除；正文范围需人工确认",
        startUtf16: range.start,
        endUtf16: range.end,
      });
      needsReview = true;
    }
  }

  if (!sawBoundary && hanCount > 7) {
    notices.push({
      code: "PARSE_LINE_SPLIT_UNCERTAIN",
      message: `全文无句边界且汉字数为 ${hanCount}：不擅自按五/七言切分，需要先确认分句`,
      startUtf16: 0,
      endUtf16: originalText.length,
    });
    needsReview = true;
  }

  return {
    originalText,
    inputHash,
    lines,
    tokens,
    quality: needsReview ? "needs_review" : "ok",
    notices,
  };
}

function tokenRange(
  tokenIds: readonly string[],
  tokens: readonly ParsedToken[],
): { start: number; end: number } {
  const first = tokens.find((token) => token.tokenId === tokenIds[0]);
  const last = tokens.find(
    (token) => token.tokenId === tokenIds[tokenIds.length - 1],
  );
  return {
    start: first?.startUtf16 ?? 0,
    end: last?.endUtf16 ?? 0,
  };
}
