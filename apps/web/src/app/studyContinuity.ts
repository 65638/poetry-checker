import type { PoetryAssistantRequest } from "@poetry/contracts";

/** UI identity only: schemas can reorder object keys without changing the context.
 * Array order remains significant. Never use this value as an API request hash.
 */
export function studyContextKey(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : item,
  );
}

/** A previous answer remains readable, but never counts as the new question's result. */
export function canKeepStudyAnswer(
  previous: PoetryAssistantRequest | null,
  next: PoetryAssistantRequest,
): boolean {
  if (previous?.task === "compare" && next.task === "compare")
    return (
      previous.left === next.left &&
      previous.right === next.right &&
      studyContextKey(previous.scope) === studyContextKey(next.scope) &&
      studyContextKey(previous.revision) === studyContextKey(next.revision)
    );
  if (previous?.task !== "critique" || next.task !== "critique") return false;
  return (
    previous.text === next.text &&
    previous.rhymeBook === next.rhymeBook &&
    previous.mode === next.mode &&
    previous.direction === next.direction &&
    studyContextKey(previous.prosodyContext) ===
      studyContextKey(next.prosodyContext)
  );
}
