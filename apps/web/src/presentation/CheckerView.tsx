// apps/web/src/presentation/CheckerView.tsx
import { useEffect, useRef, useState } from "react";
import type { CheckerViewProps } from "../view-contract";
import { InputPanel } from "./components/InputPanel";
import { ReportView } from "./components/ReportView";
import { EvidencePanel } from "./components/EvidencePanel";
import { MoonlitScene } from "./components/MoonlitScene";
import { ReadingRail } from "./components/ReadingRail";
import { useMotionPreference } from "./useMotionPreference";
import "./styles/tokens.css";
import "./styles/scene.css";
import "./styles/layout.css";
import "./styles/rail.css";
import "./styles/cursor.css";

const STEPS = [
  { no: "壹", title: "录入诗文", text: "写下诗句，或从一首熟悉的诗开始。" },
  { no: "贰", title: "依书校韵", text: "选择韵书，核对平仄与用韵。" },
  { no: "叁", title: "循字寻源", text: "点开字格，让每个读音有据可查。" },
];

export function CheckerView(props: CheckerViewProps) {
  const {
    draft,
    report,
    busy,
    stale,
    error,
    feedback,
    selectedTokenId,
    selectedFindingId,
  } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const prevTokenIdRef = useRef<string | null>(selectedTokenId);
  const manuscriptRef = useRef<HTMLElement>(null);
  const revealIntentRef = useRef<{
    from: CheckerViewProps["report"];
    sawBusy: boolean;
  } | null>(null);
  const motion = useMotionPreference();
  const effectsRef = useRef(motion.effects);
  effectsRef.current = motion.effects;
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [exampleGlow, setExampleGlow] = useState(0);

  const selectedToken =
    report !== null && selectedTokenId !== null
      ? (report.poem.tokens.find((t) => t.tokenId === selectedTokenId) ?? null)
      : null;
  const panelOpen = selectedToken !== null;
  const [lastPanel, setLastPanel] = useState<{
    report: NonNullable<CheckerViewProps["report"]>;
    token: NonNullable<typeof selectedToken>;
  } | null>(null);
  const [panelExiting, setPanelExiting] = useState(false);
  if (report !== null && selectedToken !== null) {
    if (lastPanel?.report !== report || lastPanel.token !== selectedToken)
      setLastPanel({ report, token: selectedToken });
    if (panelExiting) setPanelExiting(false);
  } else if (lastPanel !== null && !panelExiting) {
    if (motion.effects) setPanelExiting(true);
    else setLastPanel(null);
  }
  const finishPanelExit = () => {
    setPanelExiting(false);
    setLastPanel(null);
  };
  const hasReport = report !== null;
  const collapsed = hasReport && editorCollapsed;

  const lockedReason = stale
    ? "报告与当前输入不一致，请重新分析后再选音。"
    : busy
      ? "正在分析，完成后可选音。"
      : null;

  const handleSelectToken = (tokenId: string) => {
    if (
      returnFocusRef.current === null &&
      document.activeElement instanceof HTMLElement
    ) {
      returnFocusRef.current = document.activeElement;
    }
    props.onSelectToken(tokenId);
  };

  const handleAnalyze = () => {
    revealIntentRef.current = { from: report, sawBusy: false };
    props.onAnalyze();
  };

  const handleDraftChange: CheckerViewProps["onDraftChange"] = (next) => {
    revealIntentRef.current = null;
    props.onDraftChange(next);
  };

  const handleLoadExample = (exampleId: string) => {
    setExampleGlow((n) => n + 1);
    props.onLoadExample(exampleId);
  };

  const toggleEditor = () => setEditorCollapsed((c) => !c);

  // Intent is dropped as soon as the user scrolls on their own while the request is pending.
  useEffect(() => {
    const drop = () => {
      revealIntentRef.current = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        [
          "PageDown",
          "PageUp",
          "Home",
          "End",
          "ArrowDown",
          "ArrowUp",
          " ",
        ].includes(e.key) &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("textarea, input, button, [role=dialog]")
        )
      )
        drop();
    };
    window.addEventListener("wheel", drop, { passive: true });
    window.addEventListener("touchmove", drop, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", drop);
      window.removeEventListener("touchmove", drop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Single column only: reveal the result of an Analyze the user just submitted.
  useEffect(() => {
    const intent = revealIntentRef.current;
    if (intent === null) return;
    if (busy) {
      intent.sawBusy = true;
      return;
    }
    if (!intent.sawBusy && report === intent.from && error === null) return;
    revealIntentRef.current = null;
    const sheet = manuscriptRef.current;
    if (
      report === null ||
      report === intent.from ||
      error !== null ||
      stale ||
      !sheet
    )
      return;
    if (
      typeof sheet.scrollIntoView !== "function" ||
      typeof window.matchMedia !== "function"
    )
      return;
    if (!window.matchMedia("(max-width: 899px)").matches) return;
    const reduce =
      !effectsRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sheet.scrollIntoView({
      block: "start",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [busy, report, error, stale]);

  useEffect(() => {
    const prev = prevTokenIdRef.current;
    prevTokenIdRef.current = selectedTokenId;
    if (prev === null || selectedTokenId !== null) return;

    const stored = returnFocusRef.current;
    returnFocusRef.current = null;
    const fallback = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>("[data-token-id]") ?? [],
    ).find((el) => el.dataset.tokenId === prev);
    const target = stored?.isConnected ? stored : fallback;
    target?.focus();
  }, [selectedTokenId]);

  // Guard for hidden tabs, where animationend may never arrive.
  useEffect(() => {
    if (!panelExiting) return;
    const id = window.setTimeout(finishPanelExit, 600);
    return () => window.clearTimeout(id);
  }, [panelExiting]);

  const quiet = panelOpen || editing || busy || hasReport;

  return (
    <div
      ref={rootRef}
      className={`pc-root${hasReport ? " pc-root--reading" : " pc-root--writing"}${busy ? " pc-root--busy" : ""}`}
      data-motion={motion.effects ? "on" : "off"}
      data-ambient={quiet ? "quiet" : "live"}
    >
      <MoonlitScene active={motion.effects} quiet={quiet} />

      <div className="pc-page" inert={panelOpen}>
        <header className="pc-masthead">
          <span className="pc-seal" aria-hidden="true">
            律
          </span>
          <div className="pc-masthead__titles">
            <h1 className="pc-title">诗格律检查器</h1>
            <p className="pc-masthead__sub">依韵书校平仄 · 循字音见出处</p>
          </div>
          <div className="pc-masthead__tools">
            <button
              type="button"
              className="pc-motion-toggle"
              aria-pressed={motion.effects}
              disabled={motion.systemReduced}
              onClick={motion.toggle}
            >
              <span className="pc-motion-toggle__dot" aria-hidden="true" />
              动态效果：{motion.effects ? "开" : "关"}
            </button>
            {motion.systemReduced && (
              <span className="pc-motion-toggle__note">系统已设置减少动态</span>
            )}
          </div>
        </header>

        <main
          className={`pc-hall${hasReport ? " pc-hall--reading" : " pc-hall--writing"}`}
        >
          <div className="pc-desk">
            <div className="pc-desk__inner">
              <section
                className={`pc-plinth pc-surface${collapsed ? " pc-plinth--collapsed" : ""}`}
                aria-labelledby="pc-input-heading"
                onFocus={() => setEditing(true)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                    setEditing(false);
                }}
              >
                <div className="pc-plinth__head">
                  <h2 id="pc-input-heading" className="pc-plinth__heading">
                    <span className="pc-plinth__no" aria-hidden="true">
                      壹
                    </span>
                    录诗
                  </h2>
                  {hasReport ? (
                    <button
                      type="button"
                      className="pc-button pc-button--quiet pc-plinth__toggle"
                      aria-expanded={!collapsed}
                      aria-controls="pc-editor-body"
                      onClick={toggleEditor}
                    >
                      {collapsed ? "展开编辑" : "收起编辑"}
                    </button>
                  ) : null}
                </div>
                <div
                  id="pc-editor-body"
                  className="pc-editor-body"
                  data-collapsed={collapsed ? "true" : "false"}
                  inert={collapsed}
                >
                  <div className="pc-editor-body__inner">
                    <span
                      key={exampleGlow}
                      className="pc-plinth__glow"
                      data-on={exampleGlow > 0 ? "true" : "false"}
                      aria-hidden="true"
                    />
                    <InputPanel
                      compact={hasReport}
                      draft={draft}
                      busy={busy}
                      examples={props.examples}
                      onDraftChange={handleDraftChange}
                      onAnalyze={handleAnalyze}
                      onLoadExample={handleLoadExample}
                    />
                  </div>
                </div>
              </section>
              {hasReport ? (
                <div className="pc-hall__rail">
                  <ReadingRail
                    report={report}
                    stale={stale}
                    effects={motion.effects}
                    editorCollapsed={collapsed}
                    onToggleEditor={toggleEditor}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <section
            ref={manuscriptRef}
            className="pc-manuscript pc-surface"
            aria-labelledby="pc-report-heading"
            aria-busy={busy}
          >
            <h2 id="pc-report-heading" className="pc-visually-hidden">
              分析报告
            </h2>

            {busy && (
              <div className="pc-busy" aria-hidden="true">
                <span className="pc-busy__bar" />
              </div>
            )}

            {error !== null && (
              <div className="pc-banner pc-banner--error" role="alert">
                <span className="pc-banner__icon" aria-hidden="true">
                  !
                </span>
                <div className="pc-banner__body">
                  <strong className="pc-banner__title">分析未完成</strong>
                  <p className="pc-banner__text">{error.message}</p>
                  <p className="pc-banner__meta">错误代码：{error.code}</p>
                </div>
              </div>
            )}

            <div className="pc-feedback" role="status" aria-live="polite">
              {feedback}
            </div>

            {report !== null ? (
              <ReportView
                report={report}
                stale={stale}
                busy={busy}
                selectedTokenId={selectedTokenId}
                selectedFindingId={selectedFindingId}
                onSelectToken={handleSelectToken}
                onSelectFinding={props.onSelectFinding}
                onCopySummary={props.onCopySummary}
                onDownloadReport={props.onDownloadReport}
              />
            ) : (
              <aside className="pc-intro" aria-label="使用说明">
                {busy ? (
                  <p className="pc-intro__busy">
                    <span className="pc-intro__busy-seal" aria-hidden="true">
                      律
                    </span>
                    正在逐字核对，结果出来后会展陈在这里。
                  </p>
                ) : (
                  <>
                    <p className="pc-intro__eyebrow">
                      <span /> 山 亭 听 雨
                    </p>
                    <p className="pc-intro__lead">
                      <span className="pc-intro__quote">檐下听微雨，</span>
                      <span className="pc-intro__quote">诗中见平仄。</span>
                    </p>
                    <p className="pc-intro__caption">
                      一字一音，一句一韵。
                      <br />
                      在古人的声律里，读懂一首诗。
                    </p>
                    <div className="pc-intro__inscription" aria-hidden="true">
                      微雨 · 远山 <span>听韵</span>
                    </div>
                    <ol className="pc-steps">
                      {STEPS.map((s) => (
                        <li key={s.title} className="pc-step">
                          <span className="pc-step__no" aria-hidden="true">
                            {s.no}
                          </span>
                          <div>
                            <h3 className="pc-step__title">{s.title}</h3>
                            <p className="pc-step__text">{s.text}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </aside>
            )}
          </section>
        </main>

        <footer className="pc-colophon">
          <span className="pc-colophon__seal" aria-hidden="true">
            律
          </span>
          结论只依据所选韵书与已实现规则，不评价文学水平。
        </footer>
      </div>

      {(report !== null && selectedToken !== null) ||
      (panelExiting && lastPanel !== null) ? (
        <EvidencePanel
          report={
            report !== null && selectedToken !== null
              ? report
              : lastPanel!.report
          }
          token={selectedToken ?? lastPanel!.token}
          lockedReason={lockedReason}
          onChooseReading={props.onChooseReading}
          onClose={props.onCloseEvidence}
          leaving={selectedToken === null}
          onExited={finishPanelExit}
        />
      ) : null}
    </div>
  );
}
