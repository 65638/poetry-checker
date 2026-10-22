import {
  PoetryAssistantRequestSchema,
  PoetryAssistantResponseSchema,
  type PoetryAssistantRequest,
  type PoetryAssistantResponse,
} from "@poetry/contracts";
import { sha256Hex } from "../utils/sha256";

export const STUDY_ARCHIVE_KEY = "poetry-study-archive-v1";
export const STUDY_ARCHIVE_EVENT = "poetry-study-archive-changed";
export const STUDY_ARCHIVE_LIMIT = 60;
type StudyInput = Extract<
  PoetryAssistantRequest,
  { task: "critique" | "compare" }
>;
type StudyResult = Extract<
  PoetryAssistantResponse,
  { task: "critique" | "compare" }
>;
export interface StudyEntry {
  id: string;
  title: string;
  createdAt: string;
  input: StudyInput;
  response: StudyResult;
}
export const studyArchive = (entries: StudyEntry[]) => ({
  kind: "poetry-study-archive",
  version: 1,
  entries,
});
export function createStudyEntry(
  input: PoetryAssistantRequest,
  response: PoetryAssistantResponse,
  title?: string,
  createdAt = new Date().toISOString(),
): StudyEntry {
  const parsed = PoetryAssistantRequestSchema.parse(input);
  const result = PoetryAssistantResponseSchema.parse(response);
  if (
    (parsed.task !== "critique" && parsed.task !== "compare") ||
    (result.task !== "critique" && result.task !== "compare") ||
    parsed.task !== result.task ||
    result.inputHash !== sha256Hex(JSON.stringify(parsed))
  )
    throw new Error("这份评议与原诗不对应，尚未保存。");
  const rawLabel =
    title?.trim() ||
    (parsed.task === "compare"
      ? "两诗对读"
      : [...parsed.text.trim().split(/[，。！？\n]/u)[0]!]
          .slice(0, 16)
          .join(""));
  const label = [...rawLabel].slice(0, 120).join("");
  if (!label || !Number.isFinite(Date.parse(createdAt)))
    throw new Error("收藏标题或日期不完整。");
  return {
    id: sha256Hex(JSON.stringify([parsed, result])),
    title: label,
    createdAt,
    input: parsed,
    response: result,
  };
}
export function parseStudyArchive(raw: string | null): StudyEntry[] {
  if (raw === null) return [];
  try {
    if (raw.length > 3 * 1024 * 1024) throw new Error("size");
    const value = JSON.parse(raw) as {
      kind?: unknown;
      version?: unknown;
      entries?: unknown;
    };
    if (
      !value ||
      value.kind !== "poetry-study-archive" ||
      value.version !== 1 ||
      !Array.isArray(value.entries) ||
      value.entries.length > STUDY_ARCHIVE_LIMIT
    )
      throw new Error("format");
    const seen = new Set<string>();
    return value.entries.map((row: unknown) => {
      if (!row || typeof row !== "object") throw new Error("entry");
      const r = row as StudyEntry;
      if (
        typeof r.title !== "string" ||
        !r.title.trim() ||
        [...r.title].length > 120 ||
        typeof r.createdAt !== "string"
      )
        throw new Error("metadata");
      const entry = createStudyEntry(r.input, r.response, r.title, r.createdAt);
      if (entry.id !== r.id || seen.has(entry.id)) throw new Error("identity");
      seen.add(entry.id);
      return entry;
    });
  } catch (cause) {
    throw new Error(
      "研读收藏暂时无法读取，原记录已保留；请先保留备份再处理。",
      { cause },
    );
  }
}
export function mergeStudyEntries(
  current: StudyEntry[],
  incoming: StudyEntry[],
): StudyEntry[] {
  const merged = [...current];
  const ids = new Set(current.map((entry) => entry.id));
  for (const entry of incoming) {
    if (ids.has(entry.id)) continue;
    merged.push(entry);
    ids.add(entry.id);
  }
  if (merged.length > STUDY_ARCHIVE_LIMIT)
    throw new Error("研读收藏已超过60份，请先导出备份并整理旧记录。");
  return parseStudyArchive(JSON.stringify(studyArchive(merged)));
}
export function saveStudyEntry(entry: StudyEntry): boolean {
  const current = parseStudyArchive(localStorage.getItem(STUDY_ARCHIVE_KEY));
  if (current.some((row) => row.id === entry.id)) return false;
  const next = mergeStudyEntries(current, [entry]);
  writeStudyEntries(next);
  return true;
}
export function writeStudyEntries(entries: StudyEntry[]) {
  const raw = JSON.stringify(studyArchive(entries));
  parseStudyArchive(raw);
  try {
    localStorage.setItem(STUDY_ARCHIVE_KEY, raw);
  } catch (cause) {
    throw new Error(
      "本机空间不足或存储不可用，尚未保存；可以先复制或下载这份评议。",
      { cause },
    );
  }
  window.dispatchEvent(new Event(STUDY_ARCHIVE_EVENT));
}
const bookNames = { pingshui: "平水韵", cilin: "词林正韵", xinyun: "中华新韵" };
const directionNames = {
  meaning: "保留原意",
  imagery: "加强画面",
  sound: "节奏声律",
};
export function studyText(entry: StudyEntry): string {
  const { input, response } = entry;
  const rows = [entry.title, ""];
  if (input.task === "critique" && response.task === "critique") {
    rows.push(
      `${input.mode === "reading" ? "原诗赏读" : "写作推敲"} · ${directionNames[input.direction]} · ${bookNames[input.rhymeBook]}`,
      "",
      "原诗",
      input.text,
      "",
      "通篇观照",
      response.result.overview,
    );
    if (response.result.strengths.length)
      rows.push(
        "",
        "可取之处",
        ...response.result.strengths.map((text) => `• ${text}`),
      );
    if (response.result.revisions.length) {
      rows.push("", "推敲建议");
      for (const edit of response.result.revisions) {
        const position = /^l(\d+)c(\d+)$/u.exec(edit.startTokenId);
        rows.push(
          `${position ? `第${position[1]}句第${position[2]}字起：` : ""}“${edit.original}” → “${edit.replacement}”`,
          `原因：${edit.reason}`,
          `取舍：${edit.tradeoff}`,
          "",
        );
      }
    }
  } else if (input.task === "compare" && response.task === "compare") {
    rows.push(
      "两诗对读",
      "",
      "左诗",
      input.left,
      "",
      "右诗",
      input.right,
      "",
      "合卷细读",
      response.result.overview,
    );
    for (const aspect of response.result.aspects)
      rows.push(
        "",
        aspect.name,
        `左诗：${aspect.left}`,
        `右诗：${aspect.right}`,
      );
  }
  rows.push("", "AI 辅助研读，仅供参考。");
  return rows
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
export async function copyStudy(entry: StudyEntry) {
  await navigator.clipboard.writeText(studyText(entry));
}
export function downloadStudy(entry: StudyEntry) {
  const url = URL.createObjectURL(
    new Blob([studyText(entry)], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${entry.title.replace(/[\\/:*?"<>|]/gu, "_").slice(0, 60)}-研读.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
