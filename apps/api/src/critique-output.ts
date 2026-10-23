import { MAX_REVISION_SUGGESTIONS, RevisionSchema } from "@poetry/contracts";

/** Filter individual malformed edits only; the full response is still strictly validated. */
export function filterMalformedRevisions(output: unknown) {
  const unchanged = { output, omitted: 0 };
  if (!output || typeof output !== "object" || Array.isArray(output))
    return unchanged;
  if (!("revisions" in output) || !Array.isArray(output.revisions))
    return unchanged;
  if (output.revisions.length > MAX_REVISION_SUGGESTIONS) return unchanged;
  const revisions = output.revisions.flatMap((row: unknown) => {
    const parsed = RevisionSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    output: { ...output, revisions },
    omitted: output.revisions.length - revisions.length,
  };
}
