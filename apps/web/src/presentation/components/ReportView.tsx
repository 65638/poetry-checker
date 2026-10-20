// apps/web/src/presentation/components/ReportView.tsx
import { useEffect, useRef } from 'react';
import type {
  AnalysisResponse, AnnotatedToken, BookId, CheckStatus, Finding, SummaryStatus,
} from '@poetry/contracts';
import type { CheckerViewProps } from '../../view-contract';
import { trailingPunctuation } from '../punctuation';
import '../styles/report.css';

type ReportViewProps = Pick<
  CheckerViewProps,
  | 'stale' | 'busy' | 'selectedTokenId' | 'selectedFindingId'
  | 'onSelectToken' | 'onSelectFinding' | 'onCopySummary' | 'onDownloadReport'
> & { report: AnalysisResponse };

const SUMMARY: Record<SummaryStatus, { label: string; icon: string; desc: string; next?: string }> = {
  pass: { label: '通过', icon: '✓', desc: '按所选韵书与规则集，已实现的必检项均通过；不代表文学水平评价。' },
  fail: { label: '不合律', icon: '✕', desc: '存在明确违规，具体位置、应为与实际见下方批注。' },
  needs_review: {
    label: '待复核', icon: '?', desc: '部分读音、体裁或依据尚未确定，暂不能给出结论。',
    next: '下一步：点击带「?」标记的字，查看候选读音与依据。',
  },
  not_applicable: { label: '不适用', icon: '–', desc: '近体格律检查不适用于此诗；逐字平仄与韵脚仍可查看。' },
  unsupported: { label: '暂不支持', icon: '∅', desc: '此体式或必要规则尚未实现，无法给出通过结论。' },
};
const CHECK: Record<CheckStatus, { label: string; icon: string }> = {
  pass: { label: '通过', icon: '✓' }, fail: { label: '违规', icon: '✕' },
  uncertain: { label: '待复核', icon: '?' }, not_applicable: { label: '不适用', icon: '–' },
  unsupported: { label: '未支持', icon: '∅' },
};
const TALLY_ORDER: CheckStatus[] = ['fail', 'uncertain', 'unsupported', 'pass', 'not_applicable'];
const SETTLED = new Set<CheckStatus>(['pass', 'not_applicable']);
const SEVERITY: Record<Finding['severity'], string> = { error: '错误', warning: '警示', info: '提示' };
const BOOK: Record<BookId, string> = { pingshui: '平水韵', cilin: '词林正韵', xinyun: '中华新韵' };
const toneText = (t: string) => (t === 'P' ? '平' : t === 'Z' ? '仄' : t);

function toneOf(t: AnnotatedToken) {
  if (t.toneStatus === 'resolved' && t.tone !== null) {
    return t.tone === 'P' ? { label: '平', mod: 'ping' } : { label: '仄', mod: 'ze' };
  }
  return { label: '未定', mod: 'unknown' };
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ReportView(props: ReportViewProps) {
  const { report, stale, selectedTokenId, selectedFindingId } = props;
  const rootRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLOListElement>(null);
  const settledRef = useRef<HTMLDetailsElement>(null);
  const tokens = new Map(report.poem.tokens.map((t) => [t.tokenId, t]));
  const rhymeIds = new Set(report.prosody.rhyme.tokenIds);
  const checks = report.prosody.checks;
  const selectedFinding = checks.find((f) => f.id === selectedFindingId) ?? null;
  const related = new Set(
    [selectedFinding, ...checks.filter((f) => selectedFinding?.relatedFindingIds.includes(f.id))]
      .flatMap((f) => f?.locations.map((l) => l.tokenId) ?? []),
  );
  const summary = SUMMARY[report.summary.status];
  const firstRelated = selectedFinding?.locations[0]?.tokenId ?? null;
  const reportId = report.inputHash;
  const renderFinding = ({ f, n }: { f: Finding; n: number }) => {
    const st = CHECK[f.status];
    const rule = report.provenance.rules.find((r) => r.id === f.ruleId);
    const where = f.locations.map((l) => `第${l.line}句第${l.column}字`).join('、') || '整首';
    return (
      <li key={f.id} className={`pc-finding pc-finding--${f.status}${f.id === selectedFindingId ? ' pc-finding--selected' : ''}`}>
        <span className="pc-finding__no" aria-hidden="true">{n}</span>
        <div className="pc-finding__body">
          <div className="pc-finding__head">
            <span className="pc-tag"><span aria-hidden="true">{st.icon}</span> {st.label}</span>
            <span className="pc-tag pc-tag--quiet">{SEVERITY[f.severity]}</span>
            <span className="pc-finding__rule">{rule ? rule.name : f.ruleId}</span>
          </div>
          <p className="pc-finding__msg">{f.message}</p>
          <dl className="pc-finding__compare">
            <div><dt>应为</dt><dd>{f.expected.map(toneText).join(' / ') || '无记录'}</dd></div>
            <div><dt>实际</dt><dd>{f.observed.map(toneText).join(' / ') || '无记录'}</dd></div>
          </dl>
          <button
            type="button"
            className="pc-button pc-button--quiet pc-finding__locate"
            aria-pressed={f.id === selectedFindingId}
            onClick={() => props.onSelectFinding(f.id)}
          >
            ◆ 在诗中定位：{where}
          </button>
        </div>
      </li>
    );
  };
  const numbered = checks.map((f, i) => ({ f, n: i + 1 }));
  const attention = numbered.filter(({ f }) => !SETTLED.has(f.status));
  const settled = numbered.filter(({ f }) => SETTLED.has(f.status));
  const tally = Object.fromEntries(
    TALLY_ORDER.map((s) => [s, checks.filter((f) => f.status === s).length]),
  ) as Record<CheckStatus, number>;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
    const ms = parseFloat(getComputedStyle(el).getPropertyValue('--pc-dur-report'));
    if (!(ms > 0)) return;
    const style = getComputedStyle(el);
    const shift = style.getPropertyValue('--pc-shift-report').trim() || '0px';
    const stagger = parseFloat(style.getPropertyValue('--pc-stagger-line')) || 0;
    const easing = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms * 0.6, easing });
    el.querySelector('.pc-status')?.animate(
      [
        { opacity: 0, transform: 'scale(1.04)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: ms, easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)' },
    );
    const lines = Array.from(el.querySelectorAll<HTMLElement>('.pc-line'));
    // Total reveal stays near 650ms regardless of poem length.
    const step = lines.length > 1 ? Math.min(stagger, 290 / (lines.length - 1)) : 0;
    lines.forEach((line, i) => {
      line.animate(
        [
          { opacity: 0, transform: `translateY(${shift})` },
          { opacity: 1, transform: 'none' },
        ],
        { duration: ms, delay: i * step, easing, fill: 'backwards' },
      );
    });
  }, [reportId]);

  useEffect(() => {
    if (selectedFinding && SETTLED.has(selectedFinding.status) && settledRef.current) {
      settledRef.current.open = true;
    }
  }, [selectedFinding]);

  useEffect(() => {
    if (firstRelated === null) return;
    const el = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-token-id]') ?? [])
      .find((n) => n.dataset.tokenId === firstRelated);
    el?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [selectedFindingId, firstRelated]);

  return (
    <article
      ref={rootRef}
      className={`pc-report${stale ? ' pc-report--stale' : ''}${selectedFinding ? ' pc-report--focusing' : ''}`}
    >
      {stale && (
        <p className="pc-stale" role="status">
          <span aria-hidden="true">⟳</span> 此报告对应修改前的输入，结论可能已失效；请重新分析。
        </p>
      )}

      <header className={`pc-status pc-status--${report.summary.status}`}>
        <span className="pc-status__icon" aria-hidden="true">
          <span className="pc-status__glyph">{summary.icon}</span>
        </span>
        <div className="pc-status__body">
          <h3 className="pc-status__label">结论：{summary.label}</h3>
          <p className="pc-status__text">{summary.desc}</p>
          <p className="pc-status__text">{report.summary.message}</p>
          {summary.next && <p className="pc-status__next">{summary.next}</p>}
        </div>
        <div className="pc-status__actions">
          <button type="button" className="pc-button pc-button--small" onClick={props.onCopySummary}>复制摘要</button>
          <button type="button" className="pc-button pc-button--small" onClick={props.onDownloadReport}>下载报告</button>
        </div>
      </header>

      <p className="pc-policy">
        <strong>韵书：{BOOK[report.policy.rhymeBook]}</strong>
        <span>
          声调依据：{report.policy.toneBasis === 'historical' ? '传统四声（入声归仄）' : '普通话声调（可能与传统韵书结果不同）'}
        </span>
        <span>{report.policy.notice}</span>
        {report.genre.historicalTags.length > 0 && (
          <span className="pc-historical-tags">作品体裁说明：{report.genre.historicalTags.join('、')}（不改变逐项检查结论）</span>
        )}
      </p>

      <section className="pc-reading" aria-labelledby="pc-grid-heading">
        <div className="pc-reading__head">
          <h3 id="pc-grid-heading" className="pc-section-title">
            <span className="pc-section-title__no" aria-hidden="true">贰</span>
            批注诗文
          </h3>
          <p className="pc-legend">「韵」= 韵脚 · 「?」= 读音待定 · 虚线框 = 声调未定 · ◆ = 批注关联位置</p>
        </div>
        <ol ref={gridRef} className="pc-grid">
          {report.poem.lines.map((line, lineIndex) => (
            <li key={line.line} className="pc-line">
              <span className="pc-line__no">第{line.line}句</span>
              <div className="pc-line__cells">
                {line.tokenIds.map((id, i) => {
                  const t = tokens.get(id);
                  if (!t) return null;
                  const tone = toneOf(t);
                  const isRhyme = rhymeIds.has(id);
                  const pending = t.readingStatus !== 'resolved';
                  const isRelated = related.has(id);
                  const nextToken = tokens.get(line.tokenIds[i + 1] ?? '');
                  const nextLineToken = report.poem.lines[lineIndex + 1]?.tokenIds[0];
                  const lineEndUtf16 = nextLineToken
                    ? tokens.get(nextLineToken)?.startUtf16
                    : undefined;
                  const punct = trailingPunctuation(
                    report.poem.originalText,
                    t,
                    nextToken,
                    lineEndUtf16,
                  );
                  const label = `第${t.line}句第${t.column}字「${t.text}」，${tone.label}${isRhyme ? '，韵脚' : ''}${pending ? '，读音待定' : ''}${isRelated ? '，批注关联位置' : ''}`;
                  return (
                    <span key={id} className="pc-cell-wrap">
                      <button
                        type="button"
                        data-token-id={id}
                        className={`pc-cell pc-cell--${tone.mod}${isRhyme ? ' pc-cell--rhyme' : ''}${isRelated ? ' pc-cell--related' : ''}${selectedTokenId === id ? ' pc-cell--selected' : ''}`}
                        aria-label={label}
                        aria-haspopup="dialog"
                        aria-expanded={selectedTokenId === id}
                        onClick={() => props.onSelectToken(id)}
                      >
                        <span className="pc-cell__char">{t.text}</span>
                        <span className="pc-cell__tone">{tone.label}</span>
                        {isRhyme && <span className="pc-cell__badge pc-cell__badge--rhyme" aria-hidden="true">韵</span>}
                        {pending && <span className="pc-cell__badge pc-cell__badge--pending" aria-hidden="true">?</span>}
                        {isRelated && <span className="pc-cell__mark" aria-hidden="true">◆</span>}
                      </button>
                      {punct && <span className="pc-punct">{punct}</span>}
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="pc-notes" aria-labelledby="pc-findings-heading">
        <h3 id="pc-findings-heading" className="pc-section-title">
          <span className="pc-section-title__no" aria-hidden="true">叁</span>
          批注
        </h3>
        {checks.length === 0 ? (
          <p className="pc-legend">本报告未列出批注条目；结论以上方状态为准。</p>
        ) : (
          <>
            <ul className="pc-tally" aria-label="批注统计">
              {TALLY_ORDER.filter((s) => tally[s] > 0).map((s) => (
                <li key={s} className={`pc-tally__item pc-finding--${s}`}>
                  <span aria-hidden="true">{CHECK[s].icon}</span> {CHECK[s].label}
                  <strong className="pc-tally__count">{tally[s]}</strong>
                </li>
              ))}
            </ul>
            {attention.length > 0 ? (
              <ol className="pc-findings">{attention.map(renderFinding)}</ol>
            ) : (
              <p className="pc-legend">没有违规、待复核或未支持的条目。</p>
            )}
            {settled.length > 0 && (
              <details ref={settledRef} className="pc-settled">
                <summary className="pc-settled__summary">
                  已通过或不适用的检查（{settled.length} 条）
                </summary>
                <ol className="pc-findings pc-findings--settled">{settled.map(renderFinding)}</ol>
              </details>
            )}
          </>
        )}
      </section>
    </article>
  );
}
