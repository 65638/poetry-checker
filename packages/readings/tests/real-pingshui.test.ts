/**
 * B2-08：用 A 的真实快照跑三首固定正文，断言“当前实际状态”。
 *
 * 2026-10-18 起样本快照的 7 条部级证据已随 J03 第一批落库为 approved
 * （快照级 reviewStatus 仍为 unverified——部分批准不等于整库批准）；
 * 证据门槛语义不变：触发门槛的用例改用全量快照中仍未审核的部
 * （依=五微、山=十五删、尽=十一轸、人=十一真 等）。
 * 本改法由 A 在 @GLM @B 反馈中给出，GLM 代改，B 复核。
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
const full = readJson<Record<string, unknown>>(
  "data/normalized/pingshui.full-d2-patched.json",
);
const works = readJson<{ items: WorkEntry[] }>(
  "data/works/review-queue.json",
).items;
const lexicon = createLexicon([deserializeSnapshot(sample)]);
const fullLexicon = createLexicon([deserializeSnapshot(full)]);
const dataVersion = String(sample.dataVersion);
const fullDataVersion = String(full.dataVersion);

async function lookupFor(text: string): Promise<LookupResult> {
  const poem = parseText({ text });
  const characters = [...new Set(poem.tokens.map((token) => token.text))];
  return lexicon.lookupCharacters({
    characters,
    rhymeBook: "pingshui",
    dataVersion,
  });
}

async function lookupFullFor(text: string): Promise<LookupResult> {
  const poem = parseText({ text });
  const characters = [...new Set(poem.tokens.map((token) => token.text))];
  return fullLexicon.lookupCharacters({
    characters,
    rhymeBook: "pingshui",
    dataVersion: fullDataVersion,
  });
}

function work(caseId: string): WorkEntry {
  const found = works.find((item) => item.caseId === caseId);
  if (found === undefined) throw new Error(`找不到作品 ${caseId}`);
  return found;
}

describe("B2-08 真实快照下的逐字状态", () => {
  it("样本证据已随 J03 第一批全部 approved（样本 7/7；本诗命中 5 部全 approved），快照级仍 unverified——部分批准不等于整库批准", async () => {
    const sampleEvidence = sample.evidence as Array<{ reviewStatus: string }>;
    expect(sampleEvidence).toHaveLength(7);
    expect(
      sampleEvidence.every((evidence) => evidence.reviewStatus === "approved"),
    ).toBe(true);
    expect(String(sample.reviewStatus)).toBe("unverified");

    const lookup = await lookupFor(work("golden-dengguanquelou-ps-v1").text);
    expect(lookup.book).toBe("pingshui");
    expect(lookup.dataVersion).toBe(dataVersion);
    // 登鹳雀楼在样本内命中 一更楼流白 → 四质/八庚/二十四敬/十一尤/十一陌 共 5 部
    expect(lookup.evidence).toHaveLength(5);
    expect(
      lookup.evidence.every(
        (evidence) => evidence.reviewStatus === "approved",
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

  it("登鹳雀楼（全量快照）：白=十一陌、日=四质已审，依=五微未审——门槛在 l1c3 依 处拦截", () => {
    const text = work("golden-dengguanquelou-ps-v1").text;
    const poem = parseText({ text });

    return lookupFullFor(text).then((lookup) => {
      let caught: unknown;
      try {
        resolveReadings({ poem, lookup, overrides: [], contextRules: [] });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ReadingsError);
      const error = caught as ReadingsError;
      expect(error.code).toBe("LOOKUP_EVIDENCE_UNVERIFIED");
      expect(error.details.tokenId).toBe("l1c3");
      expect(error.details.character).toBe("依");
      expect(error.details.dataVersion).toBe(fullDataVersion);
    });
  });

  it("黄鹤楼（全量快照）：46 字全收录不再缺字；昔=双候选（十药未审+十一陌已审），未审竞争候选不被已审掩盖，l1c1 即拦截", async () => {
    const text = work("golden-huanghelou-ps-v1").text;
    const poem = parseText({ text });
    expect(poem.tokens).toHaveLength(56);

    const lookup = await lookupFullFor(text);
    // A 的覆盖报告称黄鹤楼 46/46：全量快照下没有缺字，缺字路径退场、证据门槛仍在。
    expect(lookup.missing).toHaveLength(0);

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
    expect(error.details.character).toBe("昔");
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
