import { X, LoaderCircle } from "lucide-react";
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
}: {
  busy: boolean;
  error: string | null;
  cancel: () => void;
}) {
  const visible = useBusyIndicator(busy);
  return (
    <>
      {visible && (
        <div className="pc-studio-status" role="status">
          <LoaderCircle
            size={17}
            className={busy ? "pc-studio-spin" : undefined}
            aria-hidden="true"
          />{" "}
          {busy ? "正在研读…" : "研读已结束"}{" "}
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
      {error && (
        <p className="pc-studio-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
