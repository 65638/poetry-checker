import type { FormId, TemplateCandidate, Tone } from "@poetry/contracts";

type LineType = TemplateCandidate["lineTypes"][number];
export interface TemplateDefinition {
  id: string;
  formId: FormId;
  width: 5 | 7;
  lineCount: 4 | 8;
  start: "ping" | "ze";
  firstLineRhymes: boolean;
  lineTypes: LineType[];
  canonicalTones: Tone[][];
  expectedTones: Tone[][][];
  requiredRhymeLines: number[];
}

const base: Record<5 | 7, Record<LineType, string>> = {
  5: { A: "ZZPPZ", B: "PPZZP", C: "PPPZZ", D: "ZZZPP" },
  7: { A: "PPZZPPZ", B: "ZZPPZZP", C: "ZZPPPZZ", D: "PPZZZPP" },
};
const forms: Record<FormId, { width: 5 | 7; lineCount: 4 | 8 }> = {
  wujue: { width: 5, lineCount: 4 },
  qijue: { width: 7, lineCount: 4 },
  wulv: { width: 5, lineCount: 8 },
  qilv: { width: 7, lineCount: 8 },
};
const sequences: Array<{ types: LineType[]; firstLineRhymes: boolean }> = [
  { types: ["A", "B", "C", "D", "A", "B", "C", "D"], firstLineRhymes: false },
  { types: ["D", "B", "C", "D", "A", "B", "C", "D"], firstLineRhymes: true },
  { types: ["C", "D", "A", "B", "C", "D", "A", "B"], firstLineRhymes: false },
  { types: ["B", "D", "A", "B", "C", "D", "A", "B"], firstLineRhymes: true },
];

// 这里仅表达基础允许集合；孤平、尾式和救法必须由完整判定另行约束。
function allowed(width: 5 | 7, type: LineType): Tone[][] {
  const result = [...base[width][type]].map((tone) => [tone as Tone]);
  const tail = width - 5;
  const flexible = new Set([0, tail]);
  if (type !== "D") flexible.add(tail + 2);
  for (const index of flexible) result[index] = ["P", "Z"];
  return result;
}

export function getTemplates(
  formHint: FormId | "auto" = "auto",
): TemplateDefinition[] {
  const selected =
    formHint === "auto" ? (Object.keys(forms) as FormId[]) : [formHint];
  return selected.flatMap((formId) => {
    const { width, lineCount } = forms[formId];
    return sequences.map(({ types, firstLineRhymes }) => {
      const lineTypes = types.slice(0, lineCount);
      const canonicalTones = lineTypes.map(
        (type) => [...base[width][type]] as Tone[],
      );
      const start = canonicalTones[0]?.[1] === "P" ? "ping" : "ze";
      return {
        id: `${formId}-${start}-${firstLineRhymes ? "rhymed" : "unrhymed"}`,
        formId,
        width,
        lineCount,
        start,
        firstLineRhymes,
        lineTypes,
        canonicalTones,
        expectedTones: lineTypes.map((type) => allowed(width, type)),
        requiredRhymeLines: Array.from(
          { length: lineCount },
          (_, i) => i + 1,
        ).filter((line) => line % 2 === 0 || (line === 1 && firstLineRhymes)),
      };
    });
  });
}
