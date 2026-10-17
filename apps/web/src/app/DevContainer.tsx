import { lazy, Suspense, useState, type ChangeEvent } from "react";
import type { CheckerViewProps } from "../view-contract";
import {
  FORM_LABELS,
  GENRE_LABELS,
  MAX_CODE_POINTS,
  RHYME_BOOK_LABELS,
  codePointLength,
} from "./examples";
import {
  buildFindings,
  buildRelations,
  buildRhymeFeet,
  buildTokenSpectrum,
  groupFindings,
  locateFinding,
  rhymeCommonGroups,
} from "./reportView";
import { buildTokenEvidence, collectEvidenceGaps } from "./evidence";
import type { DevScenarioId } from "./devScenarios";

/** 场景选择器按需加载：生产包里只留这个 lazy 占位，不含场景文案。 */
const DevScenarioSelector = lazy(async () => {
  const mod = await import("./DevScenarioSelector");
  return { default: mod.DevScenarioSelector };
});

/**
 * 临时纯文本开发容器（design 交付前的业务容器）。
 *
 * 只验证输入、提交、状态与回调是否接通，刻意不做配色/排版/组件库，
 * 也不导入 presentation 或添加全局 CSS。设计方交付 CheckerView 后，
 * 业务逻辑由 src/app/store 继续复用，本文件可整体替换。
 *
 * `onLoadDevScenario` 是**可选**的开发入口：生产入口不传，选择器不渲染，
 * fixture 与场景文案都不会进发布包（选择器与装载器都是动态 import）。
 *
 * 原始正文按文本渲染（React 默认转义），不拼未消毒 HTML。
 */
export interface DevContainerProps extends CheckerViewProps {
  onLoadDevScenario?: (id: DevScenarioId) => void;
}

export function DevContainer(props: DevContainerProps) {
  const {
    draft,
    report,
    busy,
    stale,
    error,
    feedback,
    selectedTokenId,
    selectedFindingId,
    examples,
    onDraftChange,
    onAnalyze,
    onLoadExample,
    onSelectToken,
    onSelectFinding,
    onChooseReading,
    onCloseEvidence,
    onCopySummary,
    onDownloadReport,
    onLoadDevScenario,
  } = props;

  // 视图模型全部来自纯函数（src/app/reportView.ts、src/app/evidence.ts），
  // 不在这里重算格律，也不补造来源/反切。
  const [onlyAttention, setOnlyAttention] = useState(false);
  const tokenSpectrum = report === null ? [] : buildTokenSpectrum(report);
  const findings = report === null ? [] : buildFindings(report);
  const findingGroups = groupFindings(findings, onlyAttention);
  const selectedFindingTargets =
    report === null || selectedFindingId === null
      ? []
      : locateFinding(report, selectedFindingId);
  const rhymeFeet = report === null ? [] : buildRhymeFeet(report);
  const commonGroups =
    report === null
      ? { status: "unknown" as const, groupIds: [] }
      : rhymeCommonGroups(report);
  const relations = report === null ? [] : buildRelations(report);
  const tokenEvidence =
    report === null || selectedTokenId === null
      ? null
      : buildTokenEvidence(report, selectedTokenId);
  const evidenceGapState = tokenEvidence === null ? null : collectEvidenceGaps(tokenEvidence);
  const evidenceGaps =
    tokenEvidence === null || evidenceGapState === null
      ? []
      : [
          ...(evidenceGapState.missingFanqie.length > 0
            ? [`${evidenceGapState.missingFanqie.length} 个候选未提供反切`]
            : []),
          ...(evidenceGapState.unresolvedEvidenceIds.length > 0
            ? [`引用不到证据：${evidenceGapState.unresolvedEvidenceIds.join("、")}`]
            : []),
          ...(evidenceGapState.findingsWithoutRuleCard.length > 0
            ? [`诊断缺少规则卡：${evidenceGapState.findingsWithoutRuleCard.join("、")}`]
            : []),
        ];
  const evidenceSources =
    tokenEvidence === null
      ? []
      : [
          ...new Map(
            tokenEvidence.candidates
              .flatMap((candidate) => candidate.evidence)
              .flatMap((item) => (item.source === null ? [] : [item.source]))
              .map((source) => [source.id, source]),
          ).values(),
        ];

  return (
    <main data-testid="dev-container" style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <h1>诗格律检查器 · 开发容器</h1>
      <p>
        <small>
          临时纯文本开发界面（D1）。正式视觉由设计方交付 CheckerView 后替换；
          本容器只验证业务接通。合成场景仅用于开发，不代表真实格律结论。
        </small>
      </p>

      <section aria-labelledby="input-heading">
        <h2 id="input-heading">输入</h2>

        <p>
          <label htmlFor="poem-text">正文（只粘贴正文，按标点或换行分句）</label>
          <br />
          <textarea
            id="poem-text"
            rows={6}
            cols={40}
            value={draft.text}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              onDraftChange({ ...draft, text: event.target.value });
            }}
          />
          <br />
          <small>
            {codePointLength(draft.text)} / {MAX_CODE_POINTS} 码点
          </small>
        </p>

        <p>
          <label htmlFor="rhyme-book">韵书</label>{" "}
          <select
            id="rhyme-book"
            value={draft.rhymeBook}
            onChange={(event) => {
              onDraftChange({
                ...draft,
                rhymeBook: event.target.value as typeof draft.rhymeBook,
              });
            }}
          >
            {Object.entries(RHYME_BOOK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>{" "}
          <label htmlFor="genre-hint">体裁</label>{" "}
          <select
            id="genre-hint"
            value={draft.genreHint}
            onChange={(event) => {
              onDraftChange({
                ...draft,
                genreHint: event.target.value as typeof draft.genreHint,
              });
            }}
          >
            {Object.entries(GENRE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>{" "}
          <label htmlFor="form-hint">体式</label>{" "}
          <select
            id="form-hint"
            value={draft.formHint}
            onChange={(event) => {
              onDraftChange({
                ...draft,
                formHint: event.target.value as typeof draft.formHint,
              });
            }}
          >
            {Object.entries(FORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </p>

        <p>
          <button type="button" onClick={onAnalyze} disabled={busy}>
            {busy ? "分析中…" : "分析"}
          </button>
        </p>

        <p>
          示例入口（等待来源与版本核对，暂不载入）：{" "}
          {examples.map((example) => (
            <button
              key={example.id}
              type="button"
              onClick={() => onLoadExample(example.id)}
              disabled={example.text.trim().length === 0}
            >
              {example.title}
            </button>
          ))}
        </p>

        {onLoadDevScenario !== undefined ? (
          <Suspense fallback={<p>正在加载开发场景…</p>}>
            <DevScenarioSelector onLoad={onLoadDevScenario} />
          </Suspense>
        ) : null}
      </section>

      <section aria-labelledby="status-heading">
        <h2 id="status-heading">状态</h2>
        <ul>
          <li>busy：{busy ? "是" : "否"}</li>
          <li>报告已过时（stale）：{stale ? "是，请重新分析" : "否"}</li>
          <li>错误：{error === null ? "无" : `${error.code} — ${error.message}`}</li>
          <li>反馈：{feedback ?? "无"}</li>
        </ul>
      </section>

      <section aria-labelledby="result-heading">
        <h2 id="result-heading">结果</h2>
        {report === null ? (
          <p>尚无报告。</p>
        ) : (
          <>
            <p>
              结论：<strong>{report.summary.status}</strong> — {report.summary.message}
            </p>
            {stale ? <p role="status">当前报告已不对应当前输入，选音与导出已禁用。</p> : null}
            <p>
              韵书：{report.policy.rhymeBook}｜口径：{report.policy.notice}
            </p>
            <p>
              体式：{report.genre.formFamily}
              {report.genre.formId === null ? "" : ` / ${report.genre.formId}`}
              （适用性：{report.genre.applicability}）
            </p>
            <p>
              版本：数据 {report.versions.data}｜规则 {report.versions.rules}
            </p>

            <h3>逐字谱</h3>
            <p>
              <small>
                字位按原文顺序；括号内为平仄，韵脚以「韵」标记，未定为「未定」。
              </small>
            </p>
            <ul>
              {tokenSpectrum.map((cell) => (
                <li key={cell.tokenId}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectToken(cell.tokenId);
                    }}
                    aria-pressed={selectedTokenId === cell.tokenId}
                    data-token-id={cell.tokenId}
                  >
                    {cell.text}
                  </button>{" "}
                  {cell.toneLabel}
                  {cell.tonePending ? "（待定）" : ""}
                  {cell.isRhyme ? "〔韵〕" : ""}{" "}
                  <small>
                    {cell.tokenId} · 第 {cell.line} 行第 {cell.column} 字
                  </small>
                </li>
              ))}
            </ul>

            <h3>诊断</h3>
            <p>
              <label htmlFor="only-attention">
                <input
                  id="only-attention"
                  type="checkbox"
                  checked={onlyAttention}
                  onChange={(event) => {
                    setOnlyAttention(event.target.checked);
                  }}
                />{" "}
                只看需处理项
              </label>
            </p>
            {findingGroups.length === 0 ? (
              <p>没有符合当前筛选的诊断。</p>
            ) : (
              findingGroups.map((group) => (
                <div key={group.group}>
                  <h4>
                    {group.label}（{group.items.length}）
                  </h4>
                  <ul>
                    {group.items.map((finding) => (
                      <li key={finding.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectFinding(finding.id);
                          }}
                          aria-pressed={selectedFindingId === finding.id}
                        >
                          定位
                        </button>{" "}
                        [{finding.status}/{finding.severity}] {finding.ruleId}：
                        {finding.message}
                        {finding.tokenIds.length > 0 ? (
                          <small>（字位 {finding.tokenIds.join("、")}）</small>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}

            {selectedFindingTargets.length > 0 ? (
              <p role="status">
                已定位到：{" "}
                {selectedFindingTargets
                  .map(
                    (target) =>
                      `${target.text}（${target.tokenId}，第 ${target.line} 行第 ${target.column} 字，UTF-16 ${target.startUtf16}–${target.endUtf16}）`,
                  )
                  .join("、")}
              </p>
            ) : null}

            <h3>押韵</h3>
            <p>
              状态 {report.prosody.rhyme.status}｜
              {rhymeFeet.length === 0
                ? "无韵脚"
                : `韵脚 ${rhymeFeet.map((foot) => `${foot.text}(${foot.tokenId})`).join("、")}`}
            </p>
            <p>
              共同归部：
              {commonGroups.status === "shared"
                ? commonGroups.groupIds.join("、")
                : commonGroups.status === "none"
                  ? "未找到共同韵部"
                  : "无可用韵脚，无法判断"}
            </p>

            <h3>粘对</h3>
            {relations.length === 0 ? (
              <p>
                当前报告未提供粘对关系（`prosody.relations` 为空），不视为通过。
              </p>
            ) : (
              <ul>
                {relations.map((relation, index) => (
                  <li key={`${relation.kind}-${index}`}>
                    {relation.kindLabel}：
                    {relation.sides
                      .map((side) =>
                        side.text === null
                          ? `${side.tokenId}（未解析）`
                          : `${side.text}(${side.tokenId})`,
                      )
                      .join(" ↔ ")}
                    ｜状态 {relation.status}
                    {relation.hasUnresolvedTokens ? "｜含未解析字位" : ""}
                    {relation.findingIds.length > 0
                      ? `｜诊断 ${relation.findingIds.join("、")}`
                      : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">证据抽屉（临时）</h2>
        {tokenEvidence === null ? (
          <p>点击逐字谱中的字位查看候选。</p>
        ) : (
          <>
            <p>
              字位 {tokenEvidence.tokenId}「{tokenEvidence.text}」（第{" "}
              {tokenEvidence.line} 行第 {tokenEvidence.column} 字）· 平仄{" "}
              {tokenEvidence.toneLabel}（{tokenEvidence.toneStatus}）· 读音{" "}
              {tokenEvidence.readingStatus}
              {tokenEvidence.isUserSpecified ? "· 用户指定" : ""}
            </p>
            <p>
              <small>
                原文区间 UTF-16 {tokenEvidence.startUtf16}–
                {tokenEvidence.endUtf16}，切片「{tokenEvidence.slice}」
                {tokenEvidence.reason.length > 0 ? `；依据：${tokenEvidence.reason}` : ""}
              </small>
            </p>
            {tokenEvidence.groupNames.length > 0 ? (
              <p>韵部：{tokenEvidence.groupNames.join("、")}</p>
            ) : null}

            <h4>候选读音</h4>
            <ul>
              {tokenEvidence.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChooseReading({
                        tokenId: tokenEvidence.tokenId,
                        readingId: candidate.id,
                      });
                    }}
                  >
                    选择
                  </button>{" "}
                  {candidate.toneLabel}｜{candidate.toneClass}
                  {candidate.isEffective ? "" : "（不参与判定）"}
                  {candidate.isSelected ? "（当前）" : ""}｜
                  {candidate.gloss ?? "无释义"}｜
                  {candidate.fanqie.available
                    ? `反切 ${candidate.fanqie.text}`
                    : "该数据未提供反切"}
                  {candidate.modernReading === null
                    ? ""
                    : `｜今读 ${candidate.modernReading.pinyin}${candidate.modernReading.toneNumber}`}
                  {candidate.groupNames.length > 0
                    ? `｜韵部 ${candidate.groupNames.join("、")}`
                    : ""}
                </li>
              ))}
            </ul>

            {tokenEvidence.findings.length > 0 ? (
              <>
                <h4>相关规则</h4>
                <ul>
                  {tokenEvidence.findings.map((finding) => (
                    <li key={finding.id}>
                      [{finding.status}/{finding.severity}] {finding.ruleId}：
                      {finding.message}
                      {finding.ruleCard === null ? (
                        <em>（无规则卡）</em>
                      ) : (
                        <small>
                          {" "}
                          — {finding.ruleCard.name}：{finding.ruleCard.statement}
                          （v{finding.ruleCard.version}）
                          {finding.ruleCard.limitations.length > 0
                            ? `｜限制：${finding.ruleCard.limitations.join("；")}`
                            : ""}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {evidenceSources.length > 0 ? (
              <>
                <h4>来源</h4>
                <ul>
                  {evidenceSources.map((source) => (
                    <li key={source.id}>
                      {source.title}
                      {source.edition === null ? "" : `（${source.edition}）`}
                      ｜{source.license}
                      {source.url === null ? "" : `｜${source.url}`}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {evidenceGaps.length > 0 ? (
              <p role="note">
                <small>数据缺失提示：{evidenceGaps.join("；")}</small>
              </p>
            ) : null}

            <button type="button" onClick={onCloseEvidence}>
              关闭
            </button>
          </>
        )}
      </section>

      <section aria-labelledby="export-heading">
        <h2 id="export-heading">复制与导出</h2>
        <button type="button" onClick={onCopySummary} disabled={report === null || stale}>
          复制摘要
        </button>{" "}
        <button type="button" onClick={onDownloadReport} disabled={report === null || stale}>
          下载 JSON
        </button>
      </section>
    </main>
  );
}
