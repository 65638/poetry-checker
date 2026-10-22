import type { AnnotatedPoem, Revision } from "@poetry/contracts";
import { applyRevisions } from "./notebook";

const characterCount = (text: string) =>
  [...text].filter((character) => /\p{Script=Han}|〇/u.test(character)).length;

/** Preview and adoption share the same spans, including earlier accepted edits of different lengths. */
export function planRevision(
  poem: AnnotatedPoem,
  currentText: string,
  previous: Revision[],
  edit: Revision,
) {
  if (applyRevisions(poem.originalText, previous, poem.tokens) !== currentText)
    throw new Error("当前稿已手动改动，请重新评议后试读这条建议。");
  const edits = [
    ...previous.filter(
      (row) =>
        row.startTokenId !== edit.startTokenId ||
        row.endTokenId !== edit.endTokenId,
    ),
    edit,
  ];
  const text = applyRevisions(poem.originalText, edits, poem.tokens);
  const target = poem.tokens.find(
    (token) => token.tokenId === edit.startTokenId,
  )!;
  const lineTokens = poem.tokens.filter((token) => token.line === target.line);
  const first = lineTokens[0]!,
    last = lineTokens.at(-1)!;
  const tokenMap = new Map(poem.tokens.map((token) => [token.tokenId, token]));
  function lineText(value: string, changes: Revision[]) {
    const shift = (boundary: number) =>
      changes.reduce((sum, row) => {
        const end = tokenMap.get(row.endTokenId)!;
        return (
          sum +
          (end.endUtf16 <= boundary
            ? row.replacement.length - row.original.length
            : 0)
        );
      }, 0);
    return value.slice(
      first.startUtf16 + shift(first.startUtf16),
      last.endUtf16 + shift(last.endUtf16),
    );
  }
  const beforeLine = lineText(currentText, previous);
  const afterLine = lineText(text, edits);
  return {
    text,
    edits,
    line: target.line,
    beforeLine,
    afterLine,
    beforeCount: characterCount(beforeLine),
    afterCount: characterCount(afterLine),
  };
}
