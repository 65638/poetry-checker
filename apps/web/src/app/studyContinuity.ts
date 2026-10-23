import type { PoetryAssistantRequest } from "@poetry/contracts";

/** A previous answer remains readable, but never counts as the new question's result. */
export function canKeepStudyAnswer(
  previous: PoetryAssistantRequest | null,
  next: PoetryAssistantRequest,
): boolean {
  if (previous?.task !== "critique" || next.task !== "critique") return false;
  return (
    previous.text === next.text &&
    previous.rhymeBook === next.rhymeBook &&
    previous.mode === next.mode &&
    previous.direction === next.direction &&
    JSON.stringify(previous.prosodyContext) ===
      JSON.stringify(next.prosodyContext)
  );
}
