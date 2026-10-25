import type {
  PoetryAssistantRequest,
  ReadingCandidate,
} from "@poetry/contracts";
import { formatModernReading } from "./readingLabels";

type RhymeInput = Extract<PoetryAssistantRequest, { task: "rhyme" }>;
const bookNames = { pingshui: "平水韵", cilin: "词林正韵", xinyun: "中华新韵" };

/** Export only a completed aggregate's snapshot and its exact candidate catalogue. */
export function buildRhymeNote(
  input: RhymeInput,
  matches: Array<{ id: string; reason: string }>,
  candidates: ReadingCandidate[],
): string {
  const target = /^l([1-9]\d*)c([1-9]\d*)$/u.exec(input.targetTokenId);
  if (
    !target ||
    !Number.isSafeInteger(Number(target[1])) ||
    !Number.isSafeInteger(Number(target[2]))
  )
    throw new Error("荐字对应的句末位置不完整，暂不能导出。");
  if (!Object.hasOwn(bookNames, input.rhymeBook) || !input.text.trim())
    throw new Error("荐字对应的原诗或韵书不完整，暂不能导出。");

  // An aggregate can exceed the API's 120-candidate batch limit.
  const ids = new Set(input.candidateIds);
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  if (
    !ids.size ||
    ids.size !== input.candidateIds.length ||
    byId.size !== candidates.length ||
    candidates.length !== ids.size ||
    candidates.some(
      (candidate) =>
        !ids.has(candidate.id) ||
        candidate.book !== input.rhymeBook ||
        [...candidate.character].length !== 1,
    )
  )
    throw new Error("候选资料与本次荐字范围不一致，暂不能导出。");
  const seen = new Set<string>();
  const suggestions = matches.map((match, index) => {
    const candidate = byId.get(match.id);
    if (!candidate || seen.has(match.id) || !match.reason.trim())
      throw new Error("荐字结果含重复、范围外或不完整建议，暂不能导出。");
    seen.add(match.id);
    const reading = candidate.modernReading
      ? `（今读 ${formatModernReading(candidate.modernReading)}）`
      : "";
    return `${index + 1}. ${candidate.character}${reading}\n${match.reason.trim()}`;
  });
  return [
    "同韵推敲笺",
    "",
    "原诗：",
    input.text,
    "",
    `韵书：${bookNames[input.rhymeBook]}`,
    `推敲位置：第${target[1]}句句末`,
    ...(input.intention?.trim() ? [`推敲意图：${input.intention.trim()}`] : []),
    `本次已遍历 ${input.candidateIds.length} 个同韵读音候选。`,
    "",
    ...(suggestions.length
      ? ["荐字与取舍：", suggestions.join("\n\n")]
      : ["本次未建议替换，可保留原字。"]),
    "",
    "AI建议仅供推敲参考，同韵不代表同义，也不保证全诗合律。",
  ].join("\n");
}
