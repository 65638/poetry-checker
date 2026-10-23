import {
  PoetryAssistantRequestSchema,
  PoetryAssistantResponseSchema,
  type PoetryAssistantRequest,
  type PoetryAssistantResponse,
} from "@poetry/contracts";
import { sha256Hex } from "../utils/sha256";
import { studyProse } from "./studyProseText";
import { comparisonSourceLabel } from "./comparisonPassages";

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
      ? parsed.revision
        ? "改稿对照"
        : "两诗对读"
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
export function renameStudyEntry(
  entries: StudyEntry[],
  id: string,
  title: string,
  expectedTitle: string,
): StudyEntry[] {
  const label = title.trim();
  if (!label || [...label].length > 120)
    throw new Error("标题请填写1至120个字。");
  const current = entries.find((entry) => entry.id === id);
  if (!current) throw new Error("这份收藏已被移除，请重新选择。");
  if (current.title !== expectedTitle)
    throw new Error("标题已在另一处更新，请重新打开修改。");
  const renamed = createStudyEntry(
    current.input,
    current.response,
    label,
    current.createdAt,
  );
  return entries.map((entry) => (entry.id === id ? renamed : entry));
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
export function studyText(
  entry: StudyEntry,
  options: { includeHistory?: boolean } = {},
): string {
  const { input, response } = entry;
  const rows = [entry.title, ""];
  if (input.task === "critique" && response.task === "critique") {
    if (input.question) rows.push("研读问题", input.question, "");
    if (input.followUp && options.includeHistory !== false) {
      rows.push("追问背景（此前的 AI 回答，仅供参考）");
      for (const turn of input.followUp.turns) {
        rows.push(turn.question ?? "通篇观照", turn.answer, "");
        if (turn.details)
          rows.push(
            ...(turn.detailsTruncated ? ["建议摘录（较长理由有所省略）"] : []),
            turn.details,
            "",
          );
      }
    }
    rows.push(
      `${input.mode === "reading" ? "原诗赏读" : "写作推敲"} · ${directionNames[input.direction]} · ${bookNames[input.rhymeBook]}`,
      "",
      "原诗",
      input.text,
      "",
      input.question ? "回应你的问题" : "通篇观照",
      studyProse(response.result.overview),
    );
    if (response.result.revisionNotice)
      rows.push("", "建议校验说明", response.result.revisionNotice);
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
    if (response.result.ruleReview) {
      const review = response.result.ruleReview;
      rows.push("", "格律依据", review.summary);
      if (review.reference) rows.push(`参考格式：${review.reference}`);
      rows.push(...review.checks.map((check) => `• ${check}`));
    }
  } else if (input.task === "compare" && response.task === "compare") {
    if (input.question) rows.push("对读问题", input.question, "");
    if (input.scope)
      rows.push(
        "对读范围（仅按所选文字比较，不据选段评定整篇）",
        `左卷：${comparisonSourceLabel(input.scope.left)}`,
        `右卷：${comparisonSourceLabel(input.scope.right)}`,
        "",
      );
    const leftLabel = input.revision ? "旧稿" : "左诗";
    const rightLabel = input.revision ? "新稿" : "右诗";
    rows.push(
      input.revision ? "修改前后" : "对读原文",
      "",
      input.revision
        ? `${leftLabel} · ${input.revision.beforeLabel}`
        : leftLabel,
      input.left,
      "",
      input.revision
        ? `${rightLabel} · ${input.revision.afterLabel}`
        : rightLabel,
      input.right,
      "",
      ...(input.revision?.intention
        ? ["修改意图", input.revision.intention, ""]
        : []),
      input.revision ? "修改得失" : "合卷细读",
      studyProse(response.result.overview),
    );
    for (const aspect of response.result.aspects)
      rows.push(
        "",
        aspect.name,
        `${leftLabel}：${aspect.left}`,
        `${rightLabel}：${aspect.right}`,
      );
    if (input.revision) rows.push("", "本次比较表达得失，不作合律判断。");
  }
  rows.push("", "AI 辅助研读，仅供参考。");
  return rows
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
export async function copyStudy(entry: StudyEntry, includeHistory = false) {
  await navigator.clipboard.writeText(studyText(entry, { includeHistory }));
}
export function downloadStudy(entry: StudyEntry, includeHistory = false) {
  const url = URL.createObjectURL(
    new Blob([studyText(entry, { includeHistory })], {
      type: "text/plain;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${entry.title.replace(/[\\/:*?"<>|]/gu, "_").slice(0, 60)}-研读.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
