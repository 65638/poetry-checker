import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  BookOpen,
  Copy,
  Download,
  Search,
  Star,
  Upload,
  X,
} from "lucide-react";
import type { LibraryWork, PoemPronunciation } from "@poetry/contracts";
import { loadCatalog, loadPronunciation } from "../api/library";
import { LibraryQueryHelp } from "./LibraryQueryHelp";
import { ComparePoemPicker } from "./ComparePoemPicker";
import { ComparisonScope } from "./ComparisonScope";
import { comparisonInput, comparisonSourceLabel } from "./comparisonPassages";
import { useExcerpts } from "../hooks/useExcerpts";
import { ExcerptsPanel } from "./ExcerptsPanel";
import {
  downloadPoem,
  parseReadingJournal,
  poemText,
  READING_JOURNAL_KEY,
  recordReading,
} from "./readingJournal";
import { AnnotatedVerses } from "../presentation/components/AnnotatedVerses";
import { ResearchNotes } from "../presentation/components/ResearchNotes";
import {
  BUILTIN_WORKS,
  IMPORT_BYTES,
  downloadJson,
  libraryStorage,
  mergeLibrary,
  parseLibraryImport,
  searchLibrary,
  readingSections,
  uniqueLibrary,
} from "./library";
import { useMotionPreference } from "../presentation/useMotionPreference";
import { usePoetryTask } from "../hooks/usePoetryTask";
import { StudyResultActions } from "./StudyResultActions";
import { RuleReviewNote } from "./RuleReviewNote";
import { StudyQuestion } from "./StudyQuestion";
import { StudyHistory } from "./StudyHistory";
import { StudyFollowUp, StudyFollowUpContext } from "./StudyFollowUp";
import { useStudyAnswerFocus } from "../hooks/useStudyAnswerFocus";
import { passageQuestion } from "./passageQuestion";
import { RelatedReading } from "./RelatedReading";
import { StudyProse } from "./StudyProse";
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
  active = true,
}: {
  onStudy: (work: LibraryWork) => void;
  onLookup: (char: string) => void;
  active?: boolean;
}) {
  const motion = useMotionPreference();
  const [works, setWorks] = useState<LibraryWork[]>([]);
  const [ready, setReady] = useState(false);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"literal" | "scene">("literal");
  const [view, setView] = useState<"library" | "compare" | "excerpts">(
    "library",
  );
  const excerpts = useExcerpts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relatedTrail, setRelatedTrail] = useState<string[]>([]);
  const [visits, setVisits] = useState(() => {
    try {
      return parseReadingJournal(localStorage.getItem(READING_JOURNAL_KEY));
    } catch {
      return [];
    }
  });
  const [shareFeedback, setShareFeedback] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const shareRequest = useRef(0);
  const [leftId, setLeftId] = useState(BUILTIN_WORKS[0]!.id);
  const [rightId, setRightId] = useState(BUILTIN_WORKS[1]!.id);
  const [leftSelection, setLeftSelection] = useState<{
    id: string;
    part: number | null;
  } | null>(null);
  const [rightSelection, setRightSelection] = useState<{
    id: string;
    part: number | null;
  } | null>(null);
  const leftPart = leftSelection?.id === leftId ? leftSelection.part : null;
  const rightPart = rightSelection?.id === rightId ? rightSelection.part : null;
  const currentLibrary = useRef({ works, selectedId, leftId, rightId });
  currentLibrary.current = { works, selectedId, leftId, rightId };
  const [dynasty, setDynasty] = useState("");
  const [collection, setCollection] = useState("");
  const [kind, setKind] = useState("");
  const [showPinyin, setShowPinyin] = useState(false);
  const [pronunciation, setPronunciation] = useState<PoemPronunciation | null>(
    null,
  );
  const [pronunciationError, setPronunciationError] = useState<string | null>(
    null,
  );
  const [pronunciationBusy, setPronunciationBusy] = useState(false);
  const [studySection, setStudySection] = useState(0);
  const [questionSeed, setQuestionSeed] = useState<{
    workId: string;
    section: number;
    question: string;
    revision: number;
  } | null>(null);
  const [favorites, setFavorites] = useState(readFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const unique = useMemo(() => uniqueLibrary(works), [works]);
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
    const saved = excerpts.add(work, line);
    try {
      await navigator.clipboard.writeText(
        `${work.paragraphs[line]}\n——${work.author || "作者未载"}《${work.title}》`,
      );
      if (request === excerptRequest.current && selectedRef.current === work.id)
        setExcerptFeedback({
          id: work.id,
          line,
          message: saved.saved
            ? "此句已收入摘句，诗题与作者也已复制。"
            : `此句已复制，摘句未能保存：${saved.message}`,
        });
    } catch {
      if (request === excerptRequest.current && selectedRef.current === work.id)
        setExcerptFeedback({
          id: work.id,
          line,
          message: saved.saved
            ? "此句已收入摘句；剪贴板暂不可用，可在摘句页查看。"
            : saved.message,
        });
    }
  }
  const fileInput = useRef<HTMLInputElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const queryComposing = useRef(false);
  const catalogueList = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLElement>(null);
  const compareReader = useRef<HTMLElement>(null);
  const catalogue = useRef<HTMLElement>(null);
  const returnTitle = useRef<HTMLButtonElement | null>(null);
  const searchTask = usePoetryTask(
    JSON.stringify([
      query,
      mode,
      dynasty,
      collection,
      kind,
      onlyFavorites,
      showDuplicates,
      onlyFavorites ? favorites : null,
      works.map((w) => w.id),
    ]),
  );
  const comparison = usePoetryTask(
    JSON.stringify([leftId, leftPart, rightId, rightPart]),
  );
  const comparisonFocus = useStudyAnswerFocus<HTMLHeadingElement>(
    comparison.result,
  );
  const literary = usePoetryTask(`${selectedId}|${studySection}`);
  const answerFocus = useStudyAnswerFocus<HTMLElement>(literary.result);
  useEffect(() => {
    if (!active || ready) return;
    setCatalogFailed(false);
    let live = true;
    const controller = new AbortController();
    void Promise.all([
      loadCatalog(controller.signal)
        .then((c) => c.works)
        .catch(() => {
          if (live) {
            setCatalogFailed(true);
            setFeedback("扩展诗库暂不可用，已保留基础示例与本机导入。 ");
          }
          return BUILTIN_WORKS;
        }),
      libraryStorage("read").catch((error: Error) => {
        if (live) setFeedback(error.message);
        return [];
      }),
    ])
      .then(([catalog, saved]) => {
        if (!live) return;
        const merged = mergeLibrary(catalog, saved).works;
        // A retry may finish while a fallback work is open. Keep that exact source
        // available for the reader/comparison instead of silently switching editions.
        const current = currentLibrary.current;
        const inUse = new Set([
          current.selectedId,
          current.leftId,
          current.rightId,
        ]);
        for (const work of current.works)
          if (inUse.has(work.id) && !merged.some((row) => row.id === work.id))
            merged.push(work);
        setWorks(merged);
        setLeftId((previous) =>
          merged.some((work) => work.id === previous)
            ? previous
            : (merged.find((w) => w.title === "登鹳雀楼")?.id ?? merged[0]!.id),
        );
        setRightId((previous) =>
          merged.some((work) => work.id === previous)
            ? previous
            : (merged.find((w) => w.title === "静夜思")?.id ??
              merged[1]?.id ??
              merged[0]!.id),
        );
      })
      .catch((error: Error) => {
        if (live) setFeedback(error.message);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [active, ready]);
  useEffect(() => {
    setPage(0);
  }, [query, mode, dynasty, collection, kind, onlyFavorites, showDuplicates]);
  const filtered = useMemo(
    () =>
      (showDuplicates || onlyFavorites ? works : unique.works).filter(
        (w) =>
          (!dynasty || w.dynasty === dynasty) &&
          (!collection ||
            w.collection === collection ||
            w.tags.includes(collection)) &&
          (!kind ||
            (kind === "prose" ? w.kind === "prose" : w.kind !== "prose")) &&
          (!onlyFavorites || favorites.includes(w.id)),
      ),
    [
      works,
      unique,
      dynasty,
      collection,
      kind,
      favorites,
      onlyFavorites,
      showDuplicates,
    ],
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
  const sections = useMemo(
    () => (selected ? readingSections(selected) : []),
    [selected],
  );
  useEffect(() => {
    setPronunciation(null);
    setPronunciationError(null);
    setStudySection(0);
    setQuestionSeed(null);
  }, [selectedId]);
  useEffect(() => {
    if (!showPinyin || !selected?.id.startsWith("deepseek:")) {
      setPronunciationBusy(false);
      return;
    }
    const controller = new AbortController();
    setPronunciationBusy(true);
    setPronunciationError(null);
    void loadPronunciation(selected, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPronunciation(value);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setPronunciationError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPronunciationBusy(false);
      });
    return () => controller.abort();
  }, [selected, showPinyin]);
  const left = works.find((w) => w.id === leftId);
  const right = works.find((w) => w.id === rightId);
  const compareInput = useMemo(
    () =>
      left && right ? comparisonInput(left, right, leftPart, rightPart) : null,
    [left, right, leftPart, rightPart],
  );
  const compareUnavailable =
    !left || !right
      ? "请先选好左右两卷。"
      : leftId === rightId
        ? "两卷是同一首诗，换一首再比较。"
        : !compareInput
          ? "原作较长，请先在左右卷中选择本次要比较的选段。"
          : null;
  const totalPages = Math.max(1, Math.ceil(display.length / 20));
  const visiblePage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page !== visiblePage) setPage(visiblePage);
  }, [page, visiblePage]);
  useEffect(() => {
    catalogueList.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [
    visiblePage,
    query,
    dynasty,
    collection,
    kind,
    onlyFavorites,
    showDuplicates,
    mode,
  ]);
  function resetFilters() {
    setQuery("");
    setDynasty("");
    setCollection("");
    setKind("");
    setShowDuplicates(false);
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
  function openWork(work: LibraryWork, keepTrail = false) {
    if (!keepTrail) setRelatedTrail([]);
    returnTitle.current =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement
        : null;
    setSelectedId(work.id);
    const nextVisits = recordReading(visits, work.id);
    setVisits(nextVisits);
    try {
      localStorage.setItem(READING_JOURNAL_KEY, JSON.stringify(nextVisits));
    } catch {
      setFeedback("本次阅读记录仅在当前页面保留。");
    }
    setShareFeedback(null);
    setLookupChar("");
    window.requestAnimationFrame(() => {
      reader.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 799px)").matches)
        reader.current?.scrollIntoView({
          block: "start",
          behavior: motion.effects ? "smooth" : "instant",
        });
    });
  }
  function closeWork() {
    setRelatedTrail([]);
    setSelectedId(null);
    if (window.matchMedia("(max-width: 799px)").matches)
      catalogue.current?.scrollIntoView({
        block: "start",
        behavior: motion.effects ? "smooth" : "instant",
      });
    const target = returnTitle.current?.isConnected
      ? returnTitle.current
      : catalogue.current;
    target?.focus({ preventScroll: true });
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
  const comparisonWorks = useMemo(
    () =>
      view !== "compare"
        ? []
        : works.filter(
            (w) =>
              showDuplicates ||
              !unique.hiddenIds.has(w.id) ||
              w.id === leftId ||
              w.id === rightId,
          ),
    [view, works, showDuplicates, unique.hiddenIds, leftId, rightId],
  );
  const poemColumn = (
    work: LibraryWork | undefined,
    side: "left" | "right",
  ) => (
    <section
      className="pc-library-poem"
      aria-label={side === "left" ? "左诗" : "右诗"}
    >
      <ComparePoemPicker
        works={comparisonWorks}
        selected={side === "left" ? leftId : rightId}
        otherSelected={side === "left" ? rightId : leftId}
        favorites={favorites}
        side={side}
        onSelect={(id) => {
          setCompareLine(null);
          if (side === "left") setLeftId(id);
          else setRightId(id);
        }}
      />
      {work && (
        <div className="pc-compare-leaf" key={work.id}>
          <header className="pc-compare-title">
            <h2>{work.title}</h2>
            <p className="pc-studio-meta">
              {work.dynasty || "朝代未载"} · {work.author || "作者未载"}
            </p>
          </header>
          <ComparisonScope
            work={work}
            side={side}
            selected={side === "left" ? leftPart : rightPart}
            onSelect={(part) => {
              if (side === "left") setLeftSelection({ id: work.id, part });
              else setRightSelection({ id: work.id, part });
            }}
          />
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
            {ready ? `${works.length}首入藏` : "载入诗库…"} · {favorites.length}
            首收藏
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
            disabled={!ready || importing}
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
      {ready && visits.some((v) => works.some((w) => w.id === v.id)) && (
        <details className="pc-reading-journal">
          <summary>最近读过 · 继续上次的阅读</summary>
          <div className="pc-studio-actions">
            {visits.flatMap((visit) => {
              const work = works.find((w) => w.id === visit.id);
              return work
                ? [
                    <button
                      key={visit.id}
                      className="pc-studio-action"
                      onClick={() => {
                        setView("library");
                        openWork(work);
                      }}
                    >
                      《{work.title}》<small>{work.author}</small>
                    </button>,
                  ]
                : [];
            })}
          </div>
        </details>
      )}
      <StudioTabs
        label="典籍馆视图"
        current={view}
        onChange={setView}
        tabs={[
          { id: "library", label: "诗库" },
          { id: "compare", label: "对读" },
          { id: "excerpts", label: "摘句" },
        ]}
      />
      {view === "compare" && (
        <section
          className="pc-library-reading pc-library-comparison"
          ref={compareReader}
          tabIndex={-1}
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
                  setLeftSelection(rightSelection);
                  setRightSelection(leftSelection);
                }}
              >
                <ArrowLeftRight size={18} />
                交换两卷
              </button>
              <button
                className="pc-studio-action pc-compare-submit"
                disabled={!!compareUnavailable || comparison.busy}
                aria-describedby="pc-compare-guidance"
                onClick={() => {
                  if (compareInput && !compareUnavailable) {
                    comparisonFocus.begin();
                    void comparison.run(
                      comparison.result?.task === "compare" &&
                        comparison.resultInput?.task === "compare"
                        ? comparison.resultInput
                        : compareInput,
                    );
                  }
                }}
              >
                <BookOpen size={17} />
                {comparison.result?.task === "compare"
                  ? comparison.resultInput?.task === "compare" &&
                    comparison.resultInput.question
                    ? "重新回答这个问题"
                    : "重新对读"
                  : compareInput?.scope
                    ? "比较所选文字"
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
            <div className="pc-comparison-questions">
              <StudyQuestion
                key={JSON.stringify([leftId, leftPart, rightId, rightPart])}
                heading="带着问题对读"
                comparison
                mode="reading"
                disabled={!!compareUnavailable || comparison.busy}
                onAsk={(question) => {
                  if (!compareInput || compareUnavailable) return;
                  comparisonFocus.begin();
                  void comparison.run({
                    ...compareInput,
                    question,
                  });
                }}
              />
              <StudyHistory
                entries={comparison.history}
                current={comparison.result ? comparison.resultInput : null}
                busy={comparison.busy}
                onRestore={comparison.restore}
              />
            </div>
            <StudioTaskState {...comparison} />
          </div>
          {comparison.result?.task === "compare" && (
            <div className="pc-library-comparison-notes">
              <StudyResultActions
                input={comparison.resultInput}
                result={comparison.result}
                title={`《${left?.title}》与《${right?.title}》`}
              />
              <header className="pc-compare-notes-heading">
                <span aria-hidden="true">评</span>
                <div>
                  <h2 ref={comparisonFocus.target} tabIndex={-1}>
                    合卷细读
                  </h2>
                  <p>
                    《{left?.title}》与《{right?.title}》 · AI 对读札记
                  </p>
                </div>
              </header>
              {comparison.resultInput?.task === "compare" &&
                comparison.resultInput.scope && (
                  <p className="pc-study-question-asked">
                    本次只比较：左卷
                    {comparisonSourceLabel(comparison.resultInput.scope.left)}
                    ；右卷
                    {comparisonSourceLabel(comparison.resultInput.scope.right)}
                    。不据选段评定整篇。
                  </p>
                )}
              {comparison.resultInput?.task === "compare" &&
                comparison.resultInput.question && (
                  <p className="pc-study-question-asked">
                    这份回答的问题：{comparison.resultInput.question}
                  </p>
                )}
              <StudyProse
                className="pc-compare-overview"
                text={comparison.result.result.overview}
              />
              {comparison.result.result.aspects.map((aspect, i) => (
                <div key={i} className="pc-library-aspect">
                  <h3>
                    <small>{String(i + 1).padStart(2, "0")}</small>
                    {aspect.name}
                  </h3>
                  <p>
                    <strong>左卷 ·《{left?.title}》</strong> {aspect.left}
                  </p>
                  <p>
                    <strong>右卷 ·《{right?.title}》</strong> {aspect.right}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <div hidden={view !== "excerpts"}>
        <ExcerptsPanel
          shelf={excerpts}
          works={works}
          onOpen={(work, quote) => {
            setView("library");
            openWork(work);
            setExcerptFeedback({
              id: work.id,
              line: work.paragraphs.indexOf(quote.text),
              message: "此句来自你的摘句，可以接着阅读全文。",
            });
          }}
        />
      </div>
      <div className="pc-library-worktable" hidden={view !== "library"}>
        <section
          ref={catalogue}
          role="tabpanel"
          aria-label="诗库"
          className="pc-library-catalogue"
          tabIndex={-1}
        >
          {catalogFailed && ready && (
            <div className="pc-library-retry" role="status">
              <span>完整诗库尚未载入，当前仅显示本机作品与示例。</span>
              <button
                type="button"
                className="pc-studio-action"
                onClick={() => {
                  setFeedback(null);
                  setReady(false);
                }}
              >
                重新载入诗库
              </button>
            </div>
          )}
          <form
            className="pc-library-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ready || queryComposing.current || searchTask.busy) return;
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
                  !ready ||
                  searchTask.busy ||
                  (mode === "scene" && !query.trim())
                }
              >
                寻诗
              </button>
            </div>
            {mode === "literal" && (
              <LibraryQueryHelp
                onApply={(value) => {
                  setQuery(value);
                  queryInput.current?.focus();
                }}
              />
            )}
            <div className="pc-library-filters">
              <label className="pc-library-filter pc-library-filter--collection">
                选集
                <select
                  aria-label="按选集筛选"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                >
                  <option value="">全部</option>
                  {[
                    ...new Set(
                      works.flatMap((w) =>
                        w.collection ? [w.collection] : [],
                      ),
                    ),
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="pc-library-filter">
                文类
                <select
                  aria-label="按文类筛选"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="">全部</option>
                  <option value="poetry">诗词曲及未定</option>
                  <option value="prose">散文</option>
                </select>
              </label>
              <label className="pc-library-filter">
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
              <label className="pc-library-filter-check">
                <input
                  type="checkbox"
                  checked={onlyFavorites}
                  onChange={(e) => setOnlyFavorites(e.target.checked)}
                />
                只看收藏
              </label>
              <span className="pc-library-count" aria-live="polite">
                {matches
                  ? `AI精选 ${matches.length} 首 / ${candidates.length}首候选`
                  : `${display.length}首`}
              </span>
              {unique.hiddenCount > 0 && (
                <label className="pc-library-filter-check pc-library-filter--duplicates">
                  <input
                    type="checkbox"
                    aria-label="显示合编与重复篇"
                    checked={showDuplicates}
                    onChange={(e) => setShowDuplicates(e.target.checked)}
                  />
                  显示合编与重复篇（{unique.hiddenCount}）
                </label>
              )}
            </div>
          </form>
          <div className="pc-library-discover">
            <button
              type="button"
              disabled={!ready || !filtered.length}
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
              意象匹配后最多40首交AI研读；单篇超过2000字暂不进入AI候选。
            </p>
          )}
          <div className="pc-library-list" ref={catalogueList}>
            {!ready && (
              <p className="pc-studio-empty" role="status">
                正在载入诗库与本机藏书，可先填写检索条件。
              </p>
            )}
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
          {ready && !display.length && (
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
            tabIndex={-1}
          >
            <div className="pc-studio-actions pc-reader-navigation">
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
                disabled={
                  !sections[studySection] ||
                  (selected.kind === "prose" && literary.busy)
                }
                onClick={() => {
                  const section = sections[studySection];
                  if (!section) return;
                  if (selected.kind === "prose")
                    void literary.run({
                      task: "critique",
                      text: section.paragraphs.join("\n"),
                      rhymeBook: "pingshui",
                      direction: "meaning",
                      mode: "reading",
                    });
                  else onStudy(section);
                }}
              >
                <BookOpen size={17} />
                {selected.kind === "prose"
                  ? "赏读此文"
                  : sections.length > 1
                    ? "研读选段"
                    : "研读此诗"}
              </button>
            </div>
            <h2>{selected.title}</h2>
            {!!relatedTrail.length && (
              <button
                className="pc-studio-action pc-related-return"
                onClick={() => {
                  const previous = works.find(
                    (work) => work.id === relatedTrail.at(-1),
                  );
                  setRelatedTrail((trail) => trail.slice(0, -1));
                  if (previous) openWork(previous, true);
                }}
              >
                返回上一首《
                {works.find((work) => work.id === relatedTrail.at(-1))?.title ??
                  "原诗"}
                》
              </button>
            )}
            <p className="pc-studio-meta pc-library-byline">
              {selected.dynasty || "朝代未载"} · {selected.author || "作者未载"}
              {selected.kind === "prose" ? " · 散文" : ""}
            </p>
            <div className="pc-studio-actions pc-poem-share">
              <button
                className="pc-studio-action"
                onClick={() => {
                  const id = ++shareRequest.current;
                  const work = selected;
                  void navigator.clipboard
                    .writeText(poemText(work))
                    .then(() => {
                      if (
                        id === shareRequest.current &&
                        selectedRef.current === work.id
                      )
                        setShareFeedback({
                          id: work.id,
                          message: "整首已复制，附诗题、作者与来源。",
                        });
                    })
                    .catch(() => {
                      if (
                        id === shareRequest.current &&
                        selectedRef.current === work.id
                      )
                        setShareFeedback({
                          id: work.id,
                          message: "复制未成功，可下载文本或选中诗句复制。",
                        });
                    });
                }}
              >
                <Copy size={16} />
                复制整首
              </button>
              <button
                className="pc-studio-action"
                onClick={() => {
                  try {
                    downloadPoem(selected);
                    setShareFeedback({
                      id: selected.id,
                      message: "已生成诗文文本，可在浏览器下载中查看。",
                    });
                  } catch {
                    setShareFeedback({
                      id: selected.id,
                      message: "下载未成功，可尝试复制整首。",
                    });
                  }
                }}
              >
                <Download size={16} />
                下载诗文
              </button>
            </div>
            {shareFeedback?.id === selected.id && (
              <p className="pc-studio-notice" role="status">
                {shareFeedback.message}
              </p>
            )}
            {sections.length > 1 && (
              <label className="pc-library-section-picker">
                研读选段
                <select
                  aria-label="研读选段"
                  value={studySection}
                  onChange={(e) => {
                    setStudySection(Number(e.target.value));
                    setQuestionSeed(null);
                  }}
                >
                  {sections.map((section, i) => (
                    <option key={i} value={i}>
                      第{i + 1}/{sections.length}段 ·{" "}
                      {section.paragraphs[0]?.slice(0, 14)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="pc-library-questions">
              <StudyQuestion
                key={`${selected.id}:${studySection}`}
                seed={
                  questionSeed?.workId === selected.id &&
                  questionSeed.section === studySection
                    ? questionSeed
                    : undefined
                }
                heading={
                  selected.kind === "prose" ? "问问这篇文章" : "问问这首诗"
                }
                prose={selected.kind === "prose"}
                mode="reading"
                disabled={!sections[studySection] || literary.busy}
                onAsk={(question) => {
                  const section = sections[studySection];
                  if (section) {
                    answerFocus.begin();
                    void literary.run({
                      task: "critique",
                      text: section.paragraphs.join("\n"),
                      rhymeBook: "pingshui",
                      direction: "meaning",
                      mode: "reading",
                      question,
                    });
                  }
                }}
              />
              {sections.length > 1 && (
                <p className="pc-studio-meta">
                  提问只针对第{studySection + 1}段；切换选段可读其他部分。
                </p>
              )}
              <StudyHistory
                entries={literary.history}
                current={literary.result ? literary.resultInput : null}
                busy={literary.busy}
                onRestore={literary.restore}
              />
            </div>
            <StudioTaskState {...literary} />
            {literary.result?.task === "critique" && (
              <section
                aria-label={selected.kind === "prose" ? "文章赏读" : "诗作问答"}
                className="pc-library-literary"
                ref={answerFocus.target}
                tabIndex={-1}
              >
                <StudyResultActions
                  input={literary.resultInput}
                  result={literary.result}
                  title={sections[studySection]?.title ?? selected.title}
                />
                {literary.resultInput?.task === "critique" &&
                  literary.resultInput.question && (
                    <p className="pc-study-question-asked">
                      这份回答的问题：{literary.resultInput.question}
                    </p>
                  )}
                <StudyProse text={literary.result.result.overview} />
                <StudyFollowUpContext input={literary.resultInput} />
                <StudyFollowUp
                  key={JSON.stringify([
                    literary.resultInput,
                    literary.result.result.overview,
                  ])}
                  input={literary.resultInput}
                  response={literary.result}
                  disabled={literary.busy}
                  onAsk={(input) => {
                    answerFocus.begin();
                    void literary.run(input);
                  }}
                />
                <RuleReviewNote review={literary.result.result.ruleReview} />
                {literary.result.result.strengths.map((value, i) => (
                  <p key={i}>{value}</p>
                ))}
              </section>
            )}
            <div className="pc-studio-actions pc-reader-lookup">
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
            <label className="pc-library-pinyin-toggle">
              <input
                type="checkbox"
                checked={showPinyin}
                onChange={(e) => setShowPinyin(e.target.checked)}
              />
              现代注音
            </label>
            {showPinyin && (
              <p className="pc-studio-meta" role="status">
                {pronunciationBusy
                  ? "载入注音…"
                  : (pronunciationError ??
                    (selected.id.startsWith("deepseek:")
                      ? pronunciation?.notice
                      : "本机导入作品未附逐字注音。"))}
              </p>
            )}
            <AnnotatedVerses
              work={selected}
              pronunciation={pronunciation}
              showPinyin={showPinyin}
              selected={lookupChar}
              onSelect={setLookupChar}
              onExcerpt={(line) => void copyExcerpt(selected, line)}
              askDisabled={literary.busy}
              onAskLine={(line) => {
                if (literary.busy) return;
                try {
                  const next = passageQuestion(selected, line);
                  setStudySection(next.section);
                  setQuestionSeed((previous) => ({
                    ...next,
                    workId: selected.id,
                    revision: (previous?.revision ?? 0) + 1,
                  }));
                } catch (cause) {
                  setShareFeedback({
                    id: selected.id,
                    message:
                      cause instanceof Error
                        ? cause.message
                        : "暂未带入原句，请手动提问。",
                  });
                }
              }}
              excerptLine={
                excerptFeedback?.id === selected.id &&
                excerptFeedback.message.startsWith("此句")
                  ? excerptFeedback.line
                  : undefined
              }
            />
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
            <ResearchNotes
              key={`research:${selected.id}`}
              text={selected.paragraphs.join("\n")}
            />
            {selected.kind !== "prose" && (
              <RelatedReading
                key={`related:${selected.id}`}
                selected={selected}
                works={unique.works}
                favorites={favorites}
                onRead={(work) => {
                  setRelatedTrail((trail) =>
                    [...trail, selected.id].slice(-12),
                  );
                  openWork(work, true);
                }}
                onFavorite={toggleFavorite}
                onCompare={(work) => {
                  setLeftId(selected.id);
                  setRightId(work.id);
                  setCompareLine(null);
                  setView("compare");
                  window.requestAnimationFrame(() => {
                    compareReader.current?.focus({ preventScroll: true });
                    compareReader.current?.scrollIntoView({
                      block: "start",
                      behavior: motion.effects ? "smooth" : "instant",
                    });
                  });
                }}
              />
            )}
            {selected.paragraphs.join("\n").length > 2000 && (
              <p className="pc-studio-notice">
                长篇原文完整保留；研读按所选段落进行，选段结论不代表整篇。
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
        诗文以所列来源为准；现代注音、AI赏析与意境匹配仅供参考。语料含近现代作品；来源与整理权利见原站。导入、收藏和推敲记录保存在此设备。
      </footer>
    </div>
  );
}
