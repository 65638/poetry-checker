import { useEffect, useState } from "react";
import type { CharacterReference as Reference } from "@poetry/contracts";
import { loadCharacterReference } from "../api/library";

export function CharacterReference({
  character,
  onLookup,
}: {
  character: string;
  onLookup: (char: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Reference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setResult(null);
    setError(null);
    if (!open) return;
    const controller = new AbortController();
    void loadCharacterReference(character, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [character, open, retry]);
  return (
    <details
      className="pc-guangyun"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>广韵与现代读音参考</summary>
      {error ? (
        <p role="status">
          {error}{" "}
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            重试
          </button>
        </p>
      ) : !result ? (
        <p role="status">{open ? "查阅参考资料…" : ""}</p>
      ) : (
        <>
          <p className="pc-guangyun-readings">
            {character} · {result.readings.join(" / ") || "现代读音未载"}
          </p>
          <p className="pc-dictionary__notice">{result.notice}</p>
          <ul>
            {result.entries.map((entry, i) => (
              <li key={i}>
                <strong>{entry.fanqie ?? "反切未载"}</strong> · {entry.tone}声 ·{" "}
                {entry.rhyme}韵
                <p>
                  今音参考：{entry.pronunciation ?? "未逐条对应"} · 声母：
                  {entry.initial}
                </p>
                <p>
                  映射：{entry.pingshui} / 词林{entry.cilin}
                </p>
                {entry.note && <p>{entry.note}</p>}
              </li>
            ))}
          </ul>
          {!result.entries.length && (
            <p>原字未列广韵条目；现代读音不据此补造反切或古韵归属。</p>
          )}
          {!!result.relatedGlyphs.length && (
            <div className="pc-guangyun-related">
              关联字形：
              {result.relatedGlyphs.map((ch) => (
                <button
                  type="button"
                  key={ch}
                  onClick={() => onLookup(ch)}
                  title={`查阅「${ch}」`}
                >
                  {ch}
                </button>
              ))}
            </div>
          )}
          <p className="pc-dictionary__version">
            参考版本：{result.version} · 来源：韵典网广韵表 / pypinyin / Unihan
          </p>
        </>
      )}
    </details>
  );
}
