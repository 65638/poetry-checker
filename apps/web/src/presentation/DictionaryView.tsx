import { useEffect, useId, useRef, useState } from "react";
import type { BookId, LookupResult, ReadingCandidate } from "@poetry/contracts";
import { useMotionPreference } from "./useMotionPreference";
import { useBusyIndicator } from "./useBusyIndicator";

import type { DictionaryShelf, ShelfEntry } from "../app/dictionaryShelf";
import type { BookComparison } from "../app/dictionaryComparison";
import { passageRowStatus, type PassageLookup } from "../app/passageLookup";

const BOOKS: Array<{ id: BookId; name: string; note: string }> = [
  { id: "pingshui", name: "平水韵", note: "传统诗韵 · 106部" },
  { id: "cilin", name: "词林正韵", note: "传统词韵 · 19部" },
  { id: "xinyun", name: "中华新韵", note: "现代诗韵 · 14韵" },
];
const TONES: Record<ReadingCandidate["toneClass"], string> = {
  ping: "平声",
  shang: "上声",
  qu: "去声",
  ru: "入声",
  yinping: "阴平",
  yangping: "阳平",
  neutral: "轻声",
  ze_unspecified: "仄声（未分上去）",
};
const safeUrl = (url: string | null) =>
  url !== null && /^https?:\/\//iu.test(url) ? url : null;

const LANDSCAPES = [
  {
    name: "水月",
    caption: "一川月色，几处清音。",
    characters: ["月", "江", "水", "清", "流", "舟"],
  },
  {
    name: "山林",
    caption: "山色入笺，松声入韵。",
    characters: ["山", "松", "竹", "林", "深", "白"],
  },
  {
    name: "风雨",
    caption: "风过檐角，雨落诗间。",
    characters: ["风", "雨", "云", "夜", "更", "秋"],
  },
];

export interface DictionaryViewProps {
  text: string;
  book: BookId;
  character: string;
  busy: boolean;
  result: LookupResult | null;
  error: string | null;
  onTextChange: (text: string) => void;
  onBookChange: (book: BookId) => void;
  onLookup: () => void;
  onExample: (text: string) => void;
  passage: string;
  passageCharacters: string[];
  onPassageChange: (text: string) => void;
  canImportPoem: boolean;
  onImportPoem: () => void;
  shelf: DictionaryShelf;
  shelfFeedback: string | null;
  onExportShelf: () => void;
  onImportShelf: (file: File) => void;
  onOpenEntry: (entry: ShelfEntry) => void;
  onClearRecent: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
  feedback: string | null;
  onCopy: () => void;
  onCopyLink: () => void;
  passageOpen: boolean;
  onPassageToggle: (open: boolean) => void;
  comparisons: BookComparison[];
  comparing: boolean;
  onCompare: () => void;
  passageResult: PassageLookup | null;
  passageBusy: boolean;
  passageProgress: number;
  passageError: string | null;
  onLookupPassage: () => void;
}

export function DictionaryView(props: DictionaryViewProps) {
  const uid = useId();
  const [landscape, setLandscape] = useState(0);
  const composing = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const shelfInput = useRef<HTMLInputElement>(null);
  const folio = useRef<HTMLElement>(null);
  const revealFrom = useRef<number | null>(null);
  const motion = useMotionPreference();
  const { result, character, book, busy, error } = props;
  const showBusy = useBusyIndicator(busy);
  const showComparing = useBusyIndicator(props.comparing);
  const showPassageBusy = useBusyIndicator(props.passageBusy);
  const candidates = result?.entries.flatMap((entry) => entry.candidates) ?? [];
  const selectedBook = BOOKS.find(
    (item) => item.id === (error ? book : (result?.book ?? book)),
  )!;
  const revealAfter = (action: () => void) => {
    revealFrom.current = window.scrollY;
    action();
  };
  useEffect(() => {
    if (busy || showBusy || (!result && !error) || revealFrom.current === null)
      return;
    const startedAt = revealFrom.current;
    revealFrom.current = null;
    // A delayed request must not pull the reader back after they have moved on.
    if (
      !window.matchMedia("(max-width: 799px)").matches ||
      Math.abs(window.scrollY - startedAt) > 72
    )
      return;
    const target = folio.current;
    if (
      target &&
      target.getBoundingClientRect().top > window.innerHeight * 0.45
    )
      target.scrollIntoView({
        block: "start",
        behavior: motion.effects ? "smooth" : "instant",
      });
  }, [busy, showBusy, result, error, motion.effects]);
  return (
    <div
      className="pc-root pc-dictionary"
      data-motion={motion.effects ? "on" : "off"}
    >
      <div className="pc-dictionary__page">
        <header className="pc-dictionary__masthead">
          <div className="pc-dictionary__title">
            <span className="pc-seal" aria-hidden="true">
              韵
            </span>
            <div>
              <p className="pc-dictionary__eyebrow">月下听韵 / 贰</p>
              <h1>藏韵阁</h1>
              <p>翻一页韵书，寻一字来处。</p>
            </div>
          </div>
          <button
            type="button"
            className="pc-motion-toggle"
            aria-pressed={motion.effects}
            disabled={motion.systemReduced}
            onClick={motion.toggle}
          >
            动态效果：{motion.effects ? "开" : "关"}
          </button>
        </header>
        <main className="pc-dictionary__layout">
          <section
            className="pc-dictionary__desk pc-surface"
            aria-labelledby={`${uid}-search-title`}
          >
            <h2 id={`${uid}-search-title`}>依书寻字</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!composing.current && !busy) revealAfter(props.onLookup);
              }}
            >
              <div className="pc-dictionary__query">
                <label
                  className="pc-dictionary__label"
                  htmlFor={`${uid}-character`}
                >
                  要查的字
                </label>
                <div className="pc-dictionary__searchline">
                  <input
                    ref={searchInput}
                    id={`${uid}-character`}
                    className="pc-dictionary__input"
                    value={props.text}
                    onChange={(event) => {
                      revealFrom.current = null;
                      props.onTextChange(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (composing.current ||
                          event.nativeEvent.isComposing ||
                          event.nativeEvent.keyCode === 229)
                      )
                        event.preventDefault();
                    }}
                    placeholder="月"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby={`${uid}-hint`}
                    onCompositionStart={() => {
                      composing.current = true;
                    }}
                    onCompositionEnd={() => {
                      composing.current = false;
                    }}
                  />
                  <button
                    className="pc-button pc-button--primary"
                    type="submit"
                    disabled={busy || !props.text.trim()}
                    data-pending={busy}
                    data-busy-visible={showBusy}
                  >
                    {showBusy ? "查阅中…" : "查字"}
                  </button>
                </div>
                <p className="pc-dictionary__hint" id={`${uid}-hint`}>
                  每次查一个汉字，简繁、异体分别查。
                </p>
              </div>
              <fieldset className="pc-dictionary__books">
                <legend>选择韵书</legend>
                {BOOKS.map((item) => (
                  <label key={item.id} className="pc-dictionary__book">
                    <input
                      type="radio"
                      name={`${uid}-book`}
                      value={item.id}
                      checked={item.id === book}
                      onChange={() => props.onBookChange(item.id)}
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.note}</small>
                    </span>
                    <span aria-hidden="true">
                      {item.id === book ? "●" : "○"}
                    </span>
                  </label>
                ))}
              </fieldset>
            </form>
          </section>
          <section
            className="pc-dictionary__picker pc-surface"
            aria-label="选字书签"
          >
            <details
              className="pc-dictionary__passage"
              open={props.passageOpen}
              onToggle={(event) => {
                if (event.currentTarget.open !== props.passageOpen)
                  props.onPassageToggle(event.currentTarget.open);
              }}
            >
              <summary>
                带着诗句来查字 <span aria-hidden="true">＋</span>
              </summary>
              <div>
                <label htmlFor={`${uid}-passage`}>粘贴诗句，点选其中的字</label>
                <textarea
                  id={`${uid}-passage`}
                  rows={3}
                  value={props.passage}
                  onChange={(event) =>
                    props.onPassageChange(event.target.value)
                  }
                  placeholder="明月松间照，清泉石上流。"
                />
                <div className="pc-dictionary__character-list">
                  {props.passageCharacters.map((text) => (
                    <button
                      type="button"
                      key={text}
                      onClick={() => revealAfter(() => props.onExample(text))}
                      aria-label={`查「${text}」字`}
                      aria-pressed={text === character && !!result}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <button
                  className="pc-button pc-button--quiet"
                  type="button"
                  disabled={!props.canImportPoem}
                  onClick={props.onImportPoem}
                >
                  取校诗台当前诗句
                </button>
                <button
                  className="pc-button pc-button--quiet pc-dictionary__lookup-passage"
                  type="button"
                  disabled={
                    props.passageBusy || !props.passageCharacters.length
                  }
                  data-pending={props.passageBusy}
                  data-busy-visible={showPassageBusy}
                  onClick={props.onLookupPassage}
                >
                  {showPassageBusy
                    ? `逐字查阅 ${props.passageProgress}/${props.passageCharacters.length}`
                    : "逐字收录速览"}
                </button>
                <p>
                  {props.passageCharacters.length} 个不同的汉字 ·
                  逐字查阅，不作整诗判定
                </p>
                {props.passageError && <p role="alert">{props.passageError}</p>}
                {props.passageResult && (
                  <div
                    className="pc-dictionary__passage-result"
                    aria-label="逐字收录速览"
                  >
                    <p role="status">
                      已查 {props.passageResult.rows.length} 字 ·{" "}
                      {
                        props.passageResult.rows.filter(
                          (row) => passageRowStatus(row) === "backed",
                        ).length
                      }{" "}
                      字候选依据已核
                    </p>
                    <div className="pc-dictionary__overview-grid">
                      {props.passageResult.rows.map((row) => {
                        const status = passageRowStatus(row);
                        return (
                          <button
                            type="button"
                            key={row.character}
                            data-status={status}
                            onClick={() =>
                              revealAfter(() => props.onExample(row.character))
                            }
                            aria-label={`${row.character}：${status === "backed" ? "候选依据已核" : status === "needs_review" ? "候选待核" : status === "missing" ? "未收录" : "查询失败"}，点击查字`}
                          >
                            <span>{row.character}</span>
                            <small>
                              {status === "backed"
                                ? "已核"
                                : status === "needs_review"
                                  ? "待核"
                                  : status === "missing"
                                    ? "未录"
                                    : "失败"}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                    <p>
                      “已核”仅指本书候选有依据，不代表整诗合律或读音已选定。
                    </p>
                  </div>
                )}
              </div>
            </details>
            <section
              className="pc-dictionary__wordslips"
              aria-label="风物字签"
              hidden={props.passageOpen}
            >
              <div className="pc-dictionary__wordslips-head">
                <h3>风物字签</h3>
                <span>循景拾字</span>
              </div>
              <div
                className="pc-dictionary__landscapes"
                role="group"
                aria-label="选择字签风景"
              >
                {LANDSCAPES.map((item, index) => (
                  <button
                    type="button"
                    key={item.name}
                    aria-pressed={landscape === index}
                    onClick={() => setLandscape(index)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <p className="pc-dictionary__slip-caption">
                {LANDSCAPES[landscape]!.caption}
              </p>
              <div className="pc-dictionary__examples" key={landscape}>
                {LANDSCAPES[landscape]!.characters.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => revealAfter(() => props.onExample(text))}
                    aria-label={`查「${text}」字`}
                    aria-pressed={text === character && !!result}
                  >
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </section>
            <details className="pc-dictionary__shelf">
              <summary>
                我的字笺 <span>{props.shelf.favorites.length} 收藏</span>
              </summary>
              <div>
                <h3>收藏</h3>
                <div className="pc-dictionary__shelf-tools">
                  <button
                    type="button"
                    className="pc-button pc-button--quiet"
                    disabled={!props.shelf.favorites.length}
                    onClick={props.onExportShelf}
                  >
                    导出字笺
                  </button>
                  <button
                    type="button"
                    className="pc-button pc-button--quiet"
                    onClick={() => shelfInput.current?.click()}
                  >
                    导入字笺
                  </button>
                  <input
                    ref={shelfInput}
                    type="file"
                    hidden
                    accept=".json,application/json"
                    aria-label="选择字笺文件"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) props.onImportShelf(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
                <p>收藏只存在此浏览器地址；换地址前可导出字笺。</p>
                {props.shelfFeedback && (
                  <p className="pc-dictionary__shelf-feedback" role="status">
                    {props.shelfFeedback}
                  </p>
                )}
                {props.shelf.favorites.length ? (
                  <div className="pc-dictionary__shelf-list">
                    {props.shelf.favorites.map((entry) => (
                      <button
                        type="button"
                        key={`${entry.book}:${entry.character}`}
                        onClick={() =>
                          revealAfter(() => props.onOpenEntry(entry))
                        }
                      >
                        {entry.character}
                        <small>
                          {BOOKS.find((b) => b.id === entry.book)?.name}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>查字后，可将条目收进字笺。</p>
                )}
                <div className="pc-dictionary__recent-head">
                  <h3>最近查过</h3>
                  <button
                    type="button"
                    onClick={props.onClearRecent}
                    disabled={!props.shelf.recent.length}
                  >
                    清空记录
                  </button>
                </div>
                <div className="pc-dictionary__shelf-list">
                  {props.shelf.recent.map((entry) => (
                    <button
                      type="button"
                      key={`${entry.book}:${entry.character}`}
                      onClick={() =>
                        revealAfter(() => props.onOpenEntry(entry))
                      }
                    >
                      {entry.character}
                      <small>
                        {BOOKS.find((b) => b.id === entry.book)?.name}
                      </small>
                    </button>
                  ))}
                </div>
                <p>仅保存在此设备；重新打开时会查询当前数据。</p>
              </div>
            </details>
          </section>
          <section
            className="pc-dictionary__folio pc-surface"
            ref={folio}
            aria-label="查字结果"
            aria-busy={busy}
            data-loading={showBusy}
            data-empty={!result && !error}
          >
            <div className="pc-dictionary__folio-head">
              <span>韵 书 小 笺</span>
              <span>{selectedBook.name}</span>
              <button
                type="button"
                className="pc-dictionary__return"
                onClick={() => {
                  revealFrom.current = null;
                  searchInput.current?.scrollIntoView({
                    block: "center",
                    behavior: motion.effects ? "smooth" : "instant",
                  });
                  searchInput.current?.focus({ preventScroll: true });
                }}
              >
                返回查字 ↑
              </button>
            </div>
            <span
              className="pc-dictionary__bookmark"
              data-collected={props.favorite && !!result}
              aria-hidden="true"
            >
              {props.favorite && result ? "已藏" : "韵笺"}
            </span>
            <div
              className="pc-dictionary__status"
              role="status"
              aria-live="polite"
            >
              {showBusy
                ? "正在查阅韵书…"
                : error
                  ? "本次查阅未完成"
                  : result
                    ? candidates.length
                      ? `「${character}」在${selectedBook.name}中有${candidates.length}个候选。`
                      : `当前韵书未收录「${character}」。`
                    : ""}
            </div>
            {error ? (
              <div className="pc-dictionary__error" role="alert">
                <h2>暂未查到结果</h2>
                <p>{error}</p>
                <button
                  type="button"
                  className="pc-button pc-button--quiet"
                  onClick={props.onLookup}
                >
                  重新查字
                </button>
              </div>
            ) : result ? (
              <div
                className="pc-dictionary__result"
                key={`${result.book}:${character}`}
              >
                <div className="pc-dictionary__entry">
                  <span className="pc-dictionary__glyph">{character}</span>
                  <div>
                    <p className="pc-dictionary__kicker">
                      {selectedBook.name} · {candidates.length} 个候选
                    </p>
                    <h2>{candidates.length ? "循音见韵" : "本书未收录"}</h2>
                    <p>
                      {result.book === "xinyun"
                        ? "按普通话读音归韵，项目重建表。"
                        : "依本书古音声类，保留全部竞争候选。"}
                    </p>
                  </div>
                </div>
                <div className="pc-dictionary__actions" inert={busy}>
                  <button
                    type="button"
                    className="pc-button pc-button--quiet"
                    aria-pressed={props.favorite}
                    onClick={props.onToggleFavorite}
                  >
                    {props.favorite ? "已收藏 · 移出" : "＋ 收藏字笺"}
                  </button>
                  <button
                    type="button"
                    className="pc-button pc-button--quiet"
                    onClick={props.onCopy}
                  >
                    复制条目
                  </button>
                  <button
                    type="button"
                    className="pc-button pc-button--quiet"
                    onClick={props.onCopyLink}
                  >
                    复制链接
                  </button>
                  <button
                    type="button"
                    className="pc-button pc-button--quiet pc-dictionary__compare-button"
                    disabled={props.comparing}
                    data-pending={props.comparing}
                    data-busy-visible={showComparing}
                    onClick={props.onCompare}
                  >
                    {showComparing ? "对照中…" : "三书对照"}
                  </button>
                </div>
                <div
                  className="pc-dictionary__reveal"
                  data-open={!!props.comparisons.length}
                  inert={!props.comparisons.length || busy}
                  aria-hidden={!props.comparisons.length}
                >
                  <div>
                    <section
                      className="pc-dictionary__comparison"
                      aria-label="三书对照"
                    >
                      <h3>同一字，三书对照</h3>
                      <p>只对照各书收录，不把古音与普通话混作一套。</p>
                      <div className="pc-dictionary__comparison-rows">
                        {props.comparisons.map((row) => (
                          <div
                            className="pc-dictionary__comparison-row"
                            key={row.book}
                          >
                            <button
                              type="button"
                              onClick={() => props.onBookChange(row.book)}
                            >
                              {BOOKS.find((item) => item.id === row.book)?.name}{" "}
                              ↗
                            </button>
                            {row.result === null ? (
                              <p role="status">{row.error}</p>
                            ) : (
                              <div>
                                {row.result.entries
                                  .flatMap((entry) => entry.candidates)
                                  .map((candidate) => (
                                    <span key={candidate.id}>
                                      {TONES[candidate.toneClass]} ·{" "}
                                      {candidate.groupIds
                                        .map(
                                          (id) =>
                                            row.result.groups.find(
                                              (group) => group.id === id,
                                            )?.name ?? "未载韵部",
                                        )
                                        .join("、")}{" "}
                                      <small>
                                        {candidate.evidenceIds.some((id) =>
                                          row.result.evidence.some(
                                            (item) =>
                                              item.id === id &&
                                              item.reviewStatus === "approved",
                                          ),
                                        )
                                          ? "已核"
                                          : "待核"}
                                      </small>
                                    </span>
                                  ))}
                                {!row.result.entries.some(
                                  (entry) => entry.candidates.length,
                                ) && <span>本书未收录</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
                {candidates.length ? (
                  <>
                    <p className="pc-dictionary__notice">
                      条目供查阅。标为“待核”的候选尚不能支撑确定分析；查字不会替你选择诗中读音。
                    </p>
                    <ol className="pc-dictionary__candidates">
                      {candidates.map((candidate, index) => {
                        const evidence = candidate.evidenceIds.map((id) =>
                          result.evidence.find((item) => item.id === id),
                        );
                        const approved = evidence.some(
                          (item) => item?.reviewStatus === "approved",
                        );
                        return (
                          <li
                            key={candidate.id}
                            className="pc-dictionary__candidate"
                          >
                            <header>
                              <span className="pc-dictionary__candidate-no">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <h3>{TONES[candidate.toneClass]}</h3>
                              <span
                                className="pc-dictionary__badge"
                                data-approved={approved}
                              >
                                {approved ? "归部已核" : "待核"}
                              </span>
                            </header>
                            <dl className="pc-dictionary__facts">
                              <div>
                                <dt>候选平仄</dt>
                                <dd
                                  className="pc-dictionary__tone"
                                  data-tone={candidate.tone}
                                >
                                  {candidate.tone === "P"
                                    ? "平 ○"
                                    : candidate.tone === "Z"
                                      ? "仄 ●"
                                      : "未定"}
                                </dd>
                              </div>
                              <div>
                                <dt>韵部</dt>
                                <dd>
                                  {candidate.groupIds
                                    .map(
                                      (id) =>
                                        result.groups.find(
                                          (group) => group.id === id,
                                        )?.name ?? "韵部名称未载",
                                    )
                                    .join("、") || "未载"}
                                </dd>
                              </div>
                              <div>
                                <dt>现代读音</dt>
                                <dd>
                                  {candidate.modernReading
                                    ? `${candidate.modernReading.pinyin} · ${candidate.modernReading.toneNumber}声`
                                    : "本条未载"}
                                </dd>
                              </div>
                              <div>
                                <dt>反切</dt>
                                <dd>{candidate.fanqie?.text ?? "本条未载"}</dd>
                              </div>
                            </dl>
                            {candidate.gloss && (
                              <p className="pc-dictionary__gloss">
                                {candidate.gloss}
                              </p>
                            )}
                            <details className="pc-dictionary__source">
                              <summary>
                                查阅依据与出处{" "}
                                <span aria-hidden="true">＋</span>
                              </summary>
                              <div>
                                {evidence.length ? (
                                  evidence.map((item, i) => {
                                    if (!item)
                                      return (
                                        <p key={candidate.evidenceIds[i]}>
                                          本条证据未装载。
                                        </p>
                                      );
                                    const source = result.sources.find(
                                      (s) => s.id === item.sourceId,
                                    );
                                    const url = source
                                      ? safeUrl(source.url)
                                      : null;
                                    return (
                                      <div
                                        className="pc-dictionary__evidence"
                                        key={item.id}
                                      >
                                        <p className="pc-dictionary__evidence-title">
                                          {source?.title ?? "来源信息未载"}
                                          <span>
                                            {item.reviewStatus === "approved"
                                              ? "已核证据"
                                              : "未审核证据"}
                                          </span>
                                        </p>
                                        <p>{item.assertion}</p>
                                        <p>定位：{item.locator}</p>
                                        {item.excerpt && (
                                          <blockquote>
                                            {item.excerpt}
                                          </blockquote>
                                        )}
                                        {source?.edition && (
                                          <p>版本：{source.edition}</p>
                                        )}
                                        {source && (
                                          <p>许可登记：{source.license}</p>
                                        )}
                                        {url && (
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            打开原始来源 ↗
                                          </a>
                                        )}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <p>本条未提供证据。</p>
                                )}
                              </div>
                            </details>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                ) : (
                  <p className="pc-dictionary__notice">
                    当前字形没有收录记录。可另查繁体或异体，系统不会自动合并。
                  </p>
                )}
                <p className="pc-dictionary__version">
                  数据版本：{result.dataVersion}
                </p>
              </div>
            ) : (
              <div className="pc-dictionary__empty">
                <span className="pc-dictionary__empty-glyph" aria-hidden="true">
                  韵
                </span>
                <h2>字里有山河</h2>
                <p>
                  写下一个字，
                  <br />
                  看看它在韵书里的位置。
                </p>
                <span className="pc-dictionary__empty-mark" aria-hidden="true">
                  一字一笺 · 有据可寻
                </span>
              </div>
            )}
            <p className="pc-dictionary__feedback" role="status">
              {props.feedback}
            </p>
            <div className="pc-dictionary__folio-foot" aria-hidden="true">
              <span>月色入卷</span>
              <span>声韵留痕</span>
            </div>
          </section>
        </main>
        <footer className="pc-dictionary__footer">
          查字与校诗共用韵书。收录记录、审核状态与诗中读音分别呈现。
        </footer>
      </div>
    </div>
  );
}
