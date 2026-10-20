import {
  ReadingAssistantStatusSchema,
  ReadingSuggestionRequestSchema,
  ReadingSuggestionResponseSchema,
  type ReadingSuggestionRequest,
} from "@poetry/contracts";
import { sha256Hex } from "../utils/sha256";

export function createReadingAssistant(
  baseUrl = "",
  fetcher: typeof fetch = fetch,
) {
  async function request(path: string, init: RequestInit) {
    const response = await fetcher(
      `${baseUrl}/api/v1/reading-suggestions${path}`,
      init,
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body
          ? (body as { error?: { message?: unknown } }).error?.message
          : null;
      throw new Error(
        typeof message === "string"
          ? message
          : `读音建议暂不可用（${response.status}）。`,
      );
    }
    return body;
  }
  return {
    async status(signal: AbortSignal) {
      return ReadingAssistantStatusSchema.parse(
        await request("/status", { signal }),
      );
    },
    async suggest(input: ReadingSuggestionRequest, signal: AbortSignal) {
      const checked = ReadingSuggestionRequestSchema.parse(input);
      const body = await request("", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked),
      });
      const result = ReadingSuggestionResponseSchema.parse(body);
      const seen = new Set<string>();
      if (
        result.inputHash !== sha256Hex(input.text) ||
        result.rhymeBook !== input.rhymeBook ||
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
