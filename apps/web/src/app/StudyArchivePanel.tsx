import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { OPEN_STUDY_EVENT } from "./studyNavigation";
import { StudyShareOptions } from "./StudyShareOptions";
import { SavedStudyDiscussion } from "./SavedStudyDiscussion";
import {
  STUDY_ARCHIVE_KEY,
  STUDY_ARCHIVE_EVENT,
  parseStudyArchive,
  writeStudyEntries,
  mergeStudyEntries,
  downloadStudy,
  copyStudy,
  studyText,
  renameStudyEntry,
  type StudyEntry,
} from "./studyArchive";
import "./study-archive.css";

function readArchive() {
  try {
    return {
      entries: parseStudyArchive(localStorage.getItem(STUDY_ARCHIVE_KEY)),
      error: "",
    };
  } catch (cause) {
    return {
      entries: [] as StudyEntry[],
      error: cause instanceof Error ? cause.message : "研读收藏暂不可用。",
    };
  }
}
export function StudyArchivePanel() {
  const root = useRef<HTMLDetailsElement>(null);
  const readerHeading = useRef<HTMLHeadingElement>(null);
  const [openTarget, setOpenTarget] = useState<{ id: string } | null>(null);
  const [state, setState] = useState(readArchive);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [removed, setRemoved] = useState<StudyEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [kind, setKind] = useState("all");
  const renameInput = useRef<HTMLInputElement>(null);
  const renameTrigger = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState<{
    id: string;
    before: string;
    title: string;
  } | null>(null);
  const [renamed, setRenamed] = useState<{
    id: string;
    before: string;
    after: string;
  } | null>(null);
  useEffect(() => {
    if (renaming?.id) {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [renaming?.id]);
  function closeRename() {
    setRenaming(null);
    renameTrigger.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const refresh = () => setState(readArchive());
    const open = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (
        !detail ||
        typeof detail !== "object" ||
        !("id" in detail) ||
        typeof detail.id !== "string"
      )
        return;
      const latest = readArchive();
      setState(latest);
      if (!latest.entries.some((item) => item.id === detail.id)) {
        setNotice("这份研读已被移除或暂时无法读取，请重新收藏后打开。");
        if (root.current) root.current.open = true;
        root.current?.querySelector("summary")?.focus();
        return;
      }
      setQuery("");
      setKind("all");
      setSelected(detail.id);
      setRenaming(null);
      setNotice("");
      setOpenTarget({ id: detail.id });
    };
    window.addEventListener(STUDY_ARCHIVE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener(OPEN_STUDY_EVENT, open);
    return () => {
      window.removeEventListener(STUDY_ARCHIVE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(OPEN_STUDY_EVENT, open);
    };
  }, []);
  useLayoutEffect(() => {
    if (!openTarget || !root.current) return;
    root.current.open = true;
    readerHeading.current?.focus({ preventScroll: true });
    readerHeading.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }, [openTarget]);
  const matches = [...state.entries]
    .reverse()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter(
      (entry) =>
        (kind === "all" ||
          (entry.input.task === "critique"
            ? entry.input.mode
            : entry.input.revision
              ? "revision"
              : "compare") === kind) &&
        studyText(entry).includes(query.trim()),
    );
  const entry = state.entries.find((row) => row.id === selected);
  function action(run: () => void) {
    try {
      run();
      return true;
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "操作未完成，请重试。",
      );
      return false;
    }
  }
  return (
    <details className="pc-study-archive" ref={root}>
      <summary>研读收藏 · {state.entries.length} 份</summary>
      <p>
        把值得留下的评议连同当时的原诗存好。这里的旧评议可离线查看，不会套用到当前稿件。
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      <label>
        查找收藏{" "}
        <input
          aria-label="查找研读收藏"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="诗句、标题或评议内容"
        />
      </label>
      <label>
        研读类型
        <select
          aria-label="研读类型"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="all">全部研读</option>
          <option value="reading">原诗赏读</option>
          <option value="writing">写作推敲</option>
          <option value="compare">两诗对读</option>
          <option value="revision">改稿对照</option>
        </select>
      </label>
      {notice && <p role="status">{notice}</p>}
      {renamed && (
        <button
          type="button"
          onClick={() =>
            action(() => {
              const current = parseStudyArchive(
                localStorage.getItem(STUDY_ARCHIVE_KEY),
              );
              writeStudyEntries(
                renameStudyEntry(
                  current,
                  renamed.id,
                  renamed.before,
                  renamed.after,
                ),
              );
              setRenamed(null);
              setNotice("已撤销标题修改。");
            })
          }
        >
          撤销改标题
        </button>
      )}
      {removed && (
        <button
          type="button"
          onClick={() =>
            action(() => {
              const current = parseStudyArchive(
                localStorage.getItem(STUDY_ARCHIVE_KEY),
              );
              writeStudyEntries(mergeStudyEntries(current, [removed]));
              setRemoved(null);
              setNotice("已恢复这份研读。");
            })
          }
        >
          撤销移除
        </button>
      )}
      {!matches.length && (
        <p>
          {state.entries.length
            ? "没有找到相符的研读。"
            : "完成全诗评议或两诗对读后，点“收藏评议”收入这里。"}
        </p>
      )}
      <div className="pc-study-archive__layout" data-reading={!!entry}>
        <div
          className="pc-study-archive__index"
          role="region"
          aria-label="研读收藏列表"
          tabIndex={matches.length ? 0 : undefined}
        >
          <ul className="pc-study-archive__list">
            {matches.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  aria-expanded={selected === row.id}
                  aria-controls={
                    selected === row.id ? "pc-saved-study-reader" : undefined
                  }
                  onClick={() => {
                    setSelected(selected === row.id ? null : row.id);
                    setRenaming(null);
                    setNotice("");
                  }}
                >
                  <strong>{row.title}</strong>
                  <span className="pc-study-archive__question">
                    {row.input.task === "critique"
                      ? row.input.question
                        ? `问：${row.input.question}`
                        : "通篇评议"
                      : row.input.question
                        ? `问：${row.input.question}`
                        : row.input.revision
                          ? `${row.input.revision.beforeLabel} → ${row.input.revision.afterLabel}`
                          : "两首原诗并读"}
                  </span>
                  <small>
                    {row.input.task === "compare"
                      ? row.input.revision
                        ? "改稿对照"
                        : "两诗对读"
                      : row.input.mode === "reading"
                        ? "原诗赏读"
                        : "写作推敲"}{" "}
                    ·{" "}
                    {new Date(row.createdAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {entry && (
          <article
            id="pc-saved-study-reader"
            className="pc-study-archive__reader"
            aria-label="已收藏的研读"
          >
            <h3 tabIndex={-1} ref={readerHeading}>
              {entry.title}
            </h3>
            {renaming?.id === entry.id && (
              <form
                className="pc-study-archive__rename"
                id="pc-study-rename-form"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeRename();
                  }
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  const saved = action(() => {
                    const current = parseStudyArchive(
                      localStorage.getItem(STUDY_ARCHIVE_KEY),
                    );
                    writeStudyEntries(
                      renameStudyEntry(
                        current,
                        entry.id,
                        renaming.title,
                        renaming.before,
                      ),
                    );
                    setRenamed({
                      id: entry.id,
                      before: renaming.before,
                      after: renaming.title.trim(),
                    });
                    closeRename();
                    setNotice("标题已保存，原文与回答仍完整保留。");
                  });
                  if (!saved) renameInput.current?.focus();
                }}
              >
                <label>
                  收藏标题
                  <input
                    ref={renameInput}
                    aria-label="收藏标题"
                    value={renaming.title}
                    maxLength={120}
                    onChange={(event) =>
                      setRenaming({ ...renaming, title: event.target.value })
                    }
                  />
                </label>
                <div className="pc-study-archive__actions">
                  <button type="submit">保存标题</button>
                  <button type="button" onClick={closeRename}>
                    取消改标题
                  </button>
                </div>
              </form>
            )}
            <p>
              保存于 {new Date(entry.createdAt).toLocaleString("zh-CN")} ·{" "}
              {entry.response.provider === "deepseek" ? "DeepSeek" : "GLM"}
            </p>
            <div className="pc-study-archive__actions">
              <button
                ref={renameTrigger}
                aria-expanded={renaming?.id === entry.id}
                aria-controls={
                  renaming?.id === entry.id ? "pc-study-rename-form" : undefined
                }
                type="button"
                onClick={() => {
                  setRenaming({
                    id: entry.id,
                    before: entry.title,
                    title: entry.title,
                  });
                  setNotice("");
                }}
              >
                改标题
              </button>
              <button
                type="button"
                onClick={() => {
                  void copyStudy(entry, includeHistory).then(
                    () => setNotice("原诗与评议已复制。"),
                    () => setNotice("剪贴板暂不可用，可下载文本。"),
                  );
                }}
              >
                复制这份研读
              </button>
              <button
                type="button"
                onClick={() =>
                  action(() => downloadStudy(entry, includeHistory))
                }
              >
                下载这份研读
              </button>
              <button
                type="button"
                onClick={() =>
                  action(() => {
                    const current = parseStudyArchive(
                      localStorage.getItem(STUDY_ARCHIVE_KEY),
                    );
                    const existing = current.find((row) => row.id === entry.id);
                    if (!existing) {
                      setNotice("这份研读已在另一页面移除。");
                      setState(readArchive());
                      return;
                    }
                    writeStudyEntries(
                      current.filter((row) => row.id !== entry.id),
                    );
                    setRemoved(existing);
                    setSelected(null);
                    setNotice("已移除，可撤销。");
                  })
                }
              >
                移除这份研读
              </button>
            </div>
            {entry.input.task === "critique" && entry.input.followUp && (
              <StudyShareOptions
                includeHistory={includeHistory}
                onChange={setIncludeHistory}
              />
            )}
            <pre tabIndex={0} role="region" aria-label="已保存的原诗与评议正文">
              {studyText(entry)}
            </pre>
            <SavedStudyDiscussion key={entry.id} entry={entry} />
          </article>
        )}
      </div>
    </details>
  );
}
