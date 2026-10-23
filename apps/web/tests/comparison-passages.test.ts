import { describe, expect, it } from "vitest";
import {
  PoetryAssistantRequestSchema,
  type LibraryWork,
} from "@poetry/contracts";
import {
  comparisonInput,
  comparisonPassages,
  comparisonSourceLabel,
} from "../src/app/comparisonPassages";
import { canKeepStudyAnswer } from "../src/app/studyContinuity";
const short: LibraryWork = {
  id: "short",
  title: "短作",
  author: "测试",
  dynasty: "",
  paragraphs: ["白日依山尽，黄河入海流。"],
  source: "测试",
  sourceUrl: null,
  tags: [],
};
const long: LibraryWork = {
  ...short,
  id: "long",
  title: "长篇测试",
  paragraphs: Array.from(
    { length: 100 },
    (_, i) => `${i}山水相映，${"𠀀".repeat(12)}！！`,
  ),
};
describe("explicit long-work comparison scopes", () => {
  it("keeps short texts whole and does not silently choose a long-work excerpt", () => {
    expect(comparisonPassages(short)).toEqual([short]);
    expect(comparisonInput(long, short, null, null)).toBeNull();
    expect(comparisonInput(long, short, -1, null)).toBeNull();
    expect(comparisonInput(long, short, 999, null)).toBeNull();
    expect(comparisonInput(short, short, null, null)?.scope).toBeUndefined();
  });
  it("selects exactly the chosen original section within request limits and preserves characters", () => {
    const parts = comparisonPassages(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((part) => part.paragraphs).join("")).toBe(
      long.paragraphs.join(""),
    );
    const input = comparisonInput(long, short, 1, null)!;
    expect(PoetryAssistantRequestSchema.safeParse(input).success).toBe(true);
    expect(input.left).toBe(parts[1]!.paragraphs.join("\n"));
    expect(input.right).toBe(short.paragraphs.join("\n"));
    expect(input.scope!.left).toEqual({
      title: long.title,
      part: 2,
      parts: parts.length,
    });
    expect(comparisonSourceLabel(input.scope!.left)).toContain(
      `选段2/${parts.length}`,
    );
    for (const part of parts) {
      expect(part.paragraphs.join("\n").length).toBeLessThanOrEqual(2000);
      expect(() =>
        encodeURIComponent(part.paragraphs.join("\n")),
      ).not.toThrow();
    }
  });
  it("isolates answers even when equal text came from a differently labeled scope", () => {
    const input = comparisonInput(long, short, 1, null)!;
    expect(
      canKeepStudyAnswer(input, { ...input, question: "描写有什么不同？" }),
    ).toBe(true);
    expect(
      canKeepStudyAnswer(input, {
        ...input,
        scope: { ...input.scope!, left: { ...input.scope!.left, part: 1 } },
      }),
    ).toBe(false);
    expect(
      PoetryAssistantRequestSchema.safeParse({
        ...input,
        scope: { ...input.scope!, left: { title: "长篇", part: 3, parts: 2 } },
      }).success,
    ).toBe(false);
  });
});
