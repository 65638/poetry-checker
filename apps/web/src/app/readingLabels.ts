import type { AnnotatedToken, ReadingCandidate } from "@poetry/contracts";

/** Reader-facing explanation; raw IDs and audit reasons remain in the original report. */
export function readingExplanation(token: AnnotatedToken): string {
  if (token.selectionMethod === "model")
    return token.reason.replace(/^GLM自动辨音/u, "AI语境辨音");
  if (token.selectionMethod === "user") return "采用你为这个字选定的读音。";
  if (token.selectionMethod === "unique")
    return "所选韵书中只有一个候选读音，平仄据此标注。";
  if (token.selectionMethod === "context_rule") {
    const context = /「([^」]+)」[（(]([^）)]+)[）)]/u.exec(token.reason);
    return context
      ? `依据「${context[1]}」的用法（${context[2]}）选择此读音。`
      : "依据已载入的语境规则选择此读音。";
  }
  if (!token.candidates.length)
    return "所选韵书暂缺此字的可用记录，可查阅其他字典来源。";
  if (!token.effectiveCandidateIds.length)
    return "虽有字典候选，但暂无可用于当前判断的读音依据。";
  if (token.toneStatus === "resolved" && token.tone)
    return `有${token.effectiveCandidateIds.length}个候选读音，暂未选定；这些候选都为${token.tone === "P" ? "平" : "仄"}声。`;
  return `当前语境依据不足，暂保留${token.effectiveCandidateIds.length}个候选读音。`;
}

const marks: Record<string, string[]> = {
  a: [..."āáǎà"],
  e: [..."ēéěè"],
  i: [..."īíǐì"],
  o: [..."ōóǒò"],
  u: [..."ūúǔù"],
  ü: [..."ǖǘǚǜ"],
};
/** Format only the supplied modern reading; never derive historical tone or a new pronunciation. */
export function formatModernReading(
  reading: NonNullable<ReadingCandidate["modernReading"]>,
): string {
  const raw = reading.pinyin.trim().normalize("NFC");
  const tone = reading.toneNumber;
  const fallback = `${raw} · ${tone === 5 ? "轻声" : `第${tone}声`}`;
  let base = raw.replace(/u:/giu, "ü").replace(/v/giu, "ü");
  const suffix = /([0-5])$/u.exec(base);
  if (suffix && (Number(suffix[1]) || 5) !== tone) return fallback;
  if (suffix) base = base.slice(0, -1);
  if (
    [...base.toLowerCase()].filter((char) =>
      Object.values(marks).some((variants) => variants.includes(char)),
    ).length > 1
  )
    return fallback;
  let markedTone = 0;
  for (const [letter, variants] of Object.entries(marks)) {
    for (const [index, variant] of variants.entries()) {
      if (base.toLowerCase().includes(variant)) {
        if (markedTone || index + 1 !== tone) return fallback;
        markedTone = index + 1;
        base = base
          .replaceAll(variant, letter)
          .replaceAll(variant.toUpperCase(), letter.toUpperCase());
      }
    }
  }
  if (!/^[a-zü]+$/iu.test(base)) return fallback;
  if (tone === 5) return base;
  const lower = base.toLowerCase();
  const position = lower.includes("a")
    ? lower.indexOf("a")
    : lower.includes("e")
      ? lower.indexOf("e")
      : lower.includes("ou")
        ? lower.indexOf("o")
        : Math.max(...["i", "o", "u", "ü"].map((vowel) => lower.lastIndexOf(vowel)));
  if (position < 0) return fallback;
  let marked = marks[lower[position]!]![tone - 1]!;
  if (base[position] !== lower[position]) marked = marked.toUpperCase();
  return base.slice(0, position) + marked + base.slice(position + 1);
}
