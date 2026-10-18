/**
 * `data/context/rules.json` 的结构、证据与绑定校验。
 *
 * 校验的是「规则能不能被装载并被正确指到那个字位」，不调用 resolveReadings：
 * 期望来自人审记录与真实快照，避免用被测函数自证。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import {
  ContextRuleSchema,
  EvidenceSchema,
  SourceRecordSchema,
} from "@poetry/contracts";
import type { ContextRule, Evidence, SourceRecord } from "@poetry/contracts";

import { parseText } from "../src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

const rules = readJson<ContextRule[]>("data/context/rules.json");
const evidence = readJson<Evidence[]>("data/context/evidence.json");
const sources = readJson<SourceRecord[]>("data/context/sources.json");
const snapshot = readJson<{
  candidates: Array<{ id: string; character: string }>;
}>("data/normalized/pingshui.full-d2-patched.json");
const works = readJson<{
  items: Array<{ caseId: string; title: string; text: string }>;
}>("data/works/review-queue.json").items;

const evidenceById = new Map(evidence.map((item) => [item.id, item]));
const sourceIds = new Set(sources.map((item) => item.id));
const candidatesById = new Map(
  snapshot.candidates.map((candidate) => [candidate.id, candidate]),
);

describe("data/context/rules.json", () => {
  it("十条规则都通过冻结 Schema，且都是 approved 的单候选选择", () => {
    expect(rules).toHaveLength(10);
    for (const rule of rules) {
      const parsed = ContextRuleSchema.safeParse(rule);
      expect(
        parsed.success,
        `${rule.id}: ${parsed.error?.issues.map((i) => i.message).join("; ")}`,
      ).toBe(true);
      expect(rule.reviewStatus).toBe("approved");
      expect(rule.selectCandidateIds).toHaveLength(1);
      expect(rule.book).toBe("pingshui");
      expect(rule.exactPhrases.length).toBeGreaterThan(0);
    }
  });

  it("规则证据是 approved 且 kind=context，来源可解析", () => {
    for (const rule of rules) {
      expect(rule.evidenceIds.length).toBeGreaterThan(0);
      for (const evidenceId of rule.evidenceIds) {
        const item = evidenceById.get(evidenceId);
        expect(
          item,
          `${rule.id} 引用了不存在的证据 ${evidenceId}`,
        ).toBeDefined();
        expect(item?.kind).toBe("context");
        expect(item?.reviewStatus).toBe("approved");
        expect(sourceIds.has(item?.sourceId ?? "")).toBe(true);
        expect(EvidenceSchema.safeParse(item).success).toBe(true);
      }
    }
    for (const source of sources) {
      expect(SourceRecordSchema.safeParse(source).success).toBe(true);
    }
  });

  it("去掉韵书归部证据也不能顶替语境依据：规则证据里没有 rhyme_entry", () => {
    for (const rule of rules) {
      for (const evidenceId of rule.evidenceIds) {
        expect(evidenceById.get(evidenceId)?.kind).not.toBe("rhyme_entry");
      }
    }
  });

  it("每条规则能在三首正文里精确命中，且目标偏移指向目标字", () => {
    const hits = new Map<string, number>();
    for (const rule of rules) {
      let matched = 0;
      for (const work of works) {
        const poem = parseText({ text: work.text });
        const byLine = new Map<number, string[]>();
        for (const token of poem.tokens) {
          const bucket = byLine.get(token.line) ?? [];
          bucket.push(token.text);
          byLine.set(token.line, bucket);
        }
        for (const characters of byLine.values()) {
          for (const phrase of rule.exactPhrases) {
            const target = [...phrase];
            for (
              let start = 0;
              start + target.length <= characters.length;
              start += 1
            ) {
              const window = characters.slice(start, start + target.length);
              if (window.join("") !== phrase) continue;
              const atOffset = characters[start + rule.targetOffset];
              expect(
                atOffset,
                `${rule.id} 在 ${work.title} 命中「${phrase}」时偏移 ${rule.targetOffset} 处是「${atOffset}」`,
              ).toBe(rule.target);
              matched += 1;
            }
          }
        }
      }
      hits.set(rule.id, matched);
    }
    for (const [ruleId, count] of hits) {
      expect(count, `${ruleId} 未能在三首正文中命中`).toBeGreaterThan(0);
    }
  });

  it("所选候选存在于真实快照中，且未删除同字的其他读音候选", () => {
    for (const rule of rules) {
      const chosenId = rule.selectCandidateIds[0];
      expect(chosenId, `${rule.id} 缺少被选候选`).toBeDefined();
      const chosen =
        chosenId === undefined ? undefined : candidatesById.get(chosenId);
      expect(chosen, `${rule.id} 的候选不在快照里`).toBeDefined();
      expect(chosen?.character).toBe(rule.target);

      // 同字的竞争候选仍在快照里（规则只做选音，不删数据）。
      const sameCharacter = snapshot.candidates.filter(
        (candidate) => candidate.character === rule.target,
      );
      expect(sameCharacter.length).toBeGreaterThan(0);
      expect(
        sameCharacter.some(
          (candidate) => candidate.id === rule.selectCandidateIds[0],
        ),
      ).toBe(true);
    }
  });

  it("每条规则都有反例，且反例不与命中短语重复", () => {
    for (const rule of rules) {
      expect(rule.negativeExamples.length).toBeGreaterThan(0);
      for (const negative of rule.negativeExamples) {
        expect(rule.exactPhrases).not.toContain(negative);
      }
    }
  });
});
