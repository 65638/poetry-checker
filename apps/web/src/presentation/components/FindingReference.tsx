import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { Finding } from "@poetry/contracts";

/** A top-layer note keeps the explanation beside its mark, even at sheet edges. */
export function FindingReference({
  finding,
  number,
  rule,
  onFollow,
  open,
  onOpenChange,
  conditional = false,
}: {
  finding: Finding;
  number: number;
  rule: string;
  onFollow: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conditional?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setOpen = onOpenChange;
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const reveal = () => {
    if (dwell.current) clearTimeout(dwell.current);
    dwell.current = null;
    cancelClose();
    setOpen(true);
    onFollow();
  };
  const leave = () => {
    if (dwell.current) clearTimeout(dwell.current);
    dwell.current = null;
    cancelClose();
    timer.current = setTimeout(() => {
      if (
        !trigger.current?.matches(":focus") &&
        !note.current?.matches(":focus-within")
      )
        changeRef.current(false);
    }, 160);
  };
  useEffect(
    () => () => {
      cancelClose();
      if (dwell.current) clearTimeout(dwell.current);
    },
    [finding],
  );
  useLayoutEffect(() => {
    if (!open || !note.current || !trigger.current) return;
    const panel = note.current;
    panel.showPopover?.();
    const position = () => {
      const anchor = trigger.current!.getBoundingClientRect();
      const marks =
        trigger
          .current!.closest(".pc-cell__references")
          ?.getBoundingClientRect() ?? anchor;
      const bounds = panel.getBoundingClientRect();
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
        changeRef.current(false);
        return;
      }
      const left = Math.max(
        12,
        Math.min(
          anchor.left + anchor.width / 2 - bounds.width / 2,
          window.innerWidth - bounds.width - 12,
        ),
      );
      const below = marks.bottom + 8;
      const top =
        below + bounds.height <= window.innerHeight - 12
          ? below
          : Math.max(12, marks.top - bounds.height - 8);
      panel.style.left = left + "px";
      panel.style.top = top + "px";
    };
    position();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    const dismiss = (event: PointerEvent) => {
      if (
        !panel.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        changeRef.current(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (panel.contains(document.activeElement))
        trigger.current?.focus({ preventScroll: true });
      changeRef.current(false);
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      panel.hidePopover?.();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const tone = (values: string[]) =>
    values
      .map((value) => (value === "P" ? "平" : value === "Z" ? "仄" : value))
      .join(" / ") || "无记录";
  return (
    <span
      className={`pc-reference${conditional ? " pc-reference--conditional" : ""}`}
      onMouseEnter={() => {
        cancelClose();
        if (dwell.current) clearTimeout(dwell.current);
        dwell.current = setTimeout(reveal, 800);
      }}
      onMouseLeave={leave}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`pc-cell__reference pc-finding--${finding.status}`}
        aria-label={`查看批注 ${number}：${finding.message}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={reveal}
        onClick={reveal}
      >
        {number}
      </button>
      {open && (
        <div
          ref={note}
          id={id}
          popover="manual"
          role="tooltip"
          aria-label={`批注 ${number}：${rule}`}
          className={`pc-reference__note pc-finding--${finding.status}`}
          onMouseEnter={cancelClose}
          onMouseLeave={leave}
        >
          <strong className="pc-reference__title">
            {number} · {rule}
          </strong>
          <p>{finding.message}</p>
          <dl className="pc-finding__compare">
            <div>
              <dt>应为</dt>
              <dd>{tone(finding.expected)}</dd>
            </div>
            <div>
              <dt>实际</dt>
              <dd>{tone(finding.observed)}</dd>
            </div>
          </dl>
        </div>
      )}
    </span>
  );
}
