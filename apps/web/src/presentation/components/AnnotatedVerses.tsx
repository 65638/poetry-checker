import type { LibraryWork, PoemPronunciation } from "@poetry/contracts";

export function AnnotatedVerses({
  work,
  pronunciation,
  showPinyin,
  selected,
  onSelect,
}: {
  work: LibraryWork;
  pronunciation: PoemPronunciation | null;
  showPinyin: boolean;
  selected: string;
  onSelect: (character: string) => void;
}) {
  const aligned = pronunciation?.id === work.id ? pronunciation : null;
  return (
    <div className="pc-library-verses" data-pinyin={showPinyin && !!aligned}>
      {work.paragraphs.map((line, i) => {
        let offset = 0;
        return (
          <p key={i}>
            {line.split(/(?<=[，。！？；])/u).map((phrase, part) => {
              const start = offset;
              offset += [...phrase].length;
              return (
                <span className="pc-library-phrase" key={part}>
                  {[...phrase].map((char, index) => {
                    const reading = aligned?.lines[i]?.[start + index];
                    return /\p{Script=Han}/u.test(char) ? (
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
                        {showPinyin && aligned ? (
                          <ruby>
                            {char}
                            <rt>{reading ?? "·"}</rt>
                          </ruby>
                        ) : (
                          char
                        )}
                      </button>
                    ) : (
                      <span key={index}>{char}</span>
                    );
                  })}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
