import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  BookOpen,
  Download,
  Search,
  Star,
  Upload,
  X,
} from "lucide-react";
import type { LibraryWork } from "@poetry/contracts";
import {
  BUILTIN_WORKS,
  IMPORT_BYTES,
  downloadJson,
  libraryStorage,
  mergeLibrary,
  parseLibraryImport,
  searchLibrary,
} from "./library";
import { usePoetryTask } from "../hooks/usePoetryTask";
import {
  StudioTabs,
  StudioTaskState,
} from "../presentation/components/StudioControls";

const favoriteKey = "poetry-library-favorites-v1";
function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(favoriteKey) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter((id) => typeof id === "string").slice(0, 1000)
      : [];
  } catch {
    return [];
  }
}
export function LibraryContainer({
  onStudy,
  onLookup,
}: {
  onStudy: (work: LibraryWork) => void;
  onLookup: (char: string) => void;
}) {
  const [works, setWorks] = useState<LibraryWork[]>(BUILTIN_WORKS);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"literal" | "scene">("literal");
  const [view, setView] = useState<"library" | "compare">("library");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftId, setLeftId] = useState(BUILTIN_WORKS[0]!.id);
  const [rightId, setRightId] = useState(BUILTIN_WORKS[1]!.id);
  const [dynasty, setDynasty] = useState("");
  const [favorites, setFavorites] = useState(readFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [page, setPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lookupChar, setLookupChar] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const reader = useRef<HTMLElement>(null);
  const listScroll = useRef(0);
  const searchTask = usePoetryTask(
    JSON.stringify([
      query,
      mode,
      dynasty,
      onlyFavorites,
      onlyFavorites ? favorites : null,
      works.map((w) => w.id),
    ]),
  );
  const comparison = usePoetryTask(`${leftId}|${rightId}`);
  useEffect(() => {
    let live = true;
    void libraryStorage("read")
      .then((saved) => {
        if (live) setWorks(mergeLibrary(BUILTIN_WORKS, saved).works);
      })
      .catch((error: Error) => {
        if (live) setFeedback(error.message);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    setPage(0);
  }, [query, mode, dynasty, onlyFavorites]);
  const filtered = useMemo(
    () =>
      works.filter(
        (w) =>
          (!dynasty || w.dynasty === dynasty) &&
          (!onlyFavorites || favorites.includes(w.id)),
      ),
    [works, dynasty, favorites, onlyFavorites],
  );
  const hits = useMemo(
    () => searchLibrary(filtered, query, mode === "scene"),
    [filtered, query, mode],
  );
  const candidates = useMemo(
    () =>
      (hits.length ? hits.map((h) => h.work) : filtered)
        .slice(0, 40)
        .filter((w) => w.paragraphs.join("\n").length <= 2000),
    [hits, filtered],
  );
  const matches =
    searchTask.result?.task === "search"
      ? searchTask.result.result.matches
      : null;
  const display = matches
    ? matches.flatMap((match) => {
        const work = works.find((w) => w.id === match.id);
        return work
          ? [{ work, excerpt: `${match.quote} · ${match.reason}`, score: 1 }]
          : [];
      })
    : hits;
  const selected = works.find((w) => w.id === selectedId);
  const left = works.find((w) => w.id === leftId);
  const right = works.find((w) => w.id === rightId);
  const totalPages = Math.max(1, Math.ceil(display.length / 20));
  async function importFile(file: File) {
    if (file.size > IMPORT_BYTES) {
      setFeedback("单次导入最多10MB，请分批导入。");
      return;
    }
    setImporting(true);
    setFeedback(null);
    try {
      const incoming = await parseLibraryImport(await file.text(), file.name);
      const merged = mergeLibrary(works, incoming);
      await libraryStorage("write", merged.works);
      setWorks(merged.works);
      setPage(0);
      setFeedback(
        `已导入${merged.added}首，重复${merged.duplicates}首；已保存于此设备。`,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "导入失败，原诗库保留。",
      );
    } finally {
      setImporting(false);
    }
  }
  function openWork(work: LibraryWork) {
    listScroll.current = window.scrollY;
    setSelectedId(work.id);
    setLookupChar("");
    window.requestAnimationFrame(() =>
      reader.current?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  }
  function toggleFavorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((v) => v !== id)
      : [...favorites, id];
    if (next.length > 1000) {
      setFeedback("收藏已达1000首，请先整理收藏。");
      return;
    }
    setFavorites(next);
    try {
      localStorage.setItem(favoriteKey, JSON.stringify(next));
    } catch {
      setFeedback("收藏只保留到本次会话，设备存储不可用。");
    }
  }
  const workOptions = works.map((w) => (
    <option key={w.id} value={w.id}>
      {w.title} · {w.author || "作者未载"}
      {w.sourceUrl ? ` · ${new URL(w.sourceUrl).hostname}` : ""}
    </option>
  ));
  const poemColumn = (
    work: LibraryWork | undefined,
    side: "left" | "right",
  ) => (
    <section
      className="pc-library-poem"
      aria-label={side === "left" ? "左诗" : "右诗"}
    >
      <label>
        {side === "left" ? "左卷" : "右卷"}
        <select
          value={side === "left" ? leftId : rightId}
          onChange={(e) =>
            side === "left"
              ? setLeftId(e.target.value)
              : setRightId(e.target.value)
          }
        >
          {workOptions}
        </select>
      </label>
      {work && (
        <>
          <h2>{work.title}</h2>
          <p className="pc-studio-meta">
            {work.dynasty || "朝代未载"} · {work.author || "作者未载"}
          </p>
          <div className="pc-library-verses">
            {work.paragraphs.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <p className="pc-studio-meta">{work.source}</p>
        </>
      )}
    </section>
  );
  return (
    <div className="pc-library pc-studio-scope">
      <header className="pc-library-heading">
        <div>
          <p className="pc-studio-eyebrow">叁 · 古典分区</p>
          <h1>典籍馆</h1>
          <p>
            {works.length}首入藏 · {favorites.length}首收藏
          </p>
        </div>
        <div className="pc-studio-actions">
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".json,.jsonl,application/json"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void importFile(file);
              e.currentTarget.value = "";
            }}
          />
          <button
            className="pc-studio-action"
            disabled={!ready || importing}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={17} />
            {importing ? "导入中…" : "导入诗库"}
          </button>
          <button
            className="pc-studio-icon"
            title="导出诗库"
            aria-label="导出诗库"
            onClick={() => downloadJson("典籍馆.json", { version: 1, works })}
          >
            <Download size={18} />
          </button>
        </div>
      </header>
      {feedback && (
        <p className="pc-studio-notice" role="status">
          {feedback}
        </p>
      )}
      <StudioTabs
        label="典籍馆视图"
        current={view}
        onChange={setView}
        tabs={[
          { id: "library", label: "诗库" },
          { id: "compare", label: "对读" },
        ]}
      />
      {view === "compare" ? (
        <section
          className="pc-library-reading pc-library-comparison"
          role="tabpanel"
          aria-label="对读"
        >
          <div className="pc-studio-actions">
            <button
              className="pc-studio-icon"
              title="交换左右诗作"
              aria-label="交换左右诗作"
              onClick={() => {
                setLeftId(rightId);
                setRightId(leftId);
              }}
            >
              <ArrowLeftRight size={18} />
            </button>
            <button
              className="pc-studio-action"
              disabled={
                !left ||
                !right ||
                leftId === rightId ||
                comparison.busy ||
                Math.max(
                  left?.paragraphs.join("\n").length ?? 0,
                  right?.paragraphs.join("\n").length ?? 0,
                ) > 2000
              }
              onClick={() => {
                if (left && right)
                  void comparison.run({
                    task: "compare",
                    left: left.paragraphs.join("\n"),
                    right: right.paragraphs.join("\n"),
                  });
              }}
            >
              <BookOpen size={17} />
              比较两诗
            </button>
          </div>
          <div className="pc-library-diptych">
            {poemColumn(left, "left")}
            {poemColumn(right, "right")}
          </div>
          <StudioTaskState {...comparison} />
          {comparison.result?.task === "compare" && (
            <div className="pc-library-comparison-notes">
              <p>{comparison.result.result.overview}</p>
              {comparison.result.result.aspects.map((aspect, i) => (
                <div key={i} className="pc-library-aspect">
                  <h3>{aspect.name}</h3>
                  <p>
                    <strong>左卷</strong> {aspect.left}
                  </p>
                  <p>
                    <strong>右卷</strong> {aspect.right}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : selected ? (
        <article
          ref={reader}
          className="pc-library-reading"
          role="tabpanel"
          aria-label="原诗阅读"
        >
          <div className="pc-studio-actions">
            <button
              className="pc-studio-action"
              onClick={() => {
                setSelectedId(null);
                window.requestAnimationFrame(() =>
                  window.scrollTo({
                    top: listScroll.current,
                    behavior: "instant",
                  }),
                );
              }}
            >
              <ArrowLeft size={17} />
              回诗库
            </button>
            <button
              className="pc-studio-icon"
              title="收藏此诗"
              aria-label="收藏此诗"
              aria-pressed={favorites.includes(selected.id)}
              onClick={() => toggleFavorite(selected.id)}
            >
              <Star
                size={18}
                fill={favorites.includes(selected.id) ? "currentColor" : "none"}
              />
            </button>
            <button
              className="pc-studio-action"
              disabled={selected.paragraphs.join("\n").length > 2000}
              onClick={() => onStudy(selected)}
            >
              <BookOpen size={17} />
              研读此诗
            </button>
          </div>
          <h2>{selected.title}</h2>
          <p className="pc-studio-meta">
            {selected.dynasty || "朝代未载"} · {selected.author || "作者未载"}
          </p>
          <div className="pc-library-verses">
            {selected.paragraphs.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <div className="pc-studio-actions">
            <label className="pc-studio-inline-label">
              查字
              <input
                aria-label="原诗查字"
                value={lookupChar}
                maxLength={2}
                onChange={(e) => setLookupChar(e.target.value)}
              />
            </label>
            <button
              className="pc-studio-action"
              disabled={
                [...lookupChar].length !== 1 ||
                !/\p{Script=Han}/u.test(lookupChar)
              }
              onClick={() => onLookup(lookupChar)}
            >
              查韵
              <ArrowRight size={16} />
            </button>
            <button
              className="pc-studio-action"
              onClick={() => {
                setLeftId(selected.id);
                if (rightId === selected.id)
                  setRightId(works.find((w) => w.id !== selected.id)?.id ?? "");
                setView("compare");
              }}
            >
              <ArrowLeftRight size={17} />
              加入对读
            </button>
          </div>
          <p className="pc-studio-meta">
            来源：{selected.source}
            {selected.sourceUrl && (
              <>
                {" "}
                ·{" "}
                <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                  查看原始页面
                </a>
              </>
            )}
          </p>
          {selected.paragraphs.join("\n").length > 2000 && (
            <p className="pc-studio-notice">
              此篇超过2000字，保留全文阅读；整诗研读与AI对读暂限2000字。
            </p>
          )}
        </article>
      ) : (
        <section
          role="tabpanel"
          aria-label="诗库"
          className="pc-library-catalogue"
        >
          <form
            className="pc-library-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (mode === "scene" && query.trim() && candidates.length)
                void searchTask.run({
                  task: "search",
                  query: query.trim(),
                  poems: candidates,
                });
            }}
          >
            <StudioTabs
              label="检索方式"
              current={mode}
              onChange={setMode}
              tabs={[
                { id: "literal", label: "题名 / 原句" },
                { id: "scene", label: "诗境" },
              ]}
            />
            <div className="pc-library-query">
              <label className="pc-studio-searchbox">
                <Search size={18} aria-hidden="true" />
                <input
                  aria-label="检索诗库"
                  placeholder={
                    mode === "scene"
                      ? "雨夜思乡、江上孤舟…"
                      : "题名、作者或一句诗…"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {query && (
                <button
                  className="pc-studio-icon"
                  type="button"
                  title="清空检索"
                  aria-label="清空检索"
                  onClick={() => setQuery("")}
                >
                  <X size={17} />
                </button>
              )}
              <button
                className="pc-studio-action"
                type="submit"
                disabled={
                  searchTask.busy || (mode === "scene" && !query.trim())
                }
              >
                寻诗
              </button>
            </div>
            <div className="pc-library-filters">
              <label>
                朝代
                <select
                  aria-label="筛选朝代"
                  value={dynasty}
                  onChange={(e) => setDynasty(e.target.value)}
                >
                  <option value="">全部</option>
                  {[
                    ...new Set(works.map((w) => w.dynasty).filter(Boolean)),
                  ].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={onlyFavorites}
                  onChange={(e) => setOnlyFavorites(e.target.checked)}
                />
                只看收藏
              </label>
              <span>
                {matches
                  ? `GLM精选 ${matches.length} 首 / ${candidates.length}首候选`
                  : `${display.length}首`}
              </span>
            </div>
          </form>
          <StudioTaskState {...searchTask} />
          {mode === "scene" && (
            <p className="pc-studio-meta">
              本库{filtered.length}首 ·
              意象匹配后最多40首交GLM研读；单篇超过2000字暂不进入AI候选。
            </p>
          )}
          <div className="pc-library-list">
            {display.slice(page * 20, page * 20 + 20).map((hit) => (
              <article key={hit.work.id} className="pc-library-row">
                <div>
                  <p className="pc-studio-meta">
                    {hit.work.dynasty || "朝代未载"} ·{" "}
                    {hit.work.author || "作者未载"}
                  </p>
                  <button
                    className="pc-library-title"
                    onClick={() => openWork(hit.work)}
                  >
                    {hit.work.title}
                  </button>
                  <p className="pc-library-excerpt">{hit.excerpt}</p>
                </div>
                <button
                  className="pc-studio-icon"
                  title={`收藏《${hit.work.title}》`}
                  aria-label={`收藏《${hit.work.title}》`}
                  aria-pressed={favorites.includes(hit.work.id)}
                  onClick={() => toggleFavorite(hit.work.id)}
                >
                  <Star
                    size={18}
                    fill={
                      favorites.includes(hit.work.id) ? "currentColor" : "none"
                    }
                  />
                </button>
              </article>
            ))}
          </div>
          {!display.length && (
            <p className="pc-studio-empty">
              {mode === "scene" && matches
                ? "本批候选中没有贴合此意境的诗作。"
                : "未找到相符诗作。"}
            </p>
          )}
          <div className="pc-library-pagination">
            <button
              className="pc-studio-icon"
              title="上一页"
              aria-label="上一页"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ArrowLeft size={18} />
            </button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <button
              className="pc-studio-icon"
              title="下一页"
              aria-label="下一页"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      )}
      <footer className="pc-library-footer">
        诗文以所列来源为准；AI赏析与意境匹配仅供参考。导入诗库、收藏和推敲记录保存在此设备。
      </footer>
    </div>
  );
}
