import { LibraryWorkSchema, type LibraryWork } from "@poetry/contracts";
import type { InputDraft } from "../view-contract";
import { DRAFT_KEY, parseSavedDraft } from "./draftPersistence";
import { NOTEBOOK_KEY, NOTEBOOK_LIMIT, parseNotebook } from "./notebook";
import {
  SHELF_KEY,
  FAVORITES_LIMIT,
  readShelf,
  shelfId,
} from "./dictionaryShelf";
import {
  READING_JOURNAL_KEY,
  READING_JOURNAL_LIMIT,
  parseReadingJournal,
} from "./readingJournal";
import { digest, libraryStorage, LIBRARY_LIMIT, mergeLibrary } from "./library";

export const FAVORITE_POEMS_KEY = "poetry-library-favorites-v1";
export const BACKUP_BYTES = 20 * 1024 * 1024;
export const BACKUP_KEYS = [
  DRAFT_KEY,
  NOTEBOOK_KEY,
  SHELF_KEY,
  READING_JOURNAL_KEY,
  FAVORITE_POEMS_KEY,
  "poetry-reading-size",
  "poetry-reading-quiet",
  "pc-motion-effects",
] as const;
type BackupKey = (typeof BACKUP_KEYS)[number];
type LocalRecords = Partial<Record<BackupKey, string>>;
interface Snapshot {
  local: LocalRecords;
  works: LibraryWork[];
}
export interface LocalBackup extends Snapshot {
  kind: "poetry-workspace-backup";
  version: 1;
  createdAt: string;
  checksum: string;
}
export interface BackupPort {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  readWorks: () => Promise<LibraryWork[]>;
  writeWorks: (works: LibraryWork[]) => Promise<void>;
}
export function browserBackupPort(): BackupPort {
  return {
    storage: localStorage,
    readWorks: () => libraryStorage("read"),
    writeWorks: (works) => libraryStorage("write", works),
  };
}
const invalid = () => new Error("备份内容不完整或格式不符，尚未写入本机数据。");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function favoriteIds(raw: string): string[] {
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some((id) => typeof id !== "string" || !id || id.length > 160)
  )
    throw invalid();
  return [...new Set(value as string[])];
}
function validateRecord(key: BackupKey, raw: string): string {
  if (key === "poetry-reading-size") {
    if (!["0", "1", "2"].includes(raw)) throw invalid();
    return raw;
  }
  if (key === "poetry-reading-quiet" || key === "pc-motion-effects") {
    if (
      !(
        key === "pc-motion-effects" ? ["on", "off"] : ["true", "false"]
      ).includes(raw)
    )
      throw invalid();
    return raw;
  }
  if (key === DRAFT_KEY) {
    const value = object(JSON.parse(raw));
    const parsed = parseSavedDraft(raw);
    if (
      Object.keys(parsed).some(
        (k) => value[k] !== parsed[k as keyof InputDraft],
      )
    )
      throw invalid();
    return JSON.stringify(parsed);
  }
  if (key === NOTEBOOK_KEY)
    return JSON.stringify({
      version: 1,
      entries: parseNotebook(JSON.parse(raw)),
    });
  if (key === FAVORITE_POEMS_KEY) return JSON.stringify(favoriteIds(raw));
  if (key === SHELF_KEY) {
    const value = object(JSON.parse(raw));
    const shelf = readShelf(raw);
    if (
      !Array.isArray(value.favorites) ||
      !Array.isArray(value.recent) ||
      shelf.favorites.length !== value.favorites.length ||
      shelf.recent.length !== value.recent.length
    )
      throw invalid();
    return JSON.stringify(shelf);
  }
  const value: unknown = JSON.parse(raw);
  const visits = parseReadingJournal(raw);
  if (
    !Array.isArray(value) ||
    visits.length !== value.length ||
    visits.some((v) => v.id.length > 160)
  )
    throw invalid();
  return JSON.stringify(visits);
}
function validateWorks(value: unknown): LibraryWork[] {
  const works = LibraryWorkSchema.array().max(LIBRARY_LIMIT).parse(value);
  if (
    new Set(works.map((w) => w.id)).size !== works.length ||
    works.some((w) => [...w.paragraphs.join("\n")].length > 20000)
  )
    throw invalid();
  return works;
}
async function snapshot(port: BackupPort): Promise<Snapshot> {
  const works = validateWorks(await port.readWorks());
  const local: LocalRecords = {};
  for (const key of BACKUP_KEYS) {
    const value = port.storage.getItem(key);
    if (value !== null) {
      validateRecord(key, value);
      local[key] = value;
    }
  }
  return { local, works };
}
export async function makeLocalBackup(
  port: BackupPort,
  draft?: InputDraft,
): Promise<LocalBackup> {
  const state = await snapshot(port);
  if (draft)
    state.local[DRAFT_KEY] = validateRecord(DRAFT_KEY, JSON.stringify(draft));
  const body = {
    kind: "poetry-workspace-backup" as const,
    version: 1 as const,
    createdAt: new Date().toISOString(),
    ...state,
  };
  const backup = { ...body, checksum: await digest(JSON.stringify(body)) };
  if (new TextEncoder().encode(JSON.stringify(backup)).length > BACKUP_BYTES)
    throw new Error("本机资料超过20MB，请分别导出诗库和笺记。");
  return backup;
}
export async function parseLocalBackup(raw: string): Promise<LocalBackup> {
  if (new TextEncoder().encode(raw).length > BACKUP_BYTES)
    throw new Error("备份文件超过20MB，请使用分项导入。");
  try {
    const value = object(JSON.parse(raw.replace(/^\uFEFF/u, "")));
    if (
      value.kind !== "poetry-workspace-backup" ||
      value.version !== 1 ||
      typeof value.createdAt !== "string" ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      typeof value.checksum !== "string"
    )
      throw invalid();
    const local = object(value.local);
    for (const [key, record] of Object.entries(local)) {
      if (
        !(BACKUP_KEYS as readonly string[]).includes(key) ||
        typeof record !== "string"
      )
        throw invalid();
      validateRecord(key as BackupKey, record);
    }
    validateWorks(value.works);
    const body = {
      kind: value.kind,
      version: value.version,
      createdAt: value.createdAt,
      local,
      works: value.works,
    };
    if ((await digest(JSON.stringify(body))) !== value.checksum)
      throw new Error(
        "备份校验不符，文件可能不完整或被修改；尚未写入本机数据。",
      );
    return { ...body, checksum: value.checksum } as LocalBackup;
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("备份校验"))
      throw cause;
    throw new Error("无法读取这份备份，请选择本网站导出的完整备份文件。", {
      cause,
    });
  }
}
export interface RestoreOptions {
  draft: boolean;
  preferences: boolean;
}
export interface RestorePlan {
  before: Snapshot;
  after: Snapshot;
  draft?: InputDraft;
  added: {
    works: number;
    notes: number;
    favorites: number;
    characters: number;
  };
}
export async function planLocalRestore(
  port: BackupPort,
  incoming: LocalBackup,
  options: RestoreOptions,
): Promise<RestorePlan> {
  const before = await snapshot(port);
  const local: LocalRecords = { ...before.local };
  const currentWorks = new Map(before.works.map((w) => [w.id, w]));
  for (const work of incoming.works) {
    const current = currentWorks.get(work.id);
    if (
      current &&
      JSON.stringify(current) !== JSON.stringify(LibraryWorkSchema.parse(work))
    )
      throw new Error(
        `《${work.title}》存在相同编号的不同内容，请先分别导出版本。`,
      );
  }
  const merged = mergeLibrary(before.works, incoming.works);
  const added = { works: merged.added, notes: 0, favorites: 0, characters: 0 };
  let restoredDraft: InputDraft | undefined;
  for (const key of BACKUP_KEYS) {
    const raw = incoming.local[key];
    if (raw === undefined) continue;
    const valid = validateRecord(key, raw);
    const current = before.local[key];
    if (key === DRAFT_KEY) {
      if (options.draft) {
        local[key] = valid;
        restoredDraft = parseSavedDraft(valid);
      }
    } else if (key === NOTEBOOK_KEY) {
      const old = parseNotebook(
        JSON.parse(current ?? '{"version":1,"entries":[]}'),
      );
      const rows = parseNotebook(JSON.parse(valid));
      const ids = new Map(old.map((n) => [n.id, n]));
      if (
        rows.some(
          (n) =>
            ids.has(n.id) &&
            JSON.stringify(ids.get(n.id)) !== JSON.stringify(n),
        )
      )
        throw new Error("存在编号相同、内容不同的推敲笺，本次尚未合并。");
      const next = [...old, ...rows.filter((n) => !ids.has(n.id))].sort(
        (a, b) => Date.parse(a.at) - Date.parse(b.at),
      );
      if (next.length > NOTEBOOK_LIMIT)
        throw new Error("合并后超过80笺，请先分别备份并整理笺记。");
      added.notes = next.length - old.length;
      local[key] = JSON.stringify({ version: 1, entries: next });
    } else if (key === FAVORITE_POEMS_KEY) {
      const old = favoriteIds(current ?? "[]");
      const next = [...new Set([...old, ...favoriteIds(valid)])];
      if (next.length > 1000)
        throw new Error("合并后超过1000首收藏，请先整理收藏。");
      added.favorites = next.length - old.length;
      local[key] = JSON.stringify(next);
    } else if (key === SHELF_KEY) {
      const old = readShelf(current ?? null),
        value = readShelf(valid);
      const favorites = [
        ...new Map(
          [...old.favorites, ...value.favorites].map((v) => [shelfId(v), v]),
        ).values(),
      ];
      if (favorites.length > FAVORITES_LIMIT)
        throw new Error("合并后超过24个字笺收藏，请先整理字笺。");
      added.characters = favorites.length - old.favorites.length;
      local[key] = JSON.stringify({
        favorites,
        recent: [
          ...new Map(
            [...old.recent, ...value.recent].map((v) => [shelfId(v), v]),
          ).values(),
        ].slice(0, 12),
      });
    } else if (key === READING_JOURNAL_KEY) {
      const visits = [
        ...parseReadingJournal(current ?? null),
        ...parseReadingJournal(valid),
      ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      const seen = new Set<string>();
      local[key] = JSON.stringify(
        visits
          .filter((v) => {
            if (seen.has(v.id)) return false;
            seen.add(v.id);
            return true;
          })
          .slice(0, READING_JOURNAL_LIMIT),
      );
    } else if (options.preferences) local[key] = valid;
  }
  return {
    before,
    after: { local, works: merged.works },
    ...(restoredDraft ? { draft: restoredDraft } : {}),
    added,
  };
}

/** localStorage writes are rolled back if an IDB transaction fails; the corpus is written last. */
export async function applyLocalRestore(
  port: BackupPort,
  plan: RestorePlan,
): Promise<void> {
  if (JSON.stringify(await snapshot(port)) !== JSON.stringify(plan.before))
    throw new Error("本机数据在预览后发生了变化，请重新预览再合并。");
  const written: BackupKey[] = [];
  try {
    for (const key of BACKUP_KEYS) {
      const next = plan.after.local[key];
      if (next === undefined || next === plan.before.local[key]) continue;
      port.storage.setItem(key, next);
      written.push(key);
    }
    if (JSON.stringify(plan.before.works) !== JSON.stringify(plan.after.works))
      await port.writeWorks(plan.after.works);
  } catch (cause) {
    let restored = true;
    for (const key of written.reverse()) {
      try {
        // Preserve a change made in another tab while IndexedDB was completing.
        if (port.storage.getItem(key) !== plan.after.local[key]) continue;
        const previous = plan.before.local[key];
        if (previous === undefined) port.storage.removeItem(key);
        else port.storage.setItem(key, previous);
      } catch {
        restored = false;
      }
    }
    throw new Error(
      restored
        ? "本次合并未完成，已回退本次写入；请检查浏览器存储空间后重试。"
        : "本次合并未完成，部分本机设置未能回退，请保留备份文件并检查存储空间。",
      { cause },
    );
  }
}
