import { X, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useBusyIndicator } from "../useBusyIndicator";

export function StudioTabs<T extends string>({
  tabs,
  current,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  current: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="pc-studio-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={current === tab.id}
          tabIndex={current === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % tabs.length
                : event.key === "ArrowLeft"
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            onChange(tabs[next]!.id);
            (
              event.currentTarget.parentElement?.children[
                next
              ] as HTMLButtonElement
            )?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
export function StudioTaskState({
  busy,
  error,
  cancel,
  retry,
  cancelled = false,
  result,
}: {
  busy: boolean;
  error: string | null;
  cancel: () => void;
  retry?: () => void;
  cancelled?: boolean;
  result?: unknown;
}) {
  const visible = useBusyIndicator(busy);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [busy]);
  return (
    <>
      {!!result && (busy || !!error || cancelled) && (
        <p className="pc-studio-meta">上次研读结果仍在，新结果返回后更新。</p>
      )}
      {visible && (
        <div className="pc-studio-status" role="status">
          <LoaderCircle
            size={17}
            className={busy ? "pc-studio-spin" : undefined}
            aria-hidden="true"
          />{" "}
          <span>
            {busy
              ? seconds >= 25
                ? "还在研读，可先继续看诗"
                : "正在研读…"
              : "研读已结束"}
          </span>{" "}
          {busy && <small aria-hidden="true">{seconds} 秒</small>}
          <button
            type="button"
            className="pc-studio-icon"
            aria-label="取消请求"
            title="取消请求"
            onClick={cancel}
            disabled={!busy}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {(error || cancelled) && !busy && (
        <div
          className={error ? "pc-studio-error" : "pc-studio-notice"}
          role={error ? "alert" : "status"}
        >
          <p>{error || "已停止本次研读，诗文仍保留。"}</p>
          {retry && (
            <button type="button" className="pc-studio-action" onClick={retry}>
              {cancelled ? "重新研读" : "重试本次研读"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
