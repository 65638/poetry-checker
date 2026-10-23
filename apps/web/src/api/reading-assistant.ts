import {
  ReadingAssistantStatusSchema,
  ReadingSuggestionRequestSchema,
  ReadingSuggestionResponseSchema,
  type ReadingSuggestionRequest,
} from "@poetry/contracts";
import { sha256Hex } from "../utils/sha256";
import { parseApiResponse, responseMessage } from "./responseMessages";

export function createReadingAssistant(
  baseUrl = "",
  fetcher: typeof fetch = fetch,
) {
  async function request(path: string, init: RequestInit) {
    let response: Response;
    try {
      response = await fetcher(
        `${baseUrl}/api/v1/reading-suggestions${path}`,
        init,
      );
    } catch (cause) {
      if (init.signal?.aborted) throw cause;
      throw new Error("暂时连接不上读音服务，请检查网络或启动窗口后重试。", {
        cause,
      });
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        responseMessage(
          body,
          `读音建议暂不可用（${response.status}），请稍后重试。`,
        ),
      );
    }
    return body;
  }
  return {
    async status(signal: AbortSignal) {
      return parseApiResponse(
        ReadingAssistantStatusSchema,
        await request("/status", { signal }),
        "暂时无法读取AI服务状态，请稍后重试。",
      );
    },
    async suggest(input: ReadingSuggestionRequest, signal: AbortSignal) {
      const checked = parseApiResponse(
        ReadingSuggestionRequestSchema,
        input,
        "请检查诗文和韵书选择后，再试一次辨音。",
      );
      const body = await request("", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked),
      });
      const result = parseApiResponse(
        ReadingSuggestionResponseSchema,
        body,
        "本次读音建议不完整，尚未应用；请重新辨音。",
      );
      const seen = new Set<string>();
      if (
        result.inputHash !== sha256Hex(input.text) ||
        result.rhymeBook !== input.rhymeBook ||
        (result.offset ?? 0) !== (input.offset ?? 0) ||
        result.suggestions.some((row) => {
          const duplicate = seen.has(row.tokenId);
          seen.add(row.tokenId);
          return (
            duplicate ||
            (input.targetTokenIds &&
              !input.targetTokenIds.includes(row.tokenId)) ||
            (row.candidateId === null
              ? row.candidate !== null
              : row.candidate?.id !== row.candidateId) ||
            (row.candidate !== null &&
              (row.candidate.character !== row.character ||
                row.candidate.book !== input.rhymeBook))
          );
        })
      )
        throw new Error("读音建议与当前诗句或候选不一致，已拒绝显示。");
      return result;
    },
  };
}
