import { describe, expect, it } from "vitest";
import type {
  PoetryAssistantRequest,
  ReadingCandidate,
} from "@poetry/contracts";
import { buildRhymeNote } from "../src/app/rhymeNote";

const candidates: ReadingCandidate[] = [
  {
    id: "candidate:舟",
    character: "舟",
    book: "pingshui",
    toneClass: "ping",
    tone: "P",
    groupIds: ["group:尤"],
    modernReading: { pinyin: "zhou", toneNumber: 1, evidenceIds: [] },
    fanqie: null,
    gloss: null,
    evidenceIds: [],
  },
  {
    id: "candidate:愁",
    character: "愁",
    book: "pingshui",
    toneClass: "ping",
    tone: "P",
    groupIds: ["group:尤"],
    modernReading: null,
    fanqie: null,
    gloss: null,
    evidenceIds: [],
  },
];
const input: Extract<PoetryAssistantRequest, { task: "rhyme" }> = {
  task: "rhyme",
  text: "雨落孤城外，江心一叶浮。\n灯残人未寝，独自倚危楼。",
  rhymeBook: "pingshui",
  targetTokenId: "l2c5",
  readingId: "seed:浮",
  candidateIds: candidates.map((candidate) => candidate.id),
  intention: "借孤舟表达漂泊",
};
const matches = [
  {
    id: "candidate:舟",
    reason: "点明江中孤舟，漂泊感更具体，但弱化了浮动的姿态。",
  },
  { id: "candidate:愁", reason: "情绪更直白，但会削弱原句的画面感。" },
];

describe("可分享的同韵推敲笺", () => {
  it("使用成功请求的原诗、位置、意图及完整范围，保留逐项理由", () => {
    const result = buildRhymeNote(input, matches, [...candidates].reverse());
    expect(result).toBe(
      [
        "同韵推敲笺",
        "",
        "原诗：",
        input.text,
        "",
        "韵书：平水韵",
        "推敲位置：第2句句末",
        "推敲意图：借孤舟表达漂泊",
        "本次已遍历 2 个同韵读音候选。",
        "",
        "荐字与取舍：",
        "1. 舟（今读 zhōu）",
        matches[0]!.reason,
        "",
        "2. 愁",
        matches[1]!.reason,
        "",
        "AI建议仅供推敲参考，同韵不代表同义，也不保证全诗合律。",
      ].join("\n"),
    );
    for (const hidden of [
      "l2c5",
      "candidate:",
      "seed:",
      "group:",
      "inputHash",
      "model",
      "http",
    ])
      expect(result).not.toContain(hidden);
  });

  it("聚合范围超过120仍导出完整数量，不把批次上限当成全量限制", () => {
    const all = Array.from({ length: 241 }, (_, i) => ({
      ...candidates[0]!,
      id: `candidate:${i}`,
    }));
    const result = buildRhymeNote(
      { ...input, candidateIds: all.map((candidate) => candidate.id) },
      [{ id: all.at(-1)!.id, reason: "来自最后一批的建议。" }],
      all,
    );
    expect(result).toContain("已遍历 241 个同韵读音候选");
    expect(result).toContain("来自最后一批的建议。");
  });

  it("没有推荐时允许保留原字，没有意图时不显示空标题", () => {
    const withoutIntention = { ...input };
    delete withoutIntention.intention;
    const result = buildRhymeNote(withoutIntention, [], candidates);
    expect(result).toContain("本次未建议替换，可保留原字。");
    expect(result).not.toContain("推敲意图：");
    expect(result).not.toContain("荐字与取舍：");
  });

  it("三种韵书均用中文名且候选必须属于对应韵书", () => {
    for (const [book, name] of [
      ["pingshui", "平水韵"],
      ["cilin", "词林正韵"],
      ["xinyun", "中华新韵"],
    ] as const)
      expect(
        buildRhymeNote(
          { ...input, rhymeBook: book },
          matches,
          candidates.map((candidate) => ({ ...candidate, book })),
        ),
      ).toContain(`韵书：${name}`);
  });

  it("异常位置拒绝导出，错误消息不泄露原始ID", () => {
    for (const targetTokenId of [
      "raw-secret-id",
      "l0c2",
      "l2c0",
      "l02c5",
      "l2c5extra",
      "l99999999999999999c5",
    ])
      expect(() =>
        buildRhymeNote({ ...input, targetTokenId }, matches, candidates),
      ).toThrow("荐字对应的句末位置不完整，暂不能导出。");
  });

  it("拒绝重复或越界建议以及空理由，不导出半份成功结果", () => {
    for (const bad of [
      [matches[0]!, matches[0]!],
      [matches[0]!, { id: "outside", reason: "伪造候选" }],
      [{ ...matches[0]!, reason: "  " }],
    ])
      expect(() => buildRhymeNote(input, bad, candidates)).toThrow(
        "荐字结果含重复、范围外或不完整建议",
      );
  });

  it("拒绝缺失、多余、重复、异韵书候选及重复输入范围", () => {
    for (const bad of [
      candidates.slice(0, 1),
      [...candidates, { ...candidates[0]!, id: "extra" }],
      [candidates[0]!, candidates[0]!],
      candidates.map((candidate) => ({ ...candidate, book: "cilin" as const })),
    ])
      expect(() => buildRhymeNote(input, matches, bad)).toThrow(
        "候选资料与本次荐字范围不一致",
      );
    expect(() =>
      buildRhymeNote(
        { ...input, candidateIds: [candidates[0]!.id, candidates[0]!.id] },
        matches,
        candidates,
      ),
    ).toThrow("候选资料与本次荐字范围不一致");
  });
});
