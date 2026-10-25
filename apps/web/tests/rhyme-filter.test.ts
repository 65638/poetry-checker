import { describe, expect, it } from "vitest";
import type { ReadingCandidate, RhymeWordsResponse } from "@poetry/contracts";
import { filterRhymeEntries } from "../src/app/rhymeFilter";

const candidate = (
  character: string,
  toneClass: ReadingCandidate["toneClass"],
  modernReading: ReadingCandidate["modernReading"] = null,
): ReadingCandidate => ({
  id: `${character}:${toneClass}:${modernReading?.pinyin ?? "none"}:${modernReading?.toneNumber ?? 0}`,
  character,
  book: "xinyun",
  toneClass,
  tone: null,
  groupIds: [],
  gloss: null,
  modernReading,
  fanqie: null,
  evidenceIds: [],
});
const modern = (
  pinyin: string,
  toneNumber: 1 | 2 | 3 | 4 | 5,
): NonNullable<ReadingCandidate["modernReading"]> => ({
  pinyin,
  toneNumber,
  evidenceIds: [],
});
const row = (...candidates: ReadingCandidate[]) => ({
  character: candidates[0]!.character,
  candidates,
});
const entries: RhymeWordsResponse["lookup"]["entries"] = [
  row(candidate("流", "yangping", modern("liu", 2))),
  row(
    candidate("绿", "qu", modern("lü", 4)),
    candidate("绿", "qu", modern("lu", 4)),
  ),
  row(
    candidate("女", "shang", modern("nü", 3)),
    candidate("女", "qu", modern("nü", 4)),
  ),
  row(candidate("露", "qu", modern("lu", 4))),
  row(
    candidate("上", "shang", modern("shang", 3)),
    candidate("上", "qu", modern("shang", 4)),
  ),
  row(
    candidate("行", "yangping", modern("hang", 2)),
    candidate("行", "qu", modern("xing", 4)),
  ),
  row(candidate("月", "ru")),
  row(candidate("清", "ping")),
  row(candidate("风", "yinping", modern("feng", 1))),
  row(candidate("的", "neutral", modern("de", 5))),
  row(candidate("某", "ze_unspecified")),
];
const characters = (query: string) =>
  filterRhymeEntries(entries, query).map((entry) => entry.character);

describe("完整同韵字格筛选", () => {
  it("空白保留原数组，汉字筛选保持原行对象、候选与顺序", () => {
    expect(filterRhymeEntries(entries, " \n \t")).toBe(entries);
    const result = filterRhymeEntries(entries, "绿");
    expect(result).toEqual([entries[1]]);
    expect(result[0]).toBe(entries[1]);
    expect(result[0]!.candidates).toHaveLength(2);
    expect(characters("不存在")).toEqual([]);
    expect(characters("constructor")).toEqual([]);
    expect(characters("__proto__")).toEqual([]);
    expect(characters("上")).toEqual(["上"]);
  });

  it("拼音接受无调、声调符号、数字和大小写，toneNumber是真实依据", () => {
    for (const query of ["liu", "liú", "LIU2", "liu\u03012"])
      expect(characters(query)).toEqual(["流"]);
    expect(characters("liu4")).toEqual([]);
    expect(characters("liù")).toEqual([]);
    expect(characters("liú4")).toEqual([]);
    expect(characters("li")).toEqual(["流"]);
  });

  it("ü、v和u:可互查，普通u不会被误当成ü", () => {
    for (const query of ["lv4", "lǜ", "lü4", "lu:4", "LV4"])
      expect(characters(query)).toEqual(["绿"]);
    expect(characters("lu4")).toEqual(["绿", "露"]);
    expect(characters("nu3")).toEqual([]);
    expect(characters("nv3")).toEqual(["女"]);
    expect(characters("nü4")).toEqual(["女"]);
  });

  it("带调或带数字的实际来源拼音同样可查，冲突数据不捏造带调结果", () => {
    const supplied = [
      row(candidate("滤", "qu", modern("lǜ", 4))),
      row(candidate("虑", "qu", modern("lv4", 4))),
      row(candidate("律", "ru", modern("lu:4", 4))),
      row(candidate("另", "qu", modern("lǜ", 2))),
    ];
    expect(
      filterRhymeEntries(supplied, "lv4").map((entry) => entry.character),
    ).toEqual(["滤", "虑", "律"]);
    expect(filterRhymeEntries(supplied, "lv2")).toEqual([]);
  });

  it("历史声类由toneClass区分，现代平声包括阴平阳平，轻声不冒充平仄", () => {
    expect(characters("平声")).toEqual(["流", "行", "清", "风"]);
    expect(characters("仄声")).toEqual([
      "绿",
      "女",
      "露",
      "上",
      "行",
      "月",
      "某",
    ]);
    expect(characters("入声")).toEqual(["月"]);
    expect(characters("上声")).toEqual(["女", "上"]);
    expect(characters("阴平")).toEqual(["风"]);
    expect(characters("阳平")).toEqual(["流", "行"]);
    expect(characters("轻声")).toEqual(["的"]);
    expect(characters("de0")).toEqual(["的"]);
    expect(characters("de5")).toEqual(["的"]);
    const historical = [row(candidate("律", "ru", modern("lü", 4)))];
    expect(filterRhymeEntries(historical, "去声")).toEqual([]);
    expect(filterRhymeEntries(historical, "入声 lv4")).toEqual(historical);
  });

  it("空格分词按AND，读音和声类必须来自同一候选，不把多音字的两音拼接", () => {
    expect(characters("  绿　lv4   去声 ")).toEqual(["绿"]);
    expect(characters("行 hang2 平声")).toEqual(["行"]);
    expect(characters("行 xing4 平声")).toEqual([]);
    expect(characters("女 nv3 去声")).toEqual([]);
    expect(characters("绿 露")).toEqual([]);
    expect(characters("平声 仄声")).toEqual([]);
  });

  it("未载现代读音仍能查汉字及声类，但不会猜测拼音", () => {
    expect(characters("月 入声")).toEqual(["月"]);
    expect(characters("yue4")).toEqual([]);
    expect(characters("qing 平声")).toEqual([]);
    const noCandidates = [{ character: "𠀀", candidates: [] }];
    expect(filterRhymeEntries(noCandidates, "𠀀")).toEqual(noCandidates);
    expect(filterRhymeEntries(noCandidates, "平声")).toEqual([]);
  });
});
