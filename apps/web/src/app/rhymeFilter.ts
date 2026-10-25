import type { ReadingCandidate, RhymeWordsResponse } from "@poetry/contracts";

type Entries = RhymeWordsResponse["lookup"]["entries"];
const toneClasses: Record<string, ReadingCandidate["toneClass"][]> = {
  平声: ["ping", "yinping", "yangping"],
  仄声: ["shang", "qu", "ru", "ze_unspecified"],
  上声: ["shang"],
  去声: ["qu"],
  入声: ["ru"],
  阴平: ["yinping"],
  阴平声: ["yinping"],
  阳平: ["yangping"],
  阳平声: ["yangping"],
  轻声: ["neutral"],
};
const marks: Record<string, number> = {
  "\u0304": 1,
  "\u0301": 2,
  "\u030c": 3,
  "\u0300": 4,
};

function pinyin(value: string): { base: string; tone?: number } | null {
  let raw = value.trim().toLowerCase().replace(/u:/gu, "ü").replace(/v/gu, "ü");
  const suffix = /([0-5])$/u.exec(raw);
  let tone = suffix ? Number(suffix[1]) || 5 : undefined;
  if (suffix) raw = raw.slice(0, -1);
  let base = "";
  let markCount = 0;
  for (const letter of raw.normalize("NFD")) {
    const marked = marks[letter];
    if (marked !== undefined) {
      if (++markCount > 1 || (tone !== undefined && tone !== marked))
        return null;
      tone = marked;
    } else base += letter;
  }
  base = base.normalize("NFC");
  return /^[a-zü]+$/u.test(base) ? { base, tone } : null;
}

/** Filtering never chooses a reading: a matching row keeps every original candidate. */
export function filterRhymeEntries(entries: Entries, query: string): Entries {
  const terms = query.trim().normalize("NFC").split(/\s+/u).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter((entry) => {
    // Character terms apply to the row; pronunciation terms must agree on one reading.
    const readingTerms = terms.filter(
      (term) => !entry.character.includes(term),
    );
    if (!readingTerms.length) return true;
    return entry.candidates.some((candidate) =>
      readingTerms.every((term) => {
        const allowed = Object.hasOwn(toneClasses, term)
          ? toneClasses[term]
          : undefined;
        if (allowed) return allowed.includes(candidate.toneClass);
        const requested = pinyin(term);
        const reading = candidate.modernReading;
        if (!requested || !reading) return false;
        const supplied = pinyin(reading.pinyin);
        if (!supplied || !supplied.base.startsWith(requested.base))
          return false;
        if (requested.tone === undefined) return true;
        return (
          requested.tone === reading.toneNumber &&
          (supplied.tone === undefined || supplied.tone === reading.toneNumber)
        );
      }),
    );
  });
}
