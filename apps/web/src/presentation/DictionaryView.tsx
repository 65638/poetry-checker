import { useId, useRef } from "react";
import type { BookId, LookupResult, ReadingCandidate } from "@poetry/contracts";
import { useMotionPreference } from "./useMotionPreference";
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

function GardenScene() {
  return (
    <div className="pc-garden" aria-hidden="true">
      <div className="pc-garden__mist" />
      <svg
        className="pc-garden__landscape"
        viewBox="0 0 1440 1000"
        preserveAspectRatio="xMidYMid slice"
      >
        <circle cx="1060" cy="230" r="46" fill="#ede9cf" opacity=".9" />
        <path
          d="M0 530 80 440 140 465 220 320 270 350 330 305 425 450 490 420 560 475 640 430 730 485 825 380 900 430 980 325 1050 400 1100 355 1210 480 1300 420 1440 490V1000H0Z"
          fill="#31545a"
        />
        <path
          d="M0 645 120 550 175 575 240 510 340 600 430 540 550 625 670 550 740 585 860 500 950 570 1060 515 1130 580 1260 480 1380 570 1440 545V1000H0Z"
          fill="#203e45"
        />
        <path
          d="M0 790Q200 660 440 760T900 745T1440 720V1000H0Z"
          fill="#132d35"
        />
        <g fill="none" stroke="#9bafa0" opacity=".35">
          <path d="M700 865h240m-200 13h330m-220 14h160" />
        </g>
        <g fill="#10252b" stroke="#10252b">
          <path
            d="M1280 1000V90m0 150 100-65m-100 160-130-70m130 200 140-70m-140 200-130-60"
            strokeWidth="8"
            fill="none"
          />
          <path
            d="m1380 175-62-2 38-24-6-44 30 33 30-20-9 42 39 21Zm-230 90 55-12-32-19 7-37-34 27-35-15 14 33-42 18Zm270 130-65-7 31-23-5-44 39 36 27-22-8 47 37 17Zm-270 130 54-17-27-16 1-37-31 24-32-17 9 34-33 19Z"
            stroke="none"
          />
        </g>
      </svg>
      <div className="pc-garden__frame" />
      <span className="pc-garden__inscription">
        穿廊寻字
        <br />
        隔水听音
      </span>
    </div>
  );
}

export function DictionaryView(props: DictionaryViewProps) {
  const uid = useId();
  const composing = useRef(false);
  const motion = useMotionPreference();
  const { result, character, book, busy, error } = props;
  const candidates = result?.entries.flatMap((entry) => entry.candidates) ?? [];
  const selectedBook = BOOKS.find((item) => item.id === book)!;
  return (
    <div
      className="pc-root pc-dictionary"
      data-motion={motion.effects ? "on" : "off"}
    >
      <GardenScene />
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
            <p className="pc-dictionary__kicker">依书寻字</p>
            <h2 id={`${uid}-search-title`}>一字，几重声韵。</h2>
            <p className="pc-dictionary__guide">查平仄，辨韵部，循出处。</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!composing.current) props.onLookup();
              }}
            >
              <label
                className="pc-dictionary__label"
                htmlFor={`${uid}-character`}
              >
                要查的字
              </label>
              <div className="pc-dictionary__searchline">
                <input
                  id={`${uid}-character`}
                  className="pc-dictionary__input"
                  value={props.text}
                  onChange={(event) => props.onTextChange(event.target.value)}
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
                >
                  {busy ? "查阅中…" : "查字"}
                </button>
              </div>
              <p className="pc-dictionary__hint" id={`${uid}-hint`}>
                每次查一个汉字，简繁、异体分别查。
              </p>
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
            <div className="pc-dictionary__examples">
              <span>随手翻阅</span>
              {["月", "山", "更", "白"].map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => props.onExample(text)}
                  aria-label={`查「${text}」字`}
                >
                  {text}
                </button>
              ))}
            </div>
            <p className="pc-dictionary__aside">
              传统韵书看古音，新韵依普通话。
              <br />
              同一个字，也可能有不同的归处。
            </p>
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
                  onClick={props.onLookupPassage}
                >
                  {props.passageBusy
                    ? `逐字查阅 ${props.passageProgress}/${props.passageCharacters.length}`
                    : "逐字收录速览"}
                </button>
                <p>
                  {props.passageCharacters.length} 个不同的汉字 ·
                  逐字查阅，不作整诗判定
                </p>
                <div className="pc-dictionary__character-list">
                  {props.passageCharacters.map((text) => (
                    <button
                      type="button"
                      key={text}
                      onClick={() => props.onExample(text)}
                      aria-label={`查「${text}」字`}
                      aria-pressed={text === character && !!result}
                    >
                      {text}
                    </button>
                  ))}
                </div>
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
                            onClick={() => props.onExample(row.character)}
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
            <details className="pc-dictionary__shelf">
              <summary>
                我的字笺 <span>{props.shelf.favorites.length} 收藏</span>
              </summary>
              <div>
                <h3>收藏</h3>
                {props.shelf.favorites.length ? (
                  <div className="pc-dictionary__shelf-list">
                    {props.shelf.favorites.map((entry) => (
                      <button
                        type="button"
                        key={`${entry.book}:${entry.character}`}
                        onClick={() => props.onOpenEntry(entry)}
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
                      onClick={() => props.onOpenEntry(entry)}
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
            aria-label="查字结果"
            aria-busy={busy}
          >
            <div className="pc-dictionary__folio-head">
              <span>韵 书 小 笺</span>
              <span>{selectedBook.name}</span>
            </div>
            <div
              className="pc-dictionary__status"
              role="status"
              aria-live="polite"
            >
              {busy
                ? "正在查阅韵书…"
                : result
                  ? candidates.length
                    ? `「${character}」在${selectedBook.name}中有${candidates.length}个候选。`
                    : `当前韵书未收录「${character}」。`
                  : ""}
            </div>
            {props.feedback && (
              <p className="pc-dictionary__feedback" role="status">
                {props.feedback}
              </p>
            )}
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
              <>
                <div className="pc-dictionary__entry">
                  <span className="pc-dictionary__glyph">{character}</span>
                  <div>
                    <p className="pc-dictionary__kicker">
                      {selectedBook.name} · {candidates.length} 个候选
                    </p>
                    <h2>{candidates.length ? "循音见韵" : "本书未收录"}</h2>
                    <p>
                      {book === "xinyun"
                        ? "按普通话读音归韵，项目重建表。"
                        : "依本书古音声类，保留全部竞争候选。"}
                    </p>
                  </div>
                </div>
                <div className="pc-dictionary__actions">
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
                    onClick={props.onCompare}
                  >
                    {props.comparing ? "对照中…" : "三书对照"}
                  </button>
                </div>
                {!!props.comparisons.length && (
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
                )}
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
                                <dd>
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
              </>
            ) : (
              <div className="pc-dictionary__empty">
                <span className="pc-dictionary__empty-glyph" aria-hidden="true">
                  韵
                </span>
                <h2>字里有山河</h2>
                <p>
                  从左侧写下一个字，
                  <br />
                  看看它在韵书里的位置。
                </p>
                <span className="pc-dictionary__empty-mark" aria-hidden="true">
                  一字一笺 · 有据可寻
                </span>
              </div>
            )}
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
