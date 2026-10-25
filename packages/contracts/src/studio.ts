import { z } from "zod";
import { ModelProviderSchema } from "./model.js";

const text = z.string().min(1).max(2000);
const book = z.enum(["pingshui", "cilin", "xinyun"]);
const note = z.string().min(1).max(1600);
export const MAX_REVISION_SUGGESTIONS = 6;
const comparisonSource = z
  .strictObject({
    title: z.string().min(1).max(200),
    part: z.number().int().min(1).max(2000),
    parts: z.number().int().min(1).max(2000),
  })
  .refine((source) => source.part <= source.parts, "选段编号不能大于总段数");
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
  kind: z.enum(["verse", "prose", "unknown"]).optional(),
  collection: z.string().max(120).optional(),
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
  revisions: z.array(RevisionSchema).max(MAX_REVISION_SUGGESTIONS),
  /** Server-generated explanation when invalid rewrite suggestions were withheld. */
  revisionNotice: z.string().min(1).max(400).optional(),
  /** Server-generated rule context, separate from the model's literary overview. */
  ruleReview: z
    .strictObject({
      summary: z.string().min(1).max(600),
      reference: z.string().max(160).nullable(),
      checks: z.array(z.string().min(1).max(1200)).max(120),
    })
    .optional(),
});
const ProsodyLocationSchema = z.strictObject({
  tokenId: z.string().min(1).max(100),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  text: z.string().min(1).max(4),
});
const ProsodyIssueSchema = z.strictObject({
  ruleId: z.string().min(1).max(80),
  status: z.enum(["fail", "uncertain"]),
  locations: z.array(ProsodyLocationSchema).max(12),
  message: z.string().min(1).max(600),
  expected: z.array(z.string().max(200)).max(200).optional(),
  observed: z.array(z.string().max(200)).max(200).optional(),
  severity: z.enum(["error", "warning", "info"]).optional(),
});
export const ProsodyContextSchema = z.strictObject({
  // Omitted conditions from older clients do not establish applicability.
  rhymeBook: book.optional(),
  toneBasis: z.enum(["historical", "mandarin_base"]).optional(),
  applicability: z
    .enum(["applicable", "not_applicable", "uncertain", "unsupported"])
    .optional(),
  format: z.string().min(1).max(160),
  templateId: z.string().max(160).nullable(),
  issues: z.array(ProsodyIssueSchema).max(120),
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
    prosodyContext: ProsodyContextSchema.optional(),
    question: z.string().trim().min(1).max(240).optional(),
    followUp: z
      .strictObject({
        textHash: z.string().regex(/^[a-f0-9]{64}$/u),
        rhymeBook: book,
        mode: z.enum(["writing", "reading"]),
        direction: z.enum(["meaning", "imagery", "sound"]),
        turns: z
          .array(
            z.strictObject({
              question: z.string().trim().min(1).max(240).optional(),
              answer: note,
              details: z.string().min(1).max(6400).optional(),
              detailsTruncated: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(3),
      })
      .optional(),
  }),
  z.strictObject({
    task: z.literal("compare"),
    left: text,
    right: text,
    question: z.string().trim().min(1).max(240).optional(),
    scope: z
      .strictObject({ left: comparisonSource, right: comparisonSource })
      .optional(),
    revision: z
      .strictObject({
        beforeLabel: z.string().trim().min(1).max(120),
        afterLabel: z.string().trim().min(1).max(120),
        intention: z.string().trim().min(1).max(800).optional(),
      })
      .optional(),
  }),
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
    intention: z.string().trim().min(1).max(240).optional(),
  }),
]);
const meta = {
  provider: ModelProviderSchema,
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
