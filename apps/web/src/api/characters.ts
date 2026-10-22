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

export function characterInputError(text: string): string | null {
  if ([...text.trim()].length !== 1 || !/^\p{Script=Han}$/u.test(text.trim()))
    return "请输入一个汉字，例如「月」。简繁与异体按原字查询。";
  return null;
}

export function createCharacterLookup(
  baseUrl = "",
  fetcher: typeof fetch = fetch,
): CharacterLookup {
  return async (character, book, signal) => {
    let response: Response;
    try {
      response = await fetcher(
        `${baseUrl}/api/v1/characters/${encodeURIComponent(character)}?book=${book}`,
        { signal },
      );
    } catch (cause) {
      if (signal.aborted) throw cause;
      throw new Error("暂时连接不上查字服务，请检查网络或启动窗口后重试。", {
        cause,
      });
    }
    const body: unknown = await response.json().catch(() => null);
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
  };
}
