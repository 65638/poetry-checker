import { describe, expect, it } from "vitest";

import {
  XINYUN_RULE_PROVENANCE,
  XINYUN_RULES_VERSION,
  assignYun,
  createLexicon,
  parsePinyin,
} from "../src/index.js";
import type { PinyinParseResult, Syllable } from "../src/index.js";

import {
  FIXTURE_VERSION,
  XINYUN_FIXTURE_VERSION,
  pingshuiFixture,
  xinyunFixture,
} from "./fixtures.js";

function syllableOf(raw: string): Syllable {
  const parsed: PinyinParseResult = parsePinyin(raw);
  if (!parsed.ok) throw new Error(`${raw} 解析失败：${parsed.reason}`);
  return parsed.syllable;
}

describe("新韵重建：拼音正规化", () => {
  const cases: ReadonlyArray<
    readonly [string, string, string, 1 | 2 | 3 | 4 | 5]
  > = [
    ["bái", "b", "ai", 2],
    ["xué", "x", "üe", 2],
    ["xuě", "x", "üe", 3],
    ["jiǒng", "j", "iong", 3],
    ["jù", "j", "ü", 4],
    ["lǜ", "l", "ü", 4],
    ["nv3", "n", "ü", 3],
    ["nu:4", "n", "ü", 4],
    ["yī", "", "i", 1],
    ["wù", "", "u", 4],
    ["liú", "l", "iou", 2],
    ["guī", "g", "uei", 1],
    ["lún", "l", "uen", 2],
    ["jūn", "j", "ün", 1],
    ["zhī", "zh", "i", 1],
    ["ér", "", "er", 2],
    ["wēng", "", "ueng", 1],
    ["è", "", "e", 4],
  ];

  it.each(cases)("%s → %s + %s（第 %s 声）", (raw, initial, final, tone) => {
    const syllable = syllableOf(raw);
    expect(syllable.initial).toBe(initial);
    expect(syllable.final).toBe(final);
    expect(syllable.toneNumber).toBe(tone);
    expect(syllable.toneMarked).toBe(true);
  });

  it("拒绝无法可靠归部的写法，而不是猜", () => {
    const empty = parsePinyin("");
    expect(empty.ok).toBe(false);
    const noVowel = parsePinyin("hm");
    expect(noVowel).toMatchObject({ ok: false, reason: "VOWEL_LESS" });
    const twoTones = parsePinyin("bái2");
    expect(twoTones).toMatchObject({ ok: false, reason: "MULTIPLE_TONES" });
    const junk = parsePinyin("zhi?");
    expect(junk).toMatchObject({ ok: false, reason: "UNKNOWN_LETTER" });
  });

  it("未写调号按轻声处理，并标记来源没有调号", () => {
    const syllable = syllableOf("de");
    expect(syllable.toneNumber).toBe(5);
    expect(syllable.toneMarked).toBe(false);
  });
});

describe("新韵重建：十四韵归部", () => {
  it.each([
    ["bái", "四开", "yangping", "P"],
    ["xuě", "三皆", "shang", "Z"],
    ["wù", "十四姑", "qu", "Z"],
    ["yī", "十二齐", "yinping", "P"],
    ["gēng", "十一庚", "yinping", "P"],
    ["gèng", "十一庚", "qu", "Z"],
    ["liú", "七尤", "yangping", "P"],
    ["lóu", "七尤", "yangping", "P"],
  ] as const)("%s → %s（%s）", (raw, yun, toneClass, tone) => {
    const assignment = assignYun(syllableOf(raw));
    expect(assignment.ok).toBe(true);
    if (!assignment.ok) return;
    expect(assignment.assignment.yun).toBe(yun);
    expect(assignment.assignment.toneClass).toBe(toneClass);
    expect(assignment.assignment.tone).toBe(tone);
  });

  it("舌尖元音与普通 i 分属十三支与十二齐", () => {
    const apical = assignYun(syllableOf("zhī"));
    const plain = assignYun(syllableOf("jī"));
    expect(apical.ok && apical.assignment.yun).toBe("十三支");
    expect(plain.ok && plain.assignment.yun).toBe("十二齐");
  });

  it("er 的归部标为待核实项", () => {
    const assignment = assignYun(syllableOf("ér"));
    expect(assignment.ok).toBe(true);
    if (!assignment.ok) return;
    expect(assignment.assignment.yun).toBe("十二齐");
    expect(assignment.assignment.ruleUnverified).toBe(true);
  });

  it("轻声不默认归平：tone 为 null", () => {
    const assignment = assignYun(syllableOf("de"));
    expect(assignment.ok).toBe(true);
    if (!assignment.ok) return;
    expect(assignment.assignment.toneClass).toBe("neutral");
    expect(assignment.assignment.tone).toBeNull();
  });

  it("韵母不在对照表内时明确未映射", () => {
    const assignment = assignYun(syllableOf("yo"));
    expect(assignment).toMatchObject({
      ok: false,
      reason: "FINAL_NOT_IN_RULES",
    });
  });

  it("规则出处状态为待核实，版本号可追溯", () => {
    expect(XINYUN_RULE_PROVENANCE.status).toBe("unverified");
    expect(XINYUN_RULE_PROVENANCE.distinctFrom).toContain("中华通韵");
    expect(XINYUN_RULES_VERSION).toMatch(/^xinyun-14-rules/u);
  });
});

describe("A-D1-09 新韵多读/冲突与旧韵入声", () => {
  const lexicon = () => createLexicon([pingshuiFixture(), xinyunFixture()]);
  const sample = ["白", "一", "更", "雪", "物"];

  it("旧韵入声与新韵本调各自保留证据，不跨书覆盖", async () => {
    const instance = lexicon();
    const old = await instance.lookupCharacters({
      characters: [...sample],
      rhymeBook: "pingshui",
      dataVersion: FIXTURE_VERSION,
    });
    const modern = await instance.lookupCharacters({
      characters: [...sample],
      rhymeBook: "xinyun",
      dataVersion: XINYUN_FIXTURE_VERSION,
    });

    const oldBai =
      old.entries.find((entry) => entry.character === "白")?.candidates ?? [];
    const newBai =
      modern.entries.find((entry) => entry.character === "白")?.candidates ??
      [];
    expect(oldBai.map((item) => item.toneClass)).toEqual(["ru"]);
    expect(oldBai.map((item) => item.tone)).toEqual(["Z"]);
    expect(newBai.map((item) => item.toneClass)).toEqual(["yangping"]);
    expect(newBai.map((item) => item.tone)).toEqual(["P"]);

    expect(old.book).toBe("pingshui");
    expect(modern.book).toBe("xinyun");
    expect(oldBai[0]?.book).toBe("pingshui");
    expect(newBai[0]?.book).toBe("xinyun");

    const oldEvidence = new Set(old.evidence.map((item) => item.id));
    const overlap = modern.evidence.filter((item) => oldEvidence.has(item.id));
    expect(overlap).toEqual([]);
    expect(old.dataVersion).not.toBe(modern.dataVersion);
  });

  it("新韵“一”的多读冲突单列保留，不静默覆盖", async () => {
    const instance = lexicon();
    const modern = await instance.lookupCharacters({
      characters: ["一"],
      rhymeBook: "xinyun",
      dataVersion: XINYUN_FIXTURE_VERSION,
    });
    const candidates =
      modern.entries.find((entry) => entry.character === "一")?.candidates ??
      [];
    expect(candidates).toHaveLength(2);
    // 候选按 id 升序稳定输出："一-qu" 先于 "一-yinping"。
    expect(candidates.map((item) => item.toneClass)).toEqual(["qu", "yinping"]);
    expect(candidates.map((item) => item.tone)).toEqual(["Z", "P"]);
    expect(new Set(candidates.map((item) => item.id)).size).toBe(2);
    expect(new Set(candidates.flatMap((item) => item.evidenceIds)).size).toBe(
      2,
    );

    const old = await instance.lookupCharacters({
      characters: ["一"],
      rhymeBook: "pingshui",
      dataVersion: FIXTURE_VERSION,
    });
    const oldCandidates =
      old.entries.find((entry) => entry.character === "一")?.candidates ?? [];
    expect(oldCandidates.map((item) => item.toneClass)).toEqual(["ru"]);
  });

  it("不按旧韵部整部迁移：白在旧韵入声、在新韵四开", async () => {
    const instance = lexicon();
    const old = await instance.lookupCharacters({
      characters: ["白"],
      rhymeBook: "pingshui",
      dataVersion: FIXTURE_VERSION,
    });
    const modern = await instance.lookupCharacters({
      characters: ["白"],
      rhymeBook: "xinyun",
      dataVersion: XINYUN_FIXTURE_VERSION,
    });
    expect(old.groups.map((group) => group.name)).toEqual(["入声十一陌"]);
    expect(modern.groups.map((group) => group.name)).toEqual(["四开·阳平"]);
  });
});
