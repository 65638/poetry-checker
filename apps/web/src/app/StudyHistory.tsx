import type { PoetryAssistantRequest } from "@poetry/contracts";
import type { PoetryTaskRecord } from "../hooks/usePoetryTask";
import "./study-history.css";

export function StudyHistory({
  entries,
  current,
  busy,
  onRestore,
}: {
  entries: PoetryTaskRecord[];
  current: PoetryAssistantRequest | null;
  busy: boolean;
  onRestore: (key: string) => void;
}) {
  if (entries.length < 2) return null;
  const currentKey = current ? JSON.stringify(current) : null;
  return (
    <details className="pc-study-history">
      <summary>回看本次研读 · {entries.length} 条</summary>
      <p>保留这首诗、当前侧重下最近 6 条回答；刷新前可收藏留存。</p>
      {busy && <p>选择旧回答会停止当前等待。</p>}
      <ul>
        {[...entries].reverse().map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              aria-pressed={!busy && currentKey === entry.key}
              onClick={() => onRestore(entry.key)}
            >
              {entry.input.task === "critique"
                ? (entry.input.question ?? "通篇观照")
                : "研读结果"}
              {!busy && currentKey === entry.key && <small>当前显示</small>}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
