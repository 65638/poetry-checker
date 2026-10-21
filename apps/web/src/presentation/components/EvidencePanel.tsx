// apps/web/src/presentation/components/EvidencePanel.tsx
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { AnalysisResponse, AnnotatedToken, Evidence, ReadingCandidate } from '@poetry/contracts';
import type { CheckerViewProps } from '../../view-contract';
import '../styles/evidence.css';

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
  unique: '唯一候选', context_rule: '语境规则选定', model: 'GLM 自动辨音', user: '用户手动选择', unresolved: '尚未确定',
};
const READING: Record<AnnotatedToken['readingStatus'], string> = {
  resolved: '已确定', ambiguous: '多音待定', unknown: '无读音数据',
};
const KIND: Record<Evidence['kind'], string> = {
  rhyme_entry: '韵书条目', dictionary: '字典', fanqie: '反切', context: '语境', work_metadata: '作品资料',
};
const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
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
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
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
            <div className="pc-evidence__wide"><dt>说明</dt><dd>{token.reason}</dd></div>
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
            <p className="pc-evidence__muted">所选韵书数据中没有此字的读音记录，声调记为未定。</p>
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
                    <p className="pc-candidate__line">
                      {c.modernReading
                        ? `现代读音：${c.modernReading.pinyin} · ${c.modernReading.toneNumber}声（普通话参考，不是古音构拟）`
                        : '现代读音：未提供'}
                    </p>
                    <p className="pc-candidate__line">反切：{c.fanqie ? c.fanqie.text : '未提供'}</p>
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

          <h3 className="pc-evidence__section">依据与来源</h3>
          {evidenceIds.length === 0 ? (
            <p className="pc-evidence__muted">此字没有可显示的依据记录。</p>
          ) : (
            <ul className="pc-evlist">
              {evidenceIds.map((id) => {
                const ev = evidence.find((e) => e.id === id);
                if (!ev) {
                  return <li key={id} className="pc-ev pc-ev--missing">依据记录 {id} 未包含在本报告中。</li>;
                }
                const src = sources.find((s) => s.id === ev.sourceId);
                const url = safeUrl(src?.url ?? null);
                return (
                  <li key={id} className={`pc-ev pc-ev--${ev.reviewStatus}`}>
                    <div className="pc-ev__head">
                      <span className="pc-chip pc-chip--quiet">{KIND[ev.kind]}</span>
                      <span className="pc-ev__review">
                        {ev.reviewStatus === 'approved' ? '✓ 已审核' : '… 待核实，不作为已核实依据'}
                      </span>
                    </div>
                    <p className="pc-ev__text">{ev.assertion}</p>
                    {ev.excerpt && <blockquote className="pc-ev__excerpt">{ev.excerpt}</blockquote>}
                    <p className="pc-ev__meta">
                      来源：{src ? `${src.title}${src.edition ? `（${src.edition}）` : ''}` : '来源记录不可用'} · 位置：{ev.locator}
                    </p>
                    {src && <p className="pc-ev__meta">许可：{src.license}</p>}
                    {url && (
                      <a className="pc-ev__link" href={url} target="_blank" rel="noopener noreferrer">
                        查看来源（新窗口）
                      </a>
                    )}
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
