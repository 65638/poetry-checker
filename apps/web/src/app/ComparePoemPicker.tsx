import { useEffect, useMemo, useState } from "react";
import type { LibraryWork } from "@poetry/contracts";
import { searchLibrary } from "./library";
import "./compare-picker-search.css";

const label = (work: LibraryWork) =>
  `${work.title} · ${work.author || "作者未载"}${work.sourceUrl ? ` · ${new URL(work.sourceUrl).hostname}` : ""}`;
export function ComparePoemPicker({
  works,
  selected,
  otherSelected,
  side,
  favorites,
  onSelect,
}: {
  works: LibraryWork[];
  selected: string;
  otherSelected: string;
  side: "left" | "right";
  favorites: string[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [recent, setRecent] = useState([selected]);
  useEffect(
    () =>
      setRecent((previous) =>
        [selected, ...previous.filter((id) => id !== selected)].slice(0, 5),
      ),
    [selected],
  );
  const name = side === "left" ? "左卷" : "右卷";
  const matches = useMemo(() => {
    const ids = new Set(favorites);
    return searchLibrary(works, query)
      .map((hit) => hit.work)
      .filter((work) => !onlyFavorites || ids.has(work.id));
  }, [works, query, favorites, onlyFavorites]);
  const visible = matches.slice(0, 80);
  const pinned = works.filter(
    (work) =>
      [selected, otherSelected, ...recent].includes(work.id) &&
      !visible.some((row) => row.id === work.id),
  );
  return (
    <div className="pc-compare-picker">
      <span>
        <b aria-hidden="true">{side === "left" ? "壹" : "贰"}</b>
        {name}
        <small>选一首诗</small>
      </span>
      <label className="pc-compare-search">
        <span>检索{name}</span>
        <input
          type="search"
          aria-label={`检索${name}诗作`}
          value={query}
          placeholder="题名、作者或诗句"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label className="pc-compare-favorites">
        <input
          type="checkbox"
          checked={onlyFavorites}
          onChange={(event) => setOnlyFavorites(event.target.checked)}
        />
        只看收藏
      </label>
      <select
        aria-label={`选择${name}诗作`}
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
      >
        {!!pinned.length && (
          <optgroup label="当前及最近所选">
            {pinned.map((work) => (
              <option key={work.id} value={work.id}>
                {label(work)}
              </option>
            ))}
          </optgroup>
        )}
        {visible.map((work) => (
          <option key={work.id} value={work.id}>
            {label(work)}
          </option>
        ))}
      </select>
      <p className="pc-compare-match-count" role="status">
        {matches.length
          ? `匹配 ${matches.length} 首${matches.length > 80 ? "，先列出80首；输入更具体的词可缩小范围。" : "。"}`
          : "没有匹配的诗作，当前所选仍保留。"}
      </p>
    </div>
  );
}
