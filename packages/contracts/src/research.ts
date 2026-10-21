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
export const ResearchResponseSchema = z.object({
  version: text,
  state: z.enum(["available", "unavailable"]),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
  readings: z.array(ResearchReadingSchema.extend({ match })),
  works: z.array(ResearchWorkSchema.extend({ match })),
  rules: z.array(ResearchRuleSchema),
  sources: z.array(ResearchSourceSchema),
  notice: text,
});
export type ResearchDataset = z.infer<typeof ResearchDatasetSchema>;
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>;
