import type { LibraryWork, PoemPronunciation } from "@poetry/contracts";
import { useId, useState } from "react";

export function AnnotatedVerses({
  work,
  pronunciation,
  showPinyin,
  selected,
  onSelect,
  onExcerpt,
  excerptLine,
}: {
  work: LibraryWork;
  pronunciation: PoemPronunciation | null;
  showPinyin: boolean;
  selected: string;
  onSelect: (character: string) => void;
  onExcerpt?: (line: number) => void;
  excerptLine?: number;
}) {
  const aligned = pronunciation?.id === work.id ? pronunciation : null;
  const hintId = useId();
  const [focus, setFocus] = useState<{
    workId: string;
    lines: Record<number, number>;
  }>({ workId: work.id, lines: {} });
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
      {work.paragraphs.map((line, i) => {
        let offset = 0;
        const characters = [...line];
        const saved = focus.workId === work.id ? focus.lines[i] : undefined;
        const activeOffset =
          saved !== undefined && /\p{Script=Han}/u.test(characters[saved] ?? "")
            ? saved
            : characters.findIndex((character) =>
                /\p{Script=Han}/u.test(character),
              );
        return (
          <p key={i} className="pc-library-verse-row">
            {line.split(/(?<=[，。！？；])/u).map((phrase, part) => {
              const start = offset;
              offset += [...phrase].length;
              // Keep closing punctuation with its preceding glyph without
              // changing the original codepoint positions used by annotations.
              const units: {
                char: string;
                index: number;
                punctuation: string;
              }[] = [];
              [...phrase].forEach((char, index) => {
                const previous = units.at(-1);
                if (
                  previous &&
                  /\p{Pe}|\p{Pf}|[，。！？；、：,.!?;:]/u.test(char)
                )
                  previous.punctuation += char;
                else units.push({ char, index, punctuation: "" });
              });
              return (
                <span className="pc-library-phrase" key={part}>
                  {units.map(({ char, index, punctuation }) => {
                    const reading = aligned?.lines[i]?.[start + index];
                    return (
                      <span className="pc-library-syllable" key={index}>
                        {/\p{Script=Han}/u.test(char) ? (
                          <button
                            type="button"
                            className="pc-library-character"
                            key={index}
                            aria-label={`选字「${char}」`}
                            aria-pressed={selected === char}
                            tabIndex={start + index === activeOffset ? 0 : -1}
                            onFocus={() =>
                              setFocus((previous) => ({
                                workId: work.id,
                                lines: {
                                  ...(previous.workId === work.id
                                    ? previous.lines
                                    : {}),
                                  [i]: start + index,
                                },
                              }))
                            }
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
                          <span key={index}>{char}</span>
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
              );
            })}
            {onExcerpt && (
              <button
                type="button"
                className="pc-excerpt-copy"
                aria-label={`摘录第${i + 1}段诗句`}
                onClick={() => onExcerpt(i)}
              >
                {excerptLine === i ? "已摘" : "摘句"}
              </button>
            )}
          </p>
        );
      })}
    </div>
  );
}
