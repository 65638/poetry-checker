import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RuleCardSchema } from "@poetry/contracts";

// 规则卡草案结构校验：未人审的卡不得进入发布来源集合，不能伪造出处。
// ID 与 version 采用 Codex 2026-10-17 确认口径（10 个固定 ID，首版 version="1"）。
// 2026-10-18：RESCUE.SELF/TEAO/DUIJU 按组长 J03 第一批人审升 approved。

interface DraftCardEntry {
  draftId: string;
  reviewStatus: string;
  status: string;
  reviewNote?: string;
  citation?: string[];
  rule: unknown;
  sourceNeeded: string[];
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

function loadCards(): DraftCardEntry[] {
  const url = new URL("../../../../rules/cards/draft-teaching-v1.json", import.meta.url);
  const raw = readFileSync(url, "utf8");
  const parsed = JSON.parse(raw) as { cards: DraftCardEntry[] };
  return parsed.cards;
}

const ruleIdOf = (card: DraftCardEntry): string =>
  (card.rule as { id?: string }).id ?? "";

describe("规则卡状态校验（J03 人审后）", () => {
  it("共 10 个条目，ID 与 Codex 确认口径一致且 draftId 唯一", () => {
    const cards = loadCards();
    expect(cards).toHaveLength(10);
    expect(cards.map(ruleIdOf).sort()).toEqual([...EXPECTED_RULE_IDS].sort());
    expect(new Set(cards.map((card) => card.draftId)).size).toBe(10);
  });

  it("三张救法卡按 J03 人审升 approved，其余保持待审草案", () => {
    for (const card of loadCards()) {
      const rule = RuleCardSchema.parse(card.rule);
      expect(rule.version).toBe("1");
      if (APPROVED_BY_J03.has(rule.id)) {
        expect(card.reviewStatus).toBe("approved");
        expect(card.status).toBe("approved_pending_evidence");
        expect(card.citation?.length ?? 0).toBeGreaterThan(0);
        expect(card.reviewNote ?? "").toContain("J03");
      } else {
        expect(card.reviewStatus).toBe("pending");
        expect(card.status).toBe("draft_only_not_for_release");
        expect(card.citation).toBeUndefined();
      }
    }
  });

  it("未伪造证据：全部卡片 evidenceIds 为空，待审卡注明来源待补", () => {
    for (const card of loadCards()) {
      const rule = RuleCardSchema.parse(card.rule);
      expect(rule.evidenceIds).toEqual([]);
      expect(card.sourceNeeded.length).toBeGreaterThan(0);
      if (card.reviewStatus !== "approved") {
        expect(card.sourceNeeded.join("")).toMatch(/待/);
      }
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

  it("七言对句相救位置按确认写入 6↔5，且引用王力文集卷次+页码", () => {
    const cards = loadCards();
    const rescue = cards.find((card) => ruleIdOf(card) === "RESCUE.DUIJU")!;
    const rule = RuleCardSchema.parse(rescue.rule);
    expect(rule.statement).toContain("第 6 字");
    expect(rule.statement).toContain("第 5 字");
    expect(rescue.citation?.join("")).toContain("王力文集");
    expect(rescue.citation?.join("")).toMatch(/页\s?339/);
  });
});
