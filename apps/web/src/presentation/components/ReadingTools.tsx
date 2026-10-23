import { useEffect, useId, useRef, useState } from "react";
import { useMotionPreference } from "../useMotionPreference";

/** Keep scroll updates inside this small tool; the poem never rerenders on scroll. */
export function ReadingTools({ place }: { place: string }) {
  const host = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const preferencesId = useId();
  const [expanded, setExpanded] = useState(false);
  const [quiet, setQuiet] = useState(() => {
    try {
      return localStorage.getItem("poetry-reading-quiet") === "true";
    } catch {
      return false;
    }
  });
  const [size, setSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("poetry-reading-size"));
      return [0, 1, 2].includes(saved) ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [progress, setProgress] = useState(0);
  const [showReturn, setShowReturn] = useState(false);
  const motion = useMotionPreference();
  useEffect(() => setExpanded(false), [place]);
  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !host.current?.contains(event.target)
      ) {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [expanded]);
  useEffect(() => {
    const root = host.current?.closest<HTMLElement>(".pc-workspace");
    if (root) root.dataset.readingSize = String(size);
    try {
      localStorage.setItem("poetry-reading-size", String(size));
    } catch {
      /* Preference remains usable this session. */
    }
  }, [size]);
  useEffect(() => {
    const root = host.current?.closest<HTMLElement>(".pc-workspace");
    root?.style.setProperty("--pc-reading-shade", quiet ? ".32" : "0");
    try {
      localStorage.setItem("poetry-reading-quiet", String(quiet));
    } catch {
      /* Session-only preference. */
    }
    return () => {
      root?.style.removeProperty("--pc-reading-shade");
    };
  }, [quiet]);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const range = document.documentElement.scrollHeight - innerHeight;
      setProgress(
        range > 0
          ? Math.round(Math.max(0, Math.min(1, scrollY / range)) * 100)
          : 0,
      );
      setShowReturn(scrollY > 480);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [place]);
  return (
    <aside
      ref={host}
      className="pc-reading-tools"
      aria-label="阅读小笺"
      data-expanded={expanded}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          setExpanded(false);
          toggle.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setExpanded(false);
        }
      }}
    >
      <span className="pc-reading-tools__caption">灯下静读 · 卷中有景</span>
      <button
        ref={toggle}
        type="button"
        className="pc-reading-tools__toggle"
        aria-label="阅读设置"
        aria-expanded={expanded}
        aria-controls={preferencesId}
        onClick={() => setExpanded((open) => !open)}
      >
        <span aria-hidden="true">Aa</span>
        阅读
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <div id={preferencesId} className="pc-reading-tools__preferences">
        <button
          type="button"
          className="pc-reading-light"
          aria-label={`诗文字号：${["标准", "较大", "大字"][size]}，点击切换`}
          title="调整诗文、研读回答、收藏与推敲笺字号"
          onClick={() => setSize((size + 1) % 3)}
        >
          字号 · {["标准", "较大", "大字"][size]}
        </button>
        <button
          type="button"
          className="pc-reading-light"
          aria-pressed={quiet}
          onClick={() => setQuiet(!quiet)}
          title="调暗景物，让诗文更醒目"
        >
          <span aria-hidden="true">◐</span>
          {quiet ? "还景" : "静读"}
        </button>
      </div>
      <button
        type="button"
        className="pc-page-return"
        hidden={!showReturn}
        title={`页面已读 ${progress}%，回到页首`}
        aria-label="回到页首"
        onClick={() => {
          window.scrollTo({
            top: 0,
            behavior: motion.effects ? "smooth" : "instant",
          });
          document
            .querySelector<HTMLElement>(`#${place}-space`)
            ?.focus({ preventScroll: true });
        }}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="13" className="pc-progress-track" />
          <circle
            cx="16"
            cy="16"
            r="13"
            pathLength="100"
            strokeDasharray={`${progress} 100`}
            className="pc-progress-ink"
          />
        </svg>
        <span aria-hidden="true">↑</span>
      </button>
    </aside>
  );
}
