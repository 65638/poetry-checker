import {
  AnalyzeRequestSchema,
  type AnnotatedToken,
  type Revision,
} from "@poetry/contracts";
import type { InputDraft } from "../view-contract";
export const NOTEBOOK_KEY = "poetry-notebook-v1";
export const NOTEBOOK_LIMIT = 80;
export interface NotebookEntry {
  id: string;
  at: string;
  before: InputDraft;
  after: InputDraft;
  note: string;
}
function parseDraft(value: unknown): InputDraft {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).text !== "string"
  )
    throw new Error("推敲笺缺少原文。");
  const text = (value as { text: string }).text;
  if ([...text].length > 2000) throw new Error("推敲笺原文超过2000字。");
  const record = value as Record<string, unknown>;
  return {
    text,
    rhymeBook: AnalyzeRequestSchema.shape.rhymeBook.parse(record.rhymeBook),
    genreHint: AnalyzeRequestSchema.shape.genreHint.parse(record.genreHint),
    formHint: AnalyzeRequestSchema.shape.formHint.parse(record.formHint),
  };
}
export function parseNotebook(value: unknown): NotebookEntry[] {
  if (!value || typeof value !== "object") throw new Error("推敲笺格式无效。");
  const root = value as Record<string, unknown>;
  if (
    root.version !== 1 ||
    !Array.isArray(root.entries) ||
    root.entries.length > NOTEBOOK_LIMIT
  )
    throw new Error("推敲笺版本或数量不符合要求。");
  const ids = new Set<string>();
  return root.entries.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new Error("推敲记录无效。");
    const r = row as Record<string, unknown>;
    if (
      typeof r.id !== "string" ||
      !r.id ||
      ids.has(r.id) ||
      typeof r.at !== "string" ||
      !Number.isFinite(Date.parse(r.at)) ||
      typeof r.note !== "string" ||
      r.note.length > 8000
    )
      throw new Error("推敲记录的身份或时间无效。");
    ids.add(r.id);
    return {
      id: r.id,
      at: r.at,
      note: r.note,
      before: parseDraft(r.before),
      after: parseDraft(r.after),
    };
  });
}
export function readNotebook(): NotebookEntry[] {
  try {
    return parseNotebook(
      JSON.parse(
        localStorage.getItem(NOTEBOOK_KEY) ?? '{"version":1,"entries":[]}',
      ),
    );
  } catch {
    return [];
  }
}
export function applyRevision(
  text: string,
  edit: Revision,
  tokens: AnnotatedToken[],
): string {
  const start = tokens.find((t) => t.tokenId === edit.startTokenId);
  const end = tokens.find((t) => t.tokenId === edit.endTokenId);
  if (
    !start ||
    !end ||
    start.line !== end.line ||
    start.startUtf16 > end.startUtf16 ||
    text.slice(start.startUtf16, end.endUtf16) !== edit.original
  )
    throw new Error("原文已变化，请重新评议后再采纳。");
  return (
    text.slice(0, start.startUtf16) +
    edit.replacement +
    text.slice(end.endUtf16)
  );
}
export function changedSpan(before: string, after: string) {
  const a = [...before],
    b = [...after];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length,
    endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return {
    prefix: a.slice(0, start).join(""),
    removed: a.slice(start, endA).join(""),
    added: b.slice(start, endB).join(""),
    suffix: a.slice(endA).join(""),
  };
}
