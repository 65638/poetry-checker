import { LookupResultSchema } from "@poetry/contracts";
import { describe, expect, it } from "vitest";

import {
  LexiconError,
  createLexicon,
  isLexiconError,
  lookupCharacters,
  registerSnapshot,
} from "../src/index.js";
import type { LookupResult } from "@poetry/contracts";

import { FIXTURE_VERSION, pingshuiFixture } from "./fixtures.js";

const characters = ["更", "白", "一", "流", "楼"];

function request(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    characters: [...characters],
    rhymeBook: "pingshui" as const,
    dataVersion: FIXTURE_VERSION,
    ...overrides,
  } as { characters: string[]; rhymeBook: "pingshui"; dataVersion: string };
}

function candidatesOf(result: LookupResult, character: string) {
  const entry = result.entries.find((item) => item.character === character);
  if (entry === undefined) throw new Error(`结果中没有 ${character}`);
  return entry.candidates;
}

describe("A-D1-01 批量查询的去重与稳定性", () => {
  it("重复字只查询一次，顺序按码位稳定，输入数组不被改写", async () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    const duplicated = ["更", "白", "一", "流", "楼", "更", "白"];
    const snapshotOfInput = [...duplicated];
    const input = {
      characters: duplicated,
      rhymeBook: "pingshui" as const,
      dataVersion: FIXTURE_VERSION,
    };

    const first = await lexicon.lookupCharacters(input);
    const second = await lexicon.lookupCharacters(input);

    expect(input.characters).toEqual(snapshotOfInput);
    expect(first).toEqual(second);
    expect(first.entries.map((entry) => entry.character)).toEqual([
      "一",
      "更",
      "楼",
      "流",
      "白",
    ]);
    expect(new Set(first.entries.map((entry) => entry.character)).size).toBe(
      first.entries.length,
    );
    expect(first.missing).toEqual([]);
    expect(first.dataVersion).toBe(FIXTURE_VERSION);
    expect(first.book).toBe("pingshui");
    expect(LookupResultSchema.safeParse(first).success).toBe(true);
  });
});

describe("A-D1-02 一字多声多部", () => {
  it("更的平声与去声候选同时保留，不互相覆盖", async () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    const result = await lexicon.lookupCharacters(request());
    const candidates = candidatesOf(result, "更");

    expect(candidates).toHaveLength(2);
    expect(candidates.map((item) => item.toneClass)).toEqual(["ping", "qu"]);
    expect(candidates.map((item) => item.tone)).toEqual(["P", "Z"]);
    const groupIds = candidates.flatMap((item) => item.groupIds);
    expect(new Set(groupIds).size).toBe(2);
    expect(candidates.map((item) => item.id)).toEqual(["更-ping", "更-qu"]);
  });

  it("同部同字的两个字位共享同一韵部对象", async () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    const result = await lexicon.lookupCharacters(request());
    const liu = candidatesOf(result, "流")[0];
    const lou = candidatesOf(result, "楼")[0];
    expect(liu?.groupIds).toEqual(lou?.groupIds);
    expect(result.groups.map((group) => group.name)).toContain("十一尤");
  });
});

describe("A-D1-03 未收录汉字", () => {
  it("未收录字进入 missing，不创建默认声调或拼音", async () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    const result = await lexicon.lookupCharacters(
      request({ characters: ["更", "龘"] }),
    );

    expect(result.missing).toEqual(["龘"]);
    expect(result.entries.map((entry) => entry.character)).toEqual(["更"]);
    expect(result.entries.some((entry) => entry.character === "龘")).toBe(
      false,
    );
    expect(LookupResultSchema.safeParse(result).success).toBe(true);
  });
});

describe("A-D1-04 版本与韵书校验", () => {
  it("未注册版本报可识别错误，不回退也不返回空成功", async () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    let caught: unknown;
    try {
      await lexicon.lookupCharacters(
        request({ dataVersion: "fixture-not-registered" }),
      );
    } catch (error) {
      caught = error;
    }
    expect(isLexiconError(caught)).toBe(true);
    if (!isLexiconError(caught)) throw new Error("未抛出 LexiconError");
    expect(caught.code).toBe("LEXICON_VERSION_NOT_FOUND");
    expect(caught.message).toContain("fixture-not-registered");
  });

  it("公共入口 lookupCharacters 同样不静默回退", async () => {
    await expect(
      lookupCharacters(request({ dataVersion: "fixture-公共入口未注册" })),
    ).rejects.toBeInstanceOf(LexiconError);
  });

  it("韵书与快照不一致时报 LEXICON_BOOK_MISMATCH", async () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    await expect(
      lexicon.lookupCharacters({
        characters: ["白"],
        rhymeBook: "cilin",
        dataVersion: FIXTURE_VERSION,
      }),
    ).rejects.toMatchObject({ code: "LEXICON_BOOK_MISMATCH" });
  });

  it("同一 dataVersion 不能被静默覆盖", () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    expect(() => lexicon.registerSnapshot(pingshuiFixture())).toThrow(
      /dataVersion 已注册/u,
    );
  });

  it("非单码点输入被拒绝", async () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    await expect(
      lexicon.lookupCharacters(request({ characters: ["白日"] })),
    ).rejects.toMatchObject({ code: "LEXICON_INVALID_INPUT" });
  });

  it("注册到公共入口后可按同一签名查询", async () => {
    registerSnapshot(pingshuiFixture());
    const result = await lookupCharacters(request());
    expect(result.entries).toHaveLength(characters.length);
    expect(result.book).toBe("pingshui");
  });
});

describe("A-D1-05 缺失事实与证据引用", () => {
  it("无反切、义项、今读时为 null，证据与来源全部可解析", async () => {
    const lexicon = createLexicon([pingshuiFixture()]);
    const result = await lexicon.lookupCharacters(request());

    const evidenceIds = new Set(result.evidence.map((item) => item.id));
    const sourceIds = new Set(result.sources.map((item) => item.id));
    const groupIds = new Set(result.groups.map((item) => item.id));

    for (const entry of result.entries) {
      for (const candidate of entry.candidates) {
        expect(candidate.fanqie).toBeNull();
        expect(candidate.gloss).toBeNull();
        expect(candidate.modernReading).toBeNull();
        expect(candidate.evidenceIds.length).toBeGreaterThan(0);
        for (const id of candidate.evidenceIds) {
          expect(evidenceIds.has(id)).toBe(true);
        }
        for (const id of candidate.groupIds) {
          expect(groupIds.has(id)).toBe(true);
        }
      }
    }
    for (const item of result.evidence) {
      expect(sourceIds.has(item.sourceId)).toBe(true);
      expect(item.excerpt).toBeNull();
    }
    expect(result.sources).toHaveLength(1);
    expect(LookupResultSchema.safeParse(result).success).toBe(true);
  });
});
