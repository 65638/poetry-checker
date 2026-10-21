import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import {
  LibraryCatalogSchema,
  PoemPronunciationSchema,
  CharacterReferenceSchema,
  type GuangyunEntry,
} from "@poetry/contracts";

function read(name: string): unknown {
  return JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          `../../../data/library/deepseek-v1/${name}.json.gz`,
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  );
}
let catalog: ReturnType<typeof LibraryCatalogSchema.parse> | undefined;
let annotations: Record<string, unknown> | undefined;
let reference:
  | {
      entries: Record<string, { readings: string[]; entries: GuangyunEntry[] }>;
      aliases: Record<string, string[]>;
    }
  | undefined;
const unavailable = {
  error: {
    code: "LIBRARY_UNAVAILABLE",
    message: "扩展诗库暂不可用，已保留本机作品与基础示例。",
    fieldErrors: [],
  },
};
export function characterReferenceRows(character: string): GuangyunEntry[] {
  reference ??= read("reference") as NonNullable<typeof reference>;
  return Object.hasOwn(reference.entries, character)
    ? reference.entries[character]!.entries
    : [];
}
// Retrieval only: aliases never authorize rewriting a poem or a reading.
export function relatedCharacterGlyphs(character: string): string[] {
  reference ??= read("reference") as NonNullable<typeof reference>;
  return Object.hasOwn(reference.aliases, character)
    ? reference.aliases[character]!
    : [];
}
export function registerLibrary(app: FastifyInstance) {
  app.get("/api/v1/library", async (_req, reply) => {
    try {
      catalog ??= LibraryCatalogSchema.parse(read("catalog"));
      return catalog;
    } catch {
      return reply.code(503).send(unavailable);
    }
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/library/:id/pronunciation",
    async (req, reply) => {
      try {
        annotations ??= read("annotations") as Record<string, unknown>;
        const value = Object.hasOwn(annotations, req.params.id)
          ? annotations[req.params.id]
          : undefined;
        if (!value)
          return reply.code(404).send({
            error: {
              code: "NOT_FOUND",
              message: "本篇未提供逐字注音。",
              fieldErrors: [],
            },
          });
        return PoemPronunciationSchema.parse(value);
      } catch {
        return reply.code(503).send(unavailable);
      }
    },
  );
  app.get<{ Params: { char: string } }>(
    "/api/v1/character-reference/:char",
    async (req, reply) => {
      const ch = req.params.char;
      if (!/^\p{Script=Han}$/u.test(ch))
        return reply.code(422).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "请输入一个汉字。",
            fieldErrors: [],
          },
        });
      try {
        reference ??= read("reference") as NonNullable<typeof reference>;
        const exact = Object.hasOwn(reference.entries, ch)
          ? reference.entries[ch]
          : undefined;
        const related = Object.hasOwn(reference.aliases, ch)
          ? [...new Set(reference.aliases[ch])].filter((c) => c !== ch)
          : [];
        return CharacterReferenceSchema.parse({
          character: ch,
          version: "deepseek-v1",
          readings: exact?.readings ?? [],
          entries: exact?.entries ?? [],
          relatedGlyphs: related,
          notice:
            "广韵小韵来源于韵典网提供表；平水、词林归部为程序映射，今音为程序匹配或字典参考，不参与三书格律判定。简繁异体需按原字分别查询。",
        });
      } catch {
        return reply.code(503).send(unavailable);
      }
    },
  );
}
