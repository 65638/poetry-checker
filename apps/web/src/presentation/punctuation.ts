import type { AnnotatedToken } from '@poetry/contracts';

/** Characters that close a parsed poem line. Keep in sync with readings parser. */
const LINE_BOUNDARIES = new Set(['，', '。', '；', '？', '！', ',', '.', ';', '?', '!']);
const AFTER_BOUNDARY_LAYOUT = new Set([
  '“', '”', '‘', '’', '「', '」', '『', '』', '（', '）', '(', ')',
  '《', '》', '〈', '〉', '【', '】', '〔', '〕',
]);

function codePointAt(text: string, offset: number): { value: string; next: number } {
  const value = String.fromCodePoint(text.codePointAt(offset)!);
  return { value, next: offset + value.length };
}

/**
 * Return the end of the first line boundary in a slice, including a closing
 * quote/bracket immediately after punctuation. Newline itself is excluded.
 */
function lineBoundaryEnd(text: string, start: number, limit: number): number | null {
  let offset = start;
  while (offset < limit) {
    const { value, next } = codePointAt(text, offset);
    if (value === '\n' || value === '\r') return null;
    if (LINE_BOUNDARIES.has(value)) {
      let end = next;
      while (end < limit) {
        const closing = codePointAt(text, end);
        if (!AFTER_BOUNDARY_LAYOUT.has(closing.value)) break;
        end = closing.next;
      }
      return end;
    }
    offset = next;
  }
  return null;
}

/**
 * Extract only the punctuation belonging to one displayed poem line.
 *
 * The previous implementation used the end of the whole original text when
 * the current token was the line's last token. For punctuation-separated lines
 * without newlines that made every later Chinese character appear in the
 * absolutely positioned punctuation slot at the right edge of the report.
 */
export function trailingPunctuation(
  original: string,
  token: AnnotatedToken,
  next: AnnotatedToken | undefined,
  lineEndUtf16?: number,
): string {
  const end = next?.startUtf16 ?? lineEndUtf16 ?? original.length;
  const segment = original.slice(token.endUtf16, end);
  if (next) return segment.trim();

  const boundaryEnd = lineBoundaryEnd(original, token.endUtf16, end);
  return boundaryEnd === null
    ? ''
    : original.slice(token.endUtf16, boundaryEnd).trim();
}
