import type { LibraryWork } from "@poetry/contracts";
import { useMemo } from "react";
import { comparisonPassages } from "./comparisonPassages";
import "./comparison-scope.css";

export function ComparisonScope({
  work,
  side,
  selected,
  onSelect,
}: {
  work: LibraryWork;
  side: "left" | "right";
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const parts = useMemo(() => comparisonPassages(work), [work]);
  if (parts.length === 1) return null;
  const current = selected === null ? null : parts[selected];
  const label = side === "left" ? "左卷" : "右卷";
  return (
    <div className="pc-comparison-scope">
      <label>
        {label} AI 对读范围
        <select
          aria-label={`${label}对读选段`}
          value={current ? selected! : ""}
          onChange={(event) =>
            onSelect(
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        >
          <option value="">请选择本次要比较的选段</option>
          {parts.map((part, index) => (
            <option value={index} key={index}>
              选段{index + 1}/{parts.length} ·{" "}
              {[...part.paragraphs.join("")].slice(0, 18).join("")}…
            </option>
          ))}
        </select>
      </label>
      <p>原作较长，AI 只比较所选文字；下方仍可阅读全文。换段不会自动发送。</p>
      {current && (
        <details open key={`${work.id}:${selected}`}>
          <summary>
            本次选段原文 · {current.paragraphs.join("\n").length} 字符
          </summary>
          <blockquote
            tabIndex={0}
            role="region"
            aria-label={`${label}本次选段原文`}
          >
            {current.paragraphs.join("\n")}
          </blockquote>
        </details>
      )}
    </div>
  );
}
