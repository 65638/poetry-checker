// apps/web/src/presentation/CheckerView.tsx
import { useEffect, useRef } from 'react';
import type { CheckerViewProps } from '../view-contract';
import { InputPanel } from './components/InputPanel';
import { ReportView } from './components/ReportView';
import { EvidencePanel } from './components/EvidencePanel';
import { InkStage } from './components/InkStage';
import './styles/tokens.css';
import './styles/layout.css';

const STEPS = [
  { no: '壹', title: '录入诗文', text: '每行一句，标点可留可去，原文与位置都会保留。' },
  { no: '贰', title: '选择韵书', text: '平水韵、词林正韵或中华新韵，口径不同，结论也可能不同。' },
  { no: '叁', title: '逐字查看', text: '平仄与韵脚标在字旁；点任意一字，可看读音候选与依据。' },
];

export function CheckerView(props: CheckerViewProps) {
  const { draft, report, busy, stale, error, feedback, selectedTokenId, selectedFindingId } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const prevTokenIdRef = useRef<string | null>(selectedTokenId);
  const manuscriptRef = useRef<HTMLElement>(null);
  const reportKey = report?.inputHash ?? null;

  const selectedToken =
    report !== null && selectedTokenId !== null
      ? (report.poem.tokens.find((t) => t.tokenId === selectedTokenId) ?? null)
      : null;
  const panelOpen = selectedToken !== null;
  const hasReport = report !== null;

  const lockedReason = stale
    ? '报告与当前输入不一致，请重新分析后再选音。'
    : busy
      ? '正在分析，完成后可选音。'
      : null;

  const handleSelectToken = (tokenId: string) => {
    if (returnFocusRef.current === null && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
    props.onSelectToken(tokenId);
  };

  // Single-column only: bring a fresh result into view when it was requested from the input form.
  useEffect(() => {
    const sheet = manuscriptRef.current;
    if (reportKey === null || !sheet || typeof sheet.scrollIntoView !== 'function') return;
    if (!document.activeElement?.closest('.pc-plinth')) return;
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 899px)').matches) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sheet.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [reportKey]);

  useEffect(() => {
    const prev = prevTokenIdRef.current;
    prevTokenIdRef.current = selectedTokenId;
    if (prev === null || selectedTokenId !== null) return;

    const stored = returnFocusRef.current;
    returnFocusRef.current = null;
    const fallback = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[data-token-id]') ?? [],
    ).find((el) => el.dataset.tokenId === prev);
    const target = stored?.isConnected ? stored : fallback;
    target?.focus();
  }, [selectedTokenId]);

  return (
    <div
      ref={rootRef}
      className={`pc-root${hasReport ? ' pc-root--reading' : ' pc-root--writing'}${busy ? ' pc-root--busy' : ''}`}
    >
      <div className="pc-page" inert={panelOpen}>
        <header className="pc-stage">
          <InkStage />
          <div className="pc-stage__inner">
            <span className="pc-seal" aria-hidden="true">律</span>
            <div className="pc-stage__titles">
              <p className="pc-stage__kicker" aria-hidden="true">山 · 墨 · 诗</p>
              <h1 className="pc-title">诗格律检查器</h1>
              <p className="pc-stage__sub">近体诗平仄 · 用韵 · 读音依据，逐字展陈</p>
            </div>
            <p className="pc-stage__vertical" aria-hidden="true">一字一音皆有据</p>
          </div>
        </header>

        <main className={`pc-hall${hasReport ? ' pc-hall--reading' : ' pc-hall--writing'}`}>
          <section className="pc-plinth" aria-labelledby="pc-input-heading">
            <h2 id="pc-input-heading" className="pc-plinth__heading">
              <span className="pc-plinth__no" aria-hidden="true">壹</span>
              录诗
            </h2>
            <InputPanel
              draft={draft}
              busy={busy}
              examples={props.examples}
              onDraftChange={props.onDraftChange}
              onAnalyze={props.onAnalyze}
              onLoadExample={props.onLoadExample}
            />
          </section>

          <section
            ref={manuscriptRef}
            className="pc-manuscript"
            aria-labelledby="pc-report-heading"
            aria-busy={busy}
          >
            <h2 id="pc-report-heading" className="pc-visually-hidden">分析报告</h2>

            {busy && (
              <div className="pc-busy" aria-hidden="true">
                <span className="pc-busy__bar" />
              </div>
            )}

            {error !== null && (
              <div className="pc-banner pc-banner--error" role="alert">
                <span className="pc-banner__icon" aria-hidden="true">!</span>
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
                    <span className="pc-intro__busy-seal" aria-hidden="true">律</span>
                    正在逐字核对，结果出来后会展陈在这里。
                  </p>
                ) : (
                  <>
                    <p className="pc-intro__lead">
                      <span className="pc-intro__quote">一首诗，</span>
                      <span className="pc-intro__quote">一字一字地看。</span>
                    </p>
                    <ol className="pc-steps">
                      {STEPS.map((s) => (
                        <li key={s.title} className="pc-step">
                          <span className="pc-step__no" aria-hidden="true">{s.no}</span>
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
          <span className="pc-colophon__seal" aria-hidden="true">律</span>
          结论只依据所选韵书与已实现规则，不评价文学水平。
        </footer>
      </div>

      {report !== null && selectedToken !== null && (
        <EvidencePanel
          report={report}
          token={selectedToken}
          lockedReason={lockedReason}
          onChooseReading={props.onChooseReading}
          onClose={props.onCloseEvidence}
        />
      )}
    </div>
  );
}
