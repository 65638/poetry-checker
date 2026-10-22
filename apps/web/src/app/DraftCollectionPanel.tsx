import { useEffect, useState } from "react";
import type { InputDraft } from "../view-contract";
import {
  DRAFT_COLLECTION_KEY,
  draftCollectionArchive,
  draftIdentity,
  mergeDraftCollections,
  parseDraftCollection,
  savePoemDraft,
  suggestedDraftTitle,
  type SavedPoemDraft,
} from "./draftCollection";
import "./draft-collection.css";

function readCollection() {
  try {
    return {
      entries: parseDraftCollection(localStorage.getItem(DRAFT_COLLECTION_KEY)),
      error: "",
    };
  } catch (cause) {
    return {
      entries: [] as SavedPoemDraft[],
      error: cause instanceof Error ? cause.message : "稿匣暂时无法读取。",
    };
  }
}
export function DraftCollectionPanel({
  draft,
  onLoad,
  disabled,
}: {
  draft: InputDraft;
  onLoad: (draft: InputDraft, title: string) => void;
  disabled: boolean;
}) {
  const [state, setState] = useState(readCollection);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState<SavedPoemDraft | null>(null);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (!event.key || event.key === DRAFT_COLLECTION_KEY)
        setState(readCollection());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function change(update: (entries: SavedPoemDraft[]) => SavedPoemDraft[]) {
    try {
      const next = update(
        parseDraftCollection(localStorage.getItem(DRAFT_COLLECTION_KEY)),
      );
      localStorage.setItem(
        DRAFT_COLLECTION_KEY,
        JSON.stringify(draftCollectionArchive(next)),
      );
      setState({ entries: next, error: "" });
      return true;
    } catch (cause) {
      setState((old) => ({
        ...old,
        error:
          cause instanceof DOMException
            ? "存储空间不足或不可用，诗稿尚未保存；请先复制当前诗文。"
            : cause instanceof Error
              ? cause.message
              : "诗稿未能保存。",
      }));
      return false;
    }
  }
  const visible = [...state.entries]
    .reverse()
    .filter((entry) =>
      `${entry.title}\n${entry.draft.text}`.includes(query.trim()),
    );
  return (
    <details className="pc-draft-collection">
      <summary>
        稿匣 ·{" "}
        {state.entries.length ? `${state.entries.length}篇诗稿` : "分篇存稿"}
      </summary>
      <p>
        为不同的诗留一份底稿。打开旧稿前，会把当前未存的诗收入稿匣；不自动开始分析。
      </p>
      <div className="pc-draft-collection-actions">
        <label>
          诗稿标题
          <input
            aria-label="诗稿标题"
            maxLength={80}
            value={title}
            placeholder={suggestedDraftTitle(draft)}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={disabled || !draft.text.trim()}
          onClick={() => {
            let added = false;
            if (
              change((entries) => {
                const next = savePoemDraft(
                  entries,
                  draft,
                  title.trim() || suggestedDraftTitle(draft),
                );
                added = next.length > entries.length;
                return next;
              })
            ) {
              setNotice(
                added
                  ? "当前诗稿已收入稿匣。"
                  : "相同正文与检查设置已在稿匣中，无需重复保存。",
              );
              setTitle("");
            }
          }}
        >
          保存当前诗稿
        </button>
      </div>
      <label>
        查找诗稿
        <input
          aria-label="查找诗稿"
          value={query}
          placeholder="标题或诗句"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      {notice && <p role="status">{notice}</p>}
      {removed && (
        <p>
          已移除《{removed.title}》。
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (
                change((entries) => mergeDraftCollections(entries, [removed]))
              ) {
                setRemoved(null);
                setNotice("诗稿已恢复。");
              }
            }}
          >
            撤销移除
          </button>
        </p>
      )}
      {!visible.length && (
        <p>
          {state.entries.length
            ? "没有找到相符诗稿。"
            : "这里还没有诗稿；写下几句，再点击保存。"}
        </p>
      )}
      {visible.length > 0 && (
        <div
          className="pc-draft-collection-list"
          role="region"
          aria-label="已存诗稿"
          tabIndex={0}
        >
          {visible.map((entry) => (
            <article key={entry.id}>
              <strong>{entry.title}</strong>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <details>
                <summary>预览诗文 · {[...entry.draft.text].length}字</summary>
                <blockquote>{entry.draft.text}</blockquote>
              </details>
              <div className="pc-draft-collection-actions">
                <button
                  type="button"
                  disabled={
                    disabled ||
                    draftIdentity(entry.draft) === draftIdentity(draft)
                  }
                  onClick={() => {
                    let selected: SavedPoemDraft | undefined;
                    let retained = false;
                    if (
                      !change((entries) => {
                        selected = entries.find((e) => e.id === entry.id);
                        if (!selected)
                          throw new Error(
                            "这篇诗稿已在其他页面移除，请刷新稿匣后再试。",
                          );
                        const next = draft.text.trim()
                          ? savePoemDraft(entries, draft)
                          : entries;
                        retained = next.length > entries.length;
                        return next;
                      }) ||
                      !selected
                    )
                      return;
                    onLoad(selected.draft, selected.title);
                    setNotice(
                      `已打开《${selected.title}》。${retained ? "切换前的诗已收入稿匣。" : ""}需要检查时再点分析。`,
                    );
                  }}
                >
                  打开诗稿
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    let old: SavedPoemDraft | undefined;
                    if (
                      change((entries) => {
                        old = entries.find((e) => e.id === entry.id);
                        return entries.filter((e) => e.id !== entry.id);
                      })
                    ) {
                      setRemoved(old ?? null);
                      setNotice("");
                    }
                  }}
                >
                  移除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p>最多50篇，仅存于此设备；换电脑前请用页面底部的完整备份。</p>
    </details>
  );
}
