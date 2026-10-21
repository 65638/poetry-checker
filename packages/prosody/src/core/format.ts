import type {
  AnnotatedPoem,
  AnnotatedToken,
  FormatIdentification,
  Tone,
} from "@poetry/contracts";
import type { TemplateDefinition } from "./templates.js";

const unique = (values: string[]) => [...new Set(values)].sort();
const intersection = (sets: string[][]): string[] =>
  sets.length
    ? unique(
        sets[0]!.filter((value) => sets.every((set) => set.includes(value))),
      )
    : [];
const toneOf = (token: AnnotatedToken | undefined): Tone | null =>
  token?.toneStatus === "resolved" && token.possibleTones.length === 1
    ? token.possibleTones[0]!
    : null;
const effective = (token: AnnotatedToken | undefined) =>
  token?.candidates.filter((c) => token.effectiveCandidateIds.includes(c.id)) ??
  [];

function rhymeDomain(token: AnnotatedToken | undefined) {
  const candidates = effective(token);
  return {
    known:
      candidates.length > 0 && candidates.every((c) => c.groupIds.length > 0),
    possible: unique(candidates.flatMap((c) => c.groupIds)),
    certain: intersection(candidates.map((c) => c.groupIds)),
  };
}

/** Body evidence excludes the entire first line and never chooses a reading. */
function bodySupport(poem: AnnotatedPoem, template: TemplateDefinition) {
  const tokens = new Map(poem.tokens.map((t) => [t.tokenId, t]));
  let total = 0,
    known = 0,
    matched = 0;
  for (let line = 1; line < poem.lines.length; line++) {
    for (let column = 1; column < template.width; column += 2) {
      const allowed = template.expectedTones[line]![column]!;
      if (allowed.length !== 1) continue;
      total++;
      const tone = toneOf(tokens.get(poem.lines[line]!.tokenIds[column]!));
      if (tone === null) continue;
      known++;
      if (allowed.includes(tone)) matched++;
    }
  }
  return known >= 6 && total > 0 && known / total >= 0.8
    ? matched / known
    : null;
}

export function identifyFormat(
  poem: AnnotatedPoem,
  templates: TemplateDefinition[],
): FormatIdentification | undefined {
  const base = templates[0];
  if (!base) return undefined;
  const byId = new Map(poem.tokens.map((t) => [t.tokenId, t]));
  const second = byId.get(poem.lines[0]!.tokenIds[1]!);
  const firstFoot = byId.get(poem.lines[0]!.tokenIds.at(-1)!);
  const evenFeet = poem.lines
    .filter((line) => line.line % 2 === 0)
    .map((line) => byId.get(line.tokenIds.at(-1)!));
  const startTone = toneOf(second);
  const start = startTone === "P" ? "ping" : startTone === "Z" ? "ze" : null;
  const startName = start === "ping" ? "平起" : "仄起";
  const scores = templates.map((template) => ({
    start: template.start,
    score: bodySupport(poem, template),
  }));
  const bestFor = (value: "ping" | "ze") =>
    Math.max(
      -1,
      ...scores.filter((s) => s.start === value).map((s) => s.score ?? -1),
    );
  const opposite = start === "ping" ? "ze" : "ping";
  const alternative =
    start !== null &&
    bestFor(opposite) >= 0.85 &&
    bestFor(opposite) - bestFor(start) >= 0.25
      ? opposite
      : null;
  const first = rhymeDomain(firstFoot);
  const even = evenFeet.map(rhymeDomain);
  const evenKnown = even.length > 0 && even.every((d) => d.known);
  const evenPossible = evenKnown
    ? intersection(even.map((d) => d.possible))
    : [];
  const evenCertain = evenKnown ? intersection(even.map((d) => d.certain)) : [];
  const evenLineStatus = !evenKnown
    ? "unknown"
    : !evenPossible.length
      ? "different"
      : evenCertain.length
        ? "shared"
        : "unknown";
  const shared =
    first.known &&
    evenCertain.length > 0 &&
    intersection([first.certain, evenCertain]).length > 0;
  const different =
    first.known &&
    evenLineStatus === "shared" &&
    intersection([first.possible, evenPossible]).length === 0;
  const observed = shared ? "shared" : different ? "different" : "unknown";
  const firstTone = toneOf(firstFoot);
  const evenPing = evenFeet.every((t) => toneOf(t) === "P");
  const evenZe =
    evenFeet.length > 0 && evenFeet.every((t) => toneOf(t) === "Z");
  const value =
    firstTone === "Z" && evenPing
      ? "unrhymed"
      : firstTone === "P" && evenPing && shared
        ? "rhymed"
        : "uncertain";
  const rhymeReason =
    value === "unrhymed"
      ? `首句末字「${firstFoot!.text}」为仄声；按平韵基本式作不入韵参考，不据此认定作者意图。`
      : value === "rhymed"
        ? "首句与偶数句均平收，所有有效读音组合存在共同韵部，作入韵参考。"
        : evenZe
          ? "偶数句韵脚均为仄声，现有常用平韵基本谱不能直接套用；首句用韵暂不强定。"
          : different
            ? "首句与偶数句共同韵部不同；可能出韵或涉及首句借韵，暂不确定参考用韵格式。"
            : evenLineStatus === "different"
              ? "偶数句尚无共同韵部，首句用韵暂不能确定。"
              : "韵脚的读音或共同韵部尚未确定，保留入韵与不入韵参考。";
  return {
    shape: {
      formId: base.formId,
      width: base.width,
      lineCount: base.lineCount,
      description: `${base.width === 5 ? "五" : "七"}言${base.lineCount === 4 ? "四" : "八"}句，符合${base.width === 5 ? "五" : "七"}${base.lineCount === 4 ? "绝" : "律"}形制；形制不等于已确认体裁。`,
    },
    start: {
      value: start,
      tokenId: second?.tokenId ?? null,
      reason:
        start === null
          ? `首句第二字${second ? `「${second.text}」` : ""}的平仄未定，保留两种起式。`
          : `${startName}：首句第二字「${second!.text}」的有效读音均为${startTone === "P" ? "平" : "仄"}声；这是按现有原文判断，非作者意图认定。`,
      evidenceIds: unique(second?.evidenceIds ?? []),
      alternative,
      alternativeReason: alternative
        ? `除首句外，其余诗句的关键位明显更接近${alternative === "ping" ? "平起" : "仄起"}格式；请核对首句第二字，也可切换参考格式。`
        : null,
    },
    firstLineRhyme: {
      value,
      observed,
      evenLineStatus,
      evenLineGroupIds: evenPossible,
      firstLineGroupIds: first.possible,
      reason: rhymeReason,
      evidenceIds: unique(
        [firstFoot, ...evenFeet].flatMap((t) => t?.evidenceIds ?? []),
      ),
    },
    referenceTemplateIds: templates
      .filter(
        (t) =>
          (start === null || t.start === start) &&
          (value === "uncertain" || t.firstLineRhymes === (value === "rhymed")),
      )
      .map((t) => t.id),
  };
}
