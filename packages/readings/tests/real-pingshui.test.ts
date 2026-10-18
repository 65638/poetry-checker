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

/**
 * 推导「第一个会被门槛拦截的字位」：有候选，且**任一**有效候选缺已审核证据
 * （缺字走 unknown，不算拦截）。
 *
 * 期望完全来自数据（`lookup.evidence[].reviewStatus`），**不调用 resolveReadings**，
 * 避免用被测函数自己生成预期。原实现把 l1c3 / l1c1 写死，A 每批审核都会让它再红一次。
 */
function firstUnbackedToken(
  poem: ReturnType<typeof parseText>,
  lookup: LookupResult,
): { tokenId: string; text: string; mixed: boolean } | null {
  const candidatesByCharacter = new Map(
    lookup.entries.map((entry) => [entry.character, entry.candidates]),
  );
  const approved = new Set(
    lookup.evidence
      .filter((evidence) => evidence.reviewStatus === "approved")
      .map((evidence) => evidence.id),
  );
  for (const token of poem.tokens) {
    const candidates = candidatesByCharacter.get(token.text) ?? [];
    if (candidates.length === 0) continue;
    const backed = candidates.map((candidate) =>
      candidate.evidenceIds.some((id) => approved.has(id)),
    );
    if (backed.every(Boolean)) continue;
    return {
      tokenId: token.tokenId,
      text: token.text,
      // 部分候选已审、部分未审：正是「已审候选不得掩盖未审竞争候选」的形态。
      mixed: backed.some(Boolean),
    };
  }
  return null;
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
      lookup.evidence.every((evidence) => evidence.reviewStatus === "approved"),
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

  it("登鹳雀楼（全量快照）：门槛恰在第一个未审字位拦截，位置由数据推导（当前为 l1c3 依=五微）", async () => {
    const text = work("golden-dengguanquelou-ps-v1").text;
    const poem = parseText({ text });
    const lookup = await lookupFullFor(text);
    const expected = firstUnbackedToken(poem, lookup);

    if (expected === null) {
      // 全部字位证据都已审核：门槛不应再拦截（数据推进后本用例自动转为正向断言）。
      expect(() =>
        resolveReadings({ poem, lookup, overrides: [], contextRules: [] }),
      ).not.toThrow();
      return;
    }

    let caught: unknown;
    try {
      resolveReadings({ poem, lookup, overrides: [], contextRules: [] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReadingsError);
    const error = caught as ReadingsError;
    expect(error.code).toBe("LOOKUP_EVIDENCE_UNVERIFIED");
    // 拦截位置必须与数据推导一致，而不是写死坐标
    expect(error.details.tokenId).toBe(expected.tokenId);
    expect(error.details.character).toBe(expected.text);
    expect(error.details.dataVersion).toBe(fullDataVersion);
  });

  it("黄鹤楼（全量快照）：46 字全收录、缺字 0；门槛在第一个未审字位拦截（当前为 l1c1 昔=十药未审+十一陌已审）", async () => {
    const text = work("golden-huanghelou-ps-v1").text;
    const poem = parseText({ text });
    expect(poem.tokens).toHaveLength(56);

    const lookup = await lookupFullFor(text);
    // A 的覆盖报告称黄鹤楼 46/46：全量快照下没有缺字，缺字路径退场、证据门槛仍在。
    expect(lookup.missing).toHaveLength(0);

    const expected = firstUnbackedToken(poem, lookup);
    if (expected === null) {
      expect(() =>
        resolveReadings({ poem, lookup, overrides: [], contextRules: [] }),
      ).not.toThrow();
      return;
    }

    let caught: unknown;
    try {
      resolveReadings({ poem, lookup, overrides: [], contextRules: [] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReadingsError);
    const error = caught as ReadingsError;
    expect(error.code).toBe("LOOKUP_EVIDENCE_UNVERIFIED");
    expect(error.details.tokenId).toBe(expected.tokenId);

    // 「已审候选不得掩盖未审竞争候选」：首个拦截位是多候选且部分已审时（当前正是「昔」），
    // 真实数据直接钉住该语义；全部审完后由 resolve.test.ts 的
    // 「GATE 混合有效候选」合成用例长期守护，不依赖真实数据的审核进度。
    if (expected.mixed) {
      expect(error.details.character).toBe(expected.text);
    }
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
