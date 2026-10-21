import { LibraryWorkSchema, type LibraryWork } from "@poetry/contracts";
import { EXAMPLES } from "./examples.js";

export const BUILTIN_WORKS: LibraryWork[] = EXAMPLES.map((work) => ({
  ...work,
  dynasty: "唐",
  paragraphs: work.text.match(/[^。！？]+[。！？]?/gu) ?? [work.text],
  source: "项目名篇示例（J03 固定正文）",
  sourceUrl: null,
  tags: [],
}));
export const LIBRARY_LIMIT = 10000;
export const IMPORT_BYTES = 10 * 1024 * 1024;
export async function digest(text: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const contentKey = (work: LibraryWork) =>
  JSON.stringify([
    work.title,
    work.author,
    work.paragraphs.join("").replace(/\s+/gu, ""),
    work.sourceUrl,
  ]);
export async function parseLibraryImport(
  raw: string,
  filename: string,
): Promise<LibraryWork[]> {
  if (new TextEncoder().encode(raw).length > IMPORT_BYTES)
    throw new Error("单次导入最多10MB，请分批导入。");
  let value: unknown;
  try {
    value = filename.toLowerCase().endsWith(".jsonl")
      ? raw
          .replace(/^\uFEFF/u, "")
          .split(/\r?\n/u)
          .filter((s) => s.trim())
          .map((s) => JSON.parse(s))
      : JSON.parse(raw.replace(/^\uFEFF/u, ""));
  } catch {
    throw new Error("文件不是有效的JSON或JSONL。");
  }
  const object =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const rows = Array.isArray(value) ? value : (object.works ?? object.poems);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > LIBRARY_LIMIT)
    throw new Error("需要包含1至10000首诗的数组，或works/poems数组。");
  const result: LibraryWork[] = [];
  for (const [i, row] of rows.entries()) {
    if (!row || typeof row !== "object")
      throw new Error(`第${i + 1}条作品无效，未导入任何记录。`);
    const r = row as Record<string, unknown>;
    const source =
      r.source && typeof r.source === "object"
        ? (r.source as Record<string, unknown>)
        : {};
    const text = r.paragraphs ?? r.content ?? r.text;
    const paragraphs =
      typeof text === "string"
        ? text.split(/\r?\n/u).filter((s) => s.trim())
        : text;
    const parsed = LibraryWorkSchema.safeParse({
      id: "pending",
      title: r.title ?? r.name,
      author: r.author ?? "",
      dynasty: r.dynasty ?? "",
      paragraphs,
      source:
        typeof r.source === "string" ? r.source : (source.name ?? filename),
      sourceUrl: r.sourceUrl ?? r.url ?? source.url ?? null,
      tags: r.tags ?? [],
      kind: r.kind,
      collection: r.collection,
    });
    if (
      !parsed.success ||
      !/^https?:\/\//iu.test(parsed.data.sourceUrl ?? "https://placeholder") ||
      parsed.data.paragraphs.join("\n").length > 20000
    )
      throw new Error(
        `第${i + 1}首的题名、正文、来源或标签不符合格式，未导入任何记录。`,
      );
    result.push({
      ...parsed.data,
      id: `poem:${(await digest(contentKey(parsed.data))).slice(0, 32)}`,
    });
  }
  return result;
}
export function mergeLibrary(current: LibraryWork[], incoming: LibraryWork[]) {
  const result = [...current];
  const keys = new Set(current.map(contentKey));
  for (const work of incoming) {
    if (keys.has(contentKey(work))) continue;
    result.push(work);
    keys.add(contentKey(work));
  }
  if (result.length > LIBRARY_LIMIT)
    throw new Error("合并后超过10000首，本次未导入。");
  return {
    works: result,
    added: result.length - current.length,
    duplicates: incoming.length - (result.length - current.length),
  };
}
const THEMES = [
  {
    triggers: ["思乡", "思鄉", "乡愁", "鄉愁", "故乡", "故鄉"],
    words: ["乡", "鄉", "故", "归", "歸", "客", "愁", "月"],
  },
  {
    triggers: ["雨夜", "夜雨"],
    words: ["雨", "夜", "霖", "滴", "灯", "燈", "窗"],
  },
  {
    triggers: ["江", "水", "舟", "船"],
    words: ["江", "河", "水", "舟", "船", "帆", "流", "波"],
  },
  {
    triggers: ["孤", "独", "獨", "寂寞"],
    words: ["孤", "独", "獨", "寂", "空", "愁"],
  },
  {
    triggers: ["送别", "送別", "离别", "離別"],
    words: ["送", "别", "別", "离", "離", "客", "去", "归", "歸"],
  },
  {
    triggers: ["山林", "隐居", "隱居", "田园", "田園"],
    words: ["山", "林", "松", "竹", "田", "野", "溪", "闲", "閒"],
  },
];
export interface LibraryHit {
  work: LibraryWork;
  score: number;
  excerpt: string;
}
export function searchLibrary(
  works: LibraryWork[],
  query: string,
  scene = false,
): LibraryHit[] {
  const q = query.trim().toLowerCase();
  const segments = q.split(/\s+/u).filter(Boolean);
  const themes = scene
    ? THEMES.filter((t) => t.triggers.some((v) => q.includes(v)))
    : [];
  const literal = (value: string) =>
    segments.reduce(
      (n, term) =>
        n + (value.toLowerCase().includes(term) ? term.length * 8 : 0),
      0,
    );
  const phrases = [...q].slice(0, -1).map((c, i) => c + [...q][i + 1]);
  const passageScore = (value: string) => {
    const counts = themes.map(
      (t) => t.words.filter((w) => value.includes(w)).length,
    );
    const coverage = counts.filter(Boolean).length;
    return (
      literal(value) +
      (scene
        ? coverage * 12 +
          (themes.length && coverage === themes.length ? 20 : 0) +
          counts.reduce((n, count) => n + Math.min(count, 3) * 2, 0) +
          phrases.filter((p) => value.includes(p)).length * 8
        : 0)
    );
  };
  return works
    .map((work) => {
      const sentences = work.paragraphs.flatMap(
        (p) => p.match(/[^。！？\n]+[。！？]?/gu) ?? [p],
      );
      const lines = sentences.map((line, i) => {
        const excerpt =
          scene && i + 1 < sentences.length ? line + sentences[i + 1] : line;
        return { line: excerpt, score: passageScore(excerpt) };
      });
      const best = lines.reduce(
        (a, b) => (b.score > a.score ? b : a),
        lines[0]!,
      );
      return {
        work,
        score:
          literal(
            `${work.title} ${work.author} ${work.dynasty} ${work.tags.join(" ")}`,
          ) *
            2 +
          best.score,
        excerpt: best.line,
      };
    })
    .filter((hit) => !q || hit.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function readingSections(work: LibraryWork): LibraryWork[] {
  const text = work.paragraphs.join("\n");
  if (
    [...text].length <= 2000 &&
    (text.match(/[，。！？；\n]/gu)?.length ?? 0) <= 80
  )
    return [work];
  const chunks: string[][] = [];
  let current: string[] = [],
    length = 0;
  for (const paragraph of work.paragraphs) {
    for (const piece of paragraph.match(/[^，。！？；\n]+[，。！？；]?/gu) ?? [
      paragraph,
    ]) {
      const chars = [...piece];
      for (let i = 0; i < chars.length; i += 1600) {
        const part = chars.slice(i, i + 1600).join("");
        if (
          current.length &&
          (length + [...part].length + 1 > 1800 || current.length >= 60)
        ) {
          chunks.push(current);
          current = [];
          length = 0;
        }
        current.push(part);
        length += [...part].length + 1;
      }
    }
  }
  if (current.length) chunks.push(current);
  return chunks.map((paragraphs, i) => ({
    ...work,
    title: `${work.title}（选段${i + 1}/${chunks.length}）`,
    paragraphs,
  }));
}

export async function libraryStorage(mode: "read"): Promise<LibraryWork[]>;
export async function libraryStorage(
  mode: "write",
  works: LibraryWork[],
): Promise<void>;
export async function libraryStorage(
  mode: "read" | "write",
  works?: LibraryWork[],
): Promise<LibraryWork[] | void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("poetry-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("corpus");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("本机诗库无法打开，请导出备份后重试。"));
  });
  try {
    return await new Promise<LibraryWork[] | void>((resolve, reject) => {
      const transaction = database.transaction(
        "corpus",
        mode === "read" ? "readonly" : "readwrite",
      );
      const store = transaction.objectStore("corpus");
      let loaded: LibraryWork[] = [];
      if (mode === "read") {
        const request = store.get("works");
        request.onsuccess = () => {
          try {
            loaded =
              request.result === undefined
                ? []
                : LibraryWorkSchema.array()
                    .max(LIBRARY_LIMIT)
                    .parse(request.result);
          } catch {
            transaction.abort();
            reject(new Error("已存诗库格式无效，未覆盖设备记录。"));
          }
        };
      } else store.put(works, "works");
      transaction.oncomplete = () =>
        resolve(mode === "read" ? loaded : undefined);
      transaction.onerror = () =>
        reject(new Error("诗库未能保存到本设备，请导出备份。"));
      transaction.onabort = () =>
        reject(new Error("诗库存储操作已中止，原记录保留。"));
    });
  } finally {
    database.close();
  }
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
