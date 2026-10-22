import type { InputDraft } from "../view-contract";
import { parseSavedDraft } from "./draftPersistence";

export const DRAFT_COLLECTION_KEY = "poetry-draft-collection-v1";
export const DRAFT_COLLECTION_LIMIT = 50;
export interface SavedPoemDraft {
  id: string;
  title: string;
  createdAt: string;
  draft: InputDraft;
}
export const draftCollectionArchive = (entries: SavedPoemDraft[]) => ({
  kind: "poetry-draft-collection" as const,
  version: 1 as const,
  entries,
});
export const draftIdentity = (draft: InputDraft) =>
  JSON.stringify([
    draft.text,
    draft.rhymeBook,
    draft.genreHint,
    draft.formHint,
  ]);
export function suggestedDraftTitle(draft: InputDraft): string {
  return [
    ...(draft.text
      .split(/[\n，。！？；]/u)
      .find((line) => line.trim())
      ?.trim() ?? "未题诗稿"),
  ]
    .slice(0, 16)
    .join("");
}
export function parseDraftCollection(raw: string | null): SavedPoemDraft[] {
  if (raw === null) return [];
  try {
    const value = JSON.parse(raw) as {
      kind?: unknown;
      version?: unknown;
      entries?: unknown;
    };
    if (
      value.kind !== "poetry-draft-collection" ||
      value.version !== 1 ||
      !Array.isArray(value.entries) ||
      value.entries.length > DRAFT_COLLECTION_LIMIT
    )
      throw new Error("format");
    const ids = new Set<string>();
    return value.entries.map((entry: unknown) => {
      if (!entry || typeof entry !== "object") throw new Error("entry");
      const row = entry as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        !row.id ||
        row.id.length > 160 ||
        ids.has(row.id) ||
        typeof row.title !== "string" ||
        !row.title.trim() ||
        row.title.length > 80 ||
        typeof row.createdAt !== "string" ||
        !Number.isFinite(Date.parse(row.createdAt)) ||
        !row.draft ||
        typeof row.draft !== "object"
      )
        throw new Error("metadata");
      const draft = parseSavedDraft(JSON.stringify(row.draft));
      if (
        !draft.text.trim() ||
        Object.entries(draft).some(
          ([key, val]) => (row.draft as Record<string, unknown>)[key] !== val,
        )
      )
        throw new Error("draft");
      ids.add(row.id);
      return { id: row.id, title: row.title, createdAt: row.createdAt, draft };
    });
  } catch (cause) {
    throw new Error(
      "稿匣记录暂时无法读取，原内容已保留；请先保留备份再处理。",
      { cause },
    );
  }
}
export function savePoemDraft(
  entries: SavedPoemDraft[],
  draft: InputDraft,
  title = suggestedDraftTitle(draft),
  id: string = crypto.randomUUID(),
  createdAt = new Date().toISOString(),
): SavedPoemDraft[] {
  if (!draft.text.trim()) throw new Error("先写几句诗，再收入稿匣。");
  if (!title.trim() || title.trim().length > 80)
    throw new Error("诗稿标题请填1至80字。");
  if (entries.some((e) => draftIdentity(e.draft) === draftIdentity(draft)))
    return entries;
  const next = [
    ...entries,
    { id, title: title.trim(), createdAt, draft: { ...draft } },
  ];
  if (next.length > DRAFT_COLLECTION_LIMIT)
    throw new Error("稿匣已满50篇，请先备份并整理旧稿。");
  return parseDraftCollection(JSON.stringify(draftCollectionArchive(next)));
}
export function mergeDraftCollections(
  current: SavedPoemDraft[],
  incoming: SavedPoemDraft[],
): SavedPoemDraft[] {
  const merged = [...current];
  const ids = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const existing = ids.get(entry.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(entry))
        throw new Error("同编号诗稿的内容不同，请保留两份备份后分别整理。");
      continue;
    }
    if (
      merged.some(
        (e) =>
          e.title === entry.title &&
          draftIdentity(e.draft) === draftIdentity(entry.draft),
      )
    )
      continue;
    merged.push(entry);
    ids.set(entry.id, entry);
  }
  if (merged.length > DRAFT_COLLECTION_LIMIT)
    throw new Error("合并后超过50篇诗稿，请先整理稿匣。");
  return merged.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}
