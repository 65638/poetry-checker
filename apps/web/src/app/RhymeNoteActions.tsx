import { useState } from "react";
import type { ReadingCandidate } from "@poetry/contracts";
import type { RhymeTaskInput } from "../api/rhyme-batches";
import { copyText } from "../utils/browser";
import { buildRhymeNote } from "./rhymeNote";

export function RhymeNoteActions({
  input,
  matches,
  candidates,
}: {
  input: RhymeTaskInput;
  matches: Array<{ id: string; reason: string }>;
  candidates: ReadingCandidate[];
}) {
  const [notice, setNotice] = useState<{
    input: RhymeTaskInput;
    matches: typeof matches;
    text: string;
  } | null>(null);
  async function perform(action: "copy" | "download") {
    try {
      const text = buildRhymeNote(input, matches, candidates);
      if (action === "copy") await copyText(text);
      else {
        const url = URL.createObjectURL(
          new Blob([text], { type: "text/plain;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "同韵推敲笺.txt";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice({
        input,
        matches,
        text:
          action === "copy"
            ? "原诗与荐字理由已复制，可直接分享。"
            : "荐字笺已生成，请在浏览器下载中查看。",
      });
    } catch (cause) {
      setNotice({
        input,
        matches,
        text:
          action === "copy"
            ? "复制未完成，可尝试下载荐字笺。"
            : cause instanceof Error
              ? cause.message
              : "暂未能导出，请重试。",
      });
    }
  }
  return (
    <div className="pc-study-result-actions">
      <div className="pc-studio-actions" role="group" aria-label="分享荐字">
        <button
          type="button"
          className="pc-studio-action"
          onClick={() => void perform("copy")}
        >
          复制荐字笺
        </button>
        <button
          type="button"
          className="pc-studio-action"
          onClick={() => void perform("download")}
        >
          下载荐字笺
        </button>
      </div>
      {notice?.input === input && notice.matches === matches && (
        <p className="pc-studio-meta" role="status">
          {notice.text}
        </p>
      )}
    </div>
  );
}
