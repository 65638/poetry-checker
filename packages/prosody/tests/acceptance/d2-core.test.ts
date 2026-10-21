import { describe, expect, it } from "vitest";
import type {
  AnnotatedPoem,
  Finding,
  ProsodyReport,
  TemplateCandidate,
} from "@poetry/contracts";
import { evaluateProsody, matchTemplates } from "../../src/index.js";
import {
  codeLine,
  makeAnnotatedPoem,
  makeCodePoem,
  makeSyntheticPoem,
  overrideToken,
} from "./fixtures.js";
import type { SyntheticTokenSpec } from "./fixtures.js";

// C 模块 D2 独立验收：C2-01..C2-13。
// 预期全部按《04_给C_核心独立验收与规则证据》矩阵、已确认口径与冻结规则表手工书写，
// 不调用被测实现生成答案后再反测自己。合成样本只验证算法，不冒充名篇金标准。

const RULE_SET = "teaching-v1" as const;
type Applicability = "applicable" | "not_applicable" | "uncertain" | "unsupported";

const FROZEN_RULE_IDS = new Set([
  "METER.POSITION",
  "RHYME.COMMON",
  "RELATION.DUI",
  "RELATION.NIAN",
  "GUPING.NARROW",
  "TAIL.SANPING",
  "TAIL.SANZE",
  "RESCUE.SELF",
  "RESCUE.TEAO",
  "RESCUE.DUIJU",
]);

function matchFor(poem: AnnotatedPoem): TemplateCandidate[] {
  return matchTemplates({ poem, formHint: "auto", ruleSet: RULE_SET });
}

function analyze(
  poem: AnnotatedPoem,
  selectedTemplateId: string | null,
  applicability: Applicability = "applicable",
): ProsodyReport {
  return evaluateProsody({
    poem,
    candidates: matchFor(poem),
    selectedTemplateId,
    applicability,
    ruleSet: RULE_SET,
  });
}

const checksOf = (report: ProsodyReport, ruleId: string): Finding[] =>
  report.checks.filter((check) => check.ruleId === ruleId);

const tokenIds = (finding: Finding): string[] =>
  finding.locations.map((location) => location.tokenId);

const findAt = (
  report: ProsodyReport,
  ruleId: string,
  tokenId: string,
): Finding | undefined =>
  report.checks.find(
    (check) => check.ruleId === ruleId && check.locations.some((l) => l.tokenId === tokenId),
  );

const lineOf = (
  poem: AnnotatedPoem,
  lineNumber: number,
): AnnotatedPoem["tokens"] =>
  poem.tokens.filter((token) => token.line === lineNumber);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe("C2-01 窄义孤平（只认 B 型 ZPZZP）", () => {
  it("B 型 ZPZZP 触发 GUPING.NARROW：fail/error，定位后五字", () => {
    const poem = makeCodePoem(["ZZPPZ", "ZPZZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const guping = checksOf(report, "GUPING.NARROW");
    expect(guping).toHaveLength(1);
    const finding = guping[0]!;
    expect(finding.status).toBe("fail");
    expect(finding.severity).toBe("error");
    expect(finding.ruleVersion).toBe("1");
    expect(finding.templateId).toBe("wujue-ze-unrhymed");
    expect(tokenIds(finding)).toEqual(["l2c1", "l2c2", "l2c3", "l2c4", "l2c5"]);
    expect(finding.observed).toEqual(["Z", "P", "Z", "Z", "P"]);
    expect(finding.resolvedBy).toBeNull();
  });

  it("句中有单一平声但不构成 ZPZZP 时不判孤平；其他位置错误照常报出", () => {
    const poem = makeCodePoem(["ZZPPZ", "ZZZZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const guping = checksOf(report, "GUPING.NARROW")[0]!;
    expect(guping.status).toBe("pass");
    expect(findAt(report, "METER.POSITION", "l2c2")!.status).toBe("fail");
  });
});

describe("C2-02 孤平自救（ZPPZP）", () => {
  it("ZPPZP：GUPING 通过并关联 RESCUE.SELF，拗位/救位与诊断双向闭合", () => {
    const poem = makeCodePoem(["ZZPPZ", "ZPPZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const guping = checksOf(report, "GUPING.NARROW")[0]!;
    expect(guping.status).toBe("pass");
    expect(guping.resolvedBy).toBe("RESCUE.SELF");
    const self = checksOf(report, "RESCUE.SELF");
    expect(self).toHaveLength(1);
    expect(self[0]!.status).toBe("pass");
    expect(tokenIds(self[0]!)).toEqual(["l2c1", "l2c2", "l2c3", "l2c4", "l2c5"]);
    expect(self[0]!.expected).toEqual(["ZPPZP"]);
    expect(self[0]!.observed).toEqual(["Z", "P", "P", "Z", "P"]);
    expect(guping.relatedFindingIds).toContain(self[0]!.id);
    expect(self[0]!.relatedFindingIds).toContain(guping.id);
  });

  it("差一位（ZZPZP）不得当作已救：无救法认定，第 2 字仍报错", () => {
    const poem = makeCodePoem(["ZZPPZ", "ZZPZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    expect(checksOf(report, "RESCUE.SELF")).toHaveLength(0);
    expect(checksOf(report, "GUPING.NARROW")[0]!.resolvedBy).toBeNull();
    expect(findAt(report, "METER.POSITION", "l2c2")!.status).toBe("fail");
  });
});

describe("C2-03 特拗（C 型 PPZPZ）", () => {
  it("PPZPZ：第 4 字通过并关联 RESCUE.TEAO；粘对不重复硬报", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PPZPZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const meter = findAt(report, "METER.POSITION", "l3c4")!;
    expect(meter.status).toBe("pass");
    expect(meter.resolvedBy).toBe("RESCUE.TEAO");
    const teao = checksOf(report, "RESCUE.TEAO");
    expect(teao).toHaveLength(1);
    expect(teao[0]!.status).toBe("pass");
    expect(teao[0]!.expected).toEqual(["PPZPZ"]);
    const dui = report.relations.find(
      (relation) => relation.kind === "dui" && relation.tokenIds.join(",") === "l3c4,l4c4",
    );
    expect(dui?.status).toBe("pass");
    expect(
      report.checks.some(
        (check) =>
          check.ruleId === "RELATION.DUI" &&
          check.status === "fail" &&
          tokenIds(check).includes("l3c4"),
      ),
    ).toBe(false);
  });

  it("差一位（第 2 字变仄）不认可特拗：第 4 字仍按常格报错", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PZZPZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    expect(checksOf(report, "RESCUE.TEAO")).toHaveLength(0);
    expect(findAt(report, "METER.POSITION", "l3c4")!.status).toBe("fail");
    expect(findAt(report, "METER.POSITION", "l3c2")!.status).toBe("fail");
  });
});

describe("C2-04 五言对句相救（ZZPZZ / PPPZP）", () => {
  it("命中：拗位通过并关联 RESCUE.DUIJU", () => {
    const poem = makeCodePoem(["ZZPZZ", "PPPZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const duiju = checksOf(report, "RESCUE.DUIJU");
    expect(duiju).toHaveLength(1);
    expect(duiju[0]!.status).toBe("pass");
    expect(duiju[0]!.expected).toEqual(["ZZPZZPPPZP"]);
    const meter = findAt(report, "METER.POSITION", "l1c4")!;
    expect(meter.status).toBe("pass");
    expect(meter.resolvedBy).toBe("RESCUE.DUIJU");
    expect(meter.relatedFindingIds).toContain(duiju[0]!.id);
  });

  it("跨联同形（第 1 句拗、第 4 句救）不宣称已救，拗位仍报错", () => {
    const poem = makeCodePoem(["ZZPZZ", "PPZZP", "PPPZZ", "PPPZP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    expect(checksOf(report, "RESCUE.DUIJU")).toHaveLength(0);
    expect(findAt(report, "METER.POSITION", "l1c4")!.status).toBe("fail");
  });

  it("救位读音未知时不宣称已救，拗位 uncertain", () => {
    const poem = makeCodePoem(["ZZPZZ", "PPUZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const duiju = checksOf(report, "RESCUE.DUIJU");
    expect(duiju).toHaveLength(1);
    expect(duiju[0]!.status).toBe("uncertain");
    const meter = findAt(report, "METER.POSITION", "l1c4")!;
    expect(meter.status).toBe("uncertain");
    expect(meter.resolvedBy).toBeNull();
  });
});

describe("C2-05 七言对句相救（PPZZPZZ / ZZPPPZP）", () => {
  it("窄模式第 6↔5 字可认可", () => {
    const poem = makeCodePoem(["PPZZPZZ", "ZZPPPZP", "ZZPPPZZ", "PPZZZPP"]);
    const report = analyze(poem, "qijue-ping-unrhymed");
    const duiju = checksOf(report, "RESCUE.DUIJU");
    expect(duiju).toHaveLength(1);
    expect(duiju[0]!.status).toBe("pass");
    expect(duiju[0]!.expected).toEqual(["PPZZPZZZZPPPZP"]);
    const meter = findAt(report, "METER.POSITION", "l1c6")!;
    expect(meter.status).toBe("pass");
    expect(meter.resolvedBy).toBe("RESCUE.DUIJU");
  });

  it("错误前缀（第 1 字为仄）不放行", () => {
    const poem = makeCodePoem(["ZPZZPZZ", "ZZPPPZP", "ZZPPPZZ", "PPZZZPP"]);
    const report = analyze(poem, "qijue-ping-unrhymed");
    expect(checksOf(report, "RESCUE.DUIJU")).toHaveLength(0);
    expect(findAt(report, "METER.POSITION", "l1c6")!.status).toBe("fail");
  });
});

describe("C2-06 三平尾 / 三仄尾", () => {
  it("末三字 PPP：TAIL.SANPING fail/error；SANZE 不触发", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PPPZZ", "ZZPPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const sanping = report.checks.find(
      (check) => check.ruleId === "TAIL.SANPING" && tokenIds(check).includes("l4c5"),
    )!;
    expect(sanping.status).toBe("fail");
    expect(sanping.severity).toBe("error");
    const sanze = report.checks.find(
      (check) => check.ruleId === "TAIL.SANZE" && tokenIds(check).includes("l4c5"),
    )!;
    expect(sanze.status).toBe("pass");
  });

  it("末三字 ZZZ：TAIL.SANZE fail/warning（不升级为 error）", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PPPZZ", "ZZZZZ"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const sanze = report.checks.find(
      (check) => check.ruleId === "TAIL.SANZE" && tokenIds(check).includes("l4c5"),
    )!;
    expect(sanze.status).toBe("fail");
    expect(sanze.severity).toBe("warning");
    const sanping = report.checks.find(
      (check) => check.ruleId === "TAIL.SANPING" && tokenIds(check).includes("l4c5"),
    )!;
    expect(sanping.status).toBe("pass");
  });
});

describe("C2-07 A 型小拗（政策②允许并标 info）", () => {
  it("五言 ZZZPZ：第 3 字 pass/info，expected=[P,Z]、observed=[Z]、resolvedBy=null", () => {
    const poem = makeCodePoem(["ZZZPZ", "PPZZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const meter = findAt(report, "METER.POSITION", "l1c3")!;
    expect(meter.ruleId).toBe("METER.POSITION");
    expect(meter.ruleVersion).toBe("1");
    expect(meter.status).toBe("pass");
    expect(meter.severity).toBe("info");
    expect(meter.expected).toEqual(["P", "Z"]);
    expect(meter.observed).toEqual(["Z"]);
    expect(meter.resolvedBy).toBeNull();
    expect(meter.message).toContain("小拗");
  });

  it("七言 PPZZZPZ：第 5 字 pass/info", () => {
    const poem = makeCodePoem(["PPZZZPZ", "ZZPPZZP", "ZZPPPZZ", "PPZZZPP"]);
    const report = analyze(poem, "qijue-ping-unrhymed");
    const meter = findAt(report, "METER.POSITION", "l1c5")!;
    expect(meter.status).toBe("pass");
    expect(meter.severity).toBe("info");
    expect(meter.message).toContain("小拗");
  });

  it("额外破坏固定节奏位（七言第 6 字变仄）不套用小拗豁免", () => {
    const poem = makeCodePoem(["PPZZZZZ", "ZZPPZZP", "ZZPPPZZ", "PPZZZPP"]);
    const report = analyze(poem, "qijue-ping-unrhymed");
    expect(findAt(report, "METER.POSITION", "l1c6")!.status).toBe("fail");
    expect(findAt(report, "METER.POSITION", "l1c5")!.message).not.toContain("小拗");
  });
});

describe("C2-08 固定模板改第 2 字与粘对边界", () => {
  it("首句第 2 字改平：平仄 fail + 同联失对定位正确，不换模板", () => {
    const poem = makeCodePoem(["ZPPPZ", "PPZZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    expect(report.selectedTemplateId).toBe("wujue-ze-unrhymed");
    const meter = findAt(report, "METER.POSITION", "l1c2")!;
    expect(meter.status).toBe("fail");
    expect(meter.severity).toBe("error");
    expect(meter.expected).toEqual(["Z"]);
    expect(meter.observed).toEqual(["P"]);
    expect(meter.templateId).toBe("wujue-ze-unrhymed");
    const dui = report.relations.find(
      (relation) => relation.kind === "dui" && relation.tokenIds.join(",") === "l1c2,l2c2",
    )!;
    expect(dui.status).toBe("fail");
    const nian = report.relations.find(
      (relation) => relation.kind === "nian" && relation.tokenIds.join(",") === "l2c2,l3c2",
    )!;
    expect(nian.status).toBe("pass");
  });
});

describe("C2-09 三值、未知与候选关联", () => {
  it("P/P、P/Z、未知与中位未知分别得到确定、歧义、unknown、uncertain", () => {
    const poem = makeAnnotatedPoem([
      codeLine("ZZPPZ"),
      [
        {
          text: "平",
          readings: [
            { tone: "P", groupIds: ["synthetic:group:P"] },
            { tone: "P", groupIds: ["synthetic:group:Q"] },
          ],
        },
        {
          text: "平",
          readings: [
            { tone: "P", groupIds: ["synthetic:group:P"] },
            { tone: "Z", groupIds: ["synthetic:group:Z"] },
          ],
        },
        { text: "平", readings: [] },
        { text: "仄", readings: [{ tone: "Z", groupIds: ["synthetic:group:Z"] }] },
        { text: "平", readings: [{ tone: "P", groupIds: ["synthetic:group:P"] }] },
      ],
      codeLine("PPPZZ"),
      codeLine("ZZZPP"),
    ]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const t1 = poem.tokens.find((token) => token.tokenId === "l2c1")!;
    expect(t1.toneStatus).toBe("resolved");
    expect(t1.possibleTones).toEqual(["P"]);
    expect(findAt(report, "METER.POSITION", "l2c1")!.status).toBe("pass");
    const t2 = poem.tokens.find((token) => token.tokenId === "l2c2")!;
    expect(t2.toneStatus).toBe("ambiguous");
    expect(findAt(report, "METER.POSITION", "l2c2")!.status).toBe("uncertain");
    const t3 = poem.tokens.find((token) => token.tokenId === "l2c3")!;
    expect(t3.toneStatus).toBe("unknown");
    expect(findAt(report, "METER.POSITION", "l2c3")!.status).toBe("uncertain");
  });

  it("韵脚声调与归部来自不同候选时不拼接：判 fail", () => {
    const line2: SyntheticTokenSpec[] = [
      ...codeLine("PPZZP").slice(0, 4),
      {
        text: "平",
        readings: [
          { tone: "P", groupIds: ["synthetic:乙"] },
          { tone: "Z", groupIds: ["synthetic:甲"] },
        ],
      },
    ];
    const poem = makeAnnotatedPoem([
      codeLine("ZZPPZ"),
      line2,
      codeLine("PPPZZ"),
      codeLine("ZZZPP", { groups: { 4: ["synthetic:甲"] } }),
    ]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    expect(report.rhyme.status).toBe("fail");
    expect(checksOf(report, "RHYME.COMMON")[0]!.severity).toBe("error");
  });
});

describe("C2-10 押韵公共归部与首句入韵", () => {
  it("四个韵脚两两相交但整体无交集：判 fail", () => {
    const poem = makeCodePoem([
      "ZZPPZ",
      { code: "PPZZP", options: { groups: { 4: ["synthetic:甲", "synthetic:乙"] } } },
      "PPPZZ",
      { code: "ZZZPP", options: { groups: { 4: ["synthetic:乙", "synthetic:丙"] } } },
      "ZZPPZ",
      { code: "PPZZP", options: { groups: { 4: ["synthetic:甲", "synthetic:丙"] } } },
      "PPPZZ",
      { code: "ZZZPP", options: { groups: { 4: ["synthetic:甲", "synthetic:乙", "synthetic:丙"] } } },
    ]);
    const report = analyze(poem, "wulv-ze-unrhymed");
    expect(report.rhyme.status).toBe("fail");
    expect(report.rhyme.tokenIds).toEqual(["l2c5", "l4c5", "l6c5", "l8c5"]);
  });

  it("首句入韵时包含第 1 句；无审核邻韵表不自动放行", () => {
    const poem = makeCodePoem([
      { code: "ZZZPP", options: { groups: { 4: ["synthetic:甲"] } } },
      { code: "PPZZP", options: { groups: { 4: ["synthetic:甲"] } } },
      "PPPZZ",
      { code: "ZZZPP", options: { groups: { 4: ["synthetic:乙"] } } },
    ]);
    const report = analyze(poem, "wujue-ze-rhymed");
    expect(report.rhyme.status).toBe("fail");
    expect(report.rhyme.tokenIds).toContain("l1c5");
    expect(checksOf(report, "RHYME.COMMON")[0]!.message).toContain("借邻韵");
  });
});

describe("C2-11 未选模板与适用性状态", () => {
  it("not_applicable：无近体硬错误、无 checks、rhyme 不适用", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed", "not_applicable");
    expect(report.checks).toEqual([]);
    expect(report.rhyme.status).toBe("not_applicable");
    expect(report.selectedTemplateId).toBeNull();
    expect(report.relations).toEqual([]);
  });

  it("unsupported：明确 unsupported，不输出合律结论", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, null, "unsupported");
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]!.status).toBe("unsupported");
    expect(report.checks[0]!.severity).toBe("warning");
    expect(report.rhyme.status).toBe("unsupported");
  });

  it("未选模板：只输出共同诊断并标记待确认，不静默取排序第一项", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, null);
    expect(report.selectedTemplateId).toBeNull();
    expect(report.checks.every((check) => check.templateId === null)).toBe(true);
    const pending = report.checks.find(
      (check) => check.status === "uncertain" && check.id.endsWith(":template"),
    );
    expect(pending).toBeDefined();
  });

  it("适用性 uncertain：错误降级为 warning 并附待确认说明", () => {
    const poem = makeCodePoem(["ZPPPZ", "PPZZP", "PPPZZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed", "uncertain");
    expect(report.checks.some((check) => check.severity === "error")).toBe(false);
    const meter = findAt(report, "METER.POSITION", "l1c2")!;
    expect(meter.status).toBe("fail");
    expect(meter.severity).toBe("warning");
  });
});

describe("C2-12 评分权重、缺项归一与 keyRate", () => {
  it("正格合成诗：前三特征为 1、对仗 null、score=1、keyRate=1", () => {
    const poem = makeSyntheticPoem(["A", "B", "C", "D"], 5);
    const candidate = matchFor(poem).find((c) => c.id === "wujue-ze-unrhymed")!;
    expect(candidate.features).toEqual({
      toneFit: 1,
      relationFit: 1,
      rhymeFit: 1,
      parallelismFit: null,
    });
    expect(candidate.score).toBe(1);
    expect(candidate.evaluatedKeyRate).toBe(1);
  });

  it("押韵失败时按 .65/.20/.10 归一：score=(0.65+0.20)/0.95", () => {
    const poem = makeCodePoem([
      "ZZPPZ",
      { code: "PPZZP", options: { groups: { 4: ["synthetic:甲"] } } },
      "PPPZZ",
      { code: "ZZZPP", options: { groups: { 4: ["synthetic:乙"] } } },
    ]);
    const candidate = matchFor(poem).find((c) => c.id === "wujue-ze-unrhymed")!;
    expect(candidate.features.toneFit).toBe(1);
    expect(candidate.features.relationFit).toBe(1);
    expect(candidate.features.rhymeFit).toBe(0);
    expect(candidate.score).toBeCloseTo((0.65 + 0.2) / 0.95, 10);
  });

  it("全未知：特征与 score 为 null，不写成 0", () => {
    const poem = makeCodePoem(["UUUUU", "UUUUU", "UUUUU", "UUUUU"]);
    const candidates = matchFor(poem);
    expect(candidates).toHaveLength(4);
    for (const candidate of candidates) {
      expect(candidate.features.toneFit).toBeNull();
      expect(candidate.features.relationFit).toBeNull();
      expect(candidate.features.rhymeFit).toBeNull();
      expect(candidate.score).toBeNull();
      expect(candidate.evaluatedKeyRate).toBe(0);
    }
  });

  it("少量可判：keyRate 反映可判比例（13 个固定位中仅 1 位可判）", () => {
    const poem = makeCodePoem(["UUUUU", "UUUUU", "UUUUU", "UUUUU"]);
    const fixed = overrideToken(poem, "l1c2", {
      readings: [{ tone: "Z", groupIds: ["synthetic:group:Z"] }],
    });
    const candidate = matchFor(fixed).find((c) => c.id === "wujue-ze-unrhymed")!;
    expect(candidate.features.toneFit).toBe(1);
    expect(candidate.evaluatedKeyRate).toBeCloseTo(1 / 13, 10);
  });
});

describe("C2-13 确定性、位置与引用闭合", () => {
  it("冻结输入重复执行：结果一致、输入不变", () => {
    const poem = deepFreeze(makeCodePoem(["ZZZZP", "PPPZP", "PPZPZ", "ZZZPP"]));
    const candidates = deepFreeze(matchFor(poem));
    const snapshot = JSON.stringify({ poem, candidates });
    const run = () =>
      evaluateProsody({
        poem,
        candidates,
        selectedTemplateId: "wujue-ze-unrhymed",
        applicability: "applicable",
        ruleSet: RULE_SET,
      });
    const first = run();
    const second = run();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify({ poem, candidates })).toBe(snapshot);
  });

  it("补充平面汉字位置准确，诊断定位可切回原字", () => {
    const poem = makeAnnotatedPoem([
      [
        { text: "𠀀", readings: [{ tone: "P", groupIds: ["synthetic:group:P"] }] },
        ...codeLine("ZPPZ"),
      ],
      codeLine("PPZZP"),
      codeLine("PPPZZ"),
      codeLine("ZZZPP"),
    ]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const token = poem.tokens.find((item) => item.tokenId === "l1c1")!;
    expect(token.text).toBe("𠀀");
    expect(poem.originalText.slice(token.startUtf16, token.endUtf16)).toBe("𠀀");
    const meter = findAt(report, "METER.POSITION", "l1c1")!;
    expect(meter.locations).toEqual([{ tokenId: "l1c1", line: 1, column: 1 }]);
    expect(lineOf(poem, 1)).toHaveLength(5);
  });

  it("ID 唯一、规则与版本在冻结集合内、关联与韵脚引用闭合", () => {
    const poem = makeCodePoem(["ZZPZZ", "PPPZP", "PPZPZ", "ZZZPP"]);
    const report = analyze(poem, "wujue-ze-unrhymed");
    const ids = report.checks.map((check) => check.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const check of report.checks) {
      expect(FROZEN_RULE_IDS.has(check.ruleId)).toBe(true);
      expect(check.ruleVersion).toBe("1");
      if (check.resolvedBy !== null) expect(FROZEN_RULE_IDS.has(check.resolvedBy)).toBe(true);
      for (const related of check.relatedFindingIds) expect(ids).toContain(related);
    }
    for (const relation of report.relations) {
      for (const findingId of relation.findingIds) expect(ids).toContain(findingId);
    }
    const poemTokenIds = poem.tokens.map((token) => token.tokenId);
    for (const tokenId of report.rhyme.tokenIds) expect(poemTokenIds).toContain(tokenId);
  });
});
