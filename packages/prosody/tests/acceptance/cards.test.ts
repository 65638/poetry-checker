import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RuleCardSchema, type RuleCard } from "@poetry/contracts";

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
  sourceId: string;
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
      // 证据命名约定：规则证据 ev:rule:*，作品/语境证据 ev:work:* / ctx:*；都必须在 sources 解析
      expect(record.id).toMatch(/^(ev:rule:|ev:work:|ctx:)/);
      expect(sourceIds.has(record.sourceId)).toBe(true);
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

// ---------------------------------------------------------------------------
// D3 复核收尾：发布注册表 vs 合并证据/来源注册表的闭合
//
// `rules/cards/teaching-v1.json` 是 API `provenance.rules` 的唯一来源，它的
// `evidenceIds` 可以指向三类已落库证据（API 装载时三表合并，见
// apps/api/src/resources.ts）：
//   1. rules/evidence/teaching-v1.json     规则依据（ev:rule:*）
//   2. data/context/evidence.json          语境/审批（ctx:*，B 单写）
//   3. data/works/evidence.json            作品元数据（ev:work:*，E 单写）
// 本组断言只校验引用闭合与“不复制证据本体”，不新增审核结论、不提升任何状态。
// ---------------------------------------------------------------------------

interface RegistryRecord {
  id: string;
  sourceId: string;
  kind: string;
  locator: string;
  reviewStatus: string;
}

interface RegistrySourceRef {
  id: string;
}

interface RegistryGroup {
  file: string;
  evidence: RegistryRecord[];
  sources: RegistrySourceRef[];
}

function readRepoJson(rel: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8"),
  ) as unknown;
}

function readEvidenceArray(rel: string): RegistryRecord[] {
  const parsed = readRepoJson(rel);
  if (!Array.isArray(parsed)) throw new Error(`${rel} 必须是 JSON 数组`);
  return parsed as RegistryRecord[];
}

function readSourceArray(rel: string): RegistrySourceRef[] {
  const parsed = readRepoJson(rel);
  if (!Array.isArray(parsed)) throw new Error(`${rel} 必须是 JSON 数组`);
  return parsed as RegistrySourceRef[];
}

function readRuleEvidenceBundle(): { evidence: RegistryRecord[]; sources: RegistrySourceRef[] } {
  const parsed = readRepoJson("rules/evidence/teaching-v1.json") as {
    evidence?: RegistryRecord[];
    sources?: RegistrySourceRef[];
  };
  return { evidence: parsed.evidence ?? [], sources: parsed.sources ?? [] };
}

/** 与 API 装载顺序一致的三表合并视图；附文件名以便断言“证据只存在于一张表”。 */
function mergedRegistry(): RegistryGroup[] {
  const rules = readRuleEvidenceBundle();
  return [
    { file: "rules/evidence/teaching-v1.json", evidence: rules.evidence, sources: rules.sources },
    {
      file: "data/context/evidence.json",
      evidence: readEvidenceArray("data/context/evidence.json"),
      sources: readSourceArray("data/context/sources.json"),
    },
    {
      file: "data/works/evidence.json",
      evidence: readEvidenceArray("data/works/evidence.json"),
      sources: readSourceArray("data/works/sources.json"),
    },
  ];
}

function loadPublishCards(): RuleCard[] {
  const parsed = readRepoJson("rules/cards/teaching-v1.json");
  if (!Array.isArray(parsed)) throw new Error("rules/cards/teaching-v1.json 必须是 JSON 数组");
  return parsed.map((item) => RuleCardSchema.parse(item));
}

describe("发布注册表与合并证据/来源注册表闭合（D3 复核收尾）", () => {
  it("发布注册表为 10 张冻结卡，version 均为 1", () => {
    const cards = loadPublishCards();
    expect(cards).toHaveLength(10);
    expect(cards.map((card) => card.id).sort()).toEqual([...EXPECTED_RULE_IDS].sort());
    for (const card of cards) expect(card.version, card.id).toBe("1");
  });

  it("每张发布卡的 evidenceIds 在合并注册表恰好解析一次、approved、来源可解析", () => {
    const groups = mergedRegistry();
    const occurrences = new Map<string, number>();
    const byId = new Map<string, RegistryRecord>();
    for (const group of groups) {
      for (const record of group.evidence) {
        occurrences.set(record.id, (occurrences.get(record.id) ?? 0) + 1);
        if (!byId.has(record.id)) byId.set(record.id, record);
      }
    }
    const sourceIds = new Set(groups.flatMap((group) => group.sources.map((source) => source.id)));

    const cards = loadPublishCards();
    for (const card of cards) {
      expect(card.evidenceIds.length, `${card.id} 没有任何证据引用`).toBeGreaterThan(0);
      for (const evidenceId of card.evidenceIds) {
        const record = byId.get(evidenceId);
        expect(record, `${card.id} → ${evidenceId} 未在合并注册表解析`).toBeDefined();
        // 同一 ID 出现两次即为“复制证据”，会掩盖两边内容漂移
        expect(occurrences.get(evidenceId), `${evidenceId} 在合并注册表出现多次`).toBe(1);
        expect(record?.reviewStatus, evidenceId).toBe("approved");
        expect(
          sourceIds.has(record!.sourceId),
          `${evidenceId} 的来源断链：${record?.sourceId}`,
        ).toBe(true);
      }
    }
  });

  it("TAIL.SANPING 追加既有 ctx:j03b2:08，且只登记引用不复制证据本体", () => {
    const card = loadPublishCards().find((item) => item.id === "TAIL.SANPING");
    expect(card, "发布注册表缺少 TAIL.SANPING").toBeDefined();
    expect(card?.evidenceIds).toEqual([
      "ev:rule:TAIL.SANPING:engineering-scope",
      "ctx:j03b2:08",
    ]);

    const groups = mergedRegistry();
    const holders = groups
      .filter((group) => group.evidence.some((record) => record.id === "ctx:j03b2:08"))
      .map((group) => group.file);
    // 只存在于 B 已落库的语境注册表；不得在 rules/evidence 复制一份
    expect(holders).toEqual(["data/context/evidence.json"]);

    const ctx = groups
      .flatMap((group) => group.evidence)
      .find((record) => record.id === "ctx:j03b2:08");
    expect(ctx, "ctx:j03b2:08 未注册").toBeDefined();
    expect(ctx?.kind).toBe("context");
    expect(ctx?.reviewStatus).toBe("approved");
    expect(ctx?.locator).toContain("13_J03三首核心诗逐字人审_第二批");
    expect(ctx?.locator).toContain("第 8 条");
    expect(ctx?.sourceId).toBe("src:j03-review-batch2");
    expect(
      groups
        .flatMap((group) => group.sources)
        .some((source) => source.id === "src:j03-review-batch2"),
      "审批证据的来源不可解析",
    ).toBe(true);
  });

  it("运行审核表与发布卡对 TAIL.SANPING 的证据引用一致且全部闭合", () => {
    const card = loadPublishCards().find((item) => item.id === "TAIL.SANPING")!;
    const parsed = readRepoJson("rules/cards/runtime-review-status.json") as {
      cards: Array<{ ruleId: string; evidenceIds: string[] }>;
    };
    const runtime = parsed.cards.find((item) => item.ruleId === "TAIL.SANPING");
    expect(runtime, "运行审核表缺少 TAIL.SANPING").toBeDefined();
    expect([...(runtime?.evidenceIds ?? [])].sort()).toEqual([...card.evidenceIds].sort());

    const groups = mergedRegistry();
    const known = new Set(groups.flatMap((group) => group.evidence.map((record) => record.id)));
    for (const evidenceId of runtime?.evidenceIds ?? []) {
      expect(known.has(evidenceId), `运行审核表引用未注册证据 ${evidenceId}`).toBe(true);
    }
  });
});
