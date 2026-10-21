import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, it, expect, vi } from "vitest";
import {
  ResearchDatasetSchema,
  ResearchResponseSchema,
} from "@poetry/contracts";
import { poemResearch, researchMatch } from "../src/research.js";
import { buildApp } from "../src/server.js";
import { loadResources } from "../src/resources.js";

const traditional = "空山不見人，但聞人語響。返景入深林，復照青苔上。";
const simplified = "空山不见人，但闻人语响。返景入深林，复照青苔上。";

describe("collected research remains scoped source material", () => {
  it("validates the complete real snapshot and its digest", () => {
    const bytes = readFileSync(
      new URL(
        "../../../data/research/collected-v1/reference.json.gz",
        import.meta.url,
      ),
    );
    const audit = JSON.parse(
      readFileSync(
        new URL(
          "../../../data/research/collected-v1/audit.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      audit.compiledSha256,
    );
    const data = ResearchDatasetSchema.parse(
      JSON.parse(gunzipSync(bytes).toString("utf8")),
    );
    expect(data.readings).toHaveLength(63);
    expect(data.rules).toHaveLength(32);
    expect(data.works.filter((w) => !w.compilation)).toHaveLength(44);
    expect(data.works.filter((w) => w.compilation)).toHaveLength(2);
    const ids = new Set(data.sources.map((s) => s.id));
    for (const r of data.readings) {
      expect(ids.has(r.sourceId)).toBe(true);
      if (r.hanOffset !== null) {
        const chars = [...r.text].filter((c) => /\p{Script=Han}/u.test(c));
        expect(
          chars.slice(r.hanOffset, r.hanOffset + [...r.target].length).join(""),
        ).toBe(r.target);
      }
    }
  });
  it("keeps 景/影 readings and genre disagreement together without upgrading approval", () => {
    const result = poemResearch(traditional);
    expect(result.state).toBe("available");
    expect(
      result.readings
        .filter((r) => r.conflictGroup === "luchai-fanjing")
        .map((r) => r.modernReading),
    ).toEqual(expect.arrayContaining(["fǎn yǐng", "fǎn jǐng"]));
    expect(result.rules.find((r) => r.id === "VR04")?.status).toBe("disputed");
    expect(result.rules.find((r) => r.id === "VR30")?.status).toBe(
      "unavailable",
    );
    expect(
      result.works.some((w) => w.variants.some((v) => v.variant === "返影")),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('"reviewStatus":"approved"');
  });
  it("uses glyph aliases only as labeled full-text retrieval, not silent rewriting", () => {
    expect(researchMatch(simplified, traditional)).toBe("related_glyphs");
    const result = poemResearch(simplified);
    expect(result.readings.length).toBeGreaterThan(0);
    expect(result.readings.every((r) => r.match === "related_glyphs")).toBe(
      true,
    );
    expect(result.readings[0]?.text).toContain("見");
    expect(
      researchMatch(traditional.replace("返景", "返影"), traditional),
    ).toBeNull();
    expect(researchMatch("空山不見人", traditional)).toBeNull();
    expect(poemResearch("日落江湖白，潮来天地青。").readings).toEqual([]);
    expect(poemResearch("日落江湖白，潮来天地青。").works).toEqual([]);
  });
  it("does not merge same-title authors or inject compilations as duplicate poems", () => {
    const result = poemResearch(traditional);
    expect(
      result.works.every((w) => w.author === "王維" && !w.compilation),
    ).toBe(true);
    expect(
      result.readings
        .filter((r) => r.line === null)
        .every((r) => r.hanOffset === null),
    ).toBe(true);
  });
  it("retains both historical explanations of 锦瑟 思 across glyph versions", () => {
    const bytes = readFileSync(
      new URL(
        "../../../data/research/collected-v1/reference.json.gz",
        import.meta.url,
      ),
    );
    const data = ResearchDatasetSchema.parse(
      JSON.parse(gunzipSync(bytes).toString("utf8")),
    );
    const body = data.readings.find((r) => r.id === "cr-057")!.text;
    const result = poemResearch(body);
    expect(result.readings.find((r) => r.id === "cr-057")?.historicalTone).toBe(
      "去聲",
    );
    expect(result.rules.find((r) => r.id === "VR29")?.claim).toContain("平");
    // The same couplet alone must not acquire evidence tied to the entire work.
    expect(poemResearch("锦瑟无端五十弦，一弦一柱思华年。").readings).toEqual(
      [],
    );
  });
  it("binds source half-line numbering by character offset and preserves its scope", () => {
    const bytes = readFileSync(
      new URL(
        "../../../data/research/collected-v1/reference.json.gz",
        import.meta.url,
      ),
    );
    const data = ResearchDatasetSchema.parse(
      JSON.parse(gunzipSync(bytes).toString("utf8")),
    );
    const r = data.readings.find((r) => r.id === "cr-063")!;
    expect(r.line).toBe(16);
    expect(r.modernReading).toBe("xīng");
    expect(
      [...r.text].filter((c) => /\p{Script=Han}/u.test(c))[r.hanOffset!],
    ).toBe("醒");
    expect(r.meaning).toContain("协韵");
  });
  it("serves a hash-bound reference response and includes it in local analysis without GLM", async () => {
    const app = buildApp({ readingAssistant: { apiKey: "" } });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/research",
        payload: { text: simplified },
      });
      expect(response.statusCode).toBe(200);
      const data = ResearchResponseSchema.parse(response.json());
      expect(data.inputHash).toBe(
        createHash("sha256").update(simplified).digest("hex"),
      );
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/research",
            payload: { text: "" },
          })
        ).statusCode,
      ).toBe(422);
      const analysis = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload: {
          text: simplified,
          rhymeBook: "pingshui",
          genreHint: "auto",
          formHint: "auto",
          ruleSet: "teaching-v1",
          readingOverrides: [],
        },
      });
      expect(analysis.statusCode).toBe(200);
      expect(analysis.json().research.readings.length).toBeGreaterThan(0);
      expect(analysis.json().research.inputHash).toBe(
        analysis.json().inputHash,
      );
    } finally {
      await app.close();
    }
  });
  it("supplies conflicts, title scope and sources to GLM while validating candidate choices", async () => {
    let called = false;
    const app = buildApp({
      resources: loadResources(),
      readingAssistant: {
        apiKey: "test-only-key",
        fetcher: async (_url, init) => {
          called = true;
          const body = JSON.parse(init!.body as string);
          expect(body.messages[0].content).toContain("不能据此直接覆盖");
          const payload = JSON.parse(body.messages[1].content);
          expect(
            payload.contextReferences.readings.some(
              (r: { status: string }) => r.status === "conflicting",
            ),
          ).toBe(true);
          expect(
            payload.contextReferences.readings.some(
              (r: { line: number | null }) => r.line === null,
            ),
          ).toBe(true);
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      suggestions: payload.targets.map(
                        (t: { tokenId: string }) => ({
                          tokenId: t.tokenId,
                          candidateId: null,
                          pronunciation: null,
                          reason: "测试保留分歧",
                        }),
                      ),
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          );
        },
      },
    });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reading-suggestions",
        payload: {
          text: simplified,
          rhymeBook: "pingshui",
          targetTokenIds: ["l3c2"],
        },
      });
      expect(called).toBe(true);
      expect(response.statusCode).toBe(200);
      expect(response.json().suggestions[0].candidateId).toBeNull();
    } finally {
      await app.close();
    }
  });
  it("fails open for optional research corruption without inventing evidence", async () => {
    vi.resetModules();
    vi.doMock("node:fs", () => ({
      readFileSync: () => {
        throw new Error("missing optional research");
      },
    }));
    try {
      const { poemResearch: broken } = await import("../src/research.js");
      expect(broken(traditional)).toMatchObject({
        state: "unavailable",
        readings: [],
        works: [],
        rules: [],
        sources: [],
      });
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });
});
