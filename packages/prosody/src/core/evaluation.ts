import type {
  AnnotatedPoem,
  AnnotatedToken,
  CheckStatus,
  EvaluateInput,
  Finding,
  ProsodyReport,
  TemplateCandidate,
  Tone,
} from "@poetry/contracts";
import { checkCommonRhyme, checkTonePossibilities } from "./constraints.js";
import { getTemplates, type TemplateDefinition } from "./templates.js";

type Token = AnnotatedToken | undefined;
type Assignment = ReadonlyMap<string, Tone>;
type Predicate = (tones: Assignment) => boolean;
type RescueId = "RESCUE.SELF" | "RESCUE.TEAO" | "RESCUE.DUIJU";
interface Rescue {
  ruleId: RescueId;
  tokens: Token[];
  covers: string[];
  normalized: Map<string, Tone>;
  matches: Predicate;
  status: CheckStatus;
  finding: Finding;
}

const COMBINATION_LIMIT = 4096;
const RULE_VERSION = "1";
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const orderedTokens = (tokens: readonly Token[]): AnnotatedToken[] =>
  [
    ...new Map(
      tokens
        .filter((t): t is AnnotatedToken => t !== undefined)
        .map((t) => [t.tokenId, t]),
    ).values(),
  ].sort((a, b) => a.line - b.line || a.column - b.column);

/** 只枚举规则实际依赖的字位；未知音绝不作为一个任选的 P/Z 参与“已救”。 */
function assess(tokens: readonly Token[], predicate: Predicate): CheckStatus {
  if (
    tokens.some(
      (t) =>
        t === undefined ||
        t.toneStatus === "unknown" ||
        t.possibleTones.length === 0,
    )
  )
    return "uncertain";
  const domains = orderedTokens(tokens);
  if (
    domains.reduce((size, t) => size * unique(t.possibleTones).length, 1) >
    COMBINATION_LIMIT
  )
    return "uncertain";
  let passed = false;
  let failed = false;
  const assignment = new Map<string, Tone>();
  function visit(index: number): void {
    if (passed && failed) return;
    const token = domains[index];
    if (token === undefined) {
      if (predicate(assignment)) passed = true;
      else failed = true;
      return;
    }
    for (const tone of unique(token.possibleTones)) {
      assignment.set(token.tokenId, tone);
      visit(index + 1);
    }
  }
  visit(0);
  return passed && failed ? "uncertain" : passed ? "pass" : "fail";
}

function pattern(
  tokens: readonly Token[],
  expected: string,
): { status: CheckStatus; matches: Predicate } {
  const matches: Predicate = (values) =>
    tokens.every(
      (token, i) =>
        token !== undefined &&
        (expected[i] === "*" || values.get(token.tokenId) === expected[i]),
    );
  const states = tokens.map((token, i) =>
    checkTonePossibilities(
      token?.possibleTones ?? [],
      expected[i] === "*" ? ["P", "Z"] : [expected[i] as Tone],
      token === undefined || token.toneStatus === "unknown",
    ),
  );
  // 已知不匹配位足以排除完整救法，不让其他未知字产生虚假的救法候选。
  const status = states.includes("fail")
    ? "fail"
    : states.includes("uncertain")
      ? "uncertain"
      : "pass";
  return { status, matches };
}

function finding(
  ruleId: string,
  templateId: string | null,
  tokens: readonly Token[],
  status: CheckStatus,
  expected: string[],
  observed: string[],
  message: string,
  severity: Finding["severity"] = "error",
  suffix = "",
): Finding {
  const located = orderedTokens(tokens);
  return {
    id: `${ruleId}:${templateId ?? "unselected"}:${located.map((t) => `${t.line}.${t.column}`).join("-")}${suffix}`,
    ruleId,
    ruleVersion: RULE_VERSION,
    status,
    severity:
      status === "pass"
        ? "info"
        : status === "uncertain"
          ? "warning"
          : severity,
    locations: located.map((t) => ({
      tokenId: t.tokenId,
      line: t.line,
      column: t.column,
    })),
    expected,
    observed,
    message,
    templateId,
    evidenceIds: unique(located.flatMap((t) => t.evidenceIds)).sort(),
    resolvedBy: null,
    relatedFindingIds: [],
  };
}

function observed(tokens: readonly Token[]): string[] {
  return tokens.map((t) =>
    t === undefined || t.toneStatus === "unknown"
      ? "?"
      : unique(t.possibleTones).sort().join("/"),
  );
}

function linesOf(poem: AnnotatedPoem): Token[][] {
  const tokens = new Map(poem.tokens.map((t) => [t.tokenId, t]));
  return poem.lines.map((line) => line.tokenIds.map((id) => tokens.get(id)));
}

export function compatible(
  poem: AnnotatedPoem,
  template: TemplateDefinition,
): boolean {
  return (
    poem.lines.length === template.lineCount &&
    poem.lines.every((line) => line.tokenIds.length === template.width)
  );
}

function rescuesFor(lines: Token[][], template: TemplateDefinition): Rescue[] {
  const result: Rescue[] = [];
  const tail = template.width - 5;
  function add(
    ruleId: RescueId,
    tokens: Token[],
    expected: string,
    covers: Token[],
    normalized: Array<[Token, Tone]>,
    description: string,
  ) {
    const candidate = pattern(tokens, expected);
    if (candidate.status === "fail") return;
    result.push({
      ruleId,
      tokens,
      covers: orderedTokens(covers).map((t) => t.tokenId),
      normalized: new Map(
        normalized.flatMap(([token, tone]) =>
          token ? [[token.tokenId, tone] as const] : [],
        ),
      ),
      ...candidate,
      finding: finding(
        ruleId,
        template.id,
        tokens,
        candidate.status,
        [expected],
        observed(tokens),
        `${description}；${candidate.status === "pass" ? "满足本教学规则集的完整模式" : "读音未定，仅为可能的救法，尚不能认定已救"}。`,
        "info",
      ),
    });
  }
  lines.forEach((line, i) => {
    if (template.lineTypes[i] === "B") {
      add(
        "RESCUE.SELF",
        line,
        template.width === 5 ? "ZPPZP" : "*ZZPPZP",
        [line[tail], line[tail + 2]],
        [],
        "B 型孤平自救：拗位与救位同在本句",
      );
    }
    if (template.lineTypes[i] === "C") {
      add(
        "RESCUE.TEAO",
        line,
        template.width === 5 ? "PPZPZ" : "*ZPPZPZ",
        [line[tail + 2], line[tail + 3]],
        [[line[tail + 3], "Z"]],
        "C 型特拗：按原句型认定，不更换模板",
      );
    }
    const next = lines[i + 1];
    if (
      i % 2 === 0 &&
      next &&
      template.lineTypes[i] === "A" &&
      template.lineTypes[i + 1] === "B"
    ) {
      // P0 仅支持列出的窄模式；七言采用矩阵的完整前缀，不推及其他变式。
      add(
        "RESCUE.DUIJU",
        [...line, ...next],
        template.width === 5 ? "ZZPZZPPPZP" : "PPZZPZZZZPPPZP",
        [line[tail + 3], next[tail + 2]],
        [[line[tail + 3], "P"]],
        `同联对句相救：出句第 ${tail + 4} 字与对句第 ${tail + 3} 字对应`,
      );
    }
  });
  return result;
}

function linkRescues(check: Finding, rescues: Rescue[]): void {
  for (const rescue of rescues) {
    check.relatedFindingIds.push(rescue.finding.id);
    rescue.finding.relatedFindingIds.push(check.id);
    if (rescue.status === "pass" && check.status === "pass") {
      check.resolvedBy = rescue.ruleId;
      check.message += ` 已按 ${rescue.ruleId} 关联拗位/救位，原始平仄记录保留。`;
    }
  }
}

function meterFor(
  lines: Token[][],
  template: TemplateDefinition,
  rescues: Rescue[],
): Finding[] {
  return lines.flatMap((line, i) =>
    line.map((token, j) => {
      const allowed = template.expectedTones[i]![j]!;
      const affecting = rescues.filter(
        (r) => token && r.covers.includes(token.tokenId),
      );
      const base = checkTonePossibilities(
        token?.possibleTones ?? [],
        allowed,
        !token || token.toneStatus === "unknown",
      );
      // 联合枚举“基础允许或完整救法”，同一字在两种约束中使用同一个读音。
      const status =
        base === "pass" || affecting.length === 0
          ? base
          : assess(
              [token, ...affecting.flatMap((r) => r.tokens)],
              (values) =>
                (token !== undefined &&
                  allowed.includes(values.get(token.tokenId)!)) ||
                affecting.some((r) => r.matches(values)),
            );
      const actual = token?.possibleTones ?? [];
      const check = finding(
        "METER.POSITION",
        template.id,
        [token],
        status,
        [...allowed],
        [...actual].sort(),
        `第 ${i + 1} 句第 ${j + 1} 字按 ${template.lineTypes[i]} 型允许${allowed.map((t) => (t === "P" ? "平" : "仄")).join("或")}；${status === "pass" ? "本位通过" : status === "fail" ? "此字平仄与允许集合不符" : "读音或救法条件未定，需复核"}。`,
      );
      linkRescues(check, affecting);
      const small =
        template.lineTypes[i] === "A" &&
        j === template.width - 3 &&
        actual.length === 1 &&
        actual[0] === "Z";
      if (small) {
        const wholeA = line.every(
          (item, column) =>
            checkTonePossibilities(
              item?.possibleTones ?? [],
              template.expectedTones[i]![column]!,
              !item || item.toneStatus === "unknown",
            ) === "pass",
        );
        if (wholeA)
          check.message =
            "A 型此位置常格为平，本规则集允许用仄，作小拗说明，不要求对句相救。";
      }
      return check;
    }),
  );
}

function specialChecks(
  lines: Token[][],
  template: TemplateDefinition,
  rescues: Rescue[],
): Finding[] {
  const checks: Finding[] = [];
  lines.forEach((line, i) => {
    const tail = line.slice(-3);
    for (const [ruleId, tone, name, severity] of [
      ["TAIL.SANPING", "P", "三平尾", "error"],
      ["TAIL.SANZE", "Z", "三仄尾", "warning"],
    ] as const) {
      const status = assess(
        tail,
        (values) =>
          !tail.every((token) => token && values.get(token.tokenId) === tone),
      );
      checks.push(
        finding(
          ruleId,
          template.id,
          tail,
          status,
          [`避免${tone.repeat(3)}`],
          observed(tail),
          `${name}：${status === "fail" ? "末三字构成该尾式" : status === "pass" ? "未构成该尾式" : "末三字读音未定"}。${ruleId === "TAIL.SANZE" ? "本规则集仅作警告，不单独判整诗出律。" : ""}`,
          severity,
        ),
      );
    }
    if (template.lineTypes[i] === "B") {
      const core = line.slice(-5);
      const status = assess(
        core,
        (values) =>
          core.map((t) => (t ? values.get(t.tokenId) : "?")).join("") !==
          "ZPZZP",
      );
      const check = finding(
        "GUPING.NARROW",
        template.id,
        core,
        status,
        ["避免B型ZPZZP"],
        observed(core),
        `窄义孤平只检查 B 型后五字 ZPZZP；${status === "fail" ? "本句触犯此式" : status === "pass" ? "本句未触犯此式" : "读音未定，需复核"}。`,
      );
      linkRescues(
        check,
        rescues.filter(
          (r) =>
            r.ruleId === "RESCUE.SELF" && r.tokens[0]?.line === line[0]?.line,
        ),
      );
      checks.push(check);
    }
  });
  return checks;
}

function relationsFor(
  lines: Token[][],
  template: TemplateDefinition,
  rescues: Rescue[],
): { checks: Finding[]; relations: ProsodyReport["relations"] } {
  const checks: Finding[] = [];
  const relations: ProsodyReport["relations"] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const kind = i % 2 === 0 ? "dui" : "nian";
    for (let j = 1; j < template.width; j += 2) {
      const left = lines[i]![j];
      const right = lines[i + 1]![j];
      const affecting = rescues.filter(
        (r) =>
          (left && r.normalized.has(left.tokenId)) ||
          (right && r.normalized.has(right.tokenId)),
      );
      const status = assess(
        [left, right, ...affecting.flatMap((r) => r.tokens)],
        (values) => {
          function normalized(token: Token): Tone | undefined {
            if (!token) return undefined;
            for (const rescue of affecting) {
              const replacement = rescue.normalized.get(token.tokenId);
              if (replacement && rescue.matches(values)) return replacement;
            }
            return values.get(token.tokenId);
          }
          return kind === "dui"
            ? normalized(left) !== normalized(right)
            : normalized(left) === normalized(right);
        },
      );
      const check = finding(
        kind === "dui" ? "RELATION.DUI" : "RELATION.NIAN",
        template.id,
        [left, right],
        status,
        [kind === "dui" ? "平仄相对" : "平仄相粘"],
        observed([left, right]),
        `第 ${i + 1}/${i + 2} 句第 ${j + 1} 字${kind === "dui" ? "相对" : "相粘"}（第二字为主要判别点）；${status === "pass" ? "通过，已计入认可变格" : status === "fail" ? (kind === "dui" ? "失对" : "失粘") : "条件未定，需复核"}。`,
      );
      linkRescues(check, affecting);
      checks.push(check);
      relations.push({
        kind,
        tokenIds: orderedTokens([left, right]).map((t) => t.tokenId),
        status,
        findingIds: [check.id],
      });
    }
  }
  return { checks, relations };
}

function rhymeFor(
  lines: Token[][],
  template: TemplateDefinition,
): { check: Finding; rhyme: ProsodyReport["rhyme"] } {
  const endings = template.requiredRhymeLines.map(
    (n) => lines[n - 1]?.[template.width - 1],
  );
  const result = checkCommonRhyme(
    endings.map((token) => ({
      hasUnknown: !token || token.toneStatus === "unknown",
      options:
        token?.candidates
          .filter((c) => token.effectiveCandidateIds.includes(c.id))
          .map((c) => ({ tone: c.tone, groupIds: c.groupIds })) ?? [],
    })),
  );
  const messages = {
    all_readings_match: "全部有效读音配置均满足平声韵脚公共归部",
    no_common_group: "必韵句无法同时满足平声与公共归部，存在出韵或韵脚声调不符",
    reading_dependent: "只有部分读音配置可同韵，需复核",
    unknown: "韵脚读音或归部不全，不能排除未知韵脚后判通过",
    candidate_limit: "韵部交集状态超过计算上限，需复核",
    no_endings: "无必韵脚",
  };
  return {
    check: finding(
      "RHYME.COMMON",
      template.id,
      endings,
      result.status,
      ["全部必韵脚为平声且有公共韵部"],
      result.possibleCommonGroupIds,
      `${messages[result.reason]}。首句借邻韵无已审核关系表时不自动放行。`,
    ),
    rhyme: {
      status: result.status,
      tokenIds: orderedTokens(endings).map((t) => t.tokenId),
      commonGroupIds: result.possibleCommonGroupIds,
    },
  };
}

export function evaluateTemplate(
  poem: AnnotatedPoem,
  template: TemplateDefinition,
): Omit<ProsodyReport, "candidates" | "selectedTemplateId"> {
  const lines = linesOf(poem);
  const rescues = rescuesFor(lines, template);
  const meter = meterFor(lines, template, rescues);
  const special = specialChecks(lines, template, rescues);
  const relations = relationsFor(lines, template, rescues);
  const rhyme = rhymeFor(lines, template);
  const checks = [
    ...meter,
    ...special,
    ...relations.checks,
    rhyme.check,
    ...rescues.map((r) => r.finding),
  ];
  for (const check of checks)
    check.relatedFindingIds = unique(check.relatedFindingIds).sort();
  return { checks, rhyme: rhyme.rhyme, relations: relations.relations };
}

function ratio(statuses: CheckStatus[]): number | null {
  const evaluated = statuses.filter((s) => s === "pass" || s === "fail");
  return evaluated.length === 0
    ? null
    : evaluated.filter((s) => s === "pass").length / evaluated.length;
}

export function candidateFor(
  poem: AnnotatedPoem,
  template: TemplateDefinition,
): TemplateCandidate {
  const report = evaluateTemplate(poem, template);
  const fixed = report.checks.filter(
    (c) => c.ruleId === "METER.POSITION" && c.expected.length === 1,
  );
  const features: TemplateCandidate["features"] = {
    toneFit: ratio(fixed.map((c) => c.status)),
    relationFit: ratio(report.relations.map((r) => r.status)),
    rhymeFit: ratio([report.rhyme.status]),
    parallelismFit: null,
  };
  const weights = {
    toneFit: 0.65,
    relationFit: 0.2,
    rhymeFit: 0.1,
    parallelismFit: 0.05,
  };
  let sum = 0;
  let weight = 0;
  for (const key of Object.keys(weights) as Array<keyof typeof weights>) {
    const value = features[key];
    if (value !== null) {
      sum += value * weights[key];
      weight += weights[key];
    }
  }
  return {
    id: template.id,
    formId: template.formId,
    lineTypes: template.lineTypes,
    expectedTones: template.expectedTones,
    requiredRhymeLines: template.requiredRhymeLines,
    evaluatedKeyRate:
      fixed.length === 0
        ? 0
        : fixed.filter((c) => c.status === "pass" || c.status === "fail")
            .length / fixed.length,
    features,
    score: weight === 0 ? null : sum / weight,
  };
}

function pending(
  input: EvaluateInput,
  status: "uncertain" | "unsupported",
  message: string,
): Finding {
  return finding(
    "METER.POSITION",
    input.selectedTemplateId,
    [],
    status,
    ["确定且受支持的整诗模板"],
    [],
    message,
    "warning",
    ":template",
  );
}

/** 未选模板只保留所有候选一致的诊断；不取最高分模板冒充用户/体裁选择。 */
function consensus(
  reports: ReturnType<typeof evaluateTemplate>[],
): ReturnType<typeof evaluateTemplate> {
  const signature = (check: Finding) =>
    JSON.stringify([
      check.ruleId,
      check.ruleVersion,
      check.status,
      check.severity,
      check.locations,
      check.expected,
      check.observed,
      check.resolvedBy,
    ]);
  const maps = reports.map(
    (report) =>
      new Map(report.checks.map((check) => [signature(check), check])),
  );
  const common = reports[0]!.checks.filter((check) =>
    maps.every((map) => map.has(signature(check))),
  );
  const included = common.filter(
    (check) =>
      check.resolvedBy === null ||
      common.some(
        (other) =>
          other.ruleId === check.resolvedBy &&
          other.status === "pass" &&
          check.relatedFindingIds.includes(other.id),
      ),
  );
  const ids = new Map(
    included.map((check) => [
      check.id,
      check.id.replace(`:${check.templateId}:`, ":unselected:"),
    ]),
  );
  const checks = included.map((check) => ({
    ...check,
    id: ids.get(check.id)!,
    templateId: null,
    message:
      check.ruleId === "METER.POSITION"
        ? `所有候选模板在该字位的允许集合一致：${check.expected.map((t) => (t === "P" ? "平" : "仄")).join("或")}；${check.status === "pass" ? "本位通过" : check.status === "fail" ? "此字平仄不符" : "读音或救法条件未定，需复核"}。${check.resolvedBy ? `共同认可的救法为 ${check.resolvedBy}，原始平仄记录保留。` : ""}`
        : `所有候选模板共有的诊断：${check.message}`,
    relatedFindingIds: check.relatedFindingIds.flatMap((id) =>
      ids.has(id) ? [ids.get(id)!] : [],
    ),
  }));
  const first = reports[0]!;
  const rhyme = reports.every(
    (r) => JSON.stringify(r.rhyme) === JSON.stringify(first.rhyme),
  )
    ? first.rhyme
    : {
        status: "uncertain" as const,
        tokenIds: unique(reports.flatMap((r) => r.rhyme.tokenIds)),
        commonGroupIds: [],
      };
  const relations = first.relations
    .filter((r) => r.findingIds.every((id) => ids.has(id)))
    .map((r) => ({ ...r, findingIds: r.findingIds.map((id) => ids.get(id)!) }));
  return { checks, rhyme, relations };
}

export function evaluate(input: EvaluateInput): ProsodyReport {
  const candidates = structuredClone(input.candidates);
  if (input.applicability === "not_applicable")
    return {
      candidates,
      selectedTemplateId: null,
      checks: [],
      rhyme: { status: "not_applicable", tokenIds: [], commonGroupIds: [] },
      relations: [],
    };
  const definitions = getTemplates().filter(
    (t) =>
      compatible(input.poem, t) && input.candidates.some((c) => c.id === t.id),
  );
  const selected = definitions.find((t) => t.id === input.selectedTemplateId);
  if (
    input.applicability === "unsupported" ||
    definitions.length === 0 ||
    (input.selectedTemplateId !== null && !selected)
  )
    return {
      candidates,
      selectedTemplateId: null,
      checks: [
        pending(
          input,
          "unsupported",
          "形式、模板或结构不受支持，不能输出合律结论。",
        ),
      ],
      rhyme: { status: "unsupported", tokenIds: [], commonGroupIds: [] },
      relations: [],
    };
  const report = selected
    ? evaluateTemplate(input.poem, selected)
    : consensus(definitions.map((t) => evaluateTemplate(input.poem, t)));
  if (!selected)
    report.checks.push(
      pending(
        input,
        "uncertain",
        "整诗模板尚未确定，仅返回各候选共有诊断；请确认体式与起式。",
      ),
    );
  if (input.applicability === "uncertain") {
    for (const check of report.checks) {
      if (check.severity === "error") check.severity = "warning";
      check.message = `近体适用性待确认，仅作参考：${check.message}`;
    }
    if (selected)
      report.checks.push(
        pending(
          input,
          "uncertain",
          "近体规则适用性尚未确认，不能据参考谱式宣布全篇合律。",
        ),
      );
  }
  return { candidates, selectedTemplateId: selected?.id ?? null, ...report };
}
