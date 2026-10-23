import type { AnnotatedPoem } from "@poetry/contracts";
import { readingExplanation } from "./readingLabels";

/** Read-only progress, intentionally independent of the report and its export actions. */
export function PreliminaryReadings({ poem }: { poem: AnnotatedPoem }) {
  const tokens = new Map(poem.tokens.map((token) => [token.tokenId, token]));
  const known = poem.tokens.filter((token) => token.tone !== null).length;
  return (
    <div
      className="pc-preliminary-readings"
      role="group"
      aria-label="本地读音初览"
    >
      <p>
        先读原诗 · 本地已查得 {known} / {poem.tokens.length} 字的平仄
      </p>
      <p>AI 仍在结合全诗核对，以下读音可能调整；完成后再给出格律结论。</p>
      <div
        className="pc-preliminary-readings__poem"
        role="region"
        aria-label="本地初步平仄诗文"
        tabIndex={0}
      >
        {poem.lines.map((line) => (
          <p
            key={line.line}
            role="group"
            aria-label={`第${line.line}句：${line.text}`}
          >
            {line.tokenIds.map((id) => {
              const token = tokens.get(id);
              if (!token) return null;
              const tone =
                token.tone === "P" ? "平" : token.tone === "Z" ? "仄" : "待辨";
              return (
                <span
                  key={id}
                  title={readingExplanation(token)}
                  data-tone={token.tone ?? "unknown"}
                >
                  <span>{token.text}</span>
                  <small>{tone}</small>
                </span>
              );
            })}
          </p>
        ))}
      </div>
    </div>
  );
}
