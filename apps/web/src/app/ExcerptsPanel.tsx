import { useState } from "react";
import type { LibraryWork } from "@poetry/contracts";
import type { useExcerpts } from "../hooks/useExcerpts";
import { excerptText, findExcerptWork, type Excerpt } from "./excerpts";
import "./excerpts.css";

export function ExcerptsPanel({
  shelf,
  works,
  onOpen,
}: {
  shelf: ReturnType<typeof useExcerpts>;
  works: LibraryWork[];
  onOpen: (work: LibraryWork, quote: Excerpt) => void;
}) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<
    Record<string, { text: string; base: string }>
  >({});
  const [notice, setNotice] = useState("");
  const visible = [...shelf.entries]
    .reverse()
    .filter((entry) =>
      `${entry.text}\n${entry.title}\n${entry.author}\n${entry.note}`.includes(
        query.trim(),
      ),
    );
  return (
    <section className="pc-excerpt-notebook" role="tabpanel" aria-label="摘句">
      <header>
        <h2>摘句 · 留住心动的一行</h2>
        <p>在原诗点“摘句”，便会收入这里。写下感想，也能回原诗再读。</p>
      </header>
      <div className="pc-studio-actions">
        <label>
          查找摘句{" "}
          <input
            aria-label="查找摘句"
            placeholder="诗句、作者或随手记"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="pc-studio-meta">
          {visible.length} / {shelf.entries.length} 条 · 最多200条
        </span>
        <button
          type="button"
          className="pc-studio-action"
          disabled={!shelf.entries.length}
          onClick={() => {
            const content = shelf.entries
              .map((entry) => excerptText(entry, true))
              .join("\n\n——\n\n");
            const url = URL.createObjectURL(
              new Blob([content], { type: "text/plain;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "我的摘句.txt";
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setNotice("摘句文本已生成；迁移可使用页面底部的完整备份。");
          }}
        >
          下载全部摘句
        </button>
      </div>
      {shelf.error && (
        <p role="alert" className="pc-studio-error">
          {shelf.error}
        </p>
      )}
      {notice && (
        <p role="status" className="pc-studio-notice">
          {notice}
        </p>
      )}
      {shelf.removed && (
        <p className="pc-studio-notice">
          已移除《{shelf.removed.title}》的一条摘句。{" "}
          <button
            type="button"
            className="pc-studio-action"
            onClick={() => shelf.undoRemove()}
          >
            撤销移除
          </button>
        </p>
      )}
      {!visible.length && (
        <p className="pc-studio-empty">
          {shelf.entries.length
            ? "没有相符的摘句，试试另一句诗或作者。"
            : "还没有摘句。打开一首诗，把喜欢的诗句留在这里。"}
        </p>
      )}
      {visible.map((entry) => {
        const work = findExcerptWork(entry, works);
        const edit = pending[entry.id];
        return (
          <article key={entry.id} className="pc-excerpt-entry">
            <blockquote>{entry.text}</blockquote>
            <p>
              {entry.author || "作者未载"} · 《{entry.title}》
            </p>
            <p className="pc-studio-meta">
              来源：{entry.source || "未注明"}{" "}
              {entry.sourceUrl && (
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
                  查看来源
                </a>
              )}
            </p>
            <div className="pc-studio-actions">
              <button
                type="button"
                className="pc-studio-action"
                disabled={!work}
                onClick={() => work && onOpen(work, entry)}
              >
                回原诗
              </button>
              <button
                type="button"
                className="pc-studio-action"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(excerptText(entry))
                    .then(() =>
                      setNotice("诗句已复制，附原作与来源；随手记保留在本机。"),
                    )
                    .catch(() =>
                      setNotice("复制未成功，可下载摘句文本或手动选中复制。"),
                    );
                }}
              >
                复制诗句
              </button>
              <button
                type="button"
                className="pc-studio-action"
                onClick={() => {
                  if (shelf.remove(entry.id).saved) {
                    setPending((old) => {
                      const next = { ...old };
                      delete next[entry.id];
                      return next;
                    });
                    setNotice("");
                  }
                }}
              >
                移除
              </button>
            </div>
            {!work && (
              <p className="pc-studio-meta">
                当前诗库中没有匹配的原诗版本，所摘正文和来源仍保留。
              </p>
            )}
            <label className="pc-excerpt-note">
              随手记
              <textarea
                aria-label={`《${entry.title}》摘句随手记`}
                maxLength={1000}
                value={edit?.text ?? entry.note}
                placeholder="这一句，让你想起了什么？"
                onChange={(e) => {
                  const value = e.target.value;
                  setPending((old) => ({
                    ...old,
                    [entry.id]: {
                      text: value,
                      base: old[entry.id]?.base ?? entry.note,
                    },
                  }));
                }}
              />
            </label>
            <button
              type="button"
              className="pc-studio-action"
              disabled={!edit || edit.text === entry.note}
              onClick={() => {
                if (!edit) return;
                if (shelf.saveNote(entry.id, edit.text, edit.base).saved) {
                  setPending((old) => {
                    const next = { ...old };
                    delete next[entry.id];
                    return next;
                  });
                  setNotice("随手记已保存。");
                }
              }}
            >
              保存随手记
            </button>
          </article>
        );
      })}
    </section>
  );
}
