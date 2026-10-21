import type { LibraryWork, PoemPronunciation } from "@poetry/contracts";

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
  return (
    <div className="pc-library-verses" data-pinyin={showPinyin}>
      <span className="pc-library-reading-hint">点选诗字，可查其音韵</span>
      {work.paragraphs.map((line, i) => {
        let offset = 0;
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
