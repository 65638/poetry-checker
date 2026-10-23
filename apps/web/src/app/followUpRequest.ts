import {
  PoetryAssistantRequestSchema,
  PoetryAssistantResponseSchema,
  type PoetryAssistantRequest,
  type PoetryAssistantResponse,
} from "@poetry/contracts";
import { sha256Hex } from "../utils/sha256";

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
        },
      ],
    },
  });
  if (next.task !== "critique") throw new Error("请选择一份作品评议再追问。");
  return next;
}
