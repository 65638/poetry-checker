import {
  PoetryAssistantRequestSchema,
  PoetryAssistantResponseSchema,
  RhymeWordsResponseSchema,
  type PoetryAssistantRequest,
  type RhymeWordsRequest,
} from "@poetry/contracts";
import { digest } from "../app/library";
import { readWebEnv, resolveApiConfig } from "../app/config";
import { AI_CLIENT_TIMEOUT_MS } from "./timeouts";

export async function studioPost(
  path: string,
  value: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const { baseUrl } = resolveApiConfig(readWebEnv());
  const combined = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(AI_CLIENT_TIMEOUT_MS),
  ]);
  try {
    const response = await fetch(`${baseUrl}/api/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
      signal: combined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        data?.error?.message ??
          `服务暂时未能完成请求（${response.status}），可稍后重试。`,
      );
    if (data === null) throw new Error("未收到完整结果，请重试。原文仍在。");
    return data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (combined.aborted)
      throw new Error(
        "这次研读等候较久，请稍后重试。原文和已保存的推敲笺仍在。",
        { cause: error },
      );
    if (error instanceof TypeError)
      throw new Error("暂时连接不上服务，请检查网络或启动窗口后重试。", {
        cause: error,
      });
    throw error;
  }
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
