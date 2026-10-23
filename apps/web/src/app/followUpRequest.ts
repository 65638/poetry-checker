import {
  PoetryAssistantRequestSchema,
  PoetryAssistantResponseSchema,
  type PoetryAssistantRequest,
  type PoetryAssistantResponse,
  type Critique,
} from "@poetry/contracts";
import { sha256Hex } from "../utils/sha256";

/** Bounded context for pronouns such as "that replacement", without treating advice as evidence. */
export function studyAnswerDetails(result: Critique): {
  details?: string;
  detailsTruncated?: boolean;
} {
  let truncated = false;
  const excerpt = (value: string, limit: number) => {
    if (value.length <= limit) return value;
    truncated = true;
    let prefix = "";
    for (const character of value) {
      if (prefix.length + character.length > limit) break;
      prefix += character;
    }
    return `${prefix}…（摘录）`;
  };
  const rows: string[] = [];
  if (result.strengths.length)
    rows.push(
      "可取之处",
      ...result.strengths.map((value) => `• ${excerpt(value, 200)}`),
    );
  if (result.revisions.length) {
    rows.push("推敲建议");
    for (const edit of result.revisions)
      rows.push(
        `“${edit.original}” → “${edit.replacement}”`,
        `原因：${excerpt(edit.reason, 300)}`,
        `取舍：${excerpt(edit.tradeoff, 300)}`,
      );
  }
  if (result.revisionNotice) rows.push("建议校验说明", result.revisionNotice);
  return rows.length
    ? {
        details: rows.join("\n"),
        ...(truncated ? { detailsTruncated: true } : {}),
      }
    : {};
}

export function buildStudyFollowUp(
  input: PoetryAssistantRequest,
  response: PoetryAssistantResponse,
  question: string,
): Extract<PoetryAssistantRequest, { task: "critique" }> {
  const original = PoetryAssistantRequestSchema.parse(input);
  const answer = PoetryAssistantResponseSchema.parse(response);
  if (
    original.task !== "critique" ||
    answer.task !== "critique" ||
    answer.inputHash !== sha256Hex(JSON.stringify(original))
  )
    throw new Error("这份回答与原文不对应，请从当前作品重新提问。");
  const next = PoetryAssistantRequestSchema.parse({
    ...original,
    question,
    followUp: {
      textHash: sha256Hex(original.text),
      rhymeBook: original.rhymeBook,
      mode: original.mode,
      direction: original.direction,
      turns: [
        ...(original.followUp?.turns ?? []).slice(-2),
        {
          ...(original.question ? { question: original.question } : {}),
          answer: answer.result.overview,
          ...studyAnswerDetails(answer.result),
        },
      ],
    },
  });
  if (next.task !== "critique") throw new Error("请选择一份作品评议再追问。");
  return next;
}
