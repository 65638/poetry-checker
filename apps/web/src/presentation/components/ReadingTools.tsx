import { useEffect, useRef, useState } from "react";
import { useMotionPreference } from "../useMotionPreference";

/** Keep scroll updates inside this small tool; the poem never rerenders on scroll. */
export function ReadingTools({ place }: { place: string }) {
  const host = useRef<HTMLElement>(null);
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
    <aside ref={host} className="pc-reading-tools" aria-label="阅读小笺">
      <span className="pc-reading-tools__caption">灯下静读 · 卷中有景</span>
      <button
        type="button"
        className="pc-reading-light"
        aria-label={`诗文字号：${["标准", "较大", "大字"][size]}，点击切换`}
        title="调整原诗、对读与推敲笺字号"
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
