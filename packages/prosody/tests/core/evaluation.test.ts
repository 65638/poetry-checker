import { describe, expect, it } from "vitest";
import {
  ProsodyReportSchema,
  type AnnotatedPoem,
  type EvaluateInput,
  type Tone,
  type ProsodyReport,
} from "@poetry/contracts";
import {
  evaluateProsodyCore,
  matchTemplatesCore,
} from "../../src/core/index.js";
import { makeAnnotatedPoem, overrideToken } from "../acceptance/fixtures.js";

// 独立写定输入谱；不调用模板生成器作为预期答案，不含真实韵书数据。
const five = ["ZZPPZ", "PPZZP", "PPPZZ", "ZZZPP"];
const seven = ["PPZZPPZ", "ZZPPZZP", "ZZPPPZZ", "PPZZZPP"];
function poemOf(patterns: string[]): AnnotatedPoem {
  return makeAnnotatedPoem(
    patterns.map((line) =>
      [...line].map((tone) => ({
        text: tone === "P" ? "平" : "仄",
        tones: [tone as Tone],
      })),
    ),
  );
}
function inputOf(
  poem: AnnotatedPoem,
  selectedTemplateId: string | null = "wujue-ze-unrhymed",
  applicability: EvaluateInput["applicability"] = "applicable",
): EvaluateInput {
  return {
    poem,
    candidates: matchTemplatesCore({
      poem,
      formHint: "auto",
      ruleSet: "teaching-v1",
    }),
    selectedTemplateId,
    applicability,
    ruleSet: "teaching-v1",
  };
}
function run(patterns = five, id: string | null = "wujue-ze-unrhymed") {
  const report = evaluateProsodyCore(inputOf(poemOf(patterns), id));
  return ProsodyReportSchema.parse(report);
}
function byRule(report: ProsodyReport, id: string) {
  return report.checks.filter((check) => check.ruleId === id);
}
function meter(report: ProsodyReport, tokenId: string) {
  return byRule(report, "METER.POSITION").find((c) =>
    c.locations.some((l) => l.tokenId === tokenId),
  )!;
}
function hardErrors(report: ProsodyReport) {
  return report.checks.filter(
    (c) => c.status === "fail" && c.severity === "error" && !c.resolvedBy,
  );
}
function readings(poem: AnnotatedPoem, id: string, tones: Array<Tone | null>) {
  return overrideToken(poem, id, {
    readings: tones.map((tone) => ({
      tone,
      groupIds: tone ? [`synthetic:group:${tone}`] : [],
    })),
  });
}
function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe("完整核心：已冻结句式和诊断定位", () => {
  for (const [width, base, starts] of [
    [5, five, ["ze", "ping"]],
    [7, seven, ["ping", "ze"]],
  ] as const) {
    for (const count of [4, 8] as const) {
      const form =
        width === 5
          ? count === 4
            ? "wujue"
            : "wulv"
          : count === 4
            ? "qijue"
            : "qilv";
      const sequences = [
        [0, 1, 2, 3, 0, 1, 2, 3],
        [3, 1, 2, 3, 0, 1, 2, 3],
        [2, 3, 0, 1, 2, 3, 0, 1],
        [1, 3, 0, 1, 2, 3, 0, 1],
      ];
      sequences.forEach((sequence, n) => {
        it(`${form} ${n + 1}：正格整诗无硬错误，各维度为 1`, () => {
          const id = `${form}-${starts[n < 2 ? 0 : 1]}-${n % 2 === 0 ? "unrhymed" : "rhymed"}`;
          const report = run(
            sequence.slice(0, count).map((i) => base[i]!),
            id,
          );
          expect(hardErrors(report)).toEqual([]);
          expect(report.rhyme.status).toBe("pass");
          expect(report.relations).toHaveLength(
            (count - 1) * (width === 5 ? 2 : 3),
          );
          expect(report.relations.every((r) => r.status === "pass")).toBe(true);
          expect(report.candidates.find((c) => c.id === id)?.features).toEqual({
            toneFit: 1,
            relationFit: 1,
            rhymeFit: 1,
            parallelismFit: null,
          });
        });
      });
    }
  }
  it("固定模板改第二字：逐位、失对、失粘均保留准确字位", () => {
    const report = run([five[0]!, "PZZZP", five[2]!, five[3]!]);
    expect(report.selectedTemplateId).toBe("wujue-ze-unrhymed");
    expect(meter(report, "l2c2").status).toBe("fail");
    expect(
      byRule(report, "RELATION.DUI").some(
        (c) =>
          c.status === "fail" && c.locations.some((l) => l.tokenId === "l2c2"),
      ),
    ).toBe(true);
    expect(
      byRule(report, "RELATION.NIAN").some(
        (c) =>
          c.status === "fail" && c.locations.some((l) => l.tokenId === "l3c2"),
      ),
    ).toBe(true);
  });
  it("小拗 info 复用逐位记录，三仄尾只作 warning", () => {
    const report = run(["ZZZPZ", five[1]!, "PPZZZ", five[3]!]);
    expect(meter(report, "l1c3")).toMatchObject({
      status: "pass",
      severity: "info",
      expected: ["P", "Z"],
      observed: ["Z"],
      resolvedBy: null,
    });
    expect(meter(report, "l1c3").message).toContain("小拗");
    expect(
      byRule(report, "TAIL.SANZE").find((c) => c.status === "fail")?.severity,
    ).toBe("warning");
    expect(hardErrors(report)).toEqual([]);
  });
  it("七言小拗位为第五字；第四/第六字另犯不获全句免责", () => {
    const report = run(["PPZZZPZ", ...seven.slice(1)], "qijue-ping-unrhymed");
    expect(meter(report, "l1c5").message).toContain("小拗");
    const bad = run(["PPZZZZZ", ...seven.slice(1)], "qijue-ping-unrhymed");
    expect(meter(bad, "l1c6").status).toBe("fail");
    expect(meter(bad, "l1c5").message).not.toContain("作小拗说明");
  });
  it("三平尾是 error；只因句中有一个平声不构成窄义孤平", () => {
    const report = run([five[0]!, "ZPZZP", "ZZZPZ", "ZZPPP"]);
    expect(
      byRule(report, "TAIL.SANPING").find((c) => c.status === "fail")?.severity,
    ).toBe("error");
    const guping = byRule(report, "GUPING.NARROW");
    expect(guping).toHaveLength(1);
    expect(guping[0]).toMatchObject({ status: "fail", severity: "error" });
    expect(guping[0]!.locations.every((l) => l.line === 2)).toBe(true);
  });
});

describe("三类常见救法与不可放宽的边界", () => {
  it.each([
    {
      id: "wujue-ze-unrhymed",
      patterns: [five[0]!, "ZPPZP", five[2]!, five[3]!],
      rule: "RESCUE.SELF",
      targets: ["l2c1", "l2c3"],
    },
    {
      id: "qijue-ping-unrhymed",
      patterns: [seven[0]!, "ZZZPPZP", seven[2]!, seven[3]!],
      rule: "RESCUE.SELF",
      targets: ["l2c3", "l2c5"],
    },
    {
      id: "wujue-ze-unrhymed",
      patterns: [five[0]!, five[1]!, "PPZPZ", five[3]!],
      rule: "RESCUE.TEAO",
      targets: ["l3c3", "l3c4"],
    },
    {
      id: "qijue-ping-unrhymed",
      patterns: [seven[0]!, seven[1]!, "ZZPPZPZ", seven[3]!],
      rule: "RESCUE.TEAO",
      targets: ["l3c5", "l3c6"],
    },
    {
      id: "wujue-ze-unrhymed",
      patterns: ["ZZPZZ", "PPPZP", five[2]!, five[3]!],
      rule: "RESCUE.DUIJU",
      targets: ["l1c4", "l2c3"],
    },
    {
      id: "qijue-ping-unrhymed",
      patterns: ["PPZZPZZ", "ZZPPPZP", seven[2]!, seven[3]!],
      rule: "RESCUE.DUIJU",
      targets: ["l1c6", "l2c5"],
    },
  ])(
    "$id $rule：认可完整模式并关联偏离/救位",
    ({ id, patterns, rule, targets }) => {
      const report = run(patterns, id);
      const rescue = byRule(report, rule).find((c) => c.status === "pass")!;
      expect(rescue).toBeDefined();
      expect(hardErrors(report)).toEqual([]);
      for (const target of targets) {
        const check = meter(report, target);
        expect(check).toMatchObject({
          status: "pass",
          severity: "info",
          resolvedBy: rule,
        });
        expect(check.relatedFindingIds).toContain(rescue.id);
        expect(rescue.relatedFindingIds).toContain(check.id);
      }
      expect(report.relations.every((r) => r.status === "pass")).toBe(true);
    },
  );
  it("特拗不能豁免另一句的关系错误", () => {
    const report = run([five[0]!, five[1]!, "PPZPZ", "ZZZZP"]);
    const failed = byRule(report, "RELATION.DUI").find(
      (c) => c.status === "fail" && c.locations.some((l) => l.line === 4),
    )!;
    expect(failed.resolvedBy).toBeNull();
    expect(failed.severity).toBe("error");
  });
  it("跨联不得相救，七言救位正确但前缀错误仍不认可", () => {
    const crossed = run(["ZZPZZ", five[1]!, "PPPZP", five[3]!]);
    expect(byRule(crossed, "RESCUE.DUIJU")).toHaveLength(0);
    expect(meter(crossed, "l1c4").status).toBe("fail");
    const prefix = run(
      ["PZZZPZZ", "ZZPPPZP", seven[2]!, seven[3]!],
      "qijue-ping-unrhymed",
    );
    expect(byRule(prefix, "RESCUE.DUIJU")).toHaveLength(0);
    expect(meter(prefix, "l1c6").status).toBe("fail");
  });
  it.each([{ tones: [] }, { tones: ["P", "Z"] }, { tones: [null] }])(
    "救位候选 $tones：不宣称已救，不强行确定 pass/fail",
    ({ tones }) => {
      const poem = readings(
        poemOf(["ZZPZZ", "PPPZP", five[2]!, five[3]!]),
        "l2c3",
        tones as Array<Tone | null>,
      );
      const report = evaluateProsodyCore(inputOf(poem));
      expect(
        byRule(report, "RESCUE.DUIJU").every((c) => c.status === "uncertain"),
      ).toBe(true);
      expect(meter(report, "l1c4").status).toBe("uncertain");
      expect(meter(report, "l1c4").resolvedBy).toBeNull();
    },
  );
  it("普通谱与特拗两种读法均成立，可判本位通过但不能宣称确定特拗", () => {
    const poem = readings(
      poemOf([five[0]!, five[1]!, "PPZPZ", five[3]!]),
      "l3c4",
      ["P", "Z"],
    );
    const report = evaluateProsodyCore(inputOf(poem));
    expect(meter(report, "l3c4").status).toBe("pass");
    expect(meter(report, "l3c4").resolvedBy).toBeNull();
    expect(byRule(report, "RESCUE.TEAO")[0]?.status).toBe("uncertain");
  });
});

describe("未知、未选模板、归部关联和报告稳定性", () => {
  it("未知中位保持 uncertain；全未知不产生可用评分", () => {
    const poem = readings(poemOf(five), "l1c1", []);
    expect(meter(evaluateProsodyCore(inputOf(poem)), "l1c1").status).toBe(
      "uncertain",
    );
    const allUnknown = makeAnnotatedPoem(
      five.map((line) => [...line].map(() => ({ text: "未", readings: [] }))),
    );
    const candidates = matchTemplatesCore({
      poem: allUnknown,
      formHint: "auto",
      ruleSet: "teaching-v1",
    });
    expect(
      candidates.every(
        (c) =>
          c.score === null &&
          c.evaluatedKeyRate === 0 &&
          c.features.relationFit === null &&
          c.features.rhymeFit === null,
      ),
    ).toBe(true);
  });
  it("押韵检验按同一候选绑定声调与归部，不可拼接", () => {
    let poem = overrideToken(poemOf(five), "l2c5", {
      readings: [
        { tone: "P", groupIds: ["other"] },
        { tone: "Z", groupIds: ["common"] },
      ],
    });
    poem = overrideToken(poem, "l4c5", {
      readings: [{ tone: "P", groupIds: ["common"] }],
    });
    const report = evaluateProsodyCore(inputOf(poem));
    expect(report.rhyme.status).toBe("fail");
    expect(
      byRule(report, "RHYME.COMMON")[0]!.locations.map((l) => l.tokenId),
    ).toEqual(["l2c5", "l4c5"]);
    expect(
      report.candidates.find((c) => c.id === report.selectedTemplateId)
        ?.features.rhymeFit,
    ).toBe(0);
  });
  it("未知韵脚不能删除；首句入韵时必须检查首句", () => {
    const poem = readings(poemOf(five), "l2c5", []);
    expect(evaluateProsodyCore(inputOf(poem)).rhyme.status).toBe("uncertain");
    const first = overrideToken(poemOf([five[3]!, ...five.slice(1)]), "l1c5", {
      readings: [{ tone: "P", groupIds: ["other"] }],
    });
    const report = evaluateProsodyCore(inputOf(first, "wujue-ze-rhymed"));
    expect(report.rhyme.status).toBe("fail");
    expect(report.rhyme.tokenIds).toEqual(["l1c5", "l2c5", "l4c5"]);
  });
  it("没有选模板：只保留共同判断，不使用排序第一项，引用仍闭合", () => {
    const report = run(five, null);
    expect(report.selectedTemplateId).toBeNull();
    expect(report.checks.every((c) => c.templateId === null)).toBe(true);
    expect(
      byRule(report, "METER.POSITION").every(
        (c) => !/[ABCD] 型/u.test(c.message),
      ),
    ).toBe(true);
    expect(
      report.checks.some(
        (c) => c.status === "uncertain" && c.locations.length === 0,
      ),
    ).toBe(true);
    expect(hardErrors(report)).toEqual([]);
    const ids = new Set(report.checks.map((c) => c.id));
    expect(
      report.checks
        .flatMap((c) => c.relatedFindingIds)
        .every((id) => ids.has(id)),
    ).toBe(true);
    expect(
      report.relations.flatMap((r) => r.findingIds).every((id) => ids.has(id)),
    ).toBe(true);
  });
  it.each(["not_applicable", "unsupported", "uncertain"] as const)(
    "适用性 %s 不输出近体硬错误",
    (applicability) => {
      const report = evaluateProsodyCore(
        inputOf(
          poemOf(["PPPPP", "ZZZZZ", "PPPPP", "ZZZZZ"]),
          "wujue-ze-unrhymed",
          applicability,
        ),
      );
      expect(hardErrors(report)).toEqual([]);
      if (applicability === "not_applicable") expect(report.checks).toEqual([]);
      else
        expect(report.checks.some((c) => c.status === applicability)).toBe(
          true,
        );
      ProsodyReportSchema.parse(report);
    },
  );
  it("不存在的选定模板/结构不符明确不支持，不默选另一模板", () => {
    const missing = evaluateProsodyCore(
      inputOf(poemOf(five), "qijue-ping-unrhymed"),
    );
    expect(missing.rhyme.status).toBe("unsupported");
    const mismatch = inputOf(poemOf(five));
    mismatch.poem = poemOf(["ZZPP", ...five.slice(1)]);
    expect(evaluateProsodyCore(mismatch).rhyme.status).toBe("unsupported");
  });
  it("证据/字位可追溯；规则 ID 与版本固定，诊断引用闭合且无重复", () => {
    const report = run(["ZZPZZ", "PPPZP", "PPZPZ", five[3]!]);
    const ids = new Set(report.checks.map((c) => c.id));
    expect(ids.size).toBe(report.checks.length);
    const rules = new Set([
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
    for (const check of report.checks) {
      expect(rules.has(check.ruleId)).toBe(true);
      expect(check.ruleVersion).toBe("1");
      expect(check.evidenceIds.length).toBeGreaterThan(0);
      for (const id of check.relatedFindingIds) expect(ids.has(id)).toBe(true);
      if (check.resolvedBy) {
        expect(rules.has(check.resolvedBy)).toBe(true);
        expect(check.status).toBe("pass");
      }
    }
  });
  it("冻结输入可执行，多次结果完全一致；补充平面汉字保持字位", () => {
    const specs = five.map((line) =>
      [...line].map((tone) => ({
        text: tone === "P" ? "平" : "仄",
        tones: [tone as Tone],
      })),
    );
    specs[0]![0]!.text = "𠀀";
    const input = inputOf(makeAnnotatedPoem(specs));
    freeze(input);
    const report = evaluateProsodyCore(input);
    expect(report).toEqual(evaluateProsodyCore(input));
    expect(meter(report, "l1c1").locations).toEqual([
      { tokenId: "l1c1", line: 1, column: 1 },
    ]);
    expect(
      input.poem.originalText.slice(
        input.poem.tokens[0]!.startUtf16,
        input.poem.tokens[0]!.endUtf16,
      ),
    ).toBe("𠀀");
  });
});
