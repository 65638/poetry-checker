// apps/web/src/presentation/CheckerView.tsx
import { useEffect, useRef } from 'react';
import type { CheckerViewProps } from '../view-contract';
import { InputPanel } from './components/InputPanel';
import { ReportView } from './components/ReportView';
import { EvidencePanel } from './components/EvidencePanel';
import './styles/tokens.css';
import './styles/layout.css';

const STEPS = [
  { title: '录入诗文', text: '每行一句，标点可留可去，原文与位置都会保留。' },
  { title: '选择韵书', text: '平水韵、词林正韵或中华新韵，口径不同，结论也可能不同。' },
  { title: '逐字查看', text: '平仄与韵脚标在字旁；点任意一字，可看读音候选与依据。' },
];

export function CheckerView(props: CheckerViewProps) {
  const { draft, report, busy, stale, error, feedback, selectedTokenId, selectedFindingId } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const prevTokenIdRef = useRef<string | null>(selectedTokenId);

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
    <div ref={rootRef} className="pc-root">
      <div className="pc-page" inert={panelOpen}>
        <header className="pc-masthead">
          <span className="pc-seal" aria-hidden="true">律</span>
          <div className="pc-masthead__text">
            <h1 className="pc-title">诗格律检查器</h1>
            <p className="pc-masthead__sub">近体诗平仄 · 用韵 · 读音依据</p>
          </div>
        </header>

        <main className={`pc-desk${hasReport ? ' pc-desk--reading' : ' pc-desk--writing'}`}>
          <section className="pc-desk__sheet" aria-labelledby="pc-input-heading">
            <h2 id="pc-input-heading" className="pc-visually-hidden">输入</h2>
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
            className="pc-desk__page"
            aria-labelledby="pc-report-heading"
            aria-busy={busy}
          >
            <h2 id="pc-report-heading" className="pc-visually-hidden">分析报告</h2>

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
                <div className="pc-intro__motif" aria-hidden="true" />
                {busy ? (
                  <p className="pc-intro__busy">
                    <span className="pc-busy-dot" aria-hidden="true" />
                    正在分析，结果出来后会显示在这里。
                  </p>
                ) : (
                  <ol className="pc-steps">
                    {STEPS.map((s, i) => (
                      <li key={s.title} className="pc-step">
                        <span className="pc-step__no" aria-hidden="true">{['一', '二', '三'][i]}</span>
                        <div>
                          <h3 className="pc-step__title">{s.title}</h3>
                          <p className="pc-step__text">{s.text}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </aside>
            )}
          </section>
        </main>
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
