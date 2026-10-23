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
  { status: "uncertain", label: "未确定", icon: "?" },
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
  const navigationTarget = useRef<number | null>(null);
  const navigationTimer = useRef<number | null>(null);
  const lines = report.poem.lines;
  const tokenText = new Map(report.poem.tokens.map((t) => [t.tokenId, t.text]));
  const checks = report.prosody.checks;

  // Hold the explicit choice through smooth scrolling, including clamped destinations.
  // The next page scroll after settling resumes normal reading-position tracking.
  const settleNavigation = () => {
    if (navigationTimer.current !== null)
      window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => {
      navigationTarget.current = null;
      navigationTimer.current = null;
    }, 180);
  };

  useEffect(() => {
    const targets = lines
      .map((l) => document.getElementById(`pc-line-${l.line}`))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      if (navigationTarget.current !== null) return;
      let closest = targets[0]!;
      let distance = Infinity;
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        const next = Math.abs(
          rect.top + rect.height / 2 - window.innerHeight / 2,
        );
        if (next < distance) {
          closest = el;
          distance = next;
        }
      }
      setActive(Number(closest.dataset.line));
    };
    const onScroll = () => {
      if (navigationTarget.current !== null) {
        settleNavigation();
        return;
      }
      if (!frame) frame = requestAnimationFrame(sync);
    };
    const cancelNavigation = () => {
      navigationTarget.current = null;
      if (navigationTimer.current !== null)
        window.clearTimeout(navigationTimer.current);
      navigationTimer.current = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, button, select, [contenteditable]",
        )
      )
        return;
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        cancelNavigation();
    };
    const onResize = () => {
      cancelNavigation();
      onScroll();
    };
    frame = requestAnimationFrame(sync);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("wheel", cancelNavigation, { passive: true });
    window.addEventListener("touchmove", cancelNavigation, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      cancelNavigation();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", cancelNavigation);
      window.removeEventListener("touchmove", cancelNavigation);
      window.removeEventListener("keydown", onKey);
    };
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
    navigationTarget.current = line;
    setActive(line);
    settleNavigation();
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
          {COUNTS.map(({ status, label, icon }) => {
            const conditional =
              status === "fail" && report.genre.applicability !== "applicable";
            return (
              <li
                key={status}
                className={`pc-rail__count pc-finding--${status}`}
              >
                <span aria-hidden="true">{conditional ? "△" : icon}</span>{" "}
                {conditional ? "参考不符" : label}
                <strong>
                  {checks.filter((f) => f.status === status).length}
                </strong>
              </li>
            );
          })}
        </ul>
        {report.genre.applicability !== "applicable" &&
          checks.some((finding) => finding.status === "fail") && (
            <p className="pc-rail__scope">
              按参考格式逐项计数，不代表独立诗病数。
            </p>
          )}

        <p className="pc-rail__kicker" id="pc-rail-lines">
          诗句{stale ? "（上次分析）" : ""}
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
