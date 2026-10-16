import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RuleCardSchema } from "@poetry/contracts";

// 规则卡草案结构校验：草案不得进入发布来源集合，不能伪造出处。

interface DraftCardEntry {
  draftId: string;
  reviewStatus: string;
  status: string;
  rule: unknown;
  sourceNeeded: string[];
}

const EXPECTED_RULE_IDS = [
  "METER.POSITION",
  "RHYME.COMMON_GROUP",
  "RELATION.DUI",
  "RELATION.NIAN",
  "GUPING.NARROW",
  "TAIL.SANPING",
  "TAIL.SANZE",
  "RESCUE.SELF",
  "RESCUE.TEAO",
  "RESCUE.DUIJU",
];

function loadCards(): DraftCardEntry[] {
  const url = new URL("../../../../rules/cards/draft-teaching-v1.json", import.meta.url);
  const raw = readFileSync(url, "utf8");
  const parsed = JSON.parse(raw) as { cards: DraftCardEntry[] };
  return parsed.cards;
}

describe("规则卡草案结构校验（draft-only，非发布数据）", () => {
  it("共 10 个条目，提案 ID 与预期一致且 draftId 唯一", () => {
    const cards = loadCards();
    expect(cards).toHaveLength(10);
    expect(
      cards.map((card) => (card.rule as { id?: string }).id).sort(),
    ).toEqual([...EXPECTED_RULE_IDS].sort());
    expect(new Set(cards.map((card) => card.draftId)).size).toBe(10);
  });

  it("每个 rule 本体通过 RuleCardSchema，且标记为待审核草案", () => {
    for (const card of loadCards()) {
      expect(card.reviewStatus).toBe("pending");
      expect(card.status).toBe("draft_only_not_for_release");
      const rule = RuleCardSchema.parse(card.rule);
      expect(rule.version).toBe("draft-1");
    }
  });

  it("不伪造出处：草案不带 evidenceIds，且每条都注明来源待补/待核实", () => {
    for (const card of loadCards()) {
      const rule = RuleCardSchema.parse(card.rule);
      expect(rule.evidenceIds).toEqual([]);
      expect(card.sourceNeeded.length).toBeGreaterThan(0);
      expect(card.sourceNeeded.join("")).toMatch(/待/);
    }
  });
});
