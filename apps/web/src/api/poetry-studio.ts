import {
  PoetryAssistantRequestSchema,
  PoetryAssistantResponseSchema,
  RhymeWordsResponseSchema,
  type PoetryAssistantRequest,
  type RhymeWordsRequest,
} from "@poetry/contracts";
import { digest } from "../app/library";
import { readWebEnv, resolveApiConfig } from "../app/config";

export async function studioPost(
  path: string,
  value: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const { baseUrl } = resolveApiConfig(readWebEnv());
  const combined = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(50000),
  ]);
  const response = await fetch(`${baseUrl}/api/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    signal: combined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data?.error?.message ?? `请求失败（${response.status}）`);
  return data;
}
export async function requestPoetry(
  input: PoetryAssistantRequest,
  signal?: AbortSignal,
) {
  const parsed = PoetryAssistantRequestSchema.parse(input);
  const result = PoetryAssistantResponseSchema.parse(
    await studioPost("poetry-assistant", parsed, signal),
  );
  if (
    result.task !== input.task ||
    result.inputHash !== (await digest(JSON.stringify(parsed)))
  )
    throw new Error("文学建议与本次输入不一致，已拒绝显示。");
  return result;
}
export async function requestRhymeWords(
  input: RhymeWordsRequest,
  signal?: AbortSignal,
) {
  const result = RhymeWordsResponseSchema.parse(
    await studioPost("rhyme-words", input, signal),
  );
  if (
    result.readingId !== input.readingId ||
    result.lookup.book !== input.rhymeBook ||
    result.offset !== input.offset
  )
    throw new Error("同韵候选与当前选择不一致。");
  return result;
}
