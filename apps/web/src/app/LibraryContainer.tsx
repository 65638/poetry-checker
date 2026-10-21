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
import { useMotionPreference } from "../presentation/useMotionPreference";
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
  const motion = useMotionPreference();
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
  const [compareLine, setCompareLine] = useState<number | null>(null);
  const [excerptFeedback, setExcerptFeedback] = useState<{
    id: string;
    line: number;
    message: string;
  } | null>(null);
  const excerptRequest = useRef(0);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  async function copyExcerpt(work: LibraryWork, line: number) {
    const request = ++excerptRequest.current;
    try {
      await navigator.clipboard.writeText(
        `${work.paragraphs[line]}\n——${work.author || "作者未载"}《${work.title}》`,
      );
      if (request === excerptRequest.current && selectedRef.current === work.id)
        setExcerptFeedback({
          id: work.id,
          line,
          message: "此句已摘录，诗题与作者一同带走。",
        });
    } catch {
      if (request === excerptRequest.current && selectedRef.current === work.id)
        setExcerptFeedback({
          id: work.id,
          line,
          message: "暂不能访问剪贴板，可选中诗句手动复制。",
        });
    }
  }
  const fileInput = useRef<HTMLInputElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const queryComposing = useRef(false);
  const catalogueList = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLElement>(null);
  const catalogue = useRef<HTMLElement>(null);
  const returnTitle = useRef<HTMLButtonElement | null>(null);
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
  const compareUnavailable =
    !left || !right
      ? "请先选好左右两卷。"
      : leftId === rightId
        ? "两卷是同一首诗，换一首再比较。"
        : Math.max(
              left.paragraphs.join("\n").length,
              right.paragraphs.join("\n").length,
            ) > 2000
          ? "可阅读全文；AI 对读暂限每首 2000 字，请换一首较短的诗。"
          : null;
  const totalPages = Math.max(1, Math.ceil(display.length / 20));
  const visiblePage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page !== visiblePage) setPage(visiblePage);
  }, [page, visiblePage]);
  useEffect(() => {
    catalogueList.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [visiblePage, query, dynasty, onlyFavorites, mode]);
  function resetFilters() {
    setQuery("");
    setDynasty("");
    setOnlyFavorites(false);
    setPage(0);
    queryInput.current?.focus();
  }
  function openRandomWork() {
    const pool = filtered.filter((w) => w.id !== selectedId);
    const work = pool[Math.floor(Math.random() * pool.length)] ?? filtered[0];
    if (work) openWork(work);
  }
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
    returnTitle.current =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement
        : null;
    setSelectedId(work.id);
    setLookupChar("");
    if (window.matchMedia("(max-width: 799px)").matches) {
      window.requestAnimationFrame(() =>
        reader.current?.scrollIntoView({
          block: "start",
          behavior: motion.effects ? "smooth" : "instant",
        }),
      );
    }
  }
  function closeWork() {
    setSelectedId(null);
    if (window.matchMedia("(max-width: 799px)").matches)
      catalogue.current?.scrollIntoView({
        block: "start",
        behavior: motion.effects ? "smooth" : "instant",
      });
    returnTitle.current?.focus({ preventScroll: true });
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
      <label className="pc-compare-picker">
        <span>
          <b aria-hidden="true">{side === "left" ? "壹" : "贰"}</b>
          {side === "left" ? "左卷" : "右卷"}
          <small>选一首诗</small>
        </span>
        <select
          value={side === "left" ? leftId : rightId}
          onChange={(e) => {
            setCompareLine(null);
            if (side === "left") setLeftId(e.target.value);
            else setRightId(e.target.value);
          }}
        >
          {workOptions}
        </select>
      </label>
      {work && (
        <div className="pc-compare-leaf" key={work.id}>
          <header className="pc-compare-title">
            <h2>{work.title}</h2>
            <p className="pc-studio-meta">
              {work.dynasty || "朝代未载"} · {work.author || "作者未载"}
            </p>
          </header>
          <div className="pc-library-verses">
            {work.paragraphs.map((line, i) => (
              <p
                key={i}
                className="pc-compare-line"
                data-active={compareLine === i}
                tabIndex={0}
                onPointerEnter={() => setCompareLine(i)}
                onPointerLeave={() => setCompareLine(null)}
                onFocus={() => setCompareLine(i)}
                onBlur={() => setCompareLine(null)}
              >
                <small aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </small>
                <span>
                  {line.split(/(?<=[，。！？；])/u).map((phrase, part) => (
                    <span className="pc-library-phrase" key={part}>
                      {phrase}
                    </span>
                  ))}
                </span>
              </p>
            ))}
          </div>
          <div className="pc-compare-poem-tools">
            <button
              className="pc-studio-action"
              disabled={work.paragraphs.join("\n").length > 2000}
              onClick={() => onStudy(work)}
            >
              <BookOpen size={15} />
              研读此诗
            </button>
            <button
              className="pc-studio-icon"
              aria-label={`收藏《${work.title}》`}
              aria-pressed={favorites.includes(work.id)}
              onClick={() => toggleFavorite(work.id)}
            >
              <Star
                size={16}
                fill={favorites.includes(work.id) ? "currentColor" : "none"}
              />
            </button>
            <details className="pc-compare-source">
              <summary>诗文来源</summary>
              <p>
                {work.source}
                {work.sourceUrl && (
                  <>
                    {" "}
                    ·{" "}
                    <a href={work.sourceUrl} target="_blank" rel="noreferrer">
                      原始页面
                    </a>
                  </>
                )}
              </p>
            </details>
          </div>
        </div>
      )}
    </section>
  );
  return (
    <div
      className="pc-library pc-studio-scope"
      data-reading={!!selected}
      data-view={view}
    >
      <header className="pc-library-heading">
        <span className="pc-seal" aria-hidden="true">
          藏
        </span>
        <div>
          <p className="pc-studio-eyebrow">叁 / 灯 前 展 卷</p>
          <h1>典籍馆</h1>
          <p className="pc-library-heading__verse">半窗山月，一室书声。</p>
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
          <button
            type="button"
            className="pc-motion-toggle"
            aria-pressed={motion.effects}
            disabled={motion.systemReduced}
            onClick={motion.toggle}
            title={motion.systemReduced ? "系统已设置减少动态" : undefined}
          >
            动态效果：{motion.effects ? "开" : "关"}
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
      {view === "compare" && (
        <section
          className="pc-library-reading pc-library-comparison"
          role="tabpanel"
          aria-label="对读"
        >
          <header className="pc-compare-heading">
            <div>
              <p className="pc-studio-eyebrow">灯 下 · 对 读</p>
              <h2>两卷相照</h2>
              <p>从一字一景，读出两首诗的相近与不同。</p>
            </div>
            <div className="pc-studio-actions">
              <button
                className="pc-studio-action"
                title="交换左右诗作"
                aria-label="交换左右诗作"
                onClick={() => {
                  setLeftId(rightId);
                  setRightId(leftId);
                }}
              >
                <ArrowLeftRight size={18} />
                交换两卷
              </button>
              <button
                className="pc-studio-action pc-compare-submit"
                disabled={
                  !!compareUnavailable ||
                  comparison.busy ||
                  comparison.result?.task === "compare"
                }
                aria-describedby="pc-compare-guidance"
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
                {comparison.result?.task === "compare"
                  ? "对读已完成"
                  : "比较两诗"}
              </button>
            </div>
          </header>
          <div className="pc-compare-guidance" id="pc-compare-guidance">
            <span>
              {compareUnavailable ??
                "先并读原诗，再比较意象、章法与情绪。AI 解读仅供参考。"}
            </span>
            <small>停在诗段上，对照两卷同段位置</small>
          </div>
          <div className="pc-library-diptych">
            {poemColumn(left, "left")}
            {poemColumn(right, "right")}
          </div>
          <div className="pc-compare-task">
            <StudioTaskState {...comparison} />
          </div>
          {comparison.result?.task === "compare" && (
            <div className="pc-library-comparison-notes">
              <header className="pc-compare-notes-heading">
                <span aria-hidden="true">评</span>
                <div>
                  <h2>合卷细读</h2>
                  <p>
                    《{left?.title}》与《{right?.title}》 · AI 对读札记
                  </p>
                </div>
              </header>
              <p className="pc-compare-overview">
                {comparison.result.result.overview}
              </p>
              {comparison.result.result.aspects.map((aspect, i) => (
                <div key={i} className="pc-library-aspect">
                  <h3>
                    <small>{String(i + 1).padStart(2, "0")}</small>
                    {aspect.name}
                  </h3>
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
      )}
      <div className="pc-library-worktable" hidden={view === "compare"}>
        <section
          ref={catalogue}
          role="tabpanel"
          aria-label="诗库"
          className="pc-library-catalogue"
        >
          <form
            className="pc-library-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (queryComposing.current || searchTask.busy) return;
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
                  ref={queryInput}
                  onCompositionStart={() => {
                    queryComposing.current = true;
                  }}
                  onCompositionEnd={() => {
                    queryComposing.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (queryComposing.current ||
                        e.nativeEvent.isComposing ||
                        e.nativeEvent.keyCode === 229)
                    )
                      e.preventDefault();
                    if (e.key === "Escape" && !queryComposing.current) {
                      setQuery("");
                      e.stopPropagation();
                    }
                  }}
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
                  onClick={() => {
                    setQuery("");
                    queryInput.current?.focus();
                  }}
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
          <div className="pc-library-discover">
            <button
              type="button"
              disabled={!filtered.length}
              onClick={openRandomWork}
            >
              随手翻一卷 <span aria-hidden="true">↗</span>
            </button>
            <span>在诗里偶遇一程山水</span>
          </div>
          <StudioTaskState {...searchTask} />
          {mode === "scene" && (
            <p className="pc-studio-meta">
              本库{filtered.length}首 ·
              意象匹配后最多40首交GLM研读；单篇超过2000字暂不进入AI候选。
            </p>
          )}
          <div className="pc-library-list" ref={catalogueList}>
            {display
              .slice(visiblePage * 20, visiblePage * 20 + 20)
              .map((hit) => (
                <article
                  key={hit.work.id}
                  className="pc-library-row"
                  data-selected={selectedId === hit.work.id}
                >
                  <div>
                    <p className="pc-studio-meta">
                      {hit.work.dynasty || "朝代未载"} ·{" "}
                      {hit.work.author || "作者未载"}
                    </p>
                    <button
                      className="pc-library-title"
                      aria-current={
                        selectedId === hit.work.id ? "true" : undefined
                      }
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
                        favorites.includes(hit.work.id)
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </article>
              ))}
          </div>
          {!display.length && (
            <div className="pc-studio-empty">
              <p>
                {mode === "scene" && matches
                  ? "本批候选中没有贴合此意境的诗作。"
                  : "未找到相符诗作。"}
              </p>
              <button className="pc-studio-action" onClick={resetFilters}>
                清除筛选，重寻一卷
              </button>
            </div>
          )}
          <div className="pc-library-pagination">
            <button
              className="pc-studio-icon"
              title="上一页"
              aria-label="上一页"
              disabled={visiblePage === 0}
              onClick={() => setPage(visiblePage - 1)}
            >
              <ArrowLeft size={18} />
            </button>
            <span>
              {visiblePage + 1} / {totalPages}
            </span>
            <button
              className="pc-studio-icon"
              title="下一页"
              aria-label="下一页"
              disabled={visiblePage + 1 >= totalPages}
              onClick={() => setPage(visiblePage + 1)}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
        {selected ? (
          <article
            ref={reader}
            key={selected.id}
            className="pc-library-reading"
            role="tabpanel"
            aria-label="原诗阅读"
          >
            <div className="pc-studio-actions">
              <button className="pc-studio-action" onClick={closeWork}>
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
                  fill={
                    favorites.includes(selected.id) ? "currentColor" : "none"
                  }
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
                    setRightId(
                      works.find((w) => w.id !== selected.id)?.id ?? "",
                    );
                  setView("compare");
                }}
              >
                <ArrowLeftRight size={17} />
                加入对读
              </button>
            </div>
            <div className="pc-library-verses">
              <span className="pc-library-reading-hint">
                点选诗字，可查其音韵
              </span>
              {selected.paragraphs.map((line, i) => (
                <p key={i} className="pc-library-verse-row">
                  {line.split(/(?<=[，。！？；])/u).map((phrase, part) => (
                    <span className="pc-library-phrase" key={part}>
                      {[...phrase].map((char, index) =>
                        /\p{Script=Han}/u.test(char) ? (
                          <button
                            type="button"
                            className="pc-library-character"
                            key={index}
                            aria-label={`选字「${char}」`}
                            aria-pressed={lookupChar === char}
                            onClick={() => setLookupChar(char)}
                          >
                            {char}
                          </button>
                        ) : (
                          <span key={index}>{char}</span>
                        ),
                      )}
                    </span>
                  ))}
                  <button
                    type="button"
                    className="pc-excerpt-copy"
                    aria-label={`摘录第${i + 1}段诗句`}
                    onClick={() => void copyExcerpt(selected, i)}
                  >
                    {excerptFeedback?.id === selected.id &&
                    excerptFeedback.line === i &&
                    excerptFeedback.message.startsWith("此句")
                      ? "已摘"
                      : "摘句"}
                  </button>
                </p>
              ))}
            </div>
            <p className="pc-library-copy-feedback" role="status">
              {excerptFeedback?.id === selected.id
                ? excerptFeedback.message
                : "摘一句诗，把此刻的心境带走。"}
            </p>
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
          <aside className="pc-library-invitation" aria-label="展卷提示">
            <span className="pc-library-invitation__stamp" aria-hidden="true">
              藏
            </span>
            <p className="pc-studio-eyebrow">书 间 有 天 地</p>
            <h2>
              取一卷诗，
              <br />
              与古人相逢。
            </h2>
            <p>
              从左侧题签选一首，
              <br />
              在灯下读它的山河与心事。
            </p>
            <span className="pc-library-invitation__foot">
              寻诗 · 展卷 · 对读
            </span>
          </aside>
        )}
      </div>
      <footer className="pc-library-footer">
        诗文以所列来源为准；AI赏析与意境匹配仅供参考。导入诗库、收藏和推敲记录保存在此设备。
      </footer>
    </div>
  );
}
