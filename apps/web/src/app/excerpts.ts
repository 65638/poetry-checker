import { LibraryWorkSchema, type LibraryWork } from "@poetry/contracts";

export const EXCERPTS_KEY = "poetry-excerpts-v1";
export const EXCERPTS_LIMIT = 200;
export interface Excerpt {
  id: string;
  workId: string;
  title: string;
  author: string;
  dynasty: string;
  text: string;
  paragraph: number;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
  note: string;
}
export const excerptIdentity = (entry: Excerpt) =>
  JSON.stringify([entry.workId, entry.paragraph, entry.text, entry.sourceUrl]);
export function excerptArchive(entries: Excerpt[]) {
  return { kind: "poetry-excerpts" as const, version: 1 as const, entries };
}
export function parseExcerpts(raw: string | null): Excerpt[] {
  if (raw === null) return [];
  try {
    const value = JSON.parse(raw) as {
      kind?: unknown;
      version?: unknown;
      entries?: unknown;
    };
    if (
      value.kind !== "poetry-excerpts" ||
      value.version !== 1 ||
      !Array.isArray(value.entries) ||
      value.entries.length > EXCERPTS_LIMIT
    )
      throw new Error("format");
    const ids = new Set<string>();
    return value.entries.map((row: unknown) => {
      if (!row || typeof row !== "object") throw new Error("entry");
      const r = row as Record<string, unknown>;
      if (
        typeof r.id !== "string" ||
        !r.id ||
        r.id.length > 160 ||
        ids.has(r.id) ||
        !Number.isInteger(r.paragraph) ||
        Number(r.paragraph) < 0 ||
        Number(r.paragraph) >= 200 ||
        typeof r.createdAt !== "string" ||
        !Number.isFinite(Date.parse(r.createdAt)) ||
        typeof r.note !== "string" ||
        r.note.length > 1000
      )
        throw new Error("identity");
      const work = LibraryWorkSchema.parse({
        id: r.workId,
        title: r.title,
        author: r.author,
        dynasty: r.dynasty,
        paragraphs: [r.text],
        source: r.source,
        sourceUrl: r.sourceUrl,
        tags: [],
      });
      ids.add(r.id);
      return {
        id: r.id,
        workId: work.id,
        title: work.title,
        author: work.author,
        dynasty: work.dynasty,
        text: work.paragraphs[0]!,
        paragraph: Number(r.paragraph),
        source: work.source,
        sourceUrl: work.sourceUrl,
        createdAt: r.createdAt,
        note: r.note,
      };
    });
  } catch (cause) {
    throw new Error("本机摘句格式异常，原记录已保留，请先保存现有备份。", {
      cause,
    });
  }
}
export function addExcerpt(
  entries: Excerpt[],
  work: LibraryWork,
  paragraph: number,
  id: string = crypto.randomUUID(),
  at = new Date().toISOString(),
) {
  const text = work.paragraphs[paragraph];
  if (!Number.isInteger(paragraph) || text === undefined)
    throw new Error("这段诗文已变化，请回到原诗重新摘录。");
  const candidate: Excerpt = {
    id,
    workId: work.id,
    title: work.title,
    author: work.author,
    dynasty: work.dynasty,
    text,
    paragraph,
    source: work.source,
    sourceUrl: work.sourceUrl,
    createdAt: at,
    note: "",
  };
  if (
    entries.some(
      (entry) => excerptIdentity(entry) === excerptIdentity(candidate),
    )
  )
    return entries;
  if (entries.length >= EXCERPTS_LIMIT)
    throw new Error("已收藏200条摘句，请先导出备份或整理旧摘句。");
  return [...entries, candidate];
}
export function mergeExcerpts(
  current: Excerpt[],
  incoming: Excerpt[],
): Excerpt[] {
  const ids = new Map(current.map((entry) => [entry.id, entry]));
  const combined = [...current];
  for (const entry of incoming) {
    if (ids.has(entry.id)) {
      if (JSON.stringify(ids.get(entry.id)) !== JSON.stringify(entry))
        throw new Error(
          "同一条摘句的笔记或内容不同，请保留两份备份后分别整理。",
        );
      continue;
    }
    if (
      combined.some(
        (old) =>
          excerptIdentity(old) === excerptIdentity(entry) &&
          old.note === entry.note,
      )
    )
      continue;
    combined.push(entry);
    ids.set(entry.id, entry);
  }
  if (combined.length > EXCERPTS_LIMIT)
    throw new Error("合并后超过200条摘句，请先整理摘句。");
  return combined.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}
export function excerptText(entry: Excerpt, includeNote = false): string {
  return [
    entry.text,
    `——${entry.author || "作者未载"}《${entry.title}》`,
    `来源：${entry.source || "未注明"}`,
    ...(entry.sourceUrl ? [entry.sourceUrl] : []),
    ...(includeNote && entry.note ? [`随手记：${entry.note}`] : []),
  ].join("\n");
}
export function findExcerptWork(
  entry: Excerpt,
  works: LibraryWork[],
): LibraryWork | undefined {
  return works.find(
    (work) =>
      work.id === entry.workId &&
      work.sourceUrl === entry.sourceUrl &&
      work.paragraphs.includes(entry.text),
  );
}
