// apps/web/src/presentation/components/InputPanel.tsx
import { useId, useRef, useState } from "react";
import type { BookId } from "@poetry/contracts";
import type { CheckerViewProps, InputDraft } from "../../view-contract";
import "../styles/input.css";

const BOOKS: Array<{ id: BookId; label: string; hint: string }> = [
  {
    id: "pingshui",
    label: "平水韵",
    hint: "传统诗韵，通行定义分 106 部；入声字归仄。",
  },
  {
    id: "cilin",
    label: "词林正韵",
    hint: "传统词韵，通行定义分 19 部；入声字归仄。本工具不检查词牌格律。",
  },
  {
    id: "xinyun",
    label: "中华新韵",
    hint: "现代诗韵，通行定义分 14 部；按普通话声调，一、二声为平，三、四声为仄，结论可能与传统韵书不同。",
  },
];

type InputPanelProps = Pick<
  CheckerViewProps,
  | "draft"
  | "busy"
  | "examples"
  | "onDraftChange"
  | "onAnalyze"
  | "onLoadExample"
> & { compact?: boolean; showBusy?: boolean };

export function InputPanel(props: InputPanelProps) {
  const {
    draft,
    busy,
    examples,
    onDraftChange,
    onAnalyze,
    onLoadExample,
    compact = false,
    showBusy = busy,
  } = props;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hideSettings = compact && !settingsOpen;
  const uid = useId();
  const composingRef = useRef(false);
  const [composeValue, setComposeValue] = useState<string | null>(null);

  const emit = (patch: Partial<InputDraft>) =>
    onDraftChange({ ...draft, ...patch });
  const isEmpty = draft.text.trim() === "";
  const canAnalyze = !busy && composeValue === null && !isEmpty;
  const visibleText = composeValue ?? draft.text;
  const hanCount = (visibleText.match(/\p{Script=Han}/gu) ?? []).length;
  const phraseCount = visibleText
    .split(/[，。！？；\n]+/u)
    .filter((line) => /\p{Script=Han}/u.test(line)).length;
  const activeBook = BOOKS.find((b) => b.id === draft.rhymeBook);

  const analyze = () => {
    if (canAnalyze) onAnalyze();
  };

  return (
    <form
      className={`pc-input${compact ? " pc-input--compact" : ""}${compact && settingsOpen ? " pc-input--settings" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        analyze();
      }}
    >
      <button
        type="button"
        className="pc-input__settings"
        hidden={!compact}
        inert={!compact}
        aria-hidden={!compact}
        aria-expanded={!hideSettings}
        aria-controls={`${uid}-examples-box ${uid}-books`}
        onClick={() => setSettingsOpen((open) => !open)}
      >
        <span>{activeBook?.label} · 示例与说明</span>
        <span aria-hidden="true">{hideSettings ? "+" : "−"}</span>
      </button>
      {examples.length > 0 && (
        <div
          className="pc-examples"
          id={`${uid}-examples-box`}
          hidden={hideSettings}
          inert={hideSettings}
          aria-hidden={hideSettings}
        >
          <p id={`${uid}-examples`} className="pc-input__label">
            示例
          </p>
          <ul className="pc-examples__list" aria-labelledby={`${uid}-examples`}>
            {examples.map((ex) => {
              const pending = ex.text.trim() === "";
              return (
                <li key={ex.id}>
                  <button
                    type="button"
                    className="pc-button pc-button--quiet pc-examples__item"
                    disabled={pending}
                    onClick={() => onLoadExample(ex.id)}
                  >
                    {ex.title}
                    {pending && (
                      <span className="pc-examples__pending">待核对</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <label className="pc-input__label" htmlFor={`${uid}-text`}>
        诗文
      </label>
      <textarea
        id={`${uid}-text`}
        className="pc-input__text"
        rows={4}
        spellCheck={false}
        placeholder="每行一句，可直接粘贴整首诗"
        aria-describedby={`${uid}-text-hint`}
        value={composeValue ?? draft.text}
        onChange={(e) => {
          if (composingRef.current) setComposeValue(e.target.value);
          else emit({ text: e.target.value });
        }}
        onCompositionStart={(e) => {
          composingRef.current = true;
          setComposeValue(e.currentTarget.value);
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          setComposeValue(null);
          emit({ text: e.currentTarget.value });
        }}
        onKeyDown={(e) => {
          if (
            (e.ctrlKey || e.metaKey) &&
            e.key === "Enter" &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            analyze();
          }
        }}
      />
      <div className="pc-input__measure" role="group" aria-label="诗文字数">
        <span>
          {hanCount ? `${hanCount} 字 · ${phraseCount} 句` : "落笔成诗"}
        </span>
        <kbd title="Mac 可用 Command + Enter">Ctrl ↵ 分析</kbd>
      </div>
      <p
        id={`${uid}-text-hint`}
        className="pc-input__hint pc-input__hint--keys"
        hidden={compact}
      >
        Ctrl + Enter 也可开始分析。
      </p>

      <fieldset
        className="pc-input__books"
        id={`${uid}-books`}
        aria-describedby={`${uid}-book-hint`}
      >
        <legend className="pc-input__label" hidden={hideSettings}>
          韵书
        </legend>
        <div className="pc-segmented">
          {BOOKS.map((book) => (
            <label key={book.id} className="pc-segmented__option">
              <input
                type="radio"
                className="pc-segmented__radio"
                name={`${uid}-book`}
                value={book.id}
                checked={draft.rhymeBook === book.id}
                onChange={() => emit({ rhymeBook: book.id })}
              />
              <span className="pc-segmented__face">{book.label}</span>
            </label>
          ))}
        </div>
        <p
          id={`${uid}-book-hint`}
          className="pc-input__hint"
          hidden={hideSettings}
        >
          {activeBook?.hint}
        </p>
      </fieldset>

      <button
        type="submit"
        className="pc-button pc-button--primary pc-input__submit"
        disabled={!canAnalyze}
        aria-describedby={isEmpty ? `${uid}-empty-hint` : undefined}
      >
        {showBusy ? "分析中…" : "分析"}
      </button>
      {isEmpty && (
        <p id={`${uid}-empty-hint`} className="pc-input__hint">
          请先输入诗文。
        </p>
      )}
    </form>
  );
}
