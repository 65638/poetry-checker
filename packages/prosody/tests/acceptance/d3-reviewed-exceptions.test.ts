import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  AnnotatedPoem,
  AnnotatedToken,
  BookId,
  Evidence,
  Finding,
  GenreDecision,
  ProsodyReport,
  SourceRecord,
  Tone,
  WorkMetadata,
} from "@poetry/contracts";
import {
  FROZEN_RULE_IDS,
  applyReviewedWorkExceptions,
  checkReportClosure,
  evaluateProsody,
  matchTemplates,
  parseReviewedWorkExceptions,
} from "../../src/index.js";
import { makeCodePoem } from "./fixtures.js";

// D3 已审特例独立验收（C 独立预期；不从实现输出反推）。
// 依据：docs/reviews/13_J03三首核心诗逐字人审_第二批.md §五 第 8 条 + §六 第 2 项。
// 范围：仅平水版《黄鹤楼》l4c5–7 TAIL.SANPING；不是拗救、不豁免其他规则、不改判古体。
// 例外记录与函数由 Codex 提供（rules/exceptions/reviewed-works-v1.json、src/reviewed-exceptions/），
// C 只做公共导出、独立断言与规则说明，不编辑实现。

const FINGERPRINT =
  "7b65737ca79258301a2dd35cd880c41020415945c1ea006478eaf816edbf47a2";

type Row = readonly [string, string, "P" | "Z", string, "unique" | "context_rule" | "user"];

const HH_ROWS: readonly Row[] = [
  ["l1c1", "昔", "Z", "pingshui:昔:ru:入声十一陌", "unique"],
  ["l1c2", "人", "P", "pingshui:人:ping:十一真", "unique"],
  ["l1c3", "已", "Z", "pingshui:已:shang:四纸", "unique"],
  ["l1c4", "乘", "P", "pingshui:乘:ping:十蒸", "context_rule"],
  ["l1c5", "黄", "P", "pingshui:黄:ping:七阳", "unique"],
  ["l1c6", "鹤", "Z", "pingshui:鹤:ru:入声十药", "unique"],
  ["l1c7", "去", "Z", "pingshui:去:qu:六御", "unique"],
  ["l2c1", "此", "Z", "pingshui:此:shang:四纸", "unique"],
  ["l2c2", "地", "Z", "pingshui:地:qu:四寘", "unique"],
  ["l2c3", "空", "P", "pingshui:空:ping:一东", "context_rule"],
  ["l2c4", "余", "P", "pingshui:余:ping:六鱼", "unique"],
  ["l2c5", "黄", "P", "pingshui:黄:ping:七阳", "unique"],
  ["l2c6", "鹤", "Z", "pingshui:鹤:ru:入声十药", "unique"],
  ["l2c7", "楼", "P", "pingshui:楼:ping:十一尤", "unique"],
  ["l3c1", "黄", "P", "pingshui:黄:ping:七阳", "unique"],
  ["l3c2", "鹤", "Z", "pingshui:鹤:ru:入声十药", "unique"],
  ["l3c3", "一", "Z", "pingshui:一:ru:入声四质", "unique"],
  ["l3c4", "去", "Z", "pingshui:去:qu:六御", "unique"],
  ["l3c5", "不", "Z", "pingshui:不:ru:入声五物", "context_rule"],
  ["l3c6", "复", "Z", "pingshui:复:qu:二十六宥", "unique"],
  ["l3c7", "返", "Z", "pingshui:返:shang:十三阮", "unique"],
  ["l4c1", "白", "Z", "pingshui:白:ru:入声十一陌", "unique"],
  ["l4c2", "云", "P", "pingshui:云:ping:十二文", "unique"],
  ["l4c3", "千", "P", "pingshui:千:ping:一先", "unique"],
  ["l4c4", "载", "Z", "pingshui:载:qu:十一队", "unique"],
  ["l4c5", "空", "P", "pingshui:空:ping:一东", "context_rule"],
  ["l4c6", "悠", "P", "pingshui:悠:ping:十一尤", "unique"],
  ["l4c7", "悠", "P", "pingshui:悠:ping:十一尤", "unique"],
  ["l5c1", "晴", "P", "pingshui:晴:ping:八庚", "unique"],
  ["l5c2", "川", "P", "pingshui:川:ping:一先", "unique"],
  ["l5c3", "历", "Z", "pingshui:历:ru:入声十二锡", "unique"],
  ["l5c4", "历", "Z", "pingshui:历:ru:入声十二锡", "unique"],
  ["l5c5", "汉", "Z", "pingshui:汉:qu:十五翰", "context_rule"],
  ["l5c6", "阳", "P", "pingshui:阳:ping:七阳", "unique"],
  ["l5c7", "树", "Z", "pingshui:树:qu:七遇", "unique"],
  ["l6c1", "芳", "P", "pingshui:芳:ping:七阳", "unique"],
  ["l6c2", "草", "Z", "pingshui:草:shang:十九皓", "unique"],
  ["l6c3", "萋", "P", "pingshui:萋:ping:八齐", "unique"],
  ["l6c4", "萋", "P", "pingshui:萋:ping:八齐", "unique"],
  ["l6c5", "鹦", "P", "pingshui:鹦:ping:八庚", "unique"],
  ["l6c6", "鹉", "Z", "pingshui:鹉:shang:七麌", "unique"],
  ["l6c7", "洲", "P", "pingshui:洲:ping:十一尤", "unique"],
  ["l7c1", "日", "Z", "pingshui:日:ru:入声四质", "unique"],
  ["l7c2", "暮", "Z", "pingshui:暮:qu:七遇", "unique"],
  ["l7c3", "乡", "P", "pingshui:乡:ping:七阳", "context_rule"],
  ["l7c4", "关", "P", "pingshui:关:ping:十五删", "unique"],
  ["l7c5", "何", "P", "pingshui:何:ping:五歌", "unique"],
  ["l7c6", "处", "Z", "pingshui:处:qu:六御", "unique"],
  ["l7c7", "是", "Z", "pingshui:是:shang:四纸", "unique"],
  ["l8c1", "烟", "P", "pingshui:烟:ping:一先", "unique"],
  ["l8c2", "波", "P", "pingshui:波:ping:五歌", "unique"],
  ["l8c3", "江", "P", "pingshui:江:ping:三江", "unique"],
  ["l8c4", "上", "Z", "pingshui:上:qu:二十三漾", "unique"],
  ["l8c5", "使", "Z", "pingshui:使:qu:四寘", "unique"],
  ["l8c6", "人", "P", "pingshui:人:ping:十一真", "unique"],
  ["l8c7", "愁", "P", "pingshui:愁:ping:十一尤", "unique"],
];

const HH_LINES = Array.from({ length: 8 }, (_, index) =>
  HH_ROWS.slice(index * 7, index * 7 + 7),
);

function buildPoem(options: { text?: string; book?: BookId; userOverrideAt?: string } = {}): AnnotatedPoem {
  const book = options.book ?? "pingshui";
  const plain = HH_LINES.map((line) => line.map((row) => row[1]).join("")).join("");
  const text = options.text ?? plain;
  // 按原文字符序列给汉字分配 UTF-16 偏移；标点不算 token。
  const positions: Array<{ index: number; char: string }> = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (/\p{Script=Han}/u.test(char)) positions.push({ index: i, char });
  }
  if (positions.map((item) => item.char).join("") !== plain) {
    throw new Error("测试正文改动过度：汉字序列必须仍为黄鹤楼固定正文");
  }

  const tokens: AnnotatedToken[] = HH_ROWS.map((row, offset) => {
    const [tokenId, char, tone, candidateId, method] = row;
    const position = positions[offset]!;
    const line = Math.floor(offset / 7) + 1;
    const column = (offset % 7) + 1;
    const cls = candidateId.split(":")[2] as "ping" | "shang" | "qu" | "ru";
    return {
      tokenId,
      text: char,
      line,
      column,
      startUtf16: position.index,
      endUtf16: position.index + 1,
      candidates: [
        {
          id: candidateId,
          character: char,
          book,
          toneClass: cls,
          tone: tone as Tone,
          groupIds: [],
          gloss: null,
          modernReading: null,
          fanqie: null,
          evidenceIds: [],
        },
      ],
      effectiveCandidateIds: [candidateId],
      readingStatus: "resolved",
      selectedReadingId: candidateId,
      selectionMethod: tokenId === options.userOverrideAt ? "user" : method,
      possibleTones: [tone as Tone],
      toneStatus: "resolved",
      tone: tone as Tone,
      reason: method === "context_rule" ? "13_J03 第二批人工裁定采用该读音" : "平水韵唯一候选",
      evidenceIds: [],
    };
  });

  return {
    originalText: text,
    inputHash: "b".repeat(64),
    lines: HH_LINES.map((line, index) => ({
      line: index + 1,
      text: line.map((row) => row[1]).join(""),
      tokenIds: line.map((row) => row[0]),
    })),
    tokens,
    quality: "ok",
    notices: [],
    book,
  };
}

const EXCEPTIONS = parseReviewedWorkExceptions(
  JSON.parse(
    readFileSync(
      new URL("../../../../rules/exceptions/reviewed-works-v1.json", import.meta.url),
      "utf8",
    ),
  ),
);

const SOURCES: SourceRecord[] = [
  {
    id: "src:j03-review-batch2",
    title: "J03 三首核心诗逐字人审·第二批（13 号记录）",
    edition: null,
    url: null,
    license: "内部人审记录（课程项目）",
    snapshotSha256: null,
    revision: "13",
    retrievedAt: null,
  },
];

function evidenceSet(overrides: { contextStatus?: "approved" | "unverified"; workStatus?: "approved" | "unverified" } = {}): Evidence[] {
  return [
    {
      id: "ctx:j03b2:08",
      sourceId: "src:j03-review-batch2",
      kind: "context",
      locator: "docs/reviews/13_J03三首核心诗逐字人审_第二批.md §五 第 8 条",
      assertion:
        "「白云千载空悠悠」之「空」取平声，尾三字平平平成立；作本诗古风式律诗特征保留，不据近体正格判出律。",
      excerpt: null,
      reviewStatus: overrides.contextStatus ?? "approved",
    },
    {
      id: "ev:work:huanghelou:j03",
      sourceId: "src:j03-review-batch2",
      kind: "work_metadata",
      locator: "docs/reviews/13_J03三首核心诗逐字人审_第二批.md §二 第 11 条",
      assertion: "《黄鹤楼》七律形式与特殊拗律说明（E 定版 a27bf53，组长确认）。",
      excerpt: null,
      reviewStatus: overrides.workStatus ?? "approved",
    },
  ];
}

function works(overrides: { reviewStatus?: "approved" | "unverified"; fingerprints?: string[] } = {}): WorkMetadata[] {
  return [
    {
      id: "work:huanghelou",
      title: "黄鹤楼",
      author: "崔颢",
      approvedTextFingerprints: overrides.fingerprints ?? [FINGERPRINT],
      formFamily: "regulated",
      formId: "qilv",
      historicalTags: ["特殊拗律"],
      evidenceIds: ["ev:work:huanghelou:j03"],
      reviewStatus: overrides.reviewStatus ?? "approved",
    },
  ];
}

function bestQilv(poem: AnnotatedPoem): string {
  const candidates = matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" });
  const qilv = candidates.filter((candidate) => String(candidate.formId).startsWith("qilv"));
  if (qilv.length === 0) throw new Error("未得到七律候选；输入或模板表异常");
  return [...qilv].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]!.id;
}

interface RunOptions {
  fingerprint?: string;
  evidence?: Evidence[];
  works?: WorkMetadata[];
  sources?: SourceRecord[];
}

/** 已审作品元数据驱动的体裁决策；供 run 与“冻结输入”用例共用，避免两处口径漂移。 */
function reviewedGenre(
  candidates: ReturnType<typeof matchTemplates>,
  selectedTemplateId: string,
): GenreDecision {
  return {
    formFamily: "regulated",
    formId: "qilv",
    historicalTags: ["特殊拗律"],
    applicability: "applicable",
    basisType: "reviewed_metadata",
    candidateTemplateIds: candidates.map((candidate) => candidate.id),
    selectedTemplateId,
    reasons: ["已审作品元数据（E 定版，组长确认）"],
    evidenceIds: ["ev:work:huanghelou:j03"],
  };
}

function run(poem: AnnotatedPoem, options: RunOptions = {}) {
  const candidates = matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" });
  const selectedTemplateId = bestQilv(poem);
  const report = evaluateProsody({
    poem,
    candidates,
    selectedTemplateId,
    applicability: "applicable",
    ruleSet: "teaching-v1",
  });
  const genre = reviewedGenre(candidates, selectedTemplateId);
  const adjusted = applyReviewedWorkExceptions({
    poem,
    textFingerprint: options.fingerprint ?? FINGERPRINT,
    genre,
    report,
    works: options.works ?? works(),
    exceptions: EXCEPTIONS,
    evidence: options.evidence ?? evidenceSet(),
    sources: options.sources ?? SOURCES,
  });
  return { report, adjusted, selectedTemplateId, candidates, genre };
}

const tailOf = (report: ProsodyReport): Finding | undefined =>
  report.checks.find(
    (check) =>
      check.ruleId === "TAIL.SANPING" &&
      check.locations.map((location) => location.tokenId).join(",") === "l4c5,l4c6,l4c7",
  );

describe("D3 已审特例：黄鹤楼三平尾（C01–C10）", () => {
  it("C01 已审黄鹤楼 l4c5–7=PPP：not_applicable/info，保留字位与七律身份", () => {
    const poem = buildPoem();
    const { report, adjusted, selectedTemplateId } = run(poem);
    const before = tailOf(report)!;
    const after = tailOf(adjusted)!;

    expect(report.selectedTemplateId).toBe(selectedTemplateId);
    expect(selectedTemplateId.startsWith("qilv")).toBe(true);
    expect(before.status).toBe("fail");
    expect(before.severity).toBe("error");
    expect(before.observed).toEqual(["P", "P", "P"]);

    expect(after.status).toBe("not_applicable");
    expect(after.severity).toBe("info");
    expect(after.resolvedBy).toBeNull();
    expect(after.observed).toEqual(["P", "P", "P"]);
    expect(after.locations.map((location) => location.tokenId)).toEqual([
      "l4c5",
      "l4c6",
      "l4c7",
    ]);
    expect(after.message).toContain("已审作品特例");
    expect(after.evidenceIds).toContain("ctx:j03b2:08");
  });

  it("C02 仅改标点/换行（汉字序列相同）：仍命中，且不依赖请求 inputHash", () => {
    const poem = buildPoem({
      text: "昔人已乘黄鹤去，此地空余黄鹤楼。\n黄鹤一去不复返，白云千载空悠悠。\n晴川历历汉阳树，芳草萋萋鹦鹉洲。\n日暮乡关何处是，烟波江上使人愁。",
    });
    const { adjusted } = run(poem);
    expect(tailOf(adjusted)!.status).toBe("not_applicable");
    // 指纹由调用方传入（此处为已审汉字序列指纹），而不是含标点的 inputHash
    expect(poem.inputHash).not.toBe(FINGERPRINT);
  });

  it("C03 正文实质改一字：不命中，不能凭题名/标签免责", () => {
    // 固定正文改一字（末字「愁」→「秋」），读音表与题名/标签不变：仍不得命中特例
    const base = buildPoem();
    const poem: AnnotatedPoem = {
      ...base,
      originalText: base.originalText.replace("愁", "秋"),
      lines: base.lines.map((line) =>
        line.line === 8 ? { ...line, text: "烟波江上使人秋" } : line,
      ),
      tokens: base.tokens.map((token) =>
        token.tokenId === "l8c7" ? { ...token, text: "秋", candidates: [] , effectiveCandidateIds: [], readingStatus: "unknown", selectedReadingId: null, possibleTones: [], toneStatus: "unknown", tone: null } : token,
      ),
    };
    const { report, adjusted } = run(poem);
    expect(tailOf(report)!.status).toBe("fail");
    expect(tailOf(adjusted)!.status).toBe("fail");
  });

  it("C04a 普通五绝合成 PPP 尾：仍 fail/error", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PPPZZ", "ZZPPP"]);
    const report = evaluateProsody({
      poem,
      candidates: matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" }),
      selectedTemplateId: "wujue-ze-unrhymed",
      applicability: "applicable",
      ruleSet: "teaching-v1",
    });
    const sanping = report.checks.find(
      (check) => check.ruleId === "TAIL.SANPING" && check.locations.some((l) => l.tokenId === "l4c5"),
    )!;
    expect(sanping.status).toBe("fail");
    expect(sanping.severity).toBe("error");
  });

  it("C04b 普通七律合成 PPP 尾：仍 fail/error", () => {
    const poem = makeCodePoem([
      "ZZPPPZZ",
      "PPZZZPP",
      "PPZZPPZ",
      "ZZPPPPP",
      "ZZPPPZZ",
      "PPZZZPP",
      "PPZZPPZ",
      "ZZPPPZP",
    ]);
    const report = evaluateProsody({
      poem,
      candidates: matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" }),
      selectedTemplateId: "qilv-ze-unrhymed",
      applicability: "applicable",
      ruleSet: "teaching-v1",
    });
    const sanping = report.checks.find(
      (check) =>
        check.ruleId === "TAIL.SANPING" &&
        check.locations.map((l) => l.tokenId).join(",") === "l4c5,l4c6,l4c7",
    )!;
    expect(sanping.status).toBe("fail");
    expect(sanping.severity).toBe("error");
  });

  it("C05 换词林/新韵（无对应批准）：不套用平水特例", () => {
    const poem = buildPoem({ book: "cilin" });
    const { report, adjusted } = run(poem);
    expect(tailOf(report)!.status).toBe("fail");
    expect(tailOf(adjusted)!.status).toBe("fail");
  });

  it("C06 缺审批/unverified/指纹不符：特例不生效", () => {
    const poem = buildPoem();

    const unverifiedEvidence = run(poem, { evidence: evidenceSet({ contextStatus: "unverified" }) });
    expect(tailOf(unverifiedEvidence.adjusted)!.status).toBe("fail");

    const unverifiedWork = run(poem, { works: works({ reviewStatus: "unverified" }) });
    expect(tailOf(unverifiedWork.adjusted)!.status).toBe("fail");

    const wrongFingerprint = run(poem, { fingerprint: "f".repeat(64) });
    expect(tailOf(wrongFingerprint.adjusted)!.status).toBe("fail");
  });

  it("C07 用户覆盖改变有效音：不硬套特例，也不改读音", () => {
    const poem = buildPoem({ userOverrideAt: "l4c5" });
    const { report, adjusted } = run(poem);
    const token = poem.tokens.find((item) => item.tokenId === "l4c5")!;
    expect(token.selectionMethod).toBe("user");
    expect(token.tone).toBe("P");
    expect(tailOf(report)!.status).toBe("fail");
    expect(tailOf(adjusted)!.status).toBe("fail");
  });

  it("C08 同诗其他字位偏离保留：特例不清空报告、不改判古体", () => {
    const poem = buildPoem();
    const { report, adjusted, selectedTemplateId } = run(poem);
    const hardFailsBefore = report.checks.filter(
      (check) => check.status === "fail" && check.severity === "error",
    ).length;
    const hardFailsAfter = adjusted.checks.filter(
      (check) => check.status === "fail" && check.severity === "error",
    ).length;
    expect(adjusted.selectedTemplateId).toBe(selectedTemplateId);
    expect(adjusted.candidates.some((candidate) => candidate.formId === "qilv")).toBe(true);
    // 仅尾式一项由 error → info；其他硬错必须原样保留
    expect(hardFailsAfter).toBe(hardFailsBefore - 1);
    // METER.POSITION 在 l4c5 的判读不被尾式特例顺手消除
    const meterAtL4c5 = report.checks.find(
      (check) =>
        check.ruleId === "METER.POSITION" &&
        check.locations.some((location) => location.tokenId === "l4c5"),
    );
    if (meterAtL4c5) {
      const after = adjusted.checks.find((check) => check.id === meterAtL4c5.id)!;
      expect(after.status).toBe(meterAtL4c5.status);
    }
  });

  it("C09 重复运行/幂等：输出稳定，二次应用不再变化", () => {
    const poem = buildPoem();
    const first = run(poem).adjusted;
    const second = run(poem).adjusted;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    const { adjusted, report } = run(poem);
    const reapplied = applyReviewedWorkExceptions({
      poem,
      textFingerprint: FINGERPRINT,
      genre: {
        formFamily: "regulated",
        formId: "qilv",
        historicalTags: ["特殊拗律"],
        applicability: "applicable",
        basisType: "reviewed_metadata",
        candidateTemplateIds: matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" }).map((c) => c.id),
        selectedTemplateId: report.selectedTemplateId,
        reasons: ["已审作品元数据"],
        evidenceIds: ["ev:work:huanghelou:j03"],
      },
      report: adjusted,
      works: works(),
      exceptions: EXCEPTIONS,
      evidence: evidenceSet(),
      sources: SOURCES,
    });
    expect(JSON.stringify(reapplied)).toBe(JSON.stringify(adjusted));
  });

  it("C10 引用闭合：closure ok、ruleId 合法、resolvedBy 不伪填 RESCUE", () => {
    const poem = buildPoem();
    const { adjusted } = run(poem);
    expect(checkReportClosure(adjusted, poem).ok).toBe(true);
    for (const check of adjusted.checks) {
      expect(FROZEN_RULE_IDS).toContain(check.ruleId);
      expect(check.ruleVersion).toBe("1");
      if (check.resolvedBy !== null) {
        expect(["RESCUE.SELF", "RESCUE.TEAO", "RESCUE.DUIJU"]).toContain(check.resolvedBy);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// D3 复核收尾：边界独立用例（C11–C16）
//
// 与 C01–C10 的分工：C01–C10 验证“正例成立 + 最基础反例”，本组补的是
// 复核点名的六类边界，每条都独立构造输入，不依赖上一条的副作用。
// ---------------------------------------------------------------------------

const TAIL_TOKEN_IDS = ["l4c5", "l4c6", "l4c7"] as const;

/** 只改一个字位，其余保持已审正文；用于构造未知/歧义/变仄。 */
function replaceToken(
  poem: AnnotatedPoem,
  tokenId: string,
  patch: Partial<AnnotatedToken>,
): AnnotatedPoem {
  return {
    ...poem,
    tokens: poem.tokens.map((token) =>
      token.tokenId === tokenId ? { ...token, ...patch } : token,
    ),
  };
}

/** 尾式被判为 not_applicable/info 的记录条数；未命中时必须为 0。 */
function interpretedTails(report: ProsodyReport): Finding[] {
  return report.checks.filter(
    (check) =>
      check.ruleId === "TAIL.SANPING" &&
      check.status === "not_applicable" &&
      TAIL_TOKEN_IDS.every((tokenId) =>
        check.locations.some((location) => location.tokenId === tokenId),
      ),
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

describe("D3 已审特例：边界反例（C11–C16）", () => {
  it("C11 新韵：不继承平水已审特例", () => {
    const poem = buildPoem({ book: "xinyun" });
    const { report, adjusted } = run(poem);
    expect(poem.book).toBe("xinyun");
    // 核心原判不受韵书影响（尾式只看平仄），只是不得被“解释”
    expect(tailOf(report)?.status).toBe("fail");
    expect(tailOf(adjusted)?.status).toBe("fail");
    expect(interpretedTails(adjusted)).toHaveLength(0);
  });

  it("C12 缺审批：审批证据或作品依据缺失都不生效", () => {
    const poem = buildPoem();

    // 只剩作品元数据证据，审批证据（ctx:j03b2:08）缺失
    const withoutApproval = run(poem, {
      evidence: evidenceSet().filter((item) => item.id !== "ctx:j03b2:08"),
    });
    expect(tailOf(withoutApproval.adjusted)?.status).toBe("fail");
    expect(interpretedTails(withoutApproval.adjusted)).toHaveLength(0);

    // 只剩审批证据，作品元数据证据缺失
    const withoutWorkEvidence = run(poem, {
      evidence: evidenceSet().filter((item) => item.id !== "ev:work:huanghelou:j03"),
    });
    expect(tailOf(withoutWorkEvidence.adjusted)?.status).toBe("fail");
    expect(interpretedTails(withoutWorkEvidence.adjusted)).toHaveLength(0);

    // 证据表整体为空：不得降级成“无证据也放行”
    const noEvidence = run(poem, { evidence: [] });
    expect(interpretedTails(noEvidence.adjusted)).toHaveLength(0);
  });

  it("C13 来源断链：证据在、来源不在，不生效", () => {
    const poem = buildPoem();

    // 来源表整体为空
    const noSources = run(poem, { sources: [] });
    expect(tailOf(noSources.adjusted)?.status).toBe("fail");
    expect(interpretedTails(noSources.adjusted)).toHaveLength(0);

    // 审批证据的 sourceId 指向不存在的来源
    const brokenEvidence = evidenceSet().map((item) =>
      item.id === "ctx:j03b2:08"
        ? { ...item, sourceId: "src:missing:approval" }
        : item,
    );
    const broken = run(poem, { evidence: brokenEvidence });
    expect(interpretedTails(broken.adjusted)).toHaveLength(0);
  });

  it("C14 未知/歧义/变仄：尾字读音非唯一平声则不命中", () => {
    const base = buildPoem();
    const token = base.tokens.find((item) => item.tokenId === "l4c5")!;
    const ping = token.candidates[0]!;
    const ze = {
      ...ping,
      id: "pingshui:空:qu:一送",
      toneClass: "qu" as const,
      tone: "Z" as Tone,
    };

    const unknown = replaceToken(base, "l4c5", {
      candidates: [],
      effectiveCandidateIds: [],
      readingStatus: "unknown",
      selectedReadingId: null,
      selectionMethod: "unresolved",
      possibleTones: [],
      toneStatus: "unknown",
      tone: null,
    });
    const ambiguous = replaceToken(base, "l4c5", {
      candidates: [ping, ze],
      effectiveCandidateIds: [ping.id, ze.id],
      readingStatus: "ambiguous",
      selectedReadingId: null,
      selectionMethod: "unresolved",
      possibleTones: ["P", "Z"],
      toneStatus: "ambiguous",
      tone: null,
    });
    const changedToZe = replaceToken(base, "l4c5", {
      candidates: [ze],
      effectiveCandidateIds: [ze.id],
      readingStatus: "resolved",
      selectedReadingId: ze.id,
      selectionMethod: "unique",
      possibleTones: ["Z"],
      toneStatus: "resolved",
      tone: "Z",
    });

    const cases = [
      ["unknown", unknown],
      ["ambiguous", ambiguous],
      ["变仄", changedToZe],
    ] as const;
    for (const [label, poem] of cases) {
      const { adjusted } = run(poem);
      expect(interpretedTails(adjusted), label).toHaveLength(0);
    }
  });

  it("C15 冻结输入：应用层只读入参，原报告与其他入参不变", () => {
    const poem = buildPoem();
    const candidates = matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" });
    const selectedTemplateId = bestQilv(poem);
    const report = evaluateProsody({
      poem,
      candidates,
      selectedTemplateId,
      applicability: "applicable",
      ruleSet: "teaching-v1",
    });
    const evidence = evidenceSet();
    const worksList = works();
    const snapshot = {
      poem: JSON.stringify(poem),
      report: JSON.stringify(report),
      evidence: JSON.stringify(evidence),
      works: JSON.stringify(worksList),
    };

    deepFreeze(poem);
    deepFreeze(report);
    deepFreeze(evidence);
    deepFreeze(worksList);
    deepFreeze(EXCEPTIONS);

    const adjusted = applyReviewedWorkExceptions({
      poem,
      textFingerprint: FINGERPRINT,
      genre: reviewedGenre(candidates, selectedTemplateId),
      report,
      works: worksList,
      exceptions: EXCEPTIONS,
      evidence,
      sources: SOURCES,
    });

    expect(tailOf(adjusted)!.status).toBe("not_applicable");
    expect(adjusted).not.toBe(report);
    // 原报告必须仍是 fail：应用层不得就地改写，否则下游会看到被“解释”过的历史
    expect(tailOf(report)!.status).toBe("fail");
    expect(JSON.stringify(poem)).toBe(snapshot.poem);
    expect(JSON.stringify(report)).toBe(snapshot.report);
    expect(JSON.stringify(evidence)).toBe(snapshot.evidence);
    expect(JSON.stringify(worksList)).toBe(snapshot.works);
  });

  it("C16 报告 evidence/source 闭合：所有引用可解析到合并表，且不重复挂证据", () => {
    const poem = buildPoem();
    const evidence = evidenceSet();
    const { adjusted, genre } = run(poem, { evidence });
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    const sourceIds = new Set(SOURCES.map((item) => item.id));

    const referenced = new Set<string>([
      ...adjusted.checks.flatMap((check) => check.evidenceIds),
      ...genre.evidenceIds,
      ...poem.tokens.flatMap((token) => token.evidenceIds),
    ]);
    expect(referenced.size).toBeGreaterThan(0);
    for (const id of referenced) {
      const record = evidenceById.get(id);
      expect(record, `报告引用了未注册证据 ${id}`).toBeDefined();
      expect(
        sourceIds.has(record!.sourceId),
        `${id} 的来源 ${record?.sourceId} 不可解析`,
      ).toBe(true);
    }

    // 命中项必须挂上审批证据，且同一证据只挂一次
    const tail = tailOf(adjusted)!;
    expect(tail.evidenceIds.filter((id) => id === "ctx:j03b2:08")).toHaveLength(1);
    // 逐条 finding 的引用必须来自报告可见的合并表，closure 仍然 ok
    expect(checkReportClosure(adjusted, poem).ok).toBe(true);
  });
});
