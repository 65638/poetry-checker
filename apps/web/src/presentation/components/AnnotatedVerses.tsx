import type { LibraryWork, PoemPronunciation } from "@poetry/contracts";
import { memo, useId, useMemo, useState } from "react";

type VerseProps = {
  work: LibraryWork;
  pronunciation: PoemPronunciation | null;
  showPinyin: boolean;
  selected: string;
  onSelect: (character: string) => void;
  onExcerpt?: (line: number) => void;
  excerptLine?: number;
  onAskLine?: (paragraphIndex: number) => void;
  askDisabled?: boolean;
};

export function AnnotatedVerses({
  work,
  pronunciation,
  showPinyin,
  selected,
  onSelect,
  onExcerpt,
  excerptLine,
  onAskLine,
  askDisabled = false,
}: VerseProps) {
  const aligned = pronunciation?.id === work.id ? pronunciation : null;
  const hintId = useId();
  return (
    <div
      className="pc-library-verses"
      data-pinyin={showPinyin}
      role="group"
      aria-label="原诗逐字阅读"
      aria-describedby={hintId}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
          return;
        const target = event.target as HTMLElement;
        if (!target.matches(".pc-library-character")) return;
        const row = target.closest(".pc-library-verse-row");
        const letters = Array.from(
          row?.querySelectorAll<HTMLButtonElement>(".pc-library-character") ??
            [],
        );
        const index = letters.indexOf(target as HTMLButtonElement);
        const next =
          event.key === "ArrowRight"
            ? Math.min(index + 1, letters.length - 1)
            : event.key === "ArrowLeft"
              ? Math.max(index - 1, 0)
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? letters.length - 1
                  : null;
        if (next === null) return;
        event.preventDefault();
        letters[next]?.focus();
      }}
    >
      <span className="pc-library-reading-hint" id={hintId}>
        点选诗字，可查其音韵。键盘可用左右方向键移字，Enter 选字。
      </span>
      {work.paragraphs.map((line, i) => (
        <VerseLine
          key={`${work.id}:${i}`}
          line={line}
          lineNumber={i}
          readings={aligned?.lines[i]}
          aligned={aligned !== null}
          showPinyin={showPinyin}
          selected={selected}
          onSelect={onSelect}
          onExcerpt={onExcerpt}
          excerpted={excerptLine === i}
          onAskLine={onAskLine}
          askDisabled={askDisabled}
        />
      ))}
    </div>
  );
}

// A keyboard move updates this paragraph only, not every glyph in a long work.
const VerseLine = memo(function VerseLine({
  line,
  lineNumber,
  readings,
  aligned,
  showPinyin,
  selected,
  onSelect,
  onExcerpt,
  excerpted,
  onAskLine,
  askDisabled,
}: {
  line: string;
  lineNumber: number;
  readings: PoemPronunciation["lines"][number] | undefined;
  aligned: boolean;
  showPinyin: boolean;
  selected: string;
  onSelect: VerseProps["onSelect"];
  onExcerpt: VerseProps["onExcerpt"];
  excerpted: boolean;
  onAskLine: VerseProps["onAskLine"];
  askDisabled: boolean;
}) {
  const [focusedOffset, setFocusedOffset] = useState<number | null>(null);
  const { characters, phrases, firstOffset } = useMemo(() => {
    const characters = [...line];
    let offset = 0;
    const phrases = line.split(/(?<=[，。！？；])/u).map((phrase) => {
      const start = offset;
      offset += [...phrase].length;
      const units: { char: string; index: number; punctuation: string }[] = [];
      // Closing punctuation stays with its glyph. Offsets remain codepoints
      // from the original text, including punctuation and supplementary Han.
      [...phrase].forEach((char, index) => {
        const previous = units.at(-1);
        if (previous && /\p{Pe}|\p{Pf}|[，。！？；、：,.!?;:]/u.test(char))
          previous.punctuation += char;
        else units.push({ char, index, punctuation: "" });
      });
      return { start, units };
    });
    return {
      characters,
      phrases,
      firstOffset: characters.findIndex((char) => /\p{Script=Han}/u.test(char)),
    };
  }, [line]);
  const activeOffset =
    focusedOffset !== null &&
    /\p{Script=Han}/u.test(characters[focusedOffset] ?? "")
      ? focusedOffset
      : firstOffset;
  return (
    <p className="pc-library-verse-row" data-ask-line={!!onAskLine}>
      <span className="pc-verse-text">
        {phrases.map(({ start, units }, part) => (
          <span className="pc-library-phrase" key={part}>
            {units.map(({ char, index, punctuation }) => {
              const reading = readings?.[start + index];
              return (
                <span className="pc-library-syllable" key={index}>
                  {/\p{Script=Han}/u.test(char) ? (
                    <button
                      type="button"
                      className="pc-library-character"
                      aria-label={`选字「${char}」`}
                      aria-pressed={selected === char}
                      tabIndex={start + index === activeOffset ? 0 : -1}
                      onFocus={() => setFocusedOffset(start + index)}
                      title={
                        showPinyin && aligned
                          ? (reading ?? "本字未提供注音")
                          : undefined
                      }
                      onClick={() => onSelect(char)}
                    >
                      {showPinyin ? (
                        <ruby>
                          {char}
                          <rt>{aligned ? (reading ?? "·") : "\u00a0"}</rt>
                        </ruby>
                      ) : (
                        char
                      )}
                    </button>
                  ) : (
                    <span>{char}</span>
                  )}
                  {punctuation && (
                    <span className="pc-library-punctuation">
                      {punctuation}
                    </span>
                  )}
                </span>
              );
            })}
          </span>
        ))}
      </span>
      {onAskLine ? (
        <span
          className="pc-verse-actions"
          role="group"
          aria-label={`第${lineNumber + 1}段操作`}
        >
          {onExcerpt && (
            <button
              type="button"
              className="pc-excerpt-copy"
              aria-label={`摘录第${lineNumber + 1}段诗句`}
              onClick={() => onExcerpt(lineNumber)}
            >
              {excerpted ? "已摘" : "摘句"}
            </button>
          )}
          <button
            type="button"
            className="pc-verse-ask"
            aria-label={`询问第${lineNumber + 1}段诗句`}
            disabled={askDisabled}
            onClick={() => onAskLine(lineNumber)}
          >
            问这段
          </button>
        </span>
      ) : onExcerpt ? (
        <button
          type="button"
          className="pc-excerpt-copy"
          aria-label={`摘录第${lineNumber + 1}段诗句`}
          onClick={() => onExcerpt(lineNumber)}
        >
          {excerpted ? "已摘" : "摘句"}
        </button>
      ) : null}
    </p>
  );
});
