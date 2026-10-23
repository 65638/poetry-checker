// apps/web/src/presentation/components/EvidencePanel.tsx
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { AnalysisResponse, AnnotatedToken, Evidence, ReadingCandidate } from '@poetry/contracts';
import type { CheckerViewProps } from '../../view-contract';
import '../styles/evidence.css';
import { formatModernReading, readingExplanation } from '../../app/readingLabels';

type EvidencePanelProps = {
  report: AnalysisResponse;
  token: AnnotatedToken;
  lockedReason: string | null;
  onChooseReading: CheckerViewProps['onChooseReading'];
  onClose: () => void;
  leaving?: boolean;
  onExited?: () => void;
  readingAssistant?: ReactNode;
};

const TONE_CLASS: Record<ReadingCandidate['toneClass'], string> = {
  ping: '平声', shang: '上声', qu: '去声', ru: '入声',
  yinping: '阴平', yangping: '阳平', neutral: '轻声', ze_unspecified: '仄声（未细分）',
};
const METHOD: Record<AnnotatedToken['selectionMethod'], string> = {
  unique: '唯一候选', context_rule: '语境规则选定', model: 'AI 自动辨音', user: '用户手动选择', unresolved: '尚未确定',
};
const READING: Record<AnnotatedToken['readingStatus'], string> = {
  resolved: '已确定', ambiguous: '多音待定', unknown: '无读音数据',
};
const KIND: Record<Evidence['kind'], string> = {
  rhyme_entry: '韵书条目', dictionary: '字典', fanqie: '反切', context: '语境', work_metadata: '作品资料',
};
const FOCUSABLE = 'button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';
const toneText = (t: string) => (t === 'P' ? '平' : t === 'Z' ? '仄' : t);
const safeUrl = (url: string | null) => (url !== null && /^https?:\/\//i.test(url) ? url : null);

export function EvidencePanel(props: EvidencePanelProps) {
  const { report, token, lockedReason, onChooseReading, onClose, leaving = false, onExited } = props;
  const uid = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { evidence, sources, groups } = report.provenance;
  const effective = new Set(token.effectiveCandidateIds);
  const evidenceIds = [
    ...new Set([
      ...token.evidenceIds,
      ...token.candidates.flatMap((c) => [
        ...c.evidenceIds,
        ...(c.modernReading?.evidenceIds ?? []),
        ...(c.fanqie?.evidenceIds ?? []),
      ]),
    ]),
  ];

  useEffect(() => {
    if (!leaving) closeRef.current?.focus();
  }, [token.tokenId, leaving]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter((node) => {
        if (node.closest('[inert]') || node.getClientRects().length === 0) return false;
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          if (parent instanceof HTMLDetailsElement && !parent.open && node !== parent.querySelector('summary')) return false;
        }
        return true;
      });
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`pc-evidence${leaving ? ' pc-evidence--leaving' : ''}`}
      aria-hidden={leaving || undefined}
      inert={leaving}
      onAnimationEnd={(e) => {
        if (leaving && e.animationName.startsWith('pc-evidence-out')) onExited?.();
      }}
    >
      <div className="pc-evidence__backdrop" aria-hidden="true" onClick={onClose} />
      <section
        ref={dialogRef}
        className="pc-evidence__dialog"
        role={leaving ? undefined : 'dialog'}
        aria-modal={leaving ? undefined : true}
        aria-labelledby={`${uid}-title`}
        onKeyDown={onKeyDown}
      >
        <header className="pc-evidence__header">
          <div>
            <h2 id={`${uid}-title`} className="pc-evidence__title">「{token.text}」读音与依据</h2>
            <p className="pc-evidence__sub">第{token.line}句第{token.column}字</p>
          </div>
          <button ref={closeRef} type="button" className="pc-button" onClick={onClose}>
            <span aria-hidden="true">✕</span> 关闭
          </button>
        </header>

        <div className="pc-evidence__body">
          <dl className="pc-evidence__facts">
            <div><dt>读音状态</dt><dd>{READING[token.readingStatus]}</dd></div>
            <div>
              <dt>可能声调</dt>
              <dd>{token.possibleTones.length > 0 ? token.possibleTones.map(toneText).join(' / ') : '未定'}</dd>
            </div>
            <div><dt>选择方式</dt><dd>{METHOD[token.selectionMethod]}</dd></div>
            <div className="pc-evidence__wide"><dt>说明</dt><dd>{readingExplanation(token)}</dd></div>
          </dl>
          {token.selectionMethod === 'user' && (
            <p className="pc-evidence__note">当前读音来自你的手动选择，不是文献依据。</p>
          )}

          {props.readingAssistant}
          <h3 className="pc-evidence__section">候选读音（{token.candidates.length}）</h3>
          {lockedReason !== null && (
            <p id={`${uid}-lock`} className="pc-evidence__lock">
              <span aria-hidden="true">⟳</span> {lockedReason}
            </p>
          )}
          {token.candidates.length === 0 ? (
            <p className="pc-evidence__muted">所选韵书未收录此字；上方可查广韵和现代读音参考。</p>
          ) : (
            <ul className="pc-candidates">
              {token.candidates.map((c) => {
                const isSelected = token.selectedReadingId === c.id;
                return (
                  <li key={c.id} className={`pc-candidate${isSelected ? ' pc-candidate--selected' : ''}`}>
                    <div className="pc-candidate__head">
                      <strong className={c.tone === null ? 'pc-candidate__tone--unknown' : undefined}>
                        {c.tone === null ? '声调未定' : toneText(c.tone)} · {TONE_CLASS[c.toneClass]}
                      </strong>
                      {isSelected && <span className="pc-chip">✓ 当前采用</span>}
                      {!effective.has(c.id) && <span className="pc-chip pc-chip--quiet">未生效</span>}
                    </div>
                    <p className="pc-candidate__line">
                      韵部：
                      {c.groupIds.length > 0
                        ? c.groupIds.map((id) => groups.find((g) => g.id === id)?.name ?? `${id}（记录缺失）`).join('、')
                        : '未提供'}
                    </p>
                    {c.gloss && <p className="pc-candidate__line">释义：{c.gloss}</p>}
                    {c.modernReading && <p className="pc-candidate__line">今音参考：{formatModernReading(c.modernReading)}</p>}
                    {c.fanqie && <p className="pc-candidate__line">反切：{c.fanqie.text}</p>}
                    {!isSelected && (
                      <button
                        type="button"
                        className="pc-button"
                        disabled={lockedReason !== null}
                        aria-describedby={lockedReason !== null ? `${uid}-lock` : undefined}
                        onClick={() => onChooseReading({ tokenId: token.tokenId, readingId: c.id })}
                      >
                        改用此读音
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="pc-evidence__section">来源</h3>
          {evidenceIds.length === 0 ? (
            <p className="pc-evidence__muted">此字没有可显示的依据记录。</p>
          ) : (
            <ul className="pc-evlist">
              {evidenceIds.map((id) => {
                const ev = evidence.find((e) => e.id === id);
                if (!ev) {
                  return <li key={id} className="pc-ev pc-ev--missing">此项依据未随报告返回。<details className="pc-ev__details"><summary>记录详情</summary><p className="pc-ev__meta">{id}</p></details></li>;
                }
                const src = sources.find((s) => s.id === ev.sourceId);
                const url = safeUrl(src?.url ?? null);
                const groupNames = groups.filter((g) => g.evidenceIds.includes(ev.id)).map((g) => g.name);
                return (
                  <li key={id} className={`pc-ev pc-ev--${ev.reviewStatus}`}>
                    <div className="pc-ev__head">
                      <strong>{groupNames.length ? groupNames.join('、') : KIND[ev.kind]}</strong>
                      {url && <a className="pc-ev__link" href={url} target="_blank" rel="noopener noreferrer" aria-label="原始来源（新窗口）">原始来源</a>}
                      {!src && <span className="pc-ev__meta">来源记录缺失</span>}
                    </div>
                    <details className="pc-ev__details">
                      <summary>来源详情</summary>
                      <div className="pc-ev__detail-body">
                        <p className="pc-ev__meta">{ev.reviewStatus === 'approved' ? '已人工核验' : '尚未经人工核验'}</p>
                        <p className="pc-ev__text">{ev.assertion}</p>
                        {ev.excerpt && <blockquote className="pc-ev__excerpt">{ev.excerpt}</blockquote>}
                        <p className="pc-ev__meta">来源：{src ? `${src.title}${src.edition ? `（${src.edition}）` : ''}` : '来源记录不可用'}</p>
                        <p className="pc-ev__meta">位置：{ev.locator}</p>
                        {src && <p className="pc-ev__meta">许可：{src.license}</p>}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
