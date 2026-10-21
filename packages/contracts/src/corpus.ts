import { z } from "zod";
import { LibraryWorkSchema } from "./studio.js";

export const LibraryCatalogSchema = z.object({
  version: z.string().min(1),
  works: z.array(LibraryWorkSchema).max(10000),
});
export const PoemPronunciationSchema = z.object({
  id: z.string().min(1),
  textHash: z.string().regex(/^[a-f0-9]{64}$/u),
  lines: z.array(z.array(z.string().min(1).max(40).nullable())).max(200),
  notice: z.string(),
});
export const GuangyunEntrySchema = z.object({
  character: z.string().min(1),
  pronunciation: z.string().nullable(),
  fanqie: z.string().nullable(),
  rhyme: z.string(),
  tone: z.string(),
  initial: z.string(),
  pingshui: z.string(),
  cilin: z.string(),
  note: z.string().nullable(),
});
export const CharacterReferenceSchema = z.object({
  character: z.string(),
  version: z.string(),
  readings: z.array(z.string()),
  entries: z.array(GuangyunEntrySchema),
  relatedGlyphs: z.array(z.string()),
  notice: z.string(),
});
export type LibraryCatalog = z.infer<typeof LibraryCatalogSchema>;
export type PoemPronunciation = z.infer<typeof PoemPronunciationSchema>;
export type CharacterReference = z.infer<typeof CharacterReferenceSchema>;
export type GuangyunEntry = z.infer<typeof GuangyunEntrySchema>;
