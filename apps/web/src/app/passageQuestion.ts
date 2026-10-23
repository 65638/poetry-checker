import type { LibraryWork } from "@poetry/contracts";
import { readingSections } from "./library";

/** Map a paragraph by position, so repeated lines never jump to the first occurrence. */
export function passageQuestion(
  work: LibraryWork,
  paragraphIndex: number,
): {
  section: number;
  question: string;
} {
  if (
    !Number.isInteger(paragraphIndex) ||
    paragraphIndex < 0 ||
    !work.paragraphs[paragraphIndex]?.trim()
  )
    throw new Error("这段原文暂不可用，请重新打开作品。");
  const compact = (text: string) => text.replaceAll("\n", "");
  const paragraph = compact(work.paragraphs[paragraphIndex]!);
  const start = work.paragraphs
    .slice(0, paragraphIndex)
    .reduce((sum, text) => sum + compact(text).length, 0);
  const sections = readingSections(work);
  if (
    sections.map((section) => compact(section.paragraphs.join(""))).join("") !==
    compact(work.paragraphs.join(""))
  )
    throw new Error("选段与原文暂未对齐，请手动选择研读范围。");
  let offset = 0;
  for (const [index, section] of sections.entries()) {
    const body = compact(section.paragraphs.join(""));
    const end = offset + body.length;
    if (start < end) {
      const available = body.slice(
        start - offset,
        Math.min(start - offset + paragraph.length, body.length),
      );
      let quote = "";
      for (const character of available) {
        if (quote.length + character.length > 120) break;
        quote += character;
      }
      const excerpt = quote.length < paragraph.length ? "开头" : "";
      return {
        section: index,
        question: `请结合${sections.length > 1 ? "当前选段" : work.kind === "prose" ? "全文" : "全诗"}，解释原作第${paragraphIndex + 1}段${excerpt}“${quote}”的意思和表达作用。`,
      };
    }
    offset = end;
  }
  throw new Error("未找到这段原文，请重新选择。");
}
