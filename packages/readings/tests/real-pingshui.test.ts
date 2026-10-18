/**
 * B2-08：用 A 的真实快照跑三首固定正文，断言“当前实际状态”。
 *
 * 这里**不追求全绿**：真实快照只有 7 个字、证据全部 unverified，
 * 所以正确的期望是“缺口清单准确 + 审核门槛生效”，而不是三首诗都标注成功。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { LookupResult } from "@poetry/contracts";

import { createLexicon, deserializeSnapshot } from "../../lexicon/src/index.js";
import { ReadingsError, parseText, resolveReadings } from "../src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

interface WorkEntry {
  caseId: string;
  title: string;
  text: string;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

const sample = readJson<Record<string, unknown>>(
  "data/normalized/pingshui.sample-d1.json",
);
const works = readJson<{ items: WorkEntry[] }>(
  "data/works/review-queue.json",
).items;
const lexicon = createLexicon([deserializeSnapshot(sample)]);
const dataVersion = String(sample.dataVersion);

async function lookupFor(text: string): Promise<LookupResult> {
  const poem = parseText({ text });
  const characters = [...new Set(poem.tokens.map((token) => token.text))];
  return lexicon.lookupCharacters({
    characters,
    rhymeBook: "pingshui",
    dataVersion,
  });
}

function work(caseId: string): WorkEntry {
  const found = works.find((item) => item.caseId === caseId);
  if (found === undefined) throw new Error(`找不到作品 ${caseId}`);
  return found;
}

describe("B2-08 真实快照下的逐字状态", () => {
  it("真实快照本身是 unverified，且没有任何 approved 证据", async () => {
    const lookup = await lookupFor(work("golden-dengguanquelou-ps-v1").text);
    expect(lookup.book).toBe("pingshui");
    expect(lookup.dataVersion).toBe(dataVersion);
    expect(lookup.evidence.length).toBeGreaterThan(0);
    expect(
      lookup.evidence.every(
        (evidence) => evidence.reviewStatus === "unverified",
      ),
    ).toBe(true);
  });

  it("登鹳雀楼：20 字位中 5 个有真实候选、15 个缺字，「更」保留平仄两候选", async () => {
    const text = work("golden-dengguanquelou-ps-v1").text;
    const poem = parseText({ text });
    expect(poem.tokens).toHaveLength(20);
    expect(poem.tokens[0]?.text).toBe("白");
    expect(poem.tokens[0]?.tokenId).toBe("l1c1");

    const lookup = await lookupFor(text);
    expect(lookup.entries.map((entry) => entry.character)).toEqual([
      "一",
      "更",
      "楼",
      "流",
      "白",
    ]);
    expect(lookup.missing).toHaveLength(15);

    const geng = lookup.entries.find((entry) => entry.character === "更");
    expect(geng?.candidates.map((candidate) => candidate.id)).toEqual([
      "pingshui:更:ping:八庚",
      "pingshui:更:qu:二十四敬",
    ]);
    expect(geng?.candidates.map((candidate) => candidate.tone)).toEqual([
      "P",
      "Z",
    ]);
  });

  it("登鹳雀楼：证据未审核时抛 LOOKUP_EVIDENCE_UNVERIFIED，不返回伪确定标注", () => {
    const text = work("golden-dengguanquelou-ps-v1").text;
    const poem = parseText({ text });

    return lookupFor(text).then((lookup) => {
      let caught: unknown;
      try {
        resolveReadings({ poem, lookup, overrides: [], contextRules: [] });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ReadingsError);
      const error = caught as ReadingsError;
      expect(error.code).toBe("LOOKUP_EVIDENCE_UNVERIFIED");
      expect(error.details.tokenId).toBe("l1c1");
      expect(error.details.character).toBe("白");
      expect(error.details.dataVersion).toBe(dataVersion);
    });
  });

  it("黄鹤楼：56 字位中仅 3 个有候选，同样按门槛报数据未就绪", async () => {
    const text = work("golden-huanghelou-ps-v1").text;
    const poem = parseText({ text });
    expect(poem.tokens).toHaveLength(56);

    const lookup = await lookupFor(text);
    expect(lookup.entries).toHaveLength(3);
    // lookup.missing 按去重字数计：46 个不同字里 43 个未收录。
    expect(lookup.missing).toHaveLength(43);
    const missingTokens = poem.tokens.filter((token) =>
      lookup.missing.includes(token.text),
    ).length;
    expect(missingTokens).toBe(53);
    expect(() =>
      resolveReadings({ poem, lookup, overrides: [], contextRules: [] }),
    ).toThrowError(ReadingsError);
  });

  it("静夜思：全字缺收（missing）属于正常未知，不触发证据门槛", async () => {
    const text = work("golden-jingyesi-ps-v1").text;
    const poem = parseText({ text });
    expect(poem.tokens).toHaveLength(20);

    const lookup = await lookupFor(text);
    expect(lookup.entries).toHaveLength(0);
    // 20 字位共 17 个不同字，全部未收录。
    expect(lookup.missing).toHaveLength(17);

    // 缺字是“未收录”，不是“证据未审核”，因此不该抛错，也不该编造读音。
    const annotated = resolveReadings({
      poem,
      lookup,
      overrides: [],
      contextRules: [],
    });
    expect(annotated.tokens).toHaveLength(20);
    for (const token of annotated.tokens) {
      expect(token.readingStatus).toBe("unknown");
      expect(token.toneStatus).toBe("unknown");
      expect(token.selectedReadingId).toBeNull();
      expect(token.candidates).toEqual([]);
      expect(token.effectiveCandidateIds).toEqual([]);
    }
  });

  it("真实数据不修改调用方的 lookup 与 poem", async () => {
    const text = work("golden-jingyesi-ps-v1").text;
    const poem = parseText({ text });
    const lookup = await lookupFor(text);
    const beforeLookup = JSON.stringify(lookup);
    const beforePoem = JSON.stringify(poem);

    resolveReadings({ poem, lookup, overrides: [], contextRules: [] });

    expect(JSON.stringify(lookup)).toBe(beforeLookup);
    expect(JSON.stringify(poem)).toBe(beforePoem);
  });
});
