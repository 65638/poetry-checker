import { z } from "zod";

const text = z.string().min(1).max(2000);
const book = z.enum(["pingshui", "cilin", "xinyun"]);
const note = z.string().min(1).max(1600);
export const LibraryWorkSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(200),
  author: z.string().max(120),
  dynasty: z.string().max(80),
  paragraphs: z.array(z.string().min(1).max(2000)).min(1).max(200),
  source: z.string().max(500),
  sourceUrl: z
    .url()
    .refine((url) => /^https?:\/\//iu.test(url), "来源须为HTTP(S)网址")
    .nullable(),
  tags: z.array(z.string().min(1).max(80)).max(32),
});
export const RevisionSchema = z.strictObject({
  startTokenId: z.string().min(1),
  endTokenId: z.string().min(1),
  original: z.string().min(1).max(40),
  replacement: z.string().min(1).max(40),
  reason: note,
  tradeoff: note,
});
export const CritiqueSchema = z.strictObject({
  overview: note,
  strengths: z.array(note).max(5),
  revisions: z.array(RevisionSchema).max(6),
});
export const ComparisonSchema = z.strictObject({
  overview: note,
  aspects: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(40),
        left: note,
        right: note,
      }),
    )
    .min(1)
    .max(6),
});
export const RankedItemsSchema = z.strictObject({
  matches: z
    .array(z.strictObject({ id: z.string().min(1).max(200), reason: note }))
    .max(12),
});
export const SearchMatchesSchema = z.strictObject({
  matches: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(200),
        quote: z.string().min(1).max(2000),
        reason: note,
      }),
    )
    .max(12),
});
export const PoetryAssistantRequestSchema = z.discriminatedUnion("task", [
  z.strictObject({
    task: z.literal("critique"),
    text,
    rhymeBook: book,
    direction: z.enum(["meaning", "imagery", "sound"]),
    mode: z.enum(["writing", "reading"]),
  }),
  z.strictObject({ task: z.literal("compare"), left: text, right: text }),
  z.strictObject({
    task: z.literal("search"),
    query: z.string().min(1).max(120),
    poems: z.array(LibraryWorkSchema).min(1).max(40),
  }),
  z.strictObject({
    task: z.literal("rhyme"),
    text,
    rhymeBook: book,
    targetTokenId: z.string().min(1).max(100),
    readingId: z.string().min(1).max(200),
    candidateIds: z.array(z.string().min(1).max(200)).min(1).max(120),
  }),
]);
const meta = {
  provider: z.literal("zhipu"),
  model: z.string().min(1),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
  notice: z.string(),
};
export const PoetryAssistantResponseSchema = z.discriminatedUnion("task", [
  z.strictObject({
    ...meta,
    task: z.literal("critique"),
    result: CritiqueSchema,
  }),
  z.strictObject({
    ...meta,
    task: z.literal("compare"),
    result: ComparisonSchema,
  }),
  z.strictObject({
    ...meta,
    task: z.literal("search"),
    result: SearchMatchesSchema,
  }),
  z.strictObject({
    ...meta,
    task: z.literal("rhyme"),
    result: RankedItemsSchema,
  }),
]);
export const RhymeWordsRequestSchema = z.strictObject({
  rhymeBook: book,
  readingId: z.string().min(1).max(200),
  offset: z.number().int().min(0).max(100000).default(0),
  limit: z.number().int().min(1).max(120).default(80),
});
export type LibraryWork = z.infer<typeof LibraryWorkSchema>;
export type RhymeWordsRequest = z.infer<typeof RhymeWordsRequestSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type Critique = z.infer<typeof CritiqueSchema>;
export type PoetryAssistantRequest = z.infer<
  typeof PoetryAssistantRequestSchema
>;
export type PoetryAssistantResponse = z.infer<
  typeof PoetryAssistantResponseSchema
>;
