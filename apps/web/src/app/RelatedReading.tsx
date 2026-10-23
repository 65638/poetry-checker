import { useMemo, useState } from "react";
import type { LibraryWork } from "@poetry/contracts";
import { relatedReadings } from "./relatedReadings";
import "./related-reading.css";

export function RelatedReading({
  selected,
  works,
  favorites,
  onRead,
  onCompare,
  onFavorite,
}: {
  selected: LibraryWork;
  works: LibraryWork[];
  favorites: string[];
  onRead: (work: LibraryWork) => void;
  onCompare: (work: LibraryWork) => void;
  onFavorite: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"words" | "author">("words");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [page, setPage] = useState(0);
  const hits = useMemo(
    () =>
      expanded
        ? relatedReadings(
            selected,
            works,
            mode,
            onlyFavorites ? new Set(favorites) : undefined,
          )
        : [],
    [expanded, selected, works, mode, onlyFavorites, favorites],
  );
  const visiblePage = Math.min(
    page,
    Math.max(0, Math.ceil(hits.length / 6) - 1),
  );
  return (
    <details
      className="pc-related-reading"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>同题串读 · 沿着诗意再读几首</summary>
      <p>
        从当前诗库按正文共现词或作者找作品。这里展示串读线索，诗意是否相近，可展开原诗细读。
      </p>
      <div className="pc-related-reading__controls">
        <label>
          串读线索
          <select
            aria-label="串读线索"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as "words" | "author");
              setPage(0);
            }}
          >
            <option value="words">共现词句</option>
            <option value="author">同一作者</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlyFavorites}
            onChange={(event) => {
              setOnlyFavorites(event.target.checked);
              setPage(0);
            }}
          />
          只看已收藏
        </label>
      </div>
      {!hits.length && (
        <p className="pc-related-reading__empty">
          {onlyFavorites
            ? "收藏里暂未找到相符作品，可取消收藏筛选。"
            : mode === "author"
              ? "当前诗库没有可确认属于同一作者的其他诗作。"
              : "暂未找到有共同词句线索的作品，可以换用同一作者。"}
        </p>
      )}
      <ul className="pc-related-reading__list">
        {hits.slice(visiblePage * 6, visiblePage * 6 + 6).map((hit) => (
          <li key={hit.work.id} data-work-id={hit.work.id}>
            <h4>{hit.work.title}</h4>
            <p>
              {hit.work.dynasty || "朝代未载"} · {hit.work.author || "作者未载"}
            </p>
            <blockquote
              role="region"
              tabIndex={0}
              aria-label={`《${hit.work.title}》原句`}
            >
              {hit.excerpt}
            </blockquote>
            <p className="pc-related-reading__reason">
              {mode === "author"
                ? `同为${selected.author}的作品`
                : `两诗正文都出现：${hit.terms.map((term) => `“${term}”`).join("、")}`}
            </p>
            <div className="pc-related-reading__actions">
              <button type="button" onClick={() => onRead(hit.work)}>
                读原诗
              </button>
              <button type="button" onClick={() => onCompare(hit.work)}>
                与本诗对读
              </button>
              <button
                type="button"
                aria-label={`收藏《${hit.work.title}》`}
                aria-pressed={favorites.includes(hit.work.id)}
                onClick={() => onFavorite(hit.work.id)}
              >
                {favorites.includes(hit.work.id) ? "已收藏" : "收藏"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!!hits.length && (
        <div
          className="pc-related-reading__pages"
          role="group"
          aria-label="串读分页"
        >
          <button
            type="button"
            disabled={visiblePage === 0}
            onClick={() => setPage(visiblePage - 1)}
          >
            上一组
          </button>
          <span role="status">
            第 {visiblePage + 1} / {Math.ceil(hits.length / 6)} 组 · 最多展示 24
            首
          </span>
          <button
            type="button"
            disabled={(visiblePage + 1) * 6 >= hits.length}
            onClick={() => setPage(visiblePage + 1)}
          >
            下一组
          </button>
        </div>
      )}
      <small>
        串读检索在本机完成；打开原诗、收藏和进入对读都不会自动请求 AI。
      </small>
    </details>
  );
}
