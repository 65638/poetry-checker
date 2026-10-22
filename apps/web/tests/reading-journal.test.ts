import { describe, expect, it } from "vitest";
import {
  parseReadingJournal,
  poemText,
  recordReading,
} from "../src/app/readingJournal";
import { notebookChanges } from "../src/app/notebookDiff";
import { BUILTIN_WORKS } from "../src/app/library";

describe("reading continuity and notebook comparison", () => {
  it("recovers a corrupt journal without losing access to the catalogue", () => {
    expect(parseReadingJournal("{broken")).toEqual([]);
    expect(parseReadingJournal('{"entries":[]}')).toEqual([]);
    expect(
      parseReadingJournal(
        JSON.stringify([
          null,
          { id: "bad", at: "no-date" },
          { id: "good", at: "2026-10-23T00:00:00Z" },
          { id: "good", at: "2026-10-22T00:00:00Z" },
        ]),
      ),
    ).toEqual([{ id: "good", at: "2026-10-23T00:00:00Z" }]);
  });
  it("moves reread works to the front, bounds history and keeps distinct editions", () => {
    let visits = [] as ReturnType<typeof recordReading>;
    for (let i = 0; i < 20; i++) visits = recordReading(visits, `work-${i}`);
    visits = recordReading(visits, "work-10");
    expect(visits).toHaveLength(12);
    expect(visits[0]!.id).toBe("work-10");
    expect(new Set(visits.map((v) => v.id)).size).toBe(12);
    expect(recordReading(visits, "work-10-edition-2")[1]!.id).toBe("work-10");
  });
  it("shares the complete original poem and its source without analysis internals", () => {
    const work = {
      ...BUILTIN_WORKS[0]!,
      paragraphs: ["𠀀山明月。", "江上孤舟。"],
    };
    const text = poemText(work);
    expect(text).toContain(`《${work.title}》`);
    expect(text).toContain(work.paragraphs.join("\n"));
    expect(text).toContain(`来源：${work.source}`);
    expect(text).not.toMatch(/inputHash|readingOverrides|needs_review/u);
  });
  it("aligns inserted lines rather than treating the rest of a poem as rewritten", () => {
    expect(
      notebookChanges("山高\n水长\n月明", "山高\n风起\n水长\n月明"),
    ).toEqual([
      { kind: "same", text: "山高" },
      { kind: "added", text: "风起" },
      { kind: "same", text: "水长" },
      { kind: "same", text: "月明" },
    ]);
  });
  it("preserves original and revised text, including empty lines and supplementary Han", () => {
    for (const [before, after] of [
      ["𠀀山\n\n明月", "群山\n\n明月"],
      ["", "新稿"],
      ["旧稿", ""],
      ["甲\n乙\n甲", "乙\n甲\n丙"],
      ["甲\n".repeat(450), "乙\n".repeat(450)],
    ]) {
      const rows = notebookChanges(before!, after!);
      expect(
        rows
          .filter((r) => r.kind !== "added")
          .map((r) => r.text)
          .join("\n"),
      ).toBe(before);
      expect(
        rows
          .filter((r) => r.kind !== "removed")
          .map((r) => r.text)
          .join("\n"),
      ).toBe(after);
    }
  });
});
