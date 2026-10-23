import type { LibraryWork, PoetryAssistantRequest } from "@poetry/contracts";
import { readingSections } from "./library";

type ComparisonInput = Extract<PoetryAssistantRequest, { task: "compare" }>;
type ComparisonSource = NonNullable<ComparisonInput["scope"]>["left"];

export function comparisonPassages(work: LibraryWork): LibraryWork[] {
  // Short poems keep their complete text; long works use the proven section splitter.
  return work.paragraphs.join("\n").length <= 2000
    ? [work]
    : readingSections(work);
}

export function comparisonSourceLabel(source: ComparisonSource): string {
  return `《${source.title}》 · ${source.parts === 1 ? "全文" : `选段${source.part}/${source.parts}`}`;
}

export function comparisonInput(
  left: LibraryWork,
  right: LibraryWork,
  leftPart: number | null,
  rightPart: number | null,
): ComparisonInput | null {
  const leftParts = comparisonPassages(left);
  const rightParts = comparisonPassages(right);
  const li = leftParts.length === 1 ? 0 : leftPart;
  const ri = rightParts.length === 1 ? 0 : rightPart;
  if (li === null || ri === null || !leftParts[li] || !rightParts[ri])
    return null;
  return {
    task: "compare",
    left: leftParts[li].paragraphs.join("\n"),
    right: rightParts[ri].paragraphs.join("\n"),
    ...(leftParts.length > 1 || rightParts.length > 1
      ? {
          scope: {
            left: { title: left.title, part: li + 1, parts: leftParts.length },
            right: {
              title: right.title,
              part: ri + 1,
              parts: rightParts.length,
            },
          },
        }
      : {}),
  };
}
