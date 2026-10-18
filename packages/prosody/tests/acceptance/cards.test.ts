import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RuleCardSchema } from "@poetry/contracts";

// 规则卡结构校验（D2 审核批次，基线 main 513d3f8）。
// ID 与 version 采用 Codex 2026-10-17 确认口径（10 个固定 ID，首版 version="1"）。
// 2026-10-18 J03 第一批·第三部分：RESCUE.SELF(第10项)/TEAO(第11项)/DUIJU(第12项) 升 approved。

interface CardEntry {
  draftId: string;
  reviewStatus: string;
  status: string;
  reviewNote?: string;
  citation?: string[];
  rule: unknown;
  sourceNeeded: string[];
}

interface EvidenceRecord {
  id: string;
  reviewStatus: string;
  locator: string;
}

interface EvidenceBundle {
  sources: Array<{ id: string }>;
  evidence: EvidenceRecord[];
}

const APPROVED_BY_J03 = new Set(["RESCUE.SELF", "RESCUE.TEAO", "RESCUE.DUIJU"]);

const EXPECTED_RULE_IDS = [
  "METER.POSITION",
  "RHYME.COMMON",
  "RELATION.DUI",
  "RELATION.NIAN",
  "GUPING.NARROW",
  "TAIL.SANPING",
  "TAIL.SANZE",
  "RESCUE.SELF",
  "RESCUE.TEAO",
  "RESCUE.DUIJU",
];

function loadCards(): CardEntry[] {
  const url = new URL("../../../../rules/cards/draft-teaching-v1.json", import.meta.url);
  const raw = readFileSync(url, "utf8");
  const parsed = JSON.parse(raw) as { cards: CardEntry[] };
  return parsed.cards;
}

function loadEvidence(): EvidenceBundle {
  const url = new URL("../../../../rules/evidence/teaching-v1.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as EvidenceBundle;
}

const ruleIdOf = (card: CardEntry): string => (card.rule as { id?: string }).id ?? "";

describe("规则卡与证据闭合（J03 第一批·第三部分）", () => {
  it("共 10 个条目，ID 与 Codex 确认口径一致且 draftId 唯一", () => {
    const cards = loadCards();
    expect(cards).toHaveLength(10);
    expect(cards.map(ruleIdOf).sort()).toEqual([...EXPECTED_RULE_IDS].sort());
    expect(new Set(cards.map((card) => card.draftId)).size).toBe(10);
  });

  it("全部 rule 本体通过 RuleCardSchema 且 version 为 \"1\"", () => {
    for (const card of loadCards()) {
      const rule = RuleCardSchema.parse(card.rule);
      expect(rule.version).toBe("1");
      expect(EXPECTED_RULE_IDS).toContain(rule.id);
    }
  });

  it("三张救法卡按第 10–12 项升 approved，其余保持 draft/pending", () => {
    for (const card of loadCards()) {
      const rule = RuleCardSchema.parse(card.rule);
      if (APPROVED_BY_J03.has(rule.id)) {
        expect(card.reviewStatus).toBe("approved");
        expect(card.status).toBe("approved");
        expect(card.citation?.join("")).toContain("王力文集");
        expect(card.reviewNote ?? "").toMatch(/第 (10|11|12) 项/);
        expect(rule.evidenceIds).toHaveLength(1);
      } else {
        expect(card.reviewStatus).toBe("pending");
        expect(card.status).toBe("draft_only_not_for_release");
        expect(card.citation).toBeUndefined();
        expect(rule.evidenceIds).toEqual([]);
        expect(card.sourceNeeded.join("")).toMatch(/待/);
      }
    }
  });

  it("evidenceIds 全部能在 rules/evidence/teaching-v1.json 解析且状态为 approved", () => {
    const bundle = loadEvidence();
    const byId = new Map(bundle.evidence.map((record) => [record.id, record]));
    const sourceIds = new Set(bundle.sources.map((source) => source.id));
    for (const card of loadCards()) {
      const rule = RuleCardSchema.parse(card.rule);
      for (const evidenceId of rule.evidenceIds) {
        const record = byId.get(evidenceId);
        expect(record, `${rule.id} → ${evidenceId}`).toBeDefined();
        expect(record?.reviewStatus).toBe("approved");
        expect(record?.locator).toMatch(/12_J03人审记录_第一批/);
      }
    }
    for (const record of bundle.evidence) {
      expect(record.id.startsWith("ev:rule:")).toBe(true);
      expect(sourceIds.size).toBeGreaterThan(0);
    }
  });

  it("A 型小拗政策②写入 METER.POSITION，不新增第 11 个规则 ID", () => {
    const cards = loadCards();
    const meter = cards.find((card) => ruleIdOf(card) === "METER.POSITION");
    expect(meter).toBeDefined();
    const rule = RuleCardSchema.parse(meter?.rule);
    expect(rule.statement).toContain("A 型");
    expect(rule.statement).toContain("info");
    expect(cards.filter((card) => ruleIdOf(card) === "METER.POSITION")).toHaveLength(1);
  });

  it("七言对句相救位置按确认写入 6↔5", () => {
    const cards = loadCards();
    const rescue = cards.find((card) => ruleIdOf(card) === "RESCUE.DUIJU");
    const rule = RuleCardSchema.parse(rescue?.rule);
    expect(rule.statement).toContain("第 6 字");
    expect(rule.statement).toContain("第 5 字");
  });
});
