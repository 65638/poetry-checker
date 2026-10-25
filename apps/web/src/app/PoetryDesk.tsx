import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  PoetryAssistantResponse,
  Revision,
  RhymeWordsResponse,
  ReadingCandidate,
} from "@poetry/contracts";
import type { CheckerViewProps, InputDraft } from "../view-contract";
import { usePoetryTask } from "../hooks/usePoetryTask";
import { useStudyAnswerFocus } from "../hooks/useStudyAnswerFocus";
import {
  StudioTabs,
  StudioTaskState,
} from "../presentation/components/StudioControls";
import { buildProsodyContext } from "../features/critique";
import { requestAllRhymeWords } from "../api/all-rhyme-words";
import { useRhymeTask } from "../hooks/useRhymeTask";
import { RhymeCatalogCache } from "./rhymeCatalogCache";
import { filterRhymeEntries } from "./rhymeFilter";
import { RhymeNoteActions } from "./RhymeNoteActions";
import "../presentation/styles/rhyme-catalog.css";
import { createCharacterLookup } from "../api/characters";
import { readWebEnv, resolveApiConfig } from "./config";
import { downloadJson } from "./library";
import { currentLineEnd, parseNotebook, type NotebookEntry } from "./notebook";

import { NotebookArchive } from "../presentation/components/NotebookArchive";
import { RevisionSubstitution } from "../presentation/components/RevisionSubstitution";
import { StudyResultActions } from "./StudyResultActions";
import { RuleReviewNote } from "./RuleReviewNote";
import { planRevision } from "./revisionPlan";
import { RevisionPreview } from "./RevisionPreview";
import { StudyQuestion } from "./StudyQuestion";
import { formatModernReading } from "./readingLabels";
import { StudyHistory } from "./StudyHistory";
import { StudyFollowUp, StudyFollowUpContext } from "./StudyFollowUp";
import { DraftComparison } from "./DraftComparison";
import { StudyProse } from "./StudyProse";

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
  restoredAnalysis = false,
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
  restoredAnalysis?: boolean;
}) {
  const [tab, setTab] = useState<"critique" | "rhyme" | "notebook">("critique");
  const [direction, setDirection] =
    useState<CritiqueInput["direction"]>("meaning");
  const [automatic, setAutomatic] = useState(true);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [seedTokenId, setSeedTokenId] = useState("");
  const [readingId, setReadingId] = useState("");
  const [rhymeFilter, setRhymeFilter] = useState("");
  const [rhymeIntention, setRhymeIntention] = useState("");
  const [rhymeRetry, setRhymeRetry] = useState(0);
  const [changedSeedRetry, setChangedSeedRetry] = useState(0);
  const [rhymeLoaded, setRhymeLoaded] = useState({ loaded: 0, total: 0 });
  const [rhymeSnapshot, setRhymeSnapshot] = useState<{
    identity: string;
    value: RhymeWordsResponse;
  } | null>(null);
  const rhymeCache = useRef(new RhymeCatalogCache());
  const [recommendationCandidates, setRecommendationCandidates] = useState<
    ReadingCandidate[]
  >([]);
  const [savedRecommendations, setSavedRecommendations] = useState<{
    scope: string;
    text: string;
    input: Extract<PoetryAssistantRequest, { task: "rhyme" }>;
    matches: Extract<
      PoetryAssistantResponse,
      { task: "rhyme" }
    >["result"]["matches"];
    candidates: ReadingCandidate[];
  } | null>(null);
  const [changedSeed, setChangedSeed] = useState<{
    identity: string;
    candidates: ReadingCandidate[];
    groups?: RhymeWordsResponse["lookup"]["groups"];
    error?: string;
  } | null>(null);
  const lookupCharacter = useMemo(
    () => createCharacterLookup(resolveApiConfig(readWebEnv()).baseUrl),
    [],
  );
  const [rhymeBusy, setRhymeBusy] = useState(false);
  const [rhymeError, setRhymeError] = useState<string | null>(null);
  const [revisionDrafts, setRevisionDrafts] = useState<{
    baseHash: string;
    versions: Array<{ text: string; edits: Revision[] }>;
  }>({ baseHash: "", versions: [] });
  const lastAutoReview = useRef<string | null>(null);
  const previouslyRestored = useRef(restoredAnalysis);
  const notebookFile = useRef<HTMLInputElement>(null);
  const { report, draft, stale, busy } = checker;
  const usable =
    !!report &&
    !stale &&
    !busy &&
    report.poem.originalText === draft.text &&
    report.policy.rhymeBook === draft.rhymeBook;
  // Keep advice visible while adopting edits; usable gates sending a new request.
  const prosodyContext = report ? buildProsodyContext(report) : undefined;
  const critique = usePoetryTask(
    JSON.stringify([
      report?.inputHash,
      draft.rhymeBook,
      direction,
      mode,
      prosodyContext,
    ]),
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
  const originalSeed =
    ends.find((t) => t.tokenId === seedTokenId) ?? ends.at(-1);
  const seed = originalSeed
    ? currentLineEnd(originalSeed, pendingEdits ?? [], report!.poem.tokens)
    : undefined;
  const changedSeedIdentity = JSON.stringify([
    draft.rhymeBook,
    seed?.text,
    report?.versions.data,
  ]);
  const seedChanged = seed?.text !== originalSeed?.text;
  const seedBusy = seedChanged && changedSeed?.identity !== changedSeedIdentity;
  const seedCandidates = seedChanged
    ? changedSeed?.identity === changedSeedIdentity
      ? changedSeed.candidates
      : []
    : (originalSeed?.candidates ?? []);
  const seedReading =
    seedCandidates.find((c) => c.id === readingId) ??
    seedCandidates.find((c) => c.id === originalSeed?.selectedReadingId) ??
    seedCandidates.find((c) =>
      c.groupIds.some((id) =>
        originalSeed?.candidates
          .find((s) => s.id === originalSeed.selectedReadingId)
          ?.groupIds.includes(id),
      ),
    ) ??
    seedCandidates[0];
  const rhymeIdentity = JSON.stringify([
    draft.rhymeBook,
    seedReading?.id,
    report?.versions.data,
  ]);
  const rhymeWords =
    rhymeSnapshot?.identity === rhymeIdentity ? rhymeSnapshot.value : null;
  const rhyme = useRhymeTask(
    JSON.stringify([
      draft.text,
      draft.rhymeBook,
      seed?.tokenId,
      seedReading?.id,
      report?.versions.data,
    ]),
  );
  useEffect(() => {
    setSeedTokenId("");
    setReadingId("");
    setRhymeFilter("");
  }, [report?.poem.inputHash, draft.rhymeBook]);
  useEffect(() => setRhymeFilter(""), [rhymeIdentity]);
  useEffect(() => {
    if (!canUseSuggestions || !seedChanged || !seed?.text) return;
    const controller = new AbortController();
    setChangedSeed(null);
    void lookupCharacter(seed.text, draft.rhymeBook, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setChangedSeed({
            identity: changedSeedIdentity,
            candidates: result.entries.flatMap((e) => e.candidates),
            groups: result.groups,
          });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setChangedSeed({
            identity: changedSeedIdentity,
            candidates: [],
            error: error.message,
          });
      });
    return () => controller.abort();
  }, [
    canUseSuggestions,
    changedSeedIdentity,
    seedChanged,
    lookupCharacter,
    changedSeedRetry,
  ]);
  useEffect(() => {
    setRhymeError(null);
    if (!canUseSuggestions || !seedReading || tab !== "rhyme") {
      setRhymeBusy(false);
      return;
    }
    const controller = new AbortController();
    const cacheKey = rhymeIdentity;
    const cached = rhymeCache.current.get(cacheKey);
    if (cached) {
      setRhymeSnapshot({ identity: rhymeIdentity, value: cached });
      setRhymeBusy(false);
      return;
    }
    setRhymeBusy(true);
    setRhymeLoaded({ loaded: 0, total: 0 });
    void requestAllRhymeWords(
      {
        rhymeBook: draft.rhymeBook,
        readingId: seedReading.id,
      },
      controller.signal,
      (loaded, total) => {
        if (!controller.signal.aborted) setRhymeLoaded({ loaded, total });
      },
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          rhymeCache.current.set(cacheKey, value);
          setRhymeSnapshot({ identity: rhymeIdentity, value });
        }
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setRhymeError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRhymeBusy(false);
      });
    return () => controller.abort();
  }, [canUseSuggestions, rhymeIdentity, rhymeRetry, tab]);
  const critiqueInput: CritiqueInput = {
    task: "critique",
    text: draft.text,
    rhymeBook: draft.rhymeBook,
    direction,
    mode,
    ...(prosodyContext ? { prosodyContext } : {}),
  };
  const reviewIdentity = JSON.stringify([
    report?.inputHash,
    prosodyContext,
    draft.rhymeBook,
    direction,
    mode,
  ]);
  useEffect(() => {
    if (previouslyRestored.current && !restoredAnalysis)
      lastAutoReview.current = null;
    previouslyRestored.current = restoredAnalysis;
    if (usable && automatic && lastAutoReview.current !== reviewIdentity) {
      if (restoredAnalysis && lastAutoReview.current === null) {
        lastAutoReview.current = reviewIdentity;
        return;
      }
      lastAutoReview.current = reviewIdentity;
      void critique.run(
        {
          task: "critique",
          text: draft.text,
          rhymeBook: draft.rhymeBook,
          direction,
          mode,
          ...(prosodyContext ? { prosodyContext } : {}),
        },
        { reuse: true },
      );
    }
  }, [reviewIdentity, usable, automatic, critique.run, restoredAnalysis]);
  function revise(next: InputDraft, reason: string) {
    onRevise(next, reason);
    setFeedback(null);
  }
  function adopt(edit: Revision, reason: string) {
    if (!report || !canUseSuggestions || !pendingEdits) return;
    try {
      const { text, edits } = planRevision(
        report.poem,
        draft.text,
        pendingEdits,
        edit,
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
  const answerFocus = useStudyAnswerFocus<HTMLHeadingElement>(critique.result);
  const recommendationScope = JSON.stringify([
    report?.inputHash,
    report?.versions.data,
    draft.rhymeBook,
    originalSeed?.tokenId,
    readingId,
  ]);
  const saved =
    savedRecommendations?.scope === recommendationScope
      ? savedRecommendations
      : null;
  useEffect(() => {
    if (rhyme.result?.task === "rhyme" && rhyme.resultInput)
      setSavedRecommendations({
        scope: recommendationScope,
        text: rhyme.resultInput.text,
        input: rhyme.resultInput,
        matches: rhyme.result.result.matches,
        candidates: recommendationCandidates,
      });
  }, [rhyme.result, recommendationScope]);
  const recommendations =
    rhyme.result?.task === "rhyme"
      ? rhyme.result.result.matches
      : (saved?.matches ?? []);
  const displayedCandidates =
    rhyme.result?.task === "rhyme"
      ? recommendationCandidates
      : (saved?.candidates ?? []);
  const displayedInput = rhyme.result ? rhyme.resultInput : saved?.input;
  const displayedIntention = displayedInput?.intention;
  const peers = rhymeWords?.lookup.entries.flatMap((e) => e.candidates) ?? [];
  const visibleRhymeEntries = useMemo(
    () => filterRhymeEntries(rhymeWords?.lookup.entries ?? [], rhymeFilter),
    [rhymeWords, rhymeFilter],
  );
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
              onClick={() => {
                answerFocus.begin();
                void critique.run(
                  currentCritique &&
                    critique.resultInput?.task === "critique" &&
                    critique.resultInput.question
                    ? critique.resultInput
                    : critiqueInput,
                );
              }}
            >
              <Sparkles size={17} />
              {currentCritique
                ? critique.resultInput?.task === "critique" &&
                  critique.resultInput.question
                  ? "重新回答"
                  : "重新评议"
                : "研读全诗"}
            </button>
          </div>
          <StudyQuestion
            key={report?.inputHash ?? "empty"}
            disabled={!usable || critique.busy}
            mode={mode}
            onAsk={(question) => {
              answerFocus.begin();
              void critique.run({ ...critiqueInput, question });
            }}
          />
          <StudioTaskState {...critique} />
          <StudyHistory
            entries={critique.history}
            current={critique.result ? critique.resultInput : null}
            busy={critique.busy}
            onRestore={critique.restore}
          />
          {restoredAnalysis &&
            !critique.result &&
            !critique.busy &&
            !critique.error && (
              <p className="pc-studio-meta">
                上次声律分析已恢复；点“研读全诗”可获取文学评议。
              </p>
            )}
          {critique.reused && (
            <p className="pc-studio-meta" role="status">
              已取回本次会话的研读结果，没有新发请求。
            </p>
          )}
          {!usable && (
            <p className="pc-studio-empty">
              {stale
                ? "修改已保存，当前保留上次分析。"
                : "整诗分析完成后，在此研读与推敲。"}
            </p>
          )}
          {currentCritique && (
            <div className="pc-poetry-review">
              <StudyResultActions
                input={critique.resultInput}
                result={critique.result}
              />
              {critique.resultInput?.task === "critique" &&
                critique.resultInput.question && (
                  <p className="pc-study-question-asked">
                    这份回答的问题：{critique.resultInput.question}
                  </p>
                )}
              <h3 ref={answerFocus.target} tabIndex={-1}>
                {critique.resultInput?.task === "critique" &&
                critique.resultInput.question
                  ? "回应你的问题"
                  : "通篇观照"}
              </h3>
              <StudyProse text={currentCritique.overview} />
              <StudyFollowUpContext input={critique.resultInput} />
              <StudyFollowUp
                input={critique.resultInput}
                response={critique.result}
                disabled={!usable || critique.busy}
                onAsk={(input) => {
                  answerFocus.begin();
                  void critique.run(input);
                }}
              />
              {currentCritique.revisionNotice && (
                <p className="pc-studio-notice" role="status">
                  {currentCritique.revisionNotice}
                </p>
              )}
              <RuleReviewNote review={currentCritique.ruleReview} />
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
                  <RevisionSubstitution
                    original={edit.original}
                    replacement={edit.replacement}
                  />
                  <p>{edit.reason}</p>
                  <p className="pc-studio-meta">取舍：{edit.tradeoff}</p>
                  {canApply && pendingEdits && report && (
                    <RevisionPreview
                      poem={report.poem}
                      currentText={draft.text}
                      accepted={pendingEdits}
                      edit={edit}
                    />
                  )}
                  <button
                    className="pc-studio-action"
                    disabled={
                      !canApply ||
                      critique.busy ||
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
                        `AI炼字：${edit.original}→${edit.replacement}；${edit.reason}；取舍：${edit.tradeoff}`,
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
              {stale && (
                <p className="pc-studio-meta">同韵候选沿用上次分析。</p>
              )}
              <div className="pc-studio-actions">
                <label>
                  句末字
                  <select
                    aria-label="选择句末字"
                    value={originalSeed!.tokenId}
                    onChange={(e) => {
                      setSeedTokenId(e.target.value);
                      setReadingId("");
                      setRhymeFilter("");
                    }}
                  >
                    {ends.map((t) => (
                      <option key={t.tokenId} value={t.tokenId}>
                        第{t.line}句 ·{" "}
                        {
                          currentLineEnd(
                            t,
                            pendingEdits ?? [],
                            report.poem.tokens,
                          ).text
                        }
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  韵脚读音
                  <select
                    aria-label="选择韵脚读音"
                    value={seedReading?.id ?? ""}
                    disabled={seedBusy || !seedCandidates.length}
                    onChange={(e) => {
                      setReadingId(e.target.value);
                      setRhymeFilter("");
                    }}
                  >
                    {seedCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.modernReading
                          ? `${formatModernReading(c.modernReading)} · `
                          : ""}
                        {c.groupIds
                          .map(
                            (id) =>
                              (seedChanged
                                ? changedSeed?.groups
                                : report.provenance.groups
                              )?.find((g) => g.id === id)?.name ??
                              "韵部名称未载",
                          )
                          .join("、")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {seedBusy && <p role="status">查阅当前韵脚…</p>}
              {!seedBusy && !seedCandidates.length && (
                <div className="pc-studio-error" role="status">
                  <p>
                    {changedSeed?.identity === changedSeedIdentity &&
                    changedSeed.error
                      ? changedSeed.error
                      : "此字在所选韵书中未收录。"}
                  </p>
                  {changedSeed?.identity === changedSeedIdentity &&
                    changedSeed.error && (
                      <button
                        type="button"
                        className="pc-studio-action"
                        onClick={() =>
                          setChangedSeedRetry((count) => count + 1)
                        }
                      >
                        重新查阅韵脚
                      </button>
                    )}
                </div>
              )}
              <div
                className="pc-rhyme-loading"
                role="status"
                aria-live="polite"
              >
                {rhymeBusy
                  ? rhymeLoaded.total
                    ? `正在载入全部同韵字：${rhymeLoaded.loaded} / ${rhymeLoaded.total}`
                    : "正在查阅全部同韵字…"
                  : ""}
              </div>
              {rhymeError && (
                <p role="alert" className="pc-studio-error">
                  {rhymeError}
                  <button
                    type="button"
                    className="pc-studio-action"
                    onClick={() => setRhymeRetry((n) => n + 1)}
                  >
                    重新载入同韵字
                  </button>
                </p>
              )}
              <label className="pc-rhyme-intention">
                推敲意图（选填）
                <input
                  aria-label="荐字意图"
                  value={rhymeIntention}
                  maxLength={240}
                  placeholder="例如：保留江水的画面，让语气更清冷"
                  onChange={(event) => setRhymeIntention(event.target.value)}
                />
                <span className="pc-studio-meta">
                  点击荐字后生效；仍从全部同韵候选中筛选。
                </span>
              </label>
              <div className="pc-studio-actions">
                <span className="pc-studio-meta">
                  {rhymeWords
                    ? `同韵部共${rhymeWords.total}字 · 已全部展开`
                    : "候选就绪后即可荐字"}
                </span>
                <button
                  className="pc-studio-action"
                  disabled={
                    !canUseSuggestions ||
                    rhyme.busy ||
                    rhymeBusy ||
                    !peers.length
                  }
                  onClick={() => {
                    setRecommendationCandidates(peers);
                    void rhyme.run({
                      task: "rhyme",
                      text: draft.text,
                      rhymeBook: draft.rhymeBook,
                      targetTokenId: seed.tokenId,
                      readingId: seedReading!.id,
                      candidateIds: peers.map((c) => c.id),
                      ...(rhymeIntention.trim()
                        ? { intention: rhymeIntention.trim() }
                        : {}),
                    });
                  }}
                >
                  <Sparkles size={17} />
                  结合全诗荐字
                </button>
              </div>
              <StudioTaskState
                {...rhyme}
                retryLabel={rhyme.progress.completed ? "继续荐字" : "重试荐字"}
                cancelledMessage="已停止荐字，诗文和已完成批次仍保留；继续时只处理剩余候选。"
              />
              {rhyme.progress.total > 0 && (
                <p className="pc-studio-meta" role="status">
                  已研读 {rhyme.progress.completed} / {rhyme.progress.total}{" "}
                  个读音候选
                  {rhyme.busy ? "，正在逐批结合全诗筛选…" : ""}
                </p>
              )}
              {saved && saved.text !== draft.text && !rhyme.result && (
                <p className="pc-studio-meta">上次荐字 · 可按当前稿重新推荐</p>
              )}
              {(rhyme.result || saved) && (
                <p className="pc-studio-meta">
                  这份荐字的意图：
                  {displayedIntention || "结合全诗，未指定额外侧重"}
                </p>
              )}
              {displayedInput && (
                <RhymeNoteActions
                  input={displayedInput}
                  matches={recommendations}
                  candidates={displayedCandidates}
                />
              )}
              {(rhyme.result || saved) && !recommendations.length && (
                <p className="pc-studio-meta" role="status">
                  本次未找到值得替换的字，保留原字也可以。
                </p>
              )}
              {recommendations.map((match) => {
                const c = displayedCandidates.find((p) => p.id === match.id);
                return (
                  c && (
                    <article className="pc-poetry-edit" key={c.id}>
                      <h3>
                        {c.character}
                        {c.modernReading && (
                          <small> {formatModernReading(c.modernReading)}</small>
                        )}
                      </h3>
                      <p>{match.reason}</p>
                      {canApply && pendingEdits && (
                        <RevisionPreview
                          poem={report.poem}
                          currentText={draft.text}
                          accepted={pendingEdits}
                          edit={{
                            startTokenId: originalSeed!.tokenId,
                            endTokenId: originalSeed!.tokenId,
                            original: originalSeed!.text,
                            replacement: c.character,
                            reason: match.reason,
                            tradeoff: "同韵不等于同义或整诗合律。",
                          }}
                        />
                      )}
                      <button
                        className="pc-studio-action"
                        disabled={!canApply}
                        onClick={() =>
                          adopt(
                            {
                              startTokenId: originalSeed!.tokenId,
                              endTokenId: originalSeed!.tokenId,
                              original: originalSeed!.text,
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
              {rhymeWords && (
                <>
                  <p className="pc-studio-meta pc-rhyme-grid-hint">
                    全部同韵字在下方连续展示。点字可查看读音与出处，AI荐字始终遍历全部候选。
                  </p>
                  <div className="pc-rhyme-filter">
                    <label>
                      找字或读音
                      <input
                        aria-label="筛选同韵字"
                        value={rhymeFilter}
                        onChange={(e) => setRhymeFilter(e.target.value)}
                        placeholder="汉字、拼音或声调，如 lv4 / 平声"
                      />
                    </label>
                    {rhymeFilter && (
                      <button
                        type="button"
                        className="pc-studio-action"
                        onClick={() => setRhymeFilter("")}
                      >
                        清空筛选
                      </button>
                    )}
                    <span className="pc-studio-meta" role="status">
                      显示{visibleRhymeEntries.length} / {rhymeWords.total}字
                    </span>
                  </div>
                  {!visibleRhymeEntries.length && (
                    <p className="pc-studio-meta">
                      没有匹配的同韵字，试试其他字或读音。
                    </p>
                  )}
                  <div
                    className="pc-rhyme-characters"
                    aria-label="全部同韵字"
                    aria-busy={rhymeBusy}
                  >
                    {visibleRhymeEntries.map((e) => (
                      <button
                        key={e.character}
                        type="button"
                        disabled={rhymeBusy}
                        title={e.candidates
                          .map((c) =>
                            c.modernReading
                              ? formatModernReading(c.modernReading)
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
                  <p className="pc-studio-meta">
                    AI分批筛选全部读音候选，建议按批次汇总。同韵不等于同义或整诗合律。
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
          <DraftComparison draft={draft} entries={entries} />
          <NotebookArchive entries={entries} busy={busy} onRestore={revise} />
        </div>
      )}
    </section>
  );
}
