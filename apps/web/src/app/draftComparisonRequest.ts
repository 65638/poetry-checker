import {
  PoetryAssistantRequestSchema,
  type PoetryAssistantRequest,
} from "@poetry/contracts";
import type { InputDraft } from "../view-contract";
import type { NotebookEntry } from "./notebook";
import { sha256Hex } from "../utils/sha256";

export interface DraftChoice {
  id: string;
  label: string;
  text: string;
}

/** Comparing expression uses the exact text; rule settings do not create a new literary version. */
export function draftComparisonChoices(
  current: InputDraft,
  entries: NotebookEntry[],
): DraftChoice[] {
  const choices: DraftChoice[] = [];
  const seen = new Set<string>();
  const add = (text: string, label: string) => {
    if (!text.trim() || seen.has(text.trim())) return;
    seen.add(text.trim());
    choices.push({ id: sha256Hex(text), text, label });
  };
  add(current.text, "当前稿");
  for (const entry of [...entries].reverse()) {
    const date = new Date(entry.at).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const note = entry.note.trim().slice(0, 28);
    add(entry.after.text, `${date} · 修改后${note ? ` · ${note}` : ""}`);
    add(entry.before.text, `${date} · 修改前${note ? ` · ${note}` : ""}`);
  }
  return choices;
}

export function buildDraftComparison(
  before: DraftChoice,
  after: DraftChoice,
  intention: string,
): Extract<PoetryAssistantRequest, { task: "compare" }> {
  if (before.text.trim() === after.text.trim())
    throw new Error("两版文字相同，请选择有文字改动的版本。");
  const parsed = PoetryAssistantRequestSchema.parse({
    task: "compare",
    left: before.text,
    right: after.text,
    revision: {
      beforeLabel: before.label,
      afterLabel: after.label,
      ...(intention.trim() ? { intention: intention.trim() } : {}),
    },
  });
  if (parsed.task !== "compare") throw new Error("请选择两份稿件。");
  return parsed;
}
