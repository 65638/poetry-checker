import { useEffect, useState } from "react";
import {
  STUDY_ARCHIVE_KEY,
  STUDY_ARCHIVE_EVENT,
  parseStudyArchive,
  writeStudyEntries,
  mergeStudyEntries,
  downloadStudy,
  copyStudy,
  studyText,
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
  const [state, setState] = useState(readArchive);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [removed, setRemoved] = useState<StudyEntry | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const refresh = () => setState(readArchive());
    window.addEventListener(STUDY_ARCHIVE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STUDY_ARCHIVE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const matches = [...state.entries]
    .reverse()
    .filter((entry) => studyText(entry).includes(query.trim()));
  const entry = state.entries.find((row) => row.id === selected);
  function action(run: () => void) {
    try {
      run();
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "操作未完成，请重试。",
      );
    }
  }
  return (
    <details className="pc-study-archive">
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
      {notice && <p role="status">{notice}</p>}
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
                    setNotice("");
                  }}
                >
                  <strong>{row.title}</strong>
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
            <h3>{entry.title}</h3>
            <p>
              保存于 {new Date(entry.createdAt).toLocaleString("zh-CN")} ·{" "}
              {entry.response.provider === "deepseek" ? "DeepSeek" : "GLM"}
            </p>
            <div className="pc-study-archive__actions">
              <button
                type="button"
                onClick={() => {
                  void copyStudy(entry).then(
                    () => setNotice("原诗与评议已复制。"),
                    () => setNotice("剪贴板暂不可用，可下载文本。"),
                  );
                }}
              >
                复制这份研读
              </button>
              <button
                type="button"
                onClick={() => action(() => downloadStudy(entry))}
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
            <pre tabIndex={0} role="region" aria-label="已保存的原诗与评议正文">
              {studyText(entry)}
            </pre>
          </article>
        )}
      </div>
    </details>
  );
}
