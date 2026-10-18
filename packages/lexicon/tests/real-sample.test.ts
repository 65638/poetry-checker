import { readFileSync } from "node:fs";

import { LookupResultSchema } from "@poetry/contracts";
import { describe, expect, it } from "vitest";

import {
  PINGSHUI_GATE,
  checkCompleteness,
  createLexicon,
  deserializeSnapshot,
  isLexiconError,
} from "../src/index.js";

/**
 * 真实七字小样本：由 scripts/data/build-sample.ts 从 data/raw 的固定快照生成。
 * 身份是“开发/待审核”，不是发布数据；反切、义项、今读没有来源，一律为 null。
 */
const SAMPLE = new URL(
  "../../../data/normalized/pingshui.sample-d1.json",
  import.meta.url,
);

const EXPECTED: ReadonlyArray<readonly [string, string, string]> = [
  ["白", "ru", "入声十一陌"],
  ["一", "ru", "入声四质"],
  ["流", "ping", "十一尤"],
  ["楼", "ping", "十一尤"],
  ["雪", "ru", "入声九屑"],
  ["物", "ru", "入声五物"],
];

function loadSnapshot() {
  return deserializeSnapshot(JSON.parse(readFileSync(SAMPLE).toString("utf8")));
}

describe("真实七字小样本（平水，未审核）", () => {
  it("小样本身份明确：未审核、来源固定提交、缺部未补", () => {
    const snapshot = loadSnapshot();
    expect(snapshot.book).toBe("pingshui");
    expect(snapshot.reviewStatus).toBe("unverified");
    expect(snapshot.dataVersion).toBe("sample-pingshui-cwr-ff0e9c1-d1-review2");
    expect(snapshot.sources[0]?.revision).toBe(
      "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18",
    );
    expect(snapshot.sources[0]?.snapshotSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshot.groups.map((group) => group.name)).not.toContain("三讲");
  });

  it("七字的真实归部与声类可查询，且候选不被压成单一平仄", async () => {
    const snapshot = loadSnapshot();
    const lexicon = createLexicon([snapshot]);
    const result = await lexicon.lookupCharacters({
      characters: ["白", "一", "更", "流", "楼", "雪", "物"],
      rhymeBook: "pingshui",
      dataVersion: snapshot.dataVersion,
    });

    expect(result.missing).toEqual([]);
    expect(LookupResultSchema.safeParse(result).success).toBe(true);

    const byCharacter = new Map(
      result.entries.map((entry) => [entry.character, entry.candidates]),
    );

    for (const [character, toneClass, groupName] of EXPECTED) {
      const candidates = byCharacter.get(character) ?? [];
      expect(candidates.map((item) => item.toneClass)).toEqual([toneClass]);
      const groupIds = new Set(candidates.flatMap((item) => item.groupIds));
      const names = result.groups
        .filter((group) => groupIds.has(group.id))
        .map((group) => group.name);
      expect(names).toEqual([groupName]);
      expect(candidates[0]?.tone).toBe(toneClass === "ping" ? "P" : "Z");
    }

    // “更”必须同时保留平声与去声两个候选。
    const geng = byCharacter.get("更") ?? [];
    expect(geng).toHaveLength(2);
    expect(geng.map((item) => item.toneClass).sort()).toEqual(["ping", "qu"]);
    const gengGroups = new Set(geng.flatMap((item) => item.groupIds));
    expect(
      result.groups
        .filter((group) => gengGroups.has(group.id))
        .map((group) => group.name)
        .sort(),
    ).toEqual(["二十四敬", "八庚"]);
  });

  it("反切、义项、今读没有来源时保持 null，证据与来源可解析", async () => {
    const snapshot = loadSnapshot();
    const lexicon = createLexicon([snapshot]);
    const result = await lexicon.lookupCharacters({
      characters: ["白", "更", "物"],
      rhymeBook: "pingshui",
      dataVersion: snapshot.dataVersion,
    });

    const evidenceIds = new Set(result.evidence.map((item) => item.id));
    const sourceIds = new Set(result.sources.map((item) => item.id));
    for (const entry of result.entries) {
      for (const candidate of entry.candidates) {
        expect(candidate.fanqie).toBeNull();
        expect(candidate.gloss).toBeNull();
        expect(candidate.modernReading).toBeNull();
        for (const id of candidate.evidenceIds)
          expect(evidenceIds.has(id)).toBe(true);
      }
    }
    for (const item of result.evidence) {
      expect(sourceIds.has(item.sourceId)).toBe(true);
      // 已审仅限具体候选，不将第一批单字结论扩张到整个韵部。
      expect(item.reviewStatus).toBe(
        item.id.startsWith("ev:candidate:") ? "approved" : "unverified",
      );
    }
  });

  it("小样本不是发布数据：门槛不通过，且未注册版本仍可识别报错", async () => {
    const snapshot = loadSnapshot();
    const report = checkCompleteness(snapshot, PINGSHUI_GATE);
    expect(report.releaseGatePassed).toBe(false);
    expect(report.groupCount).toBeLessThan(report.expectedGroupCount);

    const lexicon = createLexicon([]);
    let caught: unknown;
    try {
      await lexicon.lookupCharacters({
        characters: ["白"],
        rhymeBook: "pingshui",
        dataVersion: snapshot.dataVersion,
      });
    } catch (error) {
      caught = error;
    }
    expect(isLexiconError(caught) && caught.code).toBe(
      "LEXICON_VERSION_NOT_FOUND",
    );
  });
});
