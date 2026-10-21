import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ResearchResponseSchema } from "@poetry/contracts";
import {
  corpusResearch,
  fillMissingCorpusReadings,
} from "../src/corpus-research.js";
import { modelResearch, poemResearch } from "../src/research.js";
import { buildApp } from "../src/server.js";

const catalog = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "../../../data/library/deepseek-v1/catalog.json.gz",
        import.meta.url,
      ),
    ),
  ).toString("utf8"),
).works as { id: string; title: string; paragraphs: string[] }[];
const get = (title: string) => catalog.find((w) => w.title === title)!;
const body = (title: string) => get(title).paragraphs.join("\n");

describe("full-corpus references remain evidence, not approvals or reading overrides", () => {
  it("binds a representative work from all 21 batches with valid source references", () => {
    for (let n = 0; n < catalog.length; n += 100) {
      const original = catalog[n]!;
      const value = corpusResearch(original.paragraphs.join("\n"));
      expect(value.available).toBe(true);
      const work = value.works.find((w) => w.id === original.id)!;
      expect(work.paragraphs).toEqual(original.paragraphs);
      expect(work.readings.length).toBe(work.coverage.hanCount);
      const sourceIds = new Set(value.sources.map((s) => s.id));
      expect(
        work.readings.every((r) =>
          r.sourceIds.every((id) => sourceIds.has(id)),
        ),
      ).toBe(true);
    }
  });
  it("matches punctuation changes but never binds edited text, a first line or glyph conversions", () => {
    const text = body("关雎");
    expect(corpusResearch(text.replace(/[，。\n]/gu, " ")).works[0]?.id).toBe(
      get("关雎").id,
    );
    expect(corpusResearch(text.replace("关", "關")).works).toEqual([]);
    expect(corpusResearch(get("关雎").paragraphs[0]!).works).toEqual([]);
    expect(corpusResearch(text.replace("关", "光")).works).toEqual([]);
  });
  it("preserves explicit source disagreements without deriving historical tones", () => {
    const text = catalog
      .find((w) => w.id === "deepseek:33d096cd3773")!
      .paragraphs.join("\n");
    const work = corpusResearch(text).works[0]!;
    const r = work.readings.find(
      (r) => r.character === "养" && r.status === "conflicting",
    )!;
    expect(r.modernReading).toBeNull();
    expect(r.candidates.map((c) => c.modernReading)).toEqual(
      expect.arrayContaining(["yǎng", "yáng"]),
    );
    expect(r.historicalTone).toBeNull();
    expect(r.rhymeGroup).toBeNull();
    expect(work.coverage.attemptStatus).toBe("partial");
  });
  it("supplements the astral glyph only with an exact hash, without mutating the original", async () => {
    const original = get("望海潮·东南形胜");
    const text = original.paragraphs.join("\n");
    const hash = createHash("sha256").update(text).digest("hex");
    const lines = original.paragraphs.map((p) =>
      [...p].map(() => "原表" as string | null),
    );
    lines[4]![3] = null;
    const supplemented = fillMissingCorpusReadings(original.id, hash, lines);
    expect(supplemented.added).toBe(1);
    expect(supplemented.lines[4]![3]).toBe("yǎn");
    expect(lines[4]![3]).toBeNull();
    expect(
      fillMissingCorpusReadings(original.id, "0".repeat(64), lines).added,
    ).toBe(0);
    const app = buildApp({ readingAssistant: { apiKey: "" } });
    try {
      const response = await app.inject(
        `/api/v1/library/${encodeURIComponent(original.id)}/pronunciation`,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().lines[4][3]).toBe("yǎn");
      expect(response.json().notice).toContain("补充1字");
    } finally {
      await app.close();
    }
  });
  it("provides context and source links to UI and models without deciding poetic form", () => {
    const text = body("关雎");
    const result = ResearchResponseSchema.parse(poemResearch(text));
    expect(result.corpus?.[0]?.readings).toHaveLength(80);
    expect(result.corpus?.[0]?.notes.length).toBeGreaterThan(0);
    expect(
      result.sources.some(
        (s) => s.evidenceLevel === "aggregator_unidentified_editorial_basis",
      ),
    ).toBe(true);
    expect(
      modelResearch(text).corpusReferences?.[0]?.readings[0]?.modernReading,
    ).toBe("guān");
    expect(JSON.stringify(result)).not.toContain('"reviewStatus":"approved"');
  });
  it("includes requested late positions while bounding general model evidence", () => {
    const text = body("望海潮·东南形胜");
    const value = modelResearch(text, [90, 100]).corpusReferences![0]!;
    expect(value.readings.map((r) => r.hanOffset)).toEqual([90, 100]);
    expect(value.omittedReadings).toBe(105);
    expect(value.readings.every((r) => r.candidates.length > 0)).toBe(true);
  });
});
