import {
  LibraryCatalogSchema,
  PoemPronunciationSchema,
  CharacterReferenceSchema,
  type LibraryWork,
} from "@poetry/contracts";
import { readWebEnv, resolveApiConfig } from "../app/config";
import { digest } from "../app/library";
import { parseApiResponse, responseMessage } from "./responseMessages";

export async function libraryGet(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const { baseUrl } = resolveApiConfig(readWebEnv());
  const combined = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(15000),
  ]);
  try {
    const response = await fetch(`${baseUrl}/api/v1/${path}`, {
      signal: combined,
    });
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        responseMessage(
          value,
          `参考资料暂不可用（${response.status}），请稍后重试。`,
        ),
      );
    if (value === null)
      throw new Error("资料未完整返回，请重新查阅。原文仍在。");
    return value;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (combined.aborted)
      throw new Error("查阅资料等候较久，请稍后重试。", { cause });
    if (cause instanceof TypeError)
      throw new Error("暂时连接不上资料服务，请检查网站是否已启动。", {
        cause,
      });
    throw cause;
  }
}
export async function loadCatalog(signal?: AbortSignal) {
  return parseApiResponse(
    LibraryCatalogSchema,
    await libraryGet("library", signal),
    "诗库目录不完整，请重新加载；已存于本机的诗文仍保留。",
  );
}
export async function loadPronunciation(
  work: LibraryWork,
  signal?: AbortSignal,
) {
  const value = parseApiResponse(
    PoemPronunciationSchema,
    await libraryGet(
      `library/${encodeURIComponent(work.id)}/pronunciation`,
      signal,
    ),
    "这篇诗的注音资料不完整，可以先阅读原文。",
  );
  if (
    value.id !== work.id ||
    value.textHash !== (await digest(work.paragraphs.join("\n"))) ||
    value.lines.length !== work.paragraphs.length ||
    value.lines.some(
      (line, i) => line.length !== [...work.paragraphs[i]!].length,
    )
  )
    throw new Error("注音与本篇正文不一致，已保留原文。 ");
  return value;
}
export async function loadCharacterReference(
  character: string,
  signal?: AbortSignal,
) {
  const value = parseApiResponse(
    CharacterReferenceSchema,
    await libraryGet(
      `character-reference/${encodeURIComponent(character)}`,
      signal,
    ),
    "这个字的参考资料不完整，请稍后重新查阅。",
  );
  if (
    value.character !== character ||
    value.entries.some((e) => e.character !== character)
  )
    throw new Error("参考资料与本次查字不一致。");
  return value;
}
