/**
 * 中华新韵（十四韵）归部规则 —— 项目重建表，非官方原始字表。
 *
 * 规则状态：十四韵“韵母 → 韵部”对照是本项目按通行十四韵方案整理并显式编码的，
 * 其权威文本出处（学会/规范文件的可定位版次与页码）尚未取得，规则出处列为待核实；
 * 因此本表产出只作为“重建表”，不得标为已审核发布数据。
 *
 * 已知与中华通韵不同：中华通韵另有十六韵分法，不能与本表互换。
 */
import type { Tone } from "@poetry/contracts";

import { isApicalInitial, type Syllable, type ToneNumber } from "./pinyin.js";

/** 生成器版本；与 dataVersion、规则版本一起写进快照描述。 */
export const XINYUN_GENERATOR_VERSION = "xinyun-rebuild-gen/0.2.0";

export const XINYUN_RULES_VERSION = "xinyun-14-rules-d1";

/** 规则出处状态。未取得权威文本，不得写成“已核实”。 */
export const XINYUN_RULE_PROVENANCE = {
  status: "unverified" as const,
  scheme: "中华新韵十四韵（一麻…十四姑）",
  distinctFrom: "中华通韵（十六韵）不得与本表互换",
  note: "韵母→韵部对照为本项目显式编码；权威规则文本（发布机构、版次、页码）尚未取得，已在 docs/data-quality.md 列为待核实。",
} as const;

export type XinyunToneClass =
  | "yinping"
  | "yangping"
  | "shang"
  | "qu"
  | "neutral";

export interface YunAssignment {
  /** 十四韵名，例如 十二齐。 */
  yun: string;
  toneClass: XinyunToneClass;
  /** 本调平仄：一二声为 P，三四声为 Z；轻声无可靠本调时为 null。 */
  tone: Tone | null;
  /** 该韵部在本表中的规则依据是否为待核实项。 */
  ruleUnverified: boolean;
}

export type XinyunAssignResult =
  | { ok: true; assignment: YunAssignment }
  | { ok: false; reason: XinyunAssignFailure; detail: string };

export type XinyunAssignFailure =
  | "FINAL_NOT_IN_RULES"
  | "NEUTRAL_TONE_NO_BASE_TONE"
  | "APICAL_FINAL_UNEXPECTED";

interface FinalRule {
  yun: string;
  ruleUnverified?: boolean;
  note?: string;
}

/** 韵母（正规化后，含 iou/uei/uen）→ 十四韵。 */
const FINAL_TO_YUN: Record<string, FinalRule> = {
  a: { yun: "一麻" },
  ia: { yun: "一麻" },
  ua: { yun: "一麻" },
  o: { yun: "二波" },
  e: { yun: "二波" },
  uo: { yun: "二波" },
  ie: { yun: "三皆" },
  üe: { yun: "三皆" },
  ai: { yun: "四开" },
  uai: { yun: "四开" },
  ei: { yun: "五微" },
  uei: { yun: "五微" },
  ao: { yun: "六豪" },
  iao: { yun: "六豪" },
  ou: { yun: "七尤" },
  iou: { yun: "七尤" },
  an: { yun: "八寒" },
  ian: { yun: "八寒" },
  uan: { yun: "八寒" },
  üan: { yun: "八寒" },
  en: { yun: "九文" },
  in: { yun: "九文" },
  uen: { yun: "九文" },
  ün: { yun: "九文" },
  ang: { yun: "十唐" },
  iang: { yun: "十唐" },
  uang: { yun: "十唐" },
  eng: { yun: "十一庚" },
  ing: { yun: "十一庚" },
  ong: { yun: "十一庚" },
  iong: { yun: "十一庚" },
  ueng: { yun: "十一庚" },
  i: { yun: "十二齐" },
  ü: { yun: "十二齐" },
  er: {
    yun: "十二齐",
    ruleUnverified: true,
    note: "er 的归部（十二齐）为待核实项：口径文本未取得。",
  },
  u: { yun: "十四姑" },
};

/** 舌尖元音 -i：只在 z/c/s/zh/ch/sh/r 后出现，归十三支。 */
const APICAL_YUN: FinalRule = { yun: "十三支" };

const TONE_CLASS_BY_NUMBER: Record<ToneNumber, XinyunToneClass> = {
  1: "yinping",
  2: "yangping",
  3: "shang",
  4: "qu",
  5: "neutral",
};

export function toneOfToneClass(toneClass: XinyunToneClass): Tone | null {
  if (toneClass === "yinping" || toneClass === "yangping") return "P";
  if (toneClass === "shang" || toneClass === "qu") return "Z";
  return null;
}

export function assignYun(syllable: Syllable): XinyunAssignResult {
  const toneClass = TONE_CLASS_BY_NUMBER[syllable.toneNumber];

  let rule: FinalRule | undefined;
  if (syllable.final === "i") {
    rule = isApicalInitial(syllable.initial) ? APICAL_YUN : FINAL_TO_YUN.i;
  } else {
    rule = FINAL_TO_YUN[syllable.final];
  }

  if (rule === undefined) {
    return {
      ok: false,
      reason: "FINAL_NOT_IN_RULES",
      detail: `韵母 ${syllable.final}（声母 ${syllable.initial || "零"}）不在十四韵对照表内：${syllable.raw}`,
    };
  }

  const tone = toneOfToneClass(toneClass);
  return {
    ok: true,
    assignment: {
      yun: rule.yun,
      toneClass,
      tone,
      ruleUnverified: rule.ruleUnverified === true,
    },
  };
}

/** 供报告使用：未映射原因的中文说明。 */
export function describeAssignFailure(failure: XinyunAssignFailure): string {
  if (failure === "FINAL_NOT_IN_RULES") return "韵母不在十四韵对照表内";
  if (failure === "NEUTRAL_TONE_NO_BASE_TONE") return "轻声缺可靠本调";
  return "舌尖元音判定异常";
}
