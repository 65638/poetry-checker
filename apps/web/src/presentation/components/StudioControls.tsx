import { X, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useBusyIndicator } from "../useBusyIndicator";
import type { PoetryAssistantRequest } from "@poetry/contracts";
import {
  TaskRequestPreview,
  taskWaitLabel,
} from "../../app/TaskRequestPreview";

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
  pendingInput,
  retryLabel,
  cancelledMessage,
}: {
  busy: boolean;
  error: string | null;
  cancel: () => void;
  retry?: () => void;
  cancelled?: boolean;
  result?: unknown;
  pendingInput?: PoetryAssistantRequest | null;
  retryLabel?: string;
  cancelledMessage?: string;
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
        <p className="pc-studio-meta">
          {busy
            ? "上次研读结果仍在，完成本次研读后更新。"
            : cancelled
              ? "本次已停止，下面保留上次研读结果。"
              : "本次未完成，下面保留上次研读结果。"}
        </p>
      )}
      {visible && (busy || (!error && !cancelled)) && (
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
                : taskWaitLabel(pendingInput)
              : "研读已结束"}
          </span>{" "}
          {busy && <small aria-hidden="true">{seconds} 秒</small>}
          <button
            type="button"
            className="pc-studio-icon pc-studio-cancel"
            aria-label="取消请求"
            title="取消请求"
            onClick={cancel}
            disabled={!busy}
          >
            <X size={17} aria-hidden="true" />
            <span>停止等待</span>
          </button>
        </div>
      )}
      {visible && busy && pendingInput && (
        <TaskRequestPreview input={pendingInput} />
      )}
      {(error || cancelled) && !busy && (
        <div
          className={error ? "pc-studio-error" : "pc-studio-notice"}
          role={error ? "alert" : "status"}
        >
          <p>{error || cancelledMessage || "已停止本次研读，诗文仍保留。"}</p>
          {retry && (
            <button type="button" className="pc-studio-action" onClick={retry}>
              {retryLabel || (cancelled ? "重新研读" : "重试本次研读")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
