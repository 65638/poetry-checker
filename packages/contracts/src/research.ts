import { z } from "zod";

const status = z.enum([
  "source_attested",
  "conflicting",
  "disputed",
  "unavailable",
]);
const match = z.enum(["exact", "related_glyphs"]);
const text = z.string();
const sourceId = z.string().min(1);
export const ResearchSourceSchema = z.object({
  id: sourceId,
  title: text,
  url: z.url().refine((url) => /^https?:\/\//u.test(url)),
  credit: text,
  license: text,
  limitations: text,
  rawSha256: z.string().nullable(),
  accessedAt: text.optional(),
  rawPath: text.nullable().optional(),
  evidenceLevel: text.optional(),
  independenceGroup: text.optional(),
});
const citation = z.object({ sourceId, quote: text.nullable(), locator: text });
const note = citation.extend({
  term: text,
  lineText: text.nullable(),
  meaning: text,
});
const variant = citation.extend({
  original: text,
  variant: text,
  lineText: text.nullable(),
});
export const ResearchReadingSchema = citation.extend({
  id: sourceId,
  title: text,
  author: text,
  text,
  lineText: text,
  target: text,
  line: z.number().int().positive().nullable(),
  column: z.number().int().positive().nullable(),
  hanOffset: z.number().int().nonnegative().nullable(),
  modernReading: text.nullable(),
  historicalTone: text.nullable(),
  meaning: text,
  status,
  scope: text,
  conflictGroup: text.nullable(),
});
export const ResearchWorkSchema = z.object({
  id: sourceId,
  title: text,
  author: text,
  text,
  edition: text,
  collection: text.nullable(),
  genre: text.nullable(),
  status,
  compilation: z.boolean(),
  children: z.array(sourceId),
  limitations: z.array(text),
  sourceIds: z.array(sourceId),
  notes: z.array(note),
  variants: z.array(variant),
});
export const ResearchRuleSchema = z.object({
  id: sourceId,
  topic: text,
  claim: text,
  status,
  appliesTo: z.array(text),
  doesNotApplyTo: z.array(text),
  preconditions: z.array(text),
  disagreements: z.array(text),
  examples: z.array(z.object({ title: text, text })),
  sourceIds: z.array(sourceId),
  quotes: z.array(citation),
});
export const ResearchDatasetSchema = z.object({
  version: z.literal("collected-v1"),
  sources: z.array(ResearchSourceSchema),
  readings: z.array(ResearchReadingSchema),
  works: z.array(ResearchWorkSchema),
  rules: z.array(ResearchRuleSchema),
});
export const ResearchRequestSchema = z.strictObject({
  text: z.string().min(1).max(20000),
});
const position = z.object({
  paragraphNumber: z.number().int().positive(),
  codepointColumn: z.number().int().positive(),
});
const locator = z.union([text, z.record(z.string(), z.unknown())]).nullable();
const corpusCandidate = z.object({
  modernReading: text.nullable(),
  historicalTone: text.nullable(),
  rhymeGroup: text.nullable(),
  evidenceScope: text,
  sourceIds: z.array(sourceId),
  quote: text.nullable(),
  locator,
  reason: text.optional(),
});
export const CorpusResearchWorkSchema = z.object({
  id: sourceId,
  title: text,
  author: text,
  textHash: z.string().regex(/^[a-f0-9]{64}$/u),
  paragraphs: z.array(text),
  sourceIds: z.array(sourceId),
  coverage: z.object({
    attemptStatus: z.enum(["checked", "partial", "not_started"]),
    hanCount: z.number().int().nonnegative(),
    directContextCount: z.number().int().nonnegative(),
    unavailableCount: z.number().int().nonnegative(),
    conflictingCount: z.number().int().nonnegative(),
    unresolved: z.array(text),
  }),
  readings: z.array(
    position.extend({
      character: text,
      hanOffset: z.number().int().nonnegative(),
      status: z.enum([
        "source_attested",
        "conflicting",
        "unavailable",
        "inferred",
      ]),
      evidenceScope: text,
      modernReading: text.nullable(),
      historicalTone: text.nullable(),
      rhymeGroup: text.nullable(),
      sourceIds: z.array(sourceId),
      candidates: z.array(corpusCandidate),
      quote: text.nullable(),
      locator,
      reason: text,
    }),
  ),
  notes: z.array(
    z.object({
      term: text.nullable(),
      quote: text,
      sourceIds: z.array(sourceId),
      locator,
      inputOccurrences: z.array(position),
    }),
  ),
  formClaims: z.array(
    z.object({
      claim: text,
      quote: text,
      sourceIds: z.array(sourceId),
      locator,
    }),
  ),
  variants: z.array(
    z.object({
      variantId: sourceId,
      sourceText: text,
      sourceIds: z.array(sourceId),
      relation: text,
      note: text,
      differences: z.array(z.record(z.string(), z.unknown())),
    }),
  ),
});
export const CorpusResearchDatasetSchema = z.object({
  version: z.literal("full-corpus-v1"),
  works: z.array(CorpusResearchWorkSchema),
  sources: z.array(ResearchSourceSchema),
});
export type CorpusResearchWork = z.infer<typeof CorpusResearchWorkSchema>;
export type CorpusResearchDataset = z.infer<typeof CorpusResearchDatasetSchema>;
export const ResearchResponseSchema = z.object({
  version: text,
  state: z.enum(["available", "unavailable"]),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
  readings: z.array(ResearchReadingSchema.extend({ match })),
  works: z.array(ResearchWorkSchema.extend({ match })),
  rules: z.array(ResearchRuleSchema),
  sources: z.array(ResearchSourceSchema),
  corpus: z.array(CorpusResearchWorkSchema).optional(),
  notice: text,
});
export type ResearchDataset = z.infer<typeof ResearchDatasetSchema>;
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>;
