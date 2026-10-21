import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FilePlus2,
  RotateCcw,
  RotateCw,
  Sparkles,
  Upload,
} from "lucide-react";
import type {
  PoetryAssistantRequest,
  Revision,
  RhymeWordsResponse,
} from "@poetry/contracts";
import type { CheckerViewProps, InputDraft } from "../view-contract";
import { usePoetryTask } from "../hooks/usePoetryTask";
import {
  StudioTabs,
  StudioTaskState,
} from "../presentation/components/StudioControls";
import { requestRhymeWords } from "../api/poetry-studio";
import { downloadJson } from "./library";
import {
  applyRevisions,
  changedSpan,
  parseNotebook,
  type NotebookEntry,
} from "./notebook";

type CritiqueInput = Extract<PoetryAssistantRequest, { task: "critique" }>;
export function PoetryDesk({
  checker,
  entries,
  notice,
  onRevise,
  onImport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  mode,
  onModeChange,
}: {
  checker: CheckerViewProps;
  entries: NotebookEntry[];
  notice: string | null;
  onRevise: (draft: InputDraft, note: string) => void;
  onImport: (entries: NotebookEntry[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  mode: CritiqueInput["mode"];
  onModeChange: (mode: CritiqueInput["mode"]) => void;
}) {
  const [tab, setTab] = useState<"critique" | "rhyme" | "notebook">("critique");
  const [direction, setDirection] =
    useState<CritiqueInput["direction"]>("meaning");
  const [automatic, setAutomatic] = useState(true);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [seedTokenId, setSeedTokenId] = useState("");
  const [readingId, setReadingId] = useState("");
  const [page, setPage] = useState(0);
  const [rhymeWords, setRhymeWords] = useState<RhymeWordsResponse | null>(null);
  const [rhymeBusy, setRhymeBusy] = useState(false);
  const [rhymeError, setRhymeError] = useState<string | null>(null);
  const [revisionDrafts, setRevisionDrafts] = useState<{
    baseHash: string;
    versions: Array<{ text: string; edits: Revision[] }>;
  }>({ baseHash: "", versions: [] });
  const lastAutoReview = useRef<string | null>(null);
  const notebookFile = useRef<HTMLInputElement>(null);
  const { report, draft, stale, busy } = checker;
  const usable =
    !!report && !stale && !busy && report.poem.originalText === draft.text;
  const critique = usePoetryTask(
    JSON.stringify([report?.inputHash, draft.rhymeBook, direction, mode]),
  );
  const pendingEdits =
    report?.poem.originalText === draft.text
      ? []
      : revisionDrafts.baseHash === report?.inputHash
        ? [...revisionDrafts.versions]
            .reverse()
            .find((v) => v.text === draft.text)?.edits
        : undefined;
  const canUseSuggestions =
    !!report &&
    !busy &&
    pendingEdits !== undefined &&
    draft.rhymeBook === report.policy.rhymeBook;
  const ends =
    report?.poem.lines.flatMap((line) => {
      const token = report.poem.tokens.find(
        (t) => t.tokenId === line.tokenIds.at(-1),
      );
      return token ? [token] : [];
    }) ?? [];
  const seed = ends.find((t) => t.tokenId === seedTokenId) ?? ends.at(-1);
  const seedReading =
    seed?.candidates.find((c) => c.id === readingId) ??
    seed?.candidates.find((c) => c.id === seed.selectedReadingId) ??
    seed?.candidates[0];
  const rhyme = usePoetryTask(
    JSON.stringify([
      report?.inputHash,
      draft.rhymeBook,
      seed?.tokenId,
      seedReading?.id,
      page,
    ]),
  );
  useEffect(() => {
    setSeedTokenId("");
    setReadingId("");
    setPage(0);
  }, [report?.poem.inputHash, draft.rhymeBook]);
  useEffect(() => {
    setRhymeWords(null);
    setRhymeError(null);
    if (!canUseSuggestions || !seedReading || tab !== "rhyme") {
      setRhymeBusy(false);
      return;
    }
    const controller = new AbortController();
    setRhymeBusy(true);
    void requestRhymeWords(
      {
        rhymeBook: draft.rhymeBook,
        readingId: seedReading.id,
        offset: page * 80,
        limit: 80,
      },
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setRhymeWords(value);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setRhymeError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRhymeBusy(false);
      });
    return () => controller.abort();
  }, [canUseSuggestions, seedReading?.id, draft.rhymeBook, page, tab]);
  const critiqueInput: CritiqueInput = {
    task: "critique",
    text: draft.text,
    rhymeBook: draft.rhymeBook,
    direction,
    mode,
  };
  const reviewIdentity = JSON.stringify([
    report?.poem.inputHash,
    draft.rhymeBook,
    direction,
    mode,
  ]);
  useEffect(() => {
    if (usable && automatic && lastAutoReview.current !== reviewIdentity) {
      lastAutoReview.current = reviewIdentity;
      void critique.run({
        task: "critique",
        text: draft.text,
        rhymeBook: draft.rhymeBook,
        direction,
        mode,
      });
    }
  }, [reviewIdentity, usable, automatic, critique.run]);
  function revise(next: InputDraft, reason: string) {
    onRevise(next, reason);
    setFeedback(null);
  }
  function adopt(edit: Revision, reason: string) {
    if (!report || !canUseSuggestions || !pendingEdits) return;
    try {
      const edits = [
        ...pendingEdits.filter(
          (previous) =>
            previous.startTokenId !== edit.startTokenId ||
            previous.endTokenId !== edit.endTokenId,
        ),
        edit,
      ];
      const text = applyRevisions(
        report.poem.originalText,
        edits,
        report.poem.tokens,
      );
      if (text === draft.text) return;
      setRevisionDrafts((previous) => ({
        baseHash: report.inputHash,
        versions: [
          ...(previous.baseHash === report.inputHash ? previous.versions : []),
          { text, edits },
        ].slice(-80),
      }));
      revise({ ...draft, text }, reason);
    } catch (error) {
      setFeedback((error as Error).message);
    }
  }
  const currentCritique =
    critique.result?.task === "critique" ? critique.result.result : null;
  const recommendations =
    rhyme.result?.task === "rhyme" ? rhyme.result.result.matches : [];
  const peers = rhymeWords?.lookup.entries.flatMap((e) => e.candidates) ?? [];
  const canApply = canUseSuggestions && mode === "writing";
  return (
    <section
      className="pc-poetry-desk pc-studio-scope"
      aria-labelledby="poetry-desk-title"
    >
      <header className="pc-poetry-desk-heading">
        <div>
          <p className="pc-studio-eyebrow">字斟句酌</p>
          <h2 id="poetry-desk-title">推敲台</h2>
        </div>
        <div className="pc-studio-actions">
          {stale && (
            <button
              className="pc-studio-action"
              disabled={busy}
              onClick={checker.onAnalyze}
            >
              <Sparkles size={17} /> 分析修改
            </button>
          )}
          <button
            className="pc-studio-icon"
            disabled={!canUndo || busy}
            title="撤销上次修改"
            aria-label="撤销上次修改"
            onClick={onUndo}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="pc-studio-icon"
            disabled={!canRedo || busy}
            title="重做修改"
            aria-label="重做修改"
            onClick={onRedo}
          >
            <RotateCw size={18} />
          </button>
        </div>
      </header>
      <StudioTabs
        label="推敲台功能"
        current={tab}
        onChange={setTab}
        tabs={[
          { id: "critique", label: "全诗评议" },
          { id: "rhyme", label: "同韵寻字" },
          { id: "notebook", label: "推敲笺" },
        ]}
      />
      {(notice || feedback) && (
        <p className="pc-studio-notice" role="status">
          {feedback ?? notice}
        </p>
      )}
      {tab === "critique" && (
        <div
          className="pc-poetry-critique"
          role="tabpanel"
          aria-label="全诗评议"
        >
          <div className="pc-studio-actions">
            <StudioTabs
              label="诗作类型"
              current={mode}
              onChange={onModeChange}
              tabs={[
                { id: "writing", label: "写作推敲" },
                { id: "reading", label: "原诗赏读" },
              ]}
            />
            <label>
              侧重
              <select
                aria-label="评议侧重"
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as CritiqueInput["direction"])
                }
              >
                <option value="meaning">保留原意</option>
                <option value="imagery">加强画面</option>
                <option value="sound">节奏声律</option>
              </select>
            </label>
          </div>
          <div className="pc-studio-actions">
            <label>
              <input
                type="checkbox"
                checked={automatic}
                onChange={(e) => setAutomatic(e.target.checked)}
              />
              分析后自动评议
            </label>
            <button
              className="pc-studio-action"
              disabled={!usable || critique.busy}
              onClick={() => void critique.run(critiqueInput)}
            >
              <Sparkles size={17} />
              {currentCritique ? "重新评议" : "研读全诗"}
            </button>
          </div>
          <StudioTaskState {...critique} />
          {!usable && (
            <p className="pc-studio-empty">
              {stale
                ? "修改已保存，当前保留上次分析。"
                : "整诗分析完成后，在此研读与推敲。"}
            </p>
          )}
          {currentCritique && (
            <div className="pc-poetry-review">
              <h3>通篇观照</h3>
              <p>{currentCritique.overview}</p>
              {currentCritique.strengths.length > 0 && (
                <>
                  <h3>可取之处</h3>
                  <ul>
                    {currentCritique.strengths.map((strength, i) => (
                      <li key={i}>{strength}</li>
                    ))}
                  </ul>
                </>
              )}
              {currentCritique.revisions.map((edit, i) => (
                <article className="pc-poetry-edit" key={i}>
                  <div className="pc-poetry-substitution">
                    <del>{edit.original}</del>
                    <ArrowRight size={18} aria-hidden="true" />
                    <ins>{edit.replacement}</ins>
                  </div>
                  <p>{edit.reason}</p>
                  <p className="pc-studio-meta">取舍：{edit.tradeoff}</p>
                  <button
                    className="pc-studio-action"
                    disabled={
                      !canApply ||
                      pendingEdits?.some(
                        (e) =>
                          e.startTokenId === edit.startTokenId &&
                          e.endTokenId === edit.endTokenId &&
                          e.replacement === edit.replacement,
                      )
                    }
                    onClick={() =>
                      adopt(
                        edit,
                        `GLM炼字：${edit.original}→${edit.replacement}；${edit.reason}；取舍：${edit.tradeoff}`,
                      )
                    }
                  >
                    <Check size={17} />
                    {pendingEdits?.some(
                      (e) =>
                        e.startTokenId === edit.startTokenId &&
                        e.endTokenId === edit.endTokenId &&
                        e.replacement === edit.replacement,
                    )
                      ? "已采纳"
                      : "采纳"}
                  </button>
                </article>
              ))}
              {!currentCritique.revisions.length && (
                <p className="pc-studio-meta">
                  {mode === "reading"
                    ? "赏读保留原作。"
                    : "本次评议未建议改字。"}
                </p>
              )}
              <p className="pc-studio-meta">
                {critique.result?.model} · AI文学参考
              </p>
            </div>
          )}
        </div>
      )}
      {tab === "rhyme" && (
        <div role="tabpanel" aria-label="同韵寻字">
          {!canUseSuggestions || !seed ? (
            <p className="pc-studio-empty">
              请先完成当前诗作分析，再选择句末韵字。
            </p>
          ) : (
            <>
              {stale && <p className="pc-studio-meta">同韵候选沿用上次分析。</p>}
              <div className="pc-studio-actions">
                <label>
                  句末字
                  <select
                    aria-label="选择句末字"
                    value={seed.tokenId}
                    onChange={(e) => {
                      setSeedTokenId(e.target.value);
                      setReadingId("");
                      setPage(0);
                    }}
                  >
                    {ends.map((t) => (
                      <option key={t.tokenId} value={t.tokenId}>
                        第{t.line}句 · {t.text}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  读音候选
                  <select
                    aria-label="选择韵脚读音"
                    value={seedReading?.id ?? ""}
                    onChange={(e) => {
                      setReadingId(e.target.value);
                      setPage(0);
                    }}
                  >
                    {seed.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.modernReading
                          ? `${c.modernReading.pinyin}${c.modernReading.toneNumber} · `
                          : ""}
                        {c.groupIds
                          .map(
                            (id) =>
                              report.provenance.groups.find((g) => g.id === id)
                                ?.name ?? id,
                          )
                          .join("、")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!seed.candidates.length && <p>此字在所选韵书中未收录。</p>}
              {rhymeBusy && <p role="status">查阅韵书…</p>}
              {rhymeError && (
                <p role="alert" className="pc-studio-error">
                  {rhymeError}
                </p>
              )}
              {rhymeWords && (
                <>
                  <div className="pc-studio-actions">
                    <span className="pc-studio-meta">
                      同部{rhymeWords.total}字 · 本页
                      {rhymeWords.lookup.entries.length}字
                    </span>
                    <button
                      className="pc-studio-action"
                      disabled={!usable || rhyme.busy || !peers.length}
                      onClick={() =>
                        void rhyme.run({
                          task: "rhyme",
                          text: report.poem.originalText,
                          rhymeBook: draft.rhymeBook,
                          targetTokenId: seed.tokenId,
                          readingId: seedReading!.id,
                          candidateIds: peers.slice(0, 120).map((c) => c.id),
                        })
                      }
                    >
                      <Sparkles size={17} />
                      结合全诗荐字
                    </button>
                  </div>
                  <StudioTaskState {...rhyme} />
                  {recommendations.map((match) => {
                    const c = peers.find((p) => p.id === match.id);
                    return (
                      c && (
                        <article className="pc-poetry-edit" key={c.id}>
                          <h3>
                            {c.character}
                            {c.modernReading && (
                              <small>
                                {" "}
                                {c.modernReading.pinyin}
                                {c.modernReading.toneNumber}
                              </small>
                            )}
                          </h3>
                          <p>{match.reason}</p>
                          <button
                            className="pc-studio-action"
                            disabled={!canApply}
                            onClick={() =>
                              adopt(
                                {
                                  startTokenId: seed.tokenId,
                                  endTokenId: seed.tokenId,
                                  original: seed.text,
                                  replacement: c.character,
                                  reason: match.reason,
                                  tradeoff: "同韵不等于同义或整诗合律。",
                                },
                                `同韵推敲：${seed.text}→${c.character}；候选${c.id}；${match.reason}`,
                              )
                            }
                          >
                            <Check size={16} />
                            试用
                          </button>
                        </article>
                      )
                    );
                  })}
                  <div className="pc-rhyme-characters">
                    {rhymeWords.lookup.entries.map((e) => (
                      <button
                        key={e.character}
                        type="button"
                        title={e.candidates
                          .map((c) =>
                            c.modernReading
                              ? `${c.modernReading.pinyin}${c.modernReading.toneNumber}`
                              : c.toneClass,
                          )
                          .join(" / ")}
                        onClick={() => {
                          window.location.hash = `dictionary?char=${encodeURIComponent(e.character)}&book=${draft.rhymeBook}`;
                        }}
                      >
                        {e.character}
                      </button>
                    ))}
                  </div>
                  <div className="pc-library-pagination">
                    <button
                      className="pc-studio-icon"
                      title="上一页韵字"
                      aria-label="上一页韵字"
                      disabled={!page || rhymeBusy}
                      onClick={() => setPage(page - 1)}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <span>
                      {page + 1} /{" "}
                      {Math.max(1, Math.ceil(rhymeWords.total / 80))}
                    </span>
                    <button
                      className="pc-studio-icon"
                      title="下一页韵字"
                      aria-label="下一页韵字"
                      disabled={
                        (page + 1) * 80 >= rhymeWords.total || rhymeBusy
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                  <p className="pc-studio-meta">
                    语义推荐取本页前120条读音候选；同韵不等于同义或整诗合律。
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}
      {tab === "notebook" && (
        <div role="tabpanel" aria-label="推敲笺">
          <div className="pc-studio-actions">
            <label className="pc-notebook-note">
              笺记
              <input
                aria-label="修改原因"
                placeholder="记下这一次推敲"
                value={note}
                maxLength={800}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              className="pc-studio-action"
              disabled={!draft.text.trim() || busy}
              onClick={() => {
                onRevise(draft, note || "手动存笺");
                setNote("");
              }}
            >
              <FilePlus2 size={17} />
              存一笺
            </button>
            <button
              className="pc-studio-icon"
              title="导出推敲笺"
              aria-label="导出推敲笺"
              onClick={() =>
                downloadJson("推敲笺.json", { version: 1, entries })
              }
            >
              <Download size={18} />
            </button>
            <button
              className="pc-studio-icon"
              title="导入推敲笺"
              aria-label="导入推敲笺"
              onClick={() => notebookFile.current?.click()}
            >
              <Upload size={18} />
            </button>
            <input
              type="file"
              hidden
              accept=".json,application/json"
              ref={notebookFile}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  setFeedback("推敲笺文件不能超过2MB。");
                  return;
                }
                void file
                  .text()
                  .then((raw) => {
                    onImport(parseNotebook(JSON.parse(raw)));
                    setFeedback("推敲笺已合并。");
                  })
                  .catch((error: Error) => setFeedback(error.message));
              }}
            />
          </div>
          <p className="pc-studio-meta">{entries.length}笺 · 保留最近80笺</p>
          {!entries.length && (
            <p className="pc-studio-empty">此处尚无推敲记录。</p>
          )}
          {[...entries].reverse().map((entry) => {
            const diff = changedSpan(entry.before.text, entry.after.text);
            return (
              <article className="pc-notebook-entry" key={entry.id}>
                <header>
                  <time dateTime={entry.at}>
                    {new Date(entry.at).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </time>
                  <button
                    className="pc-studio-action"
                    disabled={busy}
                    onClick={() =>
                      revise(entry.after, `恢复推敲笺：${entry.note}`)
                    }
                  >
                    <RotateCcw size={16} />
                    恢复此版
                  </button>
                </header>
                <p>{entry.note}</p>
                {entry.before.text !== entry.after.text && (
                  <p className="pc-poetry-substitution">
                    <del>{diff.removed || "（无）"}</del>
                    <ArrowRight size={16} aria-hidden="true" />
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
                      <p>{entry.after.text}</p>
                    </div>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
