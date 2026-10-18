import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RuleCard } from "@poetry/contracts";
import { loadResources, unresolvedRuleEvidence } from "../src/resources.js";

// 规则卡证据记录（rules/evidence/teaching-v1.json）的注册与闭合测试。
// 三条 ev:rule:* 依据 docs/reviews/12_J03人审记录_第一批.md 第三部分第 10–12 项（2026-10-18 组长人审）。

const EXPECTED_EVIDENCE_IDS = [
  "ev:rule:RESCUE.SELF:wangli15-p339",
  "ev:rule:RESCUE.TEAO:wangli15-p336-338",
  "ev:rule:RESCUE.DUIJU:wangli15-p339-341",
] as const;

function readDraftCards(): Array<{ rule?: RuleCard }> {
  const url = new URL("../../../rules/cards/draft-teaching-v1.json", import.meta.url);
  const raw = JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as {
    cards?: Array<{ rule?: RuleCard }>;
  };
  return raw.cards ?? [];
}

describe("规则卡证据·注册表", () => {
  it("三条救法证据已注册，approved，来源可解析且声明不复制原文", () => {
    const r = loadResources();
    const byId = new Map(r.evidenceRegistry.map((e) => [e.id, e]));
    for (const id of EXPECTED_EVIDENCE_IDS) {
      const ev = byId.get(id);
      expect(ev, `缺少证据 ${id}`).toBeDefined();
      expect(ev?.reviewStatus).toBe("approved");
      expect(ev?.kind).toBe("dictionary");
      expect(ev?.excerpt).toBeNull();
      expect(ev?.locator).toContain("人审 docs/reviews/12_J03人审记录_第一批.md");
    }
    const src = r.sourceRegistry.find((s) => s.id === "src:wangli:wenji15");
    expect(src, "缺少王力文集来源记录").toBeDefined();
    expect(src?.license).toContain("不存储、不复制原文");
    // 每条证据的 sourceId 都能在来源注册表解析
    for (const id of EXPECTED_EVIDENCE_IDS) {
      const ev = byId.get(id);
      expect(r.sourceRegistry.some((s) => s.id === ev?.sourceId)).toBe(true);
    }
  });

  it("unresolvedRuleEvidence：未知 ID 如实报告，已知 ID 闭合", () => {
    const registry = loadResources().evidenceRegistry;
    const base: RuleCard = {
      id: "RESCUE.SELF",
      version: "1",
      name: "孤平自救",
      scope: "B 型平收句",
      statement: "测试卡",
      limitations: [],
      evidenceIds: [],
    };
    const ok: RuleCard[] = [
      { ...base, evidenceIds: [...EXPECTED_EVIDENCE_IDS] },
    ];
    expect(unresolvedRuleEvidence(ok, registry)).toEqual([]);
    const broken: RuleCard[] = [
      { ...base, evidenceIds: ["ev:rule:RESCUE.SELF:wangli15-p339", "ev:missing:demo"] },
    ];
    expect(unresolvedRuleEvidence(broken, registry)).toEqual(["ev:missing:demo"]);
  });

  it("草稿规则卡引用的全部 evidenceIds 均可解析（回填后成为硬门槛）", () => {
    const registry = loadResources().evidenceRegistry;
    const cards = readDraftCards()
      .map((c) => c.rule)
      .filter((r): r is RuleCard => r !== undefined);
    expect(cards.length).toBeGreaterThan(0);
    // 当前草稿卡 evidenceIds 尚为空（等 feat/c-d2-acceptance 合并后回填 ev: ID）；
    // 一旦回填，本断言要求每个 ID 都在注册表中闭合。
    const allIds = cards.flatMap((c) => c.evidenceIds);
    expect(unresolvedRuleEvidence(cards, registry)).toEqual([]);
    if (allIds.length === 0) {
      expect(allIds).toEqual([]);
    }
  });
});
