/**
 * 拼音正规化：调号/调值 → 调类，声母/韵母拆分，y/w 零声母、ü/v/u:、j/q/x 后 ü、
 * iu/ui/un 省写、舌尖元音与普通 i 的区别，全部显式处理。
 *
 * 绝不“取拼音末尾字符串猜韵部”：韵部由 (声母, 韵母) 决定，声母参与舌尖元音判定。
 */

/** 已核定的调类标记；未写调号按轻声处理并记录 toneMarked=false。 */
const TONE_MARKS: Record<string, readonly [string, string, string, string]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
};

export type ToneNumber = 1 | 2 | 3 | 4 | 5;

export type PinyinRejectReason =
  | "EMPTY"
  | "NOT_LATIN"
  | "MULTIPLE_TONES"
  | "VOWEL_LESS"
  | "UNKNOWN_LETTER";

export interface Syllable {
  /** 原始写法，保留以便回溯。 */
  raw: string;
  /** 正规化后为零声母时为空串。 */
  initial: string;
  /** 正规化韵母：iu→iou、ui→uei、un→uen，ü 统一写作 ü。 */
  final: string;
  toneNumber: ToneNumber;
  /** 是否有调号或调值；false 表示来源只写了轻声形态。 */
  toneMarked: boolean;
}

export type PinyinParseResult =
  | { ok: true; syllable: Syllable }
  | { ok: false; reason: PinyinRejectReason; detail: string };

const TWO_LETTER_INITIALS = ["zh", "ch", "sh"] as const;
const ONE_LETTER_INITIALS = [
  "b",
  "p",
  "m",
  "f",
  "d",
  "t",
  "n",
  "l",
  "g",
  "k",
  "h",
  "j",
  "q",
  "x",
  "r",
  "z",
  "c",
  "s",
] as const;

const RETROFLEX_OR_DENTAL = new Set(["z", "c", "s", "zh", "ch", "sh", "r"]);

/** y/w 零声母写法 → 韵母原文（仍是省写前的表层形式）。 */
const ZERO_INITIAL_FINALS: Record<string, string> = {
  yi: "i",
  yin: "in",
  ying: "ing",
  ya: "ia",
  ye: "ie",
  yao: "iao",
  you: "iou",
  yan: "ian",
  yang: "iang",
  yong: "iong",
  yo: "io",
  yu: "ü",
  yue: "üe",
  yuan: "üan",
  yun: "ün",
  wu: "u",
  wa: "ua",
  wo: "uo",
  wai: "uai",
  wei: "uei",
  wan: "uan",
  wen: "uen",
  wang: "uang",
  weng: "ueng",
};

function isVowel(character: string): boolean {
  return character in TONE_MARKS;
}

/**
 * 拆分调号与基本字母。返回基础串（可能含 ü/v/u:）和调类。
 */
function stripTone(raw: string): {
  base: string;
  toneNumber: ToneNumber;
  toneMarked: boolean;
  reason?: PinyinRejectReason;
  detail?: string;
} {
  let base = "";
  let toneNumber: ToneNumber = 5;
  let toneMarked = false;
  let reason: PinyinRejectReason | undefined;
  let detail: string | undefined;

  for (const character of raw) {
    let matched = false;
    for (const [plain, marks] of Object.entries(TONE_MARKS)) {
      const index = marks.indexOf(character);
      if (index >= 0) {
        if (toneMarked) {
          reason = "MULTIPLE_TONES";
          detail = `多个调号：${raw}`;
        }
        toneMarked = true;
        toneNumber = (index + 1) as ToneNumber;
        base += plain;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (/[0-9]/u.test(character)) {
      if (toneMarked) {
        reason = "MULTIPLE_TONES";
        detail = `调号与调值同时出现：${raw}`;
      }
      const value = Number(character);
      if (value >= 1 && value <= 5) {
        toneMarked = true;
        toneNumber = value as ToneNumber;
        continue;
      }
      reason = "UNKNOWN_LETTER";
      detail = `非法调值：${character}`;
      continue;
    }
    const lowered = character.toLowerCase();
    if (lowered === ":") {
      // u: 写法：把前一个 u 改成 ü
      if (base.endsWith("u")) base = `${base.slice(0, -1)}ü`;
      else {
        reason = "UNKNOWN_LETTER";
        detail = `冒号不跟在 u 后：${raw}`;
      }
      continue;
    }
    if (lowered === "v") {
      base += "ü";
      continue;
    }
    if (lowered === "ü") {
      base += "ü";
      continue;
    }
    if (/[a-z]/u.test(lowered)) {
      base += lowered;
      continue;
    }
    reason = "UNKNOWN_LETTER";
    detail = `无法识别的字符：${character}`;
  }

  return { base, toneNumber, toneMarked, reason, detail };
}

function splitInitial(base: string): { initial: string; rest: string } {
  for (const initial of TWO_LETTER_INITIALS) {
    if (base.startsWith(initial)) {
      return { initial, rest: base.slice(initial.length) };
    }
  }
  for (const initial of ONE_LETTER_INITIALS) {
    if (base.startsWith(initial)) {
      return { initial, rest: base.slice(initial.length) };
    }
  }
  return { initial: "", rest: base };
}

/** j/q/x 后的 u 实际是 ü；iu/ui/un 省写对所有声母都要展开（如 qiu → iou）。 */
function normalizeRest(initial: string, rest: string): string {
  let surface = rest;
  if (initial === "j" || initial === "q" || initial === "x") {
    if (surface === "u") surface = "ü";
    else if (surface === "ue") surface = "üe";
    else if (surface === "uan") surface = "üan";
    else if (surface === "un") surface = "ün";
  }
  if (surface === "iu") return "iou";
  if (surface === "ui") return "uei";
  if (surface === "un") return "uen";
  return surface;
}

export function parsePinyin(raw: string): PinyinParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "EMPTY", detail: "空拼音" };
  }

  const stripped = stripTone(trimmed);
  if (stripped.reason !== undefined) {
    return {
      ok: false,
      reason: stripped.reason,
      detail: stripped.detail ?? trimmed,
    };
  }
  if (stripped.base.length === 0) {
    return { ok: false, reason: "VOWEL_LESS", detail: trimmed };
  }
  if (!/[aeiouü]/u.test(stripped.base)) {
    return { ok: false, reason: "VOWEL_LESS", detail: trimmed };
  }

  const zeroInitial = ZERO_INITIAL_FINALS[stripped.base];
  if (zeroInitial !== undefined) {
    return {
      ok: true,
      syllable: {
        raw: trimmed,
        initial: "",
        final: zeroInitial,
        toneNumber: stripped.toneNumber,
        toneMarked: stripped.toneMarked,
      },
    };
  }

  const { initial, rest } = splitInitial(stripped.base);
  if (initial === "y" || initial === "w") {
    return {
      ok: false,
      reason: "UNKNOWN_LETTER",
      detail: `未覆盖的 y/w 组合：${trimmed}`,
    };
  }
  const final = normalizeRest(initial, rest);
  if (final.length === 0) {
    return { ok: false, reason: "VOWEL_LESS", detail: trimmed };
  }
  return {
    ok: true,
    syllable: {
      raw: trimmed,
      initial,
      final,
      toneNumber: stripped.toneNumber,
      toneMarked: stripped.toneMarked,
    },
  };
}

/** 舌尖元音（-i）只出现在 z/c/s/zh/ch/sh/r 之后，与普通 i 分属不同韵部。 */
export function isApicalInitial(initial: string): boolean {
  return RETROFLEX_OR_DENTAL.has(initial);
}

export function isVowelLetter(character: string): boolean {
  return isVowel(character);
}
