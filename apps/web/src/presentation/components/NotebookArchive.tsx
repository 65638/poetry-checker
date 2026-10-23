import { useState } from "react";
import { changedSpan, type NotebookEntry } from "../../app/notebook";
import type { InputDraft } from "../../view-contract";
import { notebookChanges } from "../../app/notebookDiff";

export function NotebookArchive({
  entries,
  busy,
  onRestore,
}: {
  entries: NotebookEntry[];
  busy: boolean;
  onRestore: (draft: InputDraft, note: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [feedback, setFeedback] = useState("");
  const matches = [...entries]
    .reverse()
    .filter(
      (entry) =>
        (!onlyChanges ||
          JSON.stringify(entry.before) !== JSON.stringify(entry.after)) &&
        `${entry.note}\n${entry.before.text}\n${entry.after.text}`.includes(
          query.trim(),
        ),
    );
  return (
    <div className="pc-notebook-archive">
      <div className="pc-studio-actions">
        <label className="pc-notebook-note">
          查找笺记
          <input
            aria-label="查找推敲笺"
            placeholder="诗句或修改原因"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="pc-studio-inline-label">
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={(e) => setOnlyChanges(e.target.checked)}
          />
          只看有改动
        </label>
      </div>
      <p className="pc-studio-meta">
        {matches.length} / {entries.length} 笺 · 保留最近 80 笺
      </p>
      {feedback && (
        <p role="status" className="pc-studio-notice">
          {feedback}
        </p>
      )}
      {!matches.length && (
        <p className="pc-studio-empty">
          {entries.length
            ? "未找到相符的笺记，试试另一句诗或清空筛选。"
            : "还没有笺记。写下修改原因，存下第一版。"}
        </p>
      )}
      {matches.map((entry) => {
        const diff = changedSpan(entry.before.text, entry.after.text);
        const changes = notebookChanges(entry.before.text, entry.after.text);
        return (
          <article className="pc-notebook-entry" key={entry.id}>
            <header>
              <time dateTime={entry.at}>
                {new Date(entry.at).toLocaleString("zh-CN", { hour12: false })}
              </time>
              <button
                className="pc-studio-action"
                disabled={busy}
                onClick={() =>
                  onRestore(entry.after, `恢复推敲笺：${entry.note}`)
                }
              >
                恢复此版
              </button>
            </header>
            <p>{entry.note}</p>
            {entry.before.text !== entry.after.text && (
              <p className="pc-poetry-substitution">
                <del>{diff.removed || "（无）"}</del>
                <span aria-hidden="true">→</span>
                <ins>{diff.added || "（无）"}</ins>
              </p>
            )}
            <details>
              <summary>原稿与此版</summary>
              <div className="pc-notebook-diff">
                <div>
                  <h4>原稿</h4>
                  <p>{entry.before.text || "（空稿）"}</p>
                </div>
                <div>
                  <h4>此版</h4>
                  <p>{entry.after.text || "（空稿）"}</p>
                </div>
              </div>
              <details className="pc-notebook-line-diff">
                <summary>查看逐行改动</summary>
                <div
                  className="pc-notebook-lines"
                  role="region"
                  aria-label="逐行改动"
                >
                  {changes.map((row, i) => (
                    <p key={i} data-change={row.kind}>
                      {row.kind === "removed" ? (
                        <del>
                          <span aria-label="删除">− </span>
                          {row.text || "（空行）"}
                        </del>
                      ) : row.kind === "added" ? (
                        <ins>
                          <span aria-label="新增">+ </span>
                          {row.text || "（空行）"}
                        </ins>
                      ) : (
                        <span>{row.text || "（空行）"}</span>
                      )}
                    </p>
                  ))}
                </div>
              </details>
              {entry.before.rhymeBook !== entry.after.rhymeBook && (
                <p className="pc-studio-meta">
                  韵书已更换；各版格律需按各自设置检查。
                </p>
              )}
              <div className="pc-studio-actions">
                <button
                  className="pc-studio-action"
                  disabled={busy}
                  onClick={() =>
                    onRestore(entry.before, `恢复修改前：${entry.note}`)
                  }
                >
                  恢复修改前
                </button>
                <button
                  className="pc-studio-action"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(entry.after.text)
                      .then(() => setFeedback("此版诗文已复制。"))
                      .catch(() =>
                        setFeedback("复制未成功，可选中此版诗文手动复制。"),
                      );
                  }}
                >
                  复制此版
                </button>
              </div>
            </details>
          </article>
        );
      })}
    </div>
  );
}
