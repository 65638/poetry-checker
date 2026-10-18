/* eslint-disable @typescript-eslint/no-explicit-any -- 开发用报告脚本：跨模块读取 JSON 与核心报告，逐字段类型化的收益低于维护成本；不进入构建产物 */
// C 的 D2 三首金标准异常清单生成脚本（开发用，不参与构建/发布）。
// 用法（仓库根）：pnpm exec tsx packages/prosody/scripts/d2-anomaly-report.mts [输出路径]
// 口径：字位平仄由平水韵快照的韵部声类推导（平→P；上/去/入→Z），未经 B 的语境消歧；
//       因此输出是“机器初审”，不是最终读音结论，也不能替代人审。
import { readFileSync, writeFileSync } from "node:fs";
import { registerSnapshot, lookupCharacters } from "@poetry/lexicon";
import { parseText } from "@poetry/readings";
import { matchTemplates, evaluateProsody, checkReportClosure } from "@poetry/prosody";

const OUT = process.argv[2] ?? "packages/prosody/tests/acceptance/d2-anomaly-report.json";
const readJson = (p: string): any => JSON.parse(readFileSync(p, "utf8"));

const snap = registerSnapshot(readJson("data/normalized/pingshui.full-d2-patched.json"));
const dataVersion = snap.dataVersion as string;

const CASES = ["dengguanquelou", "jingyesi", "huanghelou"];
const out: any = {
  method: "机器初审：按平水韵声类推导平仄（平→P；上/去/入→Z），未经 B 语境消歧",
  baseline: { dataVersion, ruleSet: "teaching-v1" },
  cases: {},
};

for (const name of CASES) {
  const gc = readJson(`tests/golden/cases/${name}.json`);
  const formId = gc.assertions.find((a: any) => a.path === "genre.formId")?.equals ?? null;
  const applicability =
    gc.assertions.find((a: any) => a.path === "genre.applicability")?.equals ?? "applicable";

  const parsed = parseText({ text: gc.text });
  const characters = [...new Set(parsed.tokens.map((t: any) => t.text))];
  const lookup = await lookupCharacters({ characters, rhymeBook: "pingshui", dataVersion });
  const byChar = new Map(lookup.entries.map((e: any) => [e.character, e.candidates]));

  const tokens = parsed.tokens.map((t: any) => {
    const candidates = (byChar.get(t.text) ?? []) as any[];
    const tones = [...new Set(candidates.flatMap((c) => (c.tone === null ? [] : [c.tone])))].sort();
    const unknown = candidates.length === 0 || candidates.some((c) => c.tone === null);
    const toneStatus = unknown ? "unknown" : tones.length === 1 ? "resolved" : "ambiguous";
    return {
      ...t,
      candidates,
      effectiveCandidateIds: candidates.map((c) => c.id),
      readingStatus: toneStatus,
      selectedReadingId: toneStatus === "resolved" ? candidates[0].id : null,
      selectionMethod: toneStatus === "resolved" ? "unique" : "unresolved",
      possibleTones: tones,
      toneStatus,
      tone: toneStatus === "resolved" ? tones[0] : null,
      reason: "机器初审：按平水韵快照声类推导平仄；未经 B 语境消歧",
      evidenceIds: [...new Set(candidates.flatMap((c) => c.evidenceIds))],
    };
  });

  const poem = { ...parsed, book: "pingshui" as const, tokens };
  const candidates = matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" });
  const matching =
    formId === null ? candidates : candidates.filter((c) => String(c.formId).includes(formId));
  const pick = [...matching].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;

  const report = evaluateProsody({
    poem,
    candidates,
    selectedTemplateId: applicability === "not_applicable" ? null : pick?.id ?? null,
    applicability:
      applicability === "not_applicable"
        ? "not_applicable"
        : applicability === "unsupported"
          ? "unsupported"
          : "applicable",
    ruleSet: "teaching-v1",
  });

  out.cases[name] = {
    title: gc.title,
    text: gc.text,
    formId,
    applicability,
    tokens: tokens.map((t) => ({
      tokenId: t.tokenId,
      line: t.line,
      column: t.column,
      text: t.text,
      toneStatus: t.toneStatus,
      possibleTones: t.possibleTones,
      candidateIds: t.candidates.map((c: any) => c.id),
    })),
    candidateIds: candidates.map((c) => ({ id: c.id, formId: c.formId, score: c.score })),
    selectedTemplateId: report.selectedTemplateId,
    checks: report.checks.map((c) => ({
      id: c.id,
      ruleId: c.ruleId,
      status: c.status,
      severity: c.severity,
      expected: c.expected,
      observed: c.observed,
      resolvedBy: c.resolvedBy,
      relatedFindingIds: c.relatedFindingIds,
      tokenIds: c.locations.map((l) => l.tokenId),
    })),
    relations: report.relations,
    rhyme: report.rhyme,
    score: report.score,
    evaluatedKeyRate: report.evaluatedKeyRate,
    closure: checkReportClosure(report, poem),
  };
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
const summary = Object.entries(out.cases as Record<string, any>).map(([name, c]) => ({
  name,
  template: c.selectedTemplateId,
  checks: c.checks.length,
  nonPass: c.checks.filter((x: any) => x.status !== "pass").length,
  unresolved: c.tokens.filter((t: any) => t.toneStatus !== "resolved").length,
  closureOk: c.closure.ok,
  closureProblems: c.closure.problems.length,
}));
console.log(JSON.stringify({ dataVersion, summary }, null, 2));
