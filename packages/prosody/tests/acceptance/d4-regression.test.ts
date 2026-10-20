import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  AnnotatedPoem,
  Evidence,
  Finding,
  ProsodyReport,
  RuleCard,
  SourceRecord,
} from "@poetry/contracts";
import { RuleCardSchema } from "@poetry/contracts";
import {
  FROZEN_RULE_IDS,
  evaluateProsody,
  matchTemplates,
  validateRuleCards,
} from "../../src/index.js";
import { BASE_PATTERNS, makeCodePoem } from "./fixtures.js";

// D4 独立回归：只补 D2/D3 未覆盖的语义缺口（不重复既有 104 项断言）。
// 覆盖：七言粘对字位、七言三仄尾等级、跨书规则一致性、未定音不假绿、
//       发布卡完整性校验（正/负例）、Finding 字段与位置一致性。
// 全部为合成样本，明确标识，不冒充真实诗例或真实 API 验收。

const QI = BASE_PATTERNS[7];

function pickBest(candidates: ReturnType<typeof matchTemplates>): string | null {
  const sorted = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return sorted[0]?.id ?? null;
}

function analyze(poem: AnnotatedPoem, templateId: string | null = null): ProsodyReport {
  const candidates = matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" });
  return evaluateProsody({
    poem,
    candidates,
    selectedTemplateId: templateId ?? pickBest(candidates),
    applicability: "applicable",
    ruleSet: "teaching-v1",
  });
}

const tokenIds = (finding: Finding): string =>
  finding.locations.map((location) => location.tokenId).join(",");

const findByPair = (report: ProsodyReport, ruleId: string, pair: string): Finding | undefined =>
  report.checks.find((check) => check.ruleId === ruleId && tokenIds(check) === pair);

describe("D4-01 七言粘对：逐字位正反例", () => {
  const canonical = makeCodePoem([QI.C, QI.D, QI.A, QI.B]);

  it("正例：七绝平起不入韵，粘对全部通过", () => {
    const report = analyze(canonical);
    expect(
      report.checks.filter((check) => check.ruleId === "RELATION.NIAN").every((check) => check.status === "pass"),
    ).toBe(true);
    expect(
      report.checks.filter((check) => check.ruleId === "RELATION.DUI").every((check) => check.status === "pass"),
    ).toBe(true);
  });

  it("反例：只改第二句第四字 → 仅该对相粘位置 fail，定位 l2c4/l3c4", () => {
    // D=PPZZZPP → 第四字改平：PPZPZPP
    const broken = makeCodePoem([QI.C, "PPZPZPP", QI.A, QI.B]);
    const report = analyze(broken);
    const nian = findByPair(report, "RELATION.NIAN", "l2c4,l3c4");
    expect(nian, "应存在 l2c4/l3c4 的相粘检查").toBeDefined();
    expect(nian!.status).toBe("fail");
    expect(nian!.severity).toBe("error");
    // 相邻两对（第二字、第六字）仍 pass：只报坏的那一对
    expect(findByPair(report, "RELATION.NIAN", "l2c2,l3c2")!.status).toBe("pass");
    expect(findByPair(report, "RELATION.NIAN", "l2c6,l3c6")!.status).toBe("pass");
  });

  it("反例：只改第二句第二字 → 仅该联相对位置 fail，定位 l1c2/l2c2", () => {
    // D=PPZZZPP → 第二字改仄：PZZZZPP
    const broken = makeCodePoem([QI.C, "PZZZZPP", QI.A, QI.B]);
    const report = analyze(broken);
    const dui = findByPair(report, "RELATION.DUI", "l1c2,l2c2");
    expect(dui, "应存在 l1c2/l2c2 的相对检查").toBeDefined();
    expect(dui!.status).toBe("fail");
    expect(dui!.severity).toBe("error");
    expect(findByPair(report, "RELATION.DUI", "l1c4,l2c4")!.status).toBe("pass");
    expect(findByPair(report, "RELATION.DUI", "l1c6,l2c6")!.status).toBe("pass");
  });
});

describe("D4-02 七言三仄尾：warning 等级与字位", () => {
  it("末三字 ZZZ：TAIL.SANZE fail/warning，定位 l3c5–7；同句三平尾 pass", () => {
    // A=PPZZPPZ → 末三字改 ZZZ：PPZZZZZ
    const poem = makeCodePoem([QI.C, QI.D, "PPZZZZZ", QI.B]);
    const report = analyze(poem);
    const sanze = findByPair(report, "TAIL.SANZE", "l3c5,l3c6,l3c7");
    const sanping = findByPair(report, "TAIL.SANPING", "l3c5,l3c6,l3c7");
    expect(sanze).toBeDefined();
    expect(sanze!.status).toBe("fail");
    expect(sanze!.severity).toBe("warning");
    expect(sanze!.observed).toEqual(["Z", "Z", "Z"]);
    expect(sanping!.status).toBe("pass");
  });
});

describe("D4-03 跨书一致性与未定音", () => {
  const base = makeCodePoem(["ZZPPZ", "PPZZP", "PPPZZ", "ZZZPP"]);

  it("同一诗在平水/词林/新韵下：ruleId ⊆ 冻结 10 条、version 全为 1", () => {
    const ruleSets: string[] = [];
    for (const book of ["pingshui", "cilin", "xinyun"] as const) {
      const poem: AnnotatedPoem = { ...base, book };
      const report = analyze(poem);
      for (const check of report.checks) {
        expect(FROZEN_RULE_IDS).toContain(check.ruleId);
        expect(check.ruleVersion).toBe("1");
      }
      ruleSets.push([...new Set(report.checks.map((check) => check.ruleId))].sort().join(","));
    }
    expect(new Set(ruleSets).size).toBe(1);
  });

  it("未定音尾字：不拼成已确认三平尾，只报 uncertain", () => {
    // 五言尾式取句末三字 = 第 3–5 字；把这三字改为未定音
    const unknownIds = new Set(["l4c3", "l4c4", "l4c5"]);
    const poem: AnnotatedPoem = {
      ...base,
      tokens: base.tokens.map((token) =>
        unknownIds.has(token.tokenId)
          ? {
              ...token,
              candidates: [],
              effectiveCandidateIds: [],
              readingStatus: "unknown" as const,
              selectedReadingId: null,
              selectionMethod: "unresolved" as const,
              possibleTones: [],
              toneStatus: "unknown" as const,
              tone: null,
            }
          : token,
      ),
    };
    const report = analyze(poem, "wujue-ze-unrhymed");
    const sanping = findByPair(report, "TAIL.SANPING", "l4c3,l4c4,l4c5");
    expect(sanping).toBeDefined();
    expect(sanping!.status).toBe("uncertain");
    expect(sanping!.severity).toBe("warning");
  });
});

describe("D4-04 发布卡完整性校验", () => {
  const cards = JSON.parse(
    readFileSync(new URL("../../../../rules/cards/teaching-v1.json", import.meta.url), "utf8"),
  ) as RuleCard[];
  const ruleBundle = JSON.parse(
    readFileSync(new URL("../../../../rules/evidence/teaching-v1.json", import.meta.url), "utf8"),
  ) as { evidence: Evidence[]; sources: SourceRecord[] };
  const contextEvidence = JSON.parse(
    readFileSync(new URL("../../../../data/context/evidence.json", import.meta.url), "utf8"),
  ) as Evidence[] | { evidence: Evidence[] };
  const contextSources = JSON.parse(
    readFileSync(new URL("../../../../data/context/sources.json", import.meta.url), "utf8"),
  ) as SourceRecord[] | { sources: SourceRecord[] };
  const evidence = [
    ...ruleBundle.evidence,
    ...(Array.isArray(contextEvidence) ? contextEvidence : contextEvidence.evidence),
  ];
  const sources = [
    ...ruleBundle.sources,
    ...(Array.isArray(contextSources) ? contextSources : contextSources.sources),
  ];

  it("当前发布卡：10 张、证据唯一解析且 approved、来源可解析", () => {
    for (const card of cards) RuleCardSchema.parse(card);
    const result = validateRuleCards(cards, evidence, sources, FROZEN_RULE_IDS);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  const clone = (): RuleCard[] => JSON.parse(JSON.stringify(cards)) as RuleCard[];

  it("负例：未知 ruleId / version 非 1 / 重复卡", () => {
    const badId = clone();
    badId[0] = { ...badId[0]!, id: "TAIL.UNKNOWN" };
    expect(validateRuleCards(badId, evidence, sources, FROZEN_RULE_IDS).problems.map((p) => p.code)).toContain(
      "unknown_rule_id",
    );

    const badVersion = clone();
    badVersion[0] = { ...badVersion[0]!, version: "2" };
    expect(
      validateRuleCards(badVersion, evidence, sources, FROZEN_RULE_IDS).problems.map((p) => p.code),
    ).toContain("version_mismatch");

    const duplicated = [...clone(), clone()[0]!];
    expect(
      validateRuleCards(duplicated, evidence, sources, FROZEN_RULE_IDS).problems.map((p) => p.code),
    ).toContain("duplicate_rule_id");
  });

  it("负例：证据未解析 / 未 approved / 来源断链", () => {
    const badEvidence = clone();
    badEvidence[0] = { ...badEvidence[0]!, evidenceIds: ["ev:rule:does-not-exist"] };
    expect(
      validateRuleCards(badEvidence, evidence, sources, FROZEN_RULE_IDS).problems.map((p) => p.code),
    ).toContain("evidence_unresolved");

    const firstEvidenceId = cards[0]!.evidenceIds[0]!;
    const unapproved = evidence.map((record) =>
      record.id === firstEvidenceId ? { ...record, reviewStatus: "unverified" as const } : record,
    );
    expect(
      validateRuleCards(cards, unapproved, sources, FROZEN_RULE_IDS).problems.map((p) => p.code),
    ).toContain("evidence_not_approved");

    const brokenSourceId = evidence.find((record) => record.id === firstEvidenceId)!.sourceId;
    expect(
      validateRuleCards(
        cards,
        evidence,
        sources.filter((source) => source.id !== brokenSourceId),
        FROZEN_RULE_IDS,
      ).problems.map((p) => p.code),
    ).toContain("source_unresolved");
  });
});

describe("D4-05 Finding 字段与位置一致性（含救法关联）", () => {
  it("位置可解析、状态/等级配对、resolvedBy 合法、relatedFindingIds 存在", () => {
    // 含已救（对句相救）、硬错（改字）、正常通过三类
    const poem = makeCodePoem(["ZZPZZ", "PPPZP", "PZPZZ", "ZZZPP"]);
    const report = analyze(poem);
    const tokens = new Map(poem.tokens.map((token) => [token.tokenId, token]));
    const findingIds = new Set(report.checks.map((check) => check.id));

    expect(report.checks.length).toBeGreaterThan(0);
    for (const check of report.checks) {
      expect(["pass", "fail", "uncertain", "not_applicable", "unsupported"]).toContain(check.status);
      expect(["error", "warning", "info"]).toContain(check.severity);
      expect(FROZEN_RULE_IDS).toContain(check.ruleId);
      expect(check.ruleVersion).toBe("1");
      expect(Array.isArray(check.expected)).toBe(true);
      expect(Array.isArray(check.observed)).toBe(true);
      expect(check.locations.length).toBeGreaterThan(0);
      for (const location of check.locations) {
        const token = tokens.get(location.tokenId);
        expect(token, `${check.id} 的位置 ${location.tokenId} 必须可解析`).toBeDefined();
        expect(location.line).toBe(token!.line);
        expect(location.column).toBe(token!.column);
      }
      for (const related of check.relatedFindingIds) {
        expect(findingIds.has(related), `${check.id} 关联 ${related} 必须存在`).toBe(true);
      }
      if (check.resolvedBy !== null) {
        expect(["RESCUE.SELF", "RESCUE.TEAO", "RESCUE.DUIJU"]).toContain(check.resolvedBy);
        expect(check.severity).not.toBe("error");
      }
      if (check.status === "fail") {
        expect(["error", "warning"]).toContain(check.severity);
      }
    }
  });
});
