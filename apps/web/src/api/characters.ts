import {
  LookupResultSchema,
  type BookId,
  type LookupResult,
} from "@poetry/contracts";
import { responseMessage } from "./responseMessages";

export type CharacterLookup = (
  character: string,
  book: BookId,
  signal: AbortSignal,
) => Promise<LookupResult>;

export const CHARACTER_LOOKUP_TIMEOUT_MS = 15_000;

export function characterInputError(text: string): string | null {
  if ([...text.trim()].length !== 1 || !/^\p{Script=Han}$/u.test(text.trim()))
    return "请输入一个汉字，例如「月」。简繁与异体按原字查询。";
  return null;
}

export function createCharacterLookup(
  baseUrl = "",
  fetcher: typeof fetch = fetch,
  timeoutMs = CHARACTER_LOOKUP_TIMEOUT_MS,
): CharacterLookup {
  return async (character, book, signal) => {
    signal.throwIfAborted();
    const deadline = new AbortController();
    const combined = AbortSignal.any([signal, deadline.signal]);
    const timer = setTimeout(
      () => deadline.abort(new DOMException("查字超时", "TimeoutError")),
      timeoutMs,
    );
    try {
      let response: Response;
      try {
        response = await fetcher(
          `${baseUrl}/api/v1/characters/${encodeURIComponent(character)}?book=${book}`,
          { signal: combined },
        );
      } catch (cause) {
        if (signal.aborted) throw cause;
        throw new Error("暂时连接不上查字服务，请检查网络或启动窗口后重试。", {
          cause,
        });
      }
      combined.throwIfAborted();
      const body: unknown = await response.json().catch(() => null);
      // Aborting during body consumption must not become a malformed-data error.
      combined.throwIfAborted();
      if (!response.ok) {
        throw new Error(
          responseMessage(
            body,
            `查字服务暂不可用（${response.status}），请稍后重试。`,
          ),
        );
      }
      const parsed = LookupResultSchema.safeParse(body);
      if (!parsed.success) throw new Error("查询结果格式异常，请重试。");
      const result = parsed.data;
      if (
        result.book !== book ||
        result.entries.some(
          (entry) =>
            entry.character !== character ||
            entry.candidates.some(
              (c) => c.character !== character || c.book !== book,
            ),
        ) ||
        result.missing.some((c) => c !== character) ||
        (!result.entries.some((entry) => entry.character === character) &&
          !result.missing.includes(character))
      )
        throw new Error("查询结果与本次汉字或韵书不一致，请重试。");
      return result;
    } catch (cause) {
      signal.throwIfAborted();
      if (deadline.signal.aborted)
        throw new Error("查字等候超时，请重试；当前诗文仍保留。", { cause });
      throw cause;
    } finally {
      clearTimeout(timer);
    }
  };
}
