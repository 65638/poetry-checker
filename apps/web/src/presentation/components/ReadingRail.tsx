import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AnalysisResponse, BookId, CheckStatus } from "@poetry/contracts";

interface ReadingRailProps {
  report: AnalysisResponse;
  stale: boolean;
  effects: boolean;
  editorCollapsed: boolean;
  onToggleEditor: () => void;
}

const BOOK: Record<BookId, string> = {
  pingshui: "平水韵",
  cilin: "词林正韵",
  xinyun: "中华新韵",
};
const COUNTS: Array<{ status: CheckStatus; label: string; icon: string }> = [
  { status: "fail", label: "违规", icon: "✕" },
  { status: "uncertain", label: "待复核", icon: "?" },
  { status: "unsupported", label: "未支持", icon: "∅" },
  { status: "pass", label: "通过", icon: "✓" },
  { status: "not_applicable", label: "不适用", icon: "–" },
];
const FLASH_MS = 1200;

export function ReadingRail({
  report,
  stale,
  effects,
  editorCollapsed,
  onToggleEditor,
}: ReadingRailProps) {
  const [active, setActive] = useState<number | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const flashedLine = useRef<HTMLElement | null>(null);
  const lines = report.poem.lines;
  const tokenText = new Map(report.poem.tokens.map((t) => [t.tokenId, t.text]));
  const checks = report.prosody.checks;

  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return;
    const targets = lines
      .map((l) => document.getElementById(`pc-line-${l.line}`))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const visible = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.line);
          if (entry.isIntersecting)
            visible.set(n, entry.boundingClientRect.top);
          else visible.delete(n);
        }
        if (visible.size === 0) return;
        let best = Infinity;
        let bestTop = Infinity;
        visible.forEach((top, n) => {
          if (top < bestTop || (top === bestTop && n < best)) {
            bestTop = top;
            best = n;
          }
        });
        setActive(best);
      },
      { rootMargin: "-20% 0px -45% 0px", threshold: [0, 1] },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [report, lines]);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      flashedLine.current?.classList.remove("pc-line--flash");
    },
    [],
  );

  const jump = (line: number, event: MouseEvent<HTMLButtonElement>) => {
    const el = document.getElementById(`pc-line-${line}`);
    if (!el) return;
    el.scrollIntoView({
      block: "center",
      behavior: effects ? "smooth" : "auto",
    });
    if (event.detail === 0) {
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    }
    flashedLine.current?.classList.remove("pc-line--flash");
    flashedLine.current = el;
    void el.offsetWidth;
    el.classList.add("pc-line--flash");
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      el.classList.remove("pc-line--flash");
      flashedLine.current = null;
      flashTimer.current = null;
    }, FLASH_MS);
    setActive(line);
  };

  return (
    <nav
      className={`pc-rail${stale ? " pc-rail--stale" : ""}`}
      aria-label="阅读目录"
    >
      <div className="pc-rail__book">
        <span className="pc-rail__kicker">韵书</span>
        <strong>{BOOK[report.policy.rhymeBook]}</strong>
      </div>
      <button
        type="button"
        className="pc-rail__directory-toggle"
        aria-expanded={directoryOpen}
        aria-controls="pc-rail-directory"
        onClick={() => setDirectoryOpen((open) => !open)}
      >
        <span>诗句目录 · {lines.length} 句</span>
        <span aria-hidden="true">{directoryOpen ? "−" : "+"}</span>
      </button>
      <div
        id="pc-rail-directory"
        className="pc-rail__directory"
        data-expanded={directoryOpen}
      >
        <ul className="pc-rail__counts" aria-label="检查项计数">
          {COUNTS.map(({ status, label, icon }) => (
            <li key={status} className={`pc-rail__count pc-finding--${status}`}>
              <span aria-hidden="true">{icon}</span> {label}
              <strong>
                {checks.filter((f) => f.status === status).length}
              </strong>
            </li>
          ))}
        </ul>

        <p className="pc-rail__kicker" id="pc-rail-lines">
          诗句{stale ? "（报告已过期，目录暂停）" : ""}
        </p>
        <ol className="pc-rail__lines" aria-labelledby="pc-rail-lines">
          {lines.map((l) => {
            const text = l.tokenIds
              .map((id) => tokenText.get(id) ?? "")
              .join("");
            const current = active === l.line;
            return (
              <li key={l.line}>
                <button
                  type="button"
                  className={`pc-rail__line${current ? " pc-rail__line--active" : ""}`}
                  aria-current={current ? "location" : undefined}
                  disabled={stale}
                  onClick={(event) => jump(l.line, event)}
                >
                  <span className="pc-rail__no">{l.line}</span>
                  <span className="pc-rail__text">{text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <button
        type="button"
        className="pc-button pc-button--quiet pc-rail__edit"
        aria-expanded={!editorCollapsed}
        aria-controls="pc-editor-body"
        onClick={onToggleEditor}
      >
        {editorCollapsed ? "展开编辑" : "收起编辑"}
      </button>
    </nav>
  );
}
