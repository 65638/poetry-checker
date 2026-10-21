import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  LibraryCatalogSchema,
  PoemPronunciationSchema,
  CharacterReferenceSchema,
} from "@poetry/contracts";
import { buildApp } from "../src/server.js";
import { readingSections, searchLibrary } from "../../web/src/app/library.js";

const app = buildApp();
afterAll(() => app.close());
const read = (name: string) =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          `../../../data/library/deepseek-v1/${name}.json.gz`,
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  );
const catalog = LibraryCatalogSchema.parse(read("catalog"));
describe("DeepSeek optional corpus and independent reference", () => {
  it("serves 2022 source-linked works and identifies the known prose without altering text", async () => {
    const response = await app.inject("/api/v1/library");
    expect(response.statusCode).toBe(200);
    const value = LibraryCatalogSchema.parse(response.json());
    expect(value.works).toHaveLength(2022);
    expect(new Set(value.works.map((w) => w.id)).size).toBe(2022);
    expect(value.works.every((w) => w.sourceUrl?.startsWith("https://"))).toBe(
      true,
    );
    expect(value.works.find((w) => w.title === "庖丁解牛")?.kind).toBe("prose");
  });
  it("binds every pronunciation to the exact codepoint sequence, including the unannotated astral glyph", () => {
    const values = read("annotations");
    for (const work of catalog.works) {
      const value = PoemPronunciationSchema.parse(values[work.id]);
      expect(value.textHash).toBe(
        createHash("sha256").update(work.paragraphs.join("\n")).digest("hex"),
      );
      expect(value.lines.map((l) => l.length)).toEqual(
        work.paragraphs.map((p) => [...p].length),
      );
    }
    const poem = catalog.works.find((w) => w.title === "望海潮·东南形胜")!;
    const i = poem.paragraphs.findIndex((p) => p.includes("𪩘"));
    const position = [...poem.paragraphs[i]!].indexOf("𪩘");
    expect(values[poem.id].lines[i][position]).toBeNull();
  });
  it("returns bounded pronunciation responses and rejects absent IDs", async () => {
    const work = catalog.works.find((w) => w.title === "登鹳雀楼")!;
    const result = await app.inject(
      `/api/v1/library/${encodeURIComponent(work.id)}/pronunciation`,
    );
    expect(result.statusCode).toBe(200);
    expect(PoemPronunciationSchema.parse(result.json()).id).toBe(work.id);
    expect(
      (await app.inject("/api/v1/library/__proto__/pronunciation")).statusCode,
    ).toBe(404);
  });
  it("corrects the two dry/qian associations and withholds uncertain music-row associations", async () => {
    const result = CharacterReferenceSchema.parse(
      (
        await app.inject(
          `/api/v1/character-reference/${encodeURIComponent("乾")}`,
        )
      ).json(),
    );
    expect(
      result.entries.find((e) => e.fanqie === "古寒切")?.pronunciation,
    ).toBe("gān");
    expect(
      result.entries.find((e) => e.fanqie === "渠焉切")?.pronunciation,
    ).toBe("qián");
    const music = CharacterReferenceSchema.parse(
      (
        await app.inject(
          `/api/v1/character-reference/${encodeURIComponent("樂")}`,
        )
      ).json(),
    );
    expect(music.readings).toContain("yuè");
    expect(music.entries.every((e) => e.pronunciation === null && e.note)).toBe(
      true,
    );
  });
  it("keeps simplified lookup separate and gives modern-only characters no invented fanqie", async () => {
    const east = CharacterReferenceSchema.parse(
      (
        await app.inject(
          `/api/v1/character-reference/${encodeURIComponent("东")}`,
        )
      ).json(),
    );
    expect(east.relatedGlyphs).toContain("東");
    expect(east.entries.every((e) => e.character === "东")).toBe(true);
    const modern = CharacterReferenceSchema.parse(
      (
        await app.inject(
          `/api/v1/character-reference/${encodeURIComponent("您")}`,
        )
      ).json(),
    );
    expect(modern.entries).toEqual([]);
    expect(modern.readings).toContain("nín");
    expect(
      (await app.inject("/api/v1/character-reference/abc")).statusCode,
    ).toBe(422);
  });
  it("splits long works within analysis limits without losing substantive text", () => {
    for (const work of catalog.works) {
      const sections = readingSections(work);
      expect(
        sections
          .map((w) => w.paragraphs.join(""))
          .join("")
          .replace(/\s/gu, ""),
      ).toBe(work.paragraphs.join("").replace(/\s/gu, ""));
      for (const section of sections) {
        expect([...section.paragraphs.join("\n")].length).toBeLessThanOrEqual(
          2000,
        );
        expect(section.paragraphs.length).toBeLessThanOrEqual(80);
      }
    }
  });
  it("does not reward repeating weak theme words across a long work", () => {
    const work = catalog.works[0]!;
    const exact = {
      ...work,
      id: "short",
      title: "短篇",
      tags: [],
      paragraphs: ["江上孤舟。"],
    };
    const long = {
      ...work,
      id: "long",
      title: "长篇",
      tags: [],
      paragraphs: Array(160).fill("江水流。"),
    };
    expect(searchLibrary([long, exact], "江上孤舟", true)[0]?.work.id).toBe(
      "short",
    );
    const one = searchLibrary([long], "江上孤舟", true)[0]!.score;
    expect(
      searchLibrary(
        [{ ...long, paragraphs: long.paragraphs.slice(0, 2) }],
        "江上孤舟",
        true,
      )[0]!.score,
    ).toBe(one);
  });
  it("verifies raw snapshot and derived archive bytes against the manifest", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../../data/raw/deepseek/manifest.json", import.meta.url),
        "utf8",
      ),
    );
    for (const entry of manifest.provenance) {
      const bytes = readFileSync(
        new URL(`../../../${entry.file}`, import.meta.url),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        entry.archiveSha256,
      );
      expect(createHash("sha256").update(gunzipSync(bytes)).digest("hex")).toBe(
        entry.sha256,
      );
    }
    for (const entry of manifest.products)
      expect(
        createHash("sha256")
          .update(
            readFileSync(new URL(`../../../${entry.file}`, import.meta.url)),
          )
          .digest("hex"),
      ).toBe(entry.sha256);
  });
});
