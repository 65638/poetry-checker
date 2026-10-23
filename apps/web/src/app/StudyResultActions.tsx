import { useState } from "react";
import { StudyShareOptions } from "./StudyShareOptions";
import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";
import {
  createStudyEntry,
  downloadStudy,
  saveStudyEntry,
  copyStudy,
} from "./studyArchive";

export function StudyResultActions({
  input,
  result,
  title,
}: {
  input: PoetryAssistantRequest | null;
  result: PoetryAssistantResponse | null;
  title?: string;
}) {
  const [includeHistory, setIncludeHistory] = useState(false);
  const [notice, setNotice] = useState<{
    result: PoetryAssistantResponse;
    text: string;
  } | null>(null);
  if (!input || !result || !["critique", "compare"].includes(result.task))
    return null;
  async function perform(action: "save" | "copy" | "download") {
    if (!input || !result) return;
    try {
      const entry = createStudyEntry(input, result, title);
      if (action === "save") {
        const added = saveStudyEntry(entry);
        setNotice({
          result,
          text: added
            ? "已收入本机研读收藏，刷新后也能查看。"
            : "这份评议已收藏。",
        });
      } else if (action === "copy") {
        await copyStudy(entry, includeHistory);
        setNotice({ result, text: "原诗与评议已复制，可直接分享。" });
      } else {
        downloadStudy(entry, includeHistory);
        setNotice({ result, text: "研读文本已生成，请在浏览器下载中查看。" });
      }
    } catch (cause) {
      setNotice({
        result,
        text:
          action === "copy"
            ? "剪贴板暂不可用，可下载研读文本。"
            : cause instanceof Error
              ? cause.message
              : "未能保存，请重试。",
      });
    }
  }
  return (
    <div className="pc-study-result-actions">
      {input.task === "critique" && input.followUp && (
        <StudyShareOptions
          includeHistory={includeHistory}
          onChange={setIncludeHistory}
        />
      )}
      <div
        className="pc-studio-actions"
        role="group"
        aria-label="保存与分享研读"
      >
        <button
          type="button"
          className="pc-studio-action"
          onClick={() => void perform("save")}
        >
          收藏评议
        </button>
        <button
          type="button"
          className="pc-studio-action"
          onClick={() => void perform("copy")}
        >
          复制评议
        </button>
        <button
          type="button"
          className="pc-studio-action"
          onClick={() => void perform("download")}
        >
          下载评议
        </button>
      </div>
      {notice?.result === result && (
        <p className="pc-studio-meta" role="status">
          {notice.text}
        </p>
      )}
    </div>
  );
}
