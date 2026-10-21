// apps/web/src/presentation/components/ReportView.tsx
import { useEffect, useRef, useState } from "react";
import type {
  AnalysisResponse,
  AnnotatedToken,
  BookId,
  CheckStatus,
  Finding,
  SummaryStatus,
} from "@poetry/contracts";
import type { CheckerViewProps } from "../../view-contract";
import { incompleteSummary, templateLabel } from "../../app/reportView";
import { trailingPunctuation } from "../punctuation";
import { FindingReference } from "./FindingReference";
import { FormatSummary } from "./FormatSummary";
import { ResearchNotes } from "./ResearchNotes";
import "../styles/report.css";

type ReportViewProps = Pick<
  CheckerViewProps,
  | "stale"
  | "busy"
  | "selectedTokenId"
  | "selectedFindingId"
  | "onSelectToken"
  | "onSelectFinding"
  | "onCopySummary"
  | "onDownloadReport"
> & { report: AnalysisResponse };

const SUMMARY: Record<
  SummaryStatus,
  { label: string; icon: string; desc: string }
> = {
  pass: {
    label: "通过",
    icon: "✓",
    desc: "已实现的必检项均通过。",
  },
  fail: {
    label: "不合律",
    icon: "✕",
    desc: "存在明确违规，详见诗旁批注。",
  },
  needs_review: {
    label: "暂无完整结论",
    icon: "?",
    desc: "仍有检查项目未确定。",
  },
  not_applicable: {
    label: "不适用",
    icon: "–",
    desc: "近体格律检查不适用于此诗；逐字平仄与韵脚仍可查看。",
  },
  unsupported: {
    label: "暂不支持",
    icon: "∅",
    desc: "此体式或必要规则尚未实现，无法给出通过结论。",
  },
};
const CHECK: Record<CheckStatus, { label: string; icon: string }> = {
  pass: { label: "通过", icon: "✓" },
  fail: { label: "违规", icon: "✕" },
  uncertain: { label: "未确定", icon: "?" },
  not_applicable: { label: "不适用", icon: "–" },
  unsupported: { label: "未支持", icon: "∅" },
};
const TALLY_ORDER: CheckStatus[] = [
  "fail",
  "uncertain",
  "unsupported",
  "pass",
  "not_applicable",
];
const SETTLED = new Set<CheckStatus>(["pass", "not_applicable"]);
const SEVERITY: Record<Finding["severity"], string> = {
  error: "错误",
  warning: "警示",
  info: "提示",
};
const BOOK: Record<BookId, string> = {
  pingshui: "平水韵",
  cilin: "词林正韵",
  xinyun: "中华新韵",
};
const toneText = (t: string) => (t === "P" ? "平" : t === "Z" ? "仄" : t);

function toneOf(t: AnnotatedToken) {
  if (t.toneStatus === "resolved" && t.tone !== null) {
    return t.tone === "P"
      ? { label: "平", mod: "ping" }
      : { label: "仄", mod: "ze" };
  }
  return { label: t.candidates.length ? "未定" : "缺录", mod: "unknown" };
}

function prefersReducedMotion(el?: Element | null) {
  if (el?.closest<HTMLElement>(".pc-root")?.dataset.motion === "off")
    return true;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ReportView(props: ReportViewProps) {
  const { report, stale, selectedTokenId, selectedFindingId } = props;
  const rootRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLOListElement>(null);
  const settledRef = useRef<HTMLDetailsElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locatingPoem = useRef(false);
  const [reference, setReference] = useState<{
    report: AnalysisResponse;
    id: string;
  } | null>(null);
  const referenceId = reference?.report === report ? reference.id : "";
  const [hoverToken, setHoverToken] = useState<string | null>(null);
  const [hoverFinding, setHoverFinding] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState<string | null>(null);
  const [focusFinding, setFocusFinding] = useState<string | null>(null);
  const [openReference, setOpenReference] = useState<string | null>(null);
  const [followedFindingId, setFollowedFindingId] = useState<string | null>(
    null,
  );
  const destinationRef = useRef<"poem" | "note">("poem");
  const tokens = new Map(report.poem.tokens.map((t) => [t.tokenId, t]));
  const rhymeIds = new Set(report.prosody.rhyme.tokenIds);
  const checks = report.prosody.checks;
  // Number the visible issues first, then the collapsed settled checks.
  const numbered = [
    ...checks.filter((f) => !SETTLED.has(f.status)),
    ...checks.filter((f) => SETTLED.has(f.status)),
  ].map((f, i) => ({ f, n: i + 1 }));
  const conditionalGroups = (report.prosody.conditionalChecks ?? []).map(
    (block) => {
      const label = templateLabel(
        report.prosody.candidates.find((c) => c.id === block.templateId)!,
      );
      return {
        id: block.templateId,
        label,
        checks: block.checks
          .filter(
            (f) =>
              block.conditionalFindingIds.includes(f.id) &&
              (f.status === "uncertain" ||
                f.status === "unsupported" ||
                (f.status === "fail" && f.resolvedBy === null)),
          )
          .map((f) => ({ ...f, message: `若按${label}：${f.message}` })),
      };
    },
  );
  let conditionNumber = numbered.length;
  const conditionRows = conditionalGroups.map((group) => ({
    ...group,
    items: group.checks.map((f) => ({
      f,
      n: ++conditionNumber,
      conditional: group.label,
    })),
  }));
  const allChecks = [
    ...checks,
    ...(report.prosody.conditionalChecks ?? []).flatMap(
      (block) => block.checks,
    ),
  ];
  const tokenLinks = new Map<
    string,
    Array<{ f: Finding; n: number; conditional?: string }>
  >();
  for (const item of [
    ...numbered.filter(({ f }) => !SETTLED.has(f.status)),
    ...conditionRows
      .filter((g) => g.id === referenceId)
      .flatMap((g) => g.items),
  ]) {
    for (const { tokenId } of item.f.locations) {
      const list = tokenLinks.get(tokenId) ?? [];
      if (!list.includes(item)) list.push(item);
      tokenLinks.set(tokenId, list);
    }
  }
  const activeToken = hoverToken ?? focusToken ?? selectedTokenId;
  const activeFindingId =
    hoverFinding ?? followedFindingId ?? focusFinding ?? selectedFindingId;
  const selectedFinding =
    allChecks.find((f) => f.id === selectedFindingId) ?? null;
  const activeFinding = allChecks.find((f) => f.id === activeFindingId) ?? null;
  const related = new Set(
    [
      activeFinding,
      ...allChecks.filter((f) =>
        activeFinding?.relatedFindingIds.includes(f.id),
      ),
    ].flatMap((f) => f?.locations.map((l) => l.tokenId) ?? []),
  );
  const noteIsActive = (f: Finding) =>
    activeFindingId
      ? f.id === activeFindingId
      : f.locations.some((l) => l.tokenId === activeToken);
  const cancelFollow = () => {
    if (followTimer.current) clearTimeout(followTimer.current);
    followTimer.current = null;
  };
  const followFinding = (findingId: string, delay = 800) => {
    cancelFollow();
    followTimer.current = setTimeout(() => {
      followTimer.current = null;
      setFollowedFindingId(findingId);
      const pane = notesRef.current;
      const item = Array.from(
        pane?.querySelectorAll<HTMLElement>("[data-finding-id]") ?? [],
      ).find((element) => element.dataset.findingId === findingId);
      if (!pane || !item) return;
      // Move only the note list: never move the poem, page or keyboard focus.
      const top =
        pane.scrollTop +
        item.getBoundingClientRect().top -
        pane.getBoundingClientRect().top;
      pane.scrollTo({
        top: Math.max(0, top - 8),
        behavior: prefersReducedMotion(pane) ? "instant" : "smooth",
      });
    }, delay);
  };
  useEffect(
    () => () => {
      if (followTimer.current) clearTimeout(followTimer.current);
    },
    [report],
  );
  const scrollToFinding = (finding: Finding, destination: "poem" | "note") => {
    const element =
      destination === "note"
        ? Array.from(
            rootRef.current?.querySelectorAll<HTMLElement>(
              "[data-finding-id]",
            ) ?? [],
          ).find((el) => el.dataset.findingId === finding.id)
        : Array.from(
            gridRef.current?.querySelectorAll<HTMLElement>("[data-token-id]") ??
              [],
          ).find((el) => el.dataset.tokenId === finding.locations[0]?.tokenId);
    locatingPoem.current = true;
    element?.focus({ preventScroll: true });
    locatingPoem.current = false;
    element?.scrollIntoView({
      block: destination === "note" ? "nearest" : "center",
      behavior: prefersReducedMotion(element) ? "auto" : "smooth",
    });
  };
  const selectFinding = (finding: Finding, destination: "poem" | "note") => {
    if (followTimer.current) clearTimeout(followTimer.current);
    const group = conditionRows.find((g) =>
      g.items.some((item) => item.f.id === finding.id),
    );
    if (group && group.id !== referenceId)
      setReference({ report, id: group.id });
    setFollowedFindingId(finding.id);
    destinationRef.current = destination;
    props.onSelectFinding(finding.id);
    // Repeated activation must still navigate when selection has not changed.
    if (finding.id === selectedFindingId) scrollToFinding(finding, destination);
  };
  const summary =
    report.summary.status === "needs_review"
      ? { ...SUMMARY.needs_review, ...incompleteSummary(report) }
      : SUMMARY[report.summary.status];
  const firstRelated = selectedFinding?.locations[0]?.tokenId ?? null;
  const renderFinding = ({
    f,
    n,
    conditional,
  }: {
    f: Finding;
    n: number;
    conditional?: string;
  }) => {
    const st = CHECK[f.status];
    const rule = report.provenance.rules.find((r) => r.id === f.ruleId);
    const templatePending =
      f.status === "uncertain" &&
      f.ruleId === "METER.POSITION" &&
      f.id.endsWith(":template");
    const where =
      f.locations.map((l) => `第${l.line}句第${l.column}字`).join("、") ||
      "整首";
    return (
      <li
        key={f.id}
        data-finding-id={f.id}
        tabIndex={-1}
        onMouseEnter={() => setHoverFinding(f.id)}
        onMouseLeave={() => setHoverFinding(null)}
        onFocus={() => {
          setFocusFinding(f.id);
          setFollowedFindingId(f.id);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocusFinding(null);
        }}
        className={`pc-finding pc-finding--${f.status}${conditional ? " pc-finding--conditional" : ""}${noteIsActive(f) ? " pc-finding--selected" : ""}`}
      >
        <span className="pc-finding__no" aria-hidden="true">
          {n}
        </span>
        <div className="pc-finding__body">
          <div className="pc-finding__head">
            {conditional && (
              <span className="pc-tag pc-tag--quiet">条件批注</span>
            )}
            <span className="pc-tag">
              <span aria-hidden="true">{st.icon}</span> {st.label}
            </span>
            <span className="pc-tag pc-tag--quiet">{SEVERITY[f.severity]}</span>
            <span className="pc-finding__rule">
              {templatePending
                ? "整诗参考格式未唯一确定"
                : rule
                  ? rule.name
                  : f.ruleId}
            </span>
          </div>
          <p className="pc-finding__msg">
            {templatePending
              ? report.prosody.format
                ? "已知形制与起式分别列于上方；共同问题照常标出，其余可切换参考格式查看。"
                : "平起／仄起、首句是否入韵尚未确定。目前仅显示各候选格式共有的检查结果。"
              : f.message}
          </p>
          {!templatePending && (
            <dl className="pc-finding__compare">
              <div>
                <dt>应为</dt>
                <dd>{f.expected.map(toneText).join(" / ") || "无记录"}</dd>
              </div>
              <div>
                <dt>实际</dt>
                <dd>{f.observed.map(toneText).join(" / ") || "无记录"}</dd>
              </div>
            </dl>
          )}
          {f.locations.length > 0 && (
            <button
              type="button"
              className="pc-button pc-button--quiet pc-finding__locate"
              aria-pressed={f.id === selectedFindingId}
              onClick={() => selectFinding(f, "poem")}
            >
              在诗中定位：{where}
            </button>
          )}
        </div>
      </li>
    );
  };
  const attention = numbered.filter(({ f }) => !SETTLED.has(f.status));
  const settled = numbered.filter(({ f }) => SETTLED.has(f.status));
  const tally = Object.fromEntries(
    TALLY_ORDER.map((s) => [s, checks.filter((f) => f.status === s).length]),
  ) as Record<CheckStatus, number>;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof el.animate !== "function" || prefersReducedMotion(el))
      return;
    const ms = parseFloat(
      getComputedStyle(el).getPropertyValue("--pc-dur-report"),
    );
    if (!(ms > 0)) return;
    const style = getComputedStyle(el);
    const shift = style.getPropertyValue("--pc-shift-report").trim() || "0px";
    const stagger =
      parseFloat(style.getPropertyValue("--pc-stagger-line")) || 0;
    const easing = "cubic-bezier(0.2, 0.7, 0.2, 1)";
    el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: ms * 0.6,
      easing,
    });
    el.querySelector(".pc-status")?.animate(
      [
        { opacity: 0, transform: "scale(1.04)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: ms, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" },
    );
    const lines = Array.from(el.querySelectorAll<HTMLElement>(".pc-line"));
    // Total reveal stays near 650ms regardless of poem length.
    const step =
      lines.length > 1 ? Math.min(stagger, 290 / (lines.length - 1)) : 0;
    lines.forEach((line, i) => {
      line.animate(
        [
          { opacity: 0, transform: `translateY(${shift})` },
          { opacity: 1, transform: "none" },
        ],
        { duration: ms, delay: i * step, easing, fill: "backwards" },
      );
    });
  }, [report]);

  useEffect(() => {
    if (
      selectedFinding &&
      SETTLED.has(selectedFinding.status) &&
      settledRef.current
    ) {
      settledRef.current.open = true;
    }
  }, [selectedFinding]);

  useEffect(() => {
    if (selectedFinding)
      scrollToFinding(selectedFinding, destinationRef.current);
  }, [selectedFindingId, firstRelated]);

  return (
    <article
      ref={rootRef}
      className={`pc-report${stale ? " pc-report--stale" : ""}${selectedFinding ? " pc-report--focusing" : ""}`}
    >
      {stale && (
        <p className="pc-stale" role="status">
          <span aria-hidden="true">⟳</span>{" "}
          {props.busy
            ? "正在更新分析，当前仍可查阅上次结果。"
            : "输入已修改，当前展示上次分析结果。"}
        </p>
      )}

      <header className={`pc-status pc-status--${report.summary.status}`}>
        <span className="pc-status__icon" aria-hidden="true">
          <span className="pc-status__glyph">{summary.icon}</span>
        </span>
        <div className="pc-status__body">
          <h3 className="pc-status__label">
            {report.summary.status === "needs_review" && report.prosody.format
              ? "参考分析"
              : "结论"}
            ：{summary.label}
          </h3>
          <p className="pc-status__text">{summary.desc}</p>
          {report.readingAssistant && (
            <p className="pc-status__text" role="status">
              {report.readingAssistant.message}
            </p>
          )}
        </div>
        <div className="pc-status__actions">
          <button
            type="button"
            className="pc-button pc-button--small"
            onClick={props.onCopySummary}
          >
            复制摘要
          </button>
          <button
            type="button"
            className="pc-button pc-button--small"
            onClick={props.onDownloadReport}
          >
            下载报告
          </button>
        </div>
      </header>

      <p className="pc-policy">
        <strong>韵书：{BOOK[report.policy.rhymeBook]}</strong>
        <span>
          声调依据：
          {report.policy.toneBasis === "historical"
            ? "传统四声（入声归仄）"
            : "普通话声调（可能与传统韵书结果不同）"}
        </span>
        {report.genre.historicalTags.length > 0 && (
          <span className="pc-historical-tags">
            作品体裁说明：{report.genre.historicalTags.join("、")}
            （不改变逐项检查结论）
          </span>
        )}
      </p>

      <FormatSummary report={report} />
      {report.research && (
        <ResearchNotes text={report.poem.originalText} data={report.research} />
      )}

      <div className="pc-report-workbench">
        <section className="pc-reading" aria-labelledby="pc-grid-heading">
          <div className="pc-reading__head">
            <h3 id="pc-grid-heading" className="pc-section-title">
              <span className="pc-section-title__no" aria-hidden="true">
                贰
              </span>
              批注诗文
            </h3>
            <p className="pc-legend">
              红线 = 违规 · 悬停或点编号看原因 ·「韵」= 韵脚 ·「?」= 读音待定
            </p>
          </div>
          <ol ref={gridRef} className="pc-grid">
            {report.poem.lines.map((line, lineIndex) => (
              <li
                key={line.line}
                id={`pc-line-${line.line}`}
                data-line={line.line}
                className="pc-line"
              >
                <span className="pc-line__no">第{line.line}句</span>
                <div className="pc-line__cells">
                  {line.tokenIds.map((id, i) => {
                    const t = tokens.get(id);
                    if (!t) return null;
                    const tone = toneOf(t);
                    const isRhyme = rhymeIds.has(id);
                    const pending = t.readingStatus !== "resolved";
                    const isRelated = related.has(id);
                    const links = tokenLinks.get(id) ?? [];
                    const violation = links.some(
                      ({ f, conditional }) =>
                        f.status === "fail" && !conditional,
                    );
                    const conditionalViolation = links.some(
                      ({ conditional }) => !!conditional,
                    );
                    const nextToken = tokens.get(line.tokenIds[i + 1] ?? "");
                    const nextLineToken =
                      report.poem.lines[lineIndex + 1]?.tokenIds[0];
                    const lineEndUtf16 = nextLineToken
                      ? tokens.get(nextLineToken)?.startUtf16
                      : undefined;
                    const punct = trailingPunctuation(
                      report.poem.originalText,
                      t,
                      nextToken,
                      lineEndUtf16,
                    );
                    const label = `第${t.line}句第${t.column}字「${t.text}」，${tone.label}${isRhyme ? "，韵脚" : ""}${pending ? "，读音待定" : ""}${isRelated ? "，批注关联位置" : ""}${links.length ? "，关联批注 " + links.map(({ n }) => n).join("、") : ""}`;
                    return (
                      <span
                        key={id}
                        className="pc-cell-wrap"
                        onMouseEnter={() => setHoverToken(id)}
                        onMouseLeave={() => {
                          setHoverToken(null);
                          cancelFollow();
                        }}
                        onFocus={() => setFocusToken(id)}
                        onBlur={(event) => {
                          if (
                            !event.currentTarget.contains(event.relatedTarget)
                          ) {
                            setFocusToken(null);
                            cancelFollow();
                          }
                        }}
                      >
                        <button
                          type="button"
                          data-token-id={id}
                          className={`pc-cell pc-cell--${tone.mod}${isRhyme ? " pc-cell--rhyme" : ""}${violation ? " pc-cell--violation" : ""}${conditionalViolation && !violation ? " pc-cell--conditional" : ""}${isRelated ? " pc-cell--related" : ""}${selectedTokenId === id ? " pc-cell--selected" : ""}`}
                          aria-label={label}
                          aria-haspopup="dialog"
                          aria-expanded={selectedTokenId === id}
                          onMouseEnter={() => {
                            if (links[0]) followFinding(links[0].f.id);
                          }}
                          onFocus={() => {
                            if (links[0] && !locatingPoem.current)
                              followFinding(links[0].f.id, 0);
                          }}
                          onClick={() => props.onSelectToken(id)}
                        >
                          <span className="pc-cell__char">{t.text}</span>
                          <span className="pc-cell__tone">{tone.label}</span>
                          {isRhyme && (
                            <span
                              className="pc-cell__badge pc-cell__badge--rhyme"
                              aria-hidden="true"
                            >
                              韵
                            </span>
                          )}
                          {pending && (
                            <span
                              className="pc-cell__badge pc-cell__badge--pending"
                              aria-hidden="true"
                            >
                              ?
                            </span>
                          )}
                        </button>
                        <span className="pc-cell__references">
                          {links.map(({ f, n, conditional }) => (
                            <FindingReference
                              key={f.id}
                              finding={f}
                              conditional={!!conditional}
                              number={n}
                              open={openReference === `${id}:${f.id}`}
                              onOpenChange={(open) =>
                                setOpenReference((current) =>
                                  open
                                    ? `${id}:${f.id}`
                                    : current === `${id}:${f.id}`
                                      ? null
                                      : current,
                                )
                              }
                              rule={`${conditional ? "条件批注 · " : ""}${
                                report.provenance.rules.find(
                                  (rule) => rule.id === f.ruleId,
                                )?.name ?? f.ruleId
                              }`}
                              onFollow={() => followFinding(f.id, 0)}
                            />
                          ))}
                        </span>
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
          <div className="pc-notes-heading">
            <h3 id="pc-findings-heading" className="pc-section-title">
              <span className="pc-section-title__no" aria-hidden="true">
                叁
              </span>
              批注
            </h3>
            <button
              type="button"
              className="pc-return-poem"
              onClick={() => {
                const target =
                  gridRef.current?.querySelector<HTMLElement>(".pc-line");
                target?.scrollIntoView({
                  block: "center",
                  behavior: prefersReducedMotion(target) ? "instant" : "smooth",
                });
                target?.setAttribute("tabindex", "-1");
                target?.focus({ preventScroll: true });
              }}
            >
              回诗首 ↑
            </button>
          </div>
          {conditionRows.length > 0 && (
            <label className="pc-format-reference">
              参考格式
              <select
                aria-label="参考格式"
                value={referenceId}
                onChange={(e) => {
                  cancelFollow();
                  setReference({ report, id: e.target.value });
                  setOpenReference(null);
                  setFollowedFindingId(null);
                  setHoverFinding(null);
                  setFocusFinding(null);
                  props.onSelectFinding(null);
                }}
              >
                <option value="">各式共有</option>
                {conditionRows.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div
            ref={notesRef}
            className="pc-notes__body"
            tabIndex={0}
            aria-label="批注列表"
          >
            {checks.length === 0 ? (
              <p className="pc-legend">
                本报告未列出批注条目；结论以上方状态为准。
              </p>
            ) : (
              <>
                <ul className="pc-tally" aria-label="批注统计">
                  {TALLY_ORDER.filter((s) => tally[s] > 0).map((s) => (
                    <li key={s} className={`pc-tally__item pc-finding--${s}`}>
                      <span aria-hidden="true">{CHECK[s].icon}</span>{" "}
                      {CHECK[s].label}
                      <strong className="pc-tally__count">{tally[s]}</strong>
                    </li>
                  ))}
                </ul>
                {attention.length > 0 ? (
                  <ol className="pc-findings">
                    {attention.map(renderFinding)}
                  </ol>
                ) : (
                  <p className="pc-legend">没有需要关注的条目。</p>
                )}
                {settled.length > 0 && (
                  <details ref={settledRef} className="pc-settled">
                    <summary className="pc-settled__summary">
                      已通过或不适用的检查（{settled.length} 条）
                    </summary>
                    <ol className="pc-findings pc-findings--settled">
                      {settled.map(renderFinding)}
                    </ol>
                  </details>
                )}
                {conditionRows.length > 0 &&
                  (referenceId ? (
                    <section className="pc-conditional" aria-label="条件批注">
                      <h4>
                        若按
                        {conditionRows.find((g) => g.id === referenceId)?.label}
                      </h4>
                      <ol className="pc-findings">
                        {conditionRows
                          .find((g) => g.id === referenceId)
                          ?.items.map(renderFinding)}
                      </ol>
                      {!conditionRows.find((g) => g.id === referenceId)?.items
                        .length && (
                        <p className="pc-legend">
                          此格式没有额外的未解决问题。
                        </p>
                      )}
                    </section>
                  ) : (
                    <details className="pc-conditional">
                      <summary>
                        条件批注（{conditionRows.length}种参考格式）
                      </summary>
                      {conditionRows.map((group) => (
                        <details
                          key={group.id}
                          className="pc-conditional__group"
                        >
                          <summary>
                            若按{group.label}：{group.items.length}项
                          </summary>
                          <ol className="pc-findings">
                            {group.items.map(renderFinding)}
                          </ol>
                        </details>
                      ))}
                    </details>
                  ))}
              </>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
