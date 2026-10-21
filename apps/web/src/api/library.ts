import {
  LibraryCatalogSchema,
  PoemPronunciationSchema,
  CharacterReferenceSchema,
  type LibraryWork,
} from "@poetry/contracts";
import { readWebEnv, resolveApiConfig } from "../app/config";
import { digest } from "../app/library";

export async function libraryGet(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const { baseUrl } = resolveApiConfig(readWebEnv());
  const response = await fetch(`${baseUrl}/api/v1/${path}`, {
    signal: AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(15000),
    ]),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value?.error?.message ?? "参考资料暂不可用，请稍后重试。");
  return value;
}
export async function loadCatalog(signal?: AbortSignal) {
  return LibraryCatalogSchema.parse(await libraryGet("library", signal));
}
export async function loadPronunciation(
  work: LibraryWork,
  signal?: AbortSignal,
) {
  const value = PoemPronunciationSchema.parse(
    await libraryGet(
      `library/${encodeURIComponent(work.id)}/pronunciation`,
      signal,
    ),
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
  const value = CharacterReferenceSchema.parse(
    await libraryGet(
      `character-reference/${encodeURIComponent(character)}`,
      signal,
    ),
  );
  if (
    value.character !== character ||
    value.entries.some((e) => e.character !== character)
  )
    throw new Error("参考资料与本次查字不一致。");
  return value;
}
