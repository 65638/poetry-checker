import { sourceLinkUrl } from "../utils/sourceLinks.js";
import type { LibraryWork } from "@poetry/contracts";

export const READING_JOURNAL_KEY = "poetry-reading-journal-v1";
export const READING_JOURNAL_LIMIT = 12;
export interface ReadingVisit {
  id: string;
  at: string;
}

export function parseReadingJournal(raw: string | null): ReadingVisit[] {
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values
      .filter((value): value is ReadingVisit => {
        if (!value || typeof value !== "object") return false;
        const v = value as Record<string, unknown>;
        if (
          typeof v.id !== "string" ||
          !v.id ||
          seen.has(v.id) ||
          typeof v.at !== "string" ||
          !Number.isFinite(Date.parse(v.at))
        )
          return false;
        seen.add(v.id);
        return true;
      })
      .slice(0, READING_JOURNAL_LIMIT)
      .map(({ id, at }) => ({ id, at }));
  } catch {
    return [];
  }
}

export function recordReading(
  visits: ReadingVisit[],
  id: string,
  at = new Date().toISOString(),
): ReadingVisit[] {
  return [{ id, at }, ...visits.filter((v) => v.id !== id)].slice(
    0,
    READING_JOURNAL_LIMIT,
  );
}

export function poemText(work: LibraryWork): string {
  return [
    `《${work.title}》`,
    [work.dynasty, work.author].filter(Boolean).join(" · ") || "作者未载",
    "",
    work.paragraphs.join("\n"),
    "",
    `来源：${work.source || "未注明"}`,
    ...(sourceLinkUrl(work.sourceUrl) ? [work.sourceUrl] : []),
  ].join("\n");
}

export function downloadPoem(work: LibraryWork) {
  const blob = new Blob([poemText(work)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const filename = Array.from(work.title, (char) =>
    char.codePointAt(0)! < 32 || /[<>:"/\\|?*]/u.test(char) ? "_" : char,
  ).join("");
  anchor.download = `${filename.slice(0, 80) || "诗文"}.txt`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
