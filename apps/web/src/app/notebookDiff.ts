export interface ChangedLine {
  kind: "same" | "added" | "removed";
  text: string;
}

/** Align whole lines, so inserting a stanza doesn't mark every following line changed. */
export function notebookChanges(before: string, after: string): ChangedLine[] {
  const a = before ? before.split(/\r?\n/u) : [];
  const b = after ? after.split(/\r?\n/u) : [];
  // Imported drafts can consist of thousands of blank lines. Bound the comparison work.
  if (a.length * b.length > 160_000)
    return [
      ...a.map((text) => ({ kind: "removed" as const, text })),
      ...b.map((text) => ({ kind: "added" as const, text })),
    ];
  const width = b.length + 1;
  const lengths = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? 1 + lengths[(i + 1) * width + j + 1]!
          : Math.max(
              lengths[(i + 1) * width + j]!,
              lengths[i * width + j + 1]!,
            );
    }
  }
  const rows: ChangedLine[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i++]! });
      j++;
    } else if (
      i < a.length &&
      (j === b.length ||
        lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)
    )
      rows.push({ kind: "removed", text: a[i++]! });
    else rows.push({ kind: "added", text: b[j++]! });
  }
  return rows;
}
