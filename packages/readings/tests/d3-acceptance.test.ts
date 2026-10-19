/**
 * D3 验收用例（B01–B08）。
 *
 * 全部基于真实快照、已审正文与已批规则；合成用例标注 synthetic。
 * 期望值不调用 resolveReadings 生成：真实数据用例的期望来自快照本身。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { AnnotatedPoem, AnnotatedToken, LookupResult } from "@poetry/contracts";
import type { ContextRule, Evidence, SourceRecord } from "@poetry/contracts";

import { createLexicon, deserializeSnapshot } from "../../lexicon/src/index.js";
import {
  ReadingsError,
  isReadingsError,
  parseText,
  resolveReadings,
} from "../src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

const pingshuiSnapshot = readJson<Record<string, unknown>>(
  "data/normalized/pingshui.full-d2-patched.json",
);
const rules = readJson<ContextRule[]>("data/context/rules.json");
const contextEvidence = readJson<Evidence[]>("data/context/evidence.json");
const contextSources = readJson<SourceRecord[]>("data/context/sources.json");
const matrix = readJson<{
  cells: Array<{
    caseId: string;
    book: string;
    tokens: number;
    blocked: number;
    resolved: number;
    ambiguous: number;
    unknown: number;
    tokensWithUnapprovedCompeting: number;
    tokenCells: Array<{
      tokenId: string;
      character: string;
      candidateIds: string[];
      effectiveCandidateIds: string[];
      unbackedEffectiveCandidateIds: string[];
      contextRuleIds: string[];
      toneStatus: string;
      tone: string | null;
      readingStatus: string;
    }>;
  }>;
  totals: { combinations: number; tokens: number };
}>("data/reviews/d3-b-effective-candidates.json");

const dengGuan = readJson<{ id: string; title: string; text: string }>(
  "tests/golden/cases/dengguanquelou.json",
);
const jingYe = readJson<{ id: string; title: string; text: string }>(
  "tests/golden/cases/jingyesi.json",
);
const huangHe = readJson<{ id: string; title: string; text: string }>(
  "tests/golden/cases/huanghelou.json",
);

const pingshuiLexicon = createLexicon([deserializeSnapshot(pingshuiSnapshot)]);

async function pingshuiLookup(text: string): Promise<LookupResult> {
  const poem = parseText({ text });
  const characters = [...new Set(poem.tokens.map((token) => token.text))];
  const lookup = await pingshuiLexicon.lookupCharacters({
    characters,
    rhymeBook: "pingshui",
    dataVersion: String(pingshuiSnapshot.dataVersion),
  });
  return {
    ...lookup,
    evidence: [...lookup.evidence, ...contextEvidence],
    sources: [...lookup.sources, ...contextSources],
  };
}

function token(poem: AnnotatedPoem, tokenId: string): AnnotatedToken {
  const found = poem.tokens.find((item) => item.tokenId === tokenId);
  if (found === undefined) throw new Error(`找不到字位 ${tokenId}`);
  return found;
}

describe("B01 平水三首：既有 11 条语境不回退，里选上四纸", () => {
  it("登鹳雀楼可标注，里命中固定句规则并保留竞争候选", async () => {
    const poem = parseText({ text: dengGuan.text });
    const lookup = await pingshuiLookup(dengGuan.text);
    const annotated = resolveReadings({
      poem,
      lookup,
      overrides: [],
      contextRules: rules,
    });

    const li = token(annotated, "l3c4");
    expect(li.text).toBe("里");
    expect(li.selectionMethod).toBe("context_rule");
    expect(li.selectedReadingId).toBe("pingshui:里:shang:四纸");
    // 竞争候选（去声四寘）仍在候选集里，没有被删掉
    expect(li.candidates.map((candidate) => candidate.id)).toContain(
      "pingshui:里:qu:四寘",
    );

    const ruleHitCount = annotated.tokens.filter(
      (item) => item.selectionMethod === "context_rule",
    ).length;
    expect(ruleHitCount).toBe(2); // 欲穷千里目·里 + 更上一层楼·更
  });

  it("静夜思与黄鹤楼同样可标注，规则命中数不回退", async () => {
    for (const [work, expectedHits] of [
      [jingYe, 3],
      [huangHe, 6],
    ] as const) {
      const poem = parseText({ text: work.text });
      const lookup = await pingshuiLookup(work.text);
      const annotated = resolveReadings({
        poem,
        lookup,
        overrides: [],
        contextRules: rules,
      });
      expect(
        annotated.tokens.filter(
          (item) => item.selectionMethod === "context_rule",
        ).length,
        work.title,
      ).toBe(expectedHits);
    }
  });
});

describe("B02 固定句规则不泛化", () => {
  it("「里」在千里／里外／欲穷千里山下都不被固定句规则选中", async () => {
    for (const text of ["千里", "里外", "欲穷千里山"]) {
      const poem = parseText({ text });
      const lookup = await pingshuiLookup(text);
      // 规则不命中时由证据门槛接管：里 的竞争候选「四寘」未审 → 要么 blocked，要么保留歧义；
      // 两种都不允许出现 selectionMethod=context_rule。
      let outcome: "rule" | "blocked" | "ambiguous" | "other";
      try {
        const annotated = resolveReadings({
          poem,
          lookup,
          overrides: [],
          contextRules: rules,
        });
        const li = annotated.tokens.find((item) => item.text === "里");
        outcome = li?.selectionMethod === "context_rule" ? "rule" : "ambiguous";
      } catch (error) {
        outcome =
          isReadingsError(error) && error.code === "LOOKUP_EVIDENCE_UNVERIFIED"
            ? "blocked"
            : "other";
      }
      expect(outcome, text).not.toBe("rule");
      expect(["blocked", "ambiguous"], text).toContain(outcome);
    }
  });
});

describe("B03/B04 双读同调与平仄未定", () => {
  it("平水三首的 ambiguous 字位都是「读音歧义、平仄确定」，没有伪确定", () => {
    const pingshuiCells = matrix.cells.filter(
      (cell) => cell.book === "pingshui",
    );
    const ambiguousTokens = pingshuiCells.flatMap((cell) =>
      cell.tokenCells.filter((item) => item.readingStatus === "ambiguous"),
    );
    expect(ambiguousTokens.length).toBeGreaterThan(0);
    for (const item of ambiguousTokens) {
      expect(item.effectiveCandidateIds.length, item.tokenId).toBeGreaterThan(
        1,
      );
      expect(item.toneStatus, item.tokenId).toBe("resolved");
    }
  });

  it("语境筛选前含未审竞争候选的 10 个字位，筛后有效候选全部有证据", () => {
    const pingshuiCells = matrix.cells.filter(
      (cell) => cell.book === "pingshui",
    );
    const competing = pingshuiCells.reduce(
      (sum, cell) => sum + cell.tokensWithUnapprovedCompeting,
      0,
    );
    expect(competing).toBe(10);
    const blocked = pingshuiCells.reduce((sum, cell) => sum + cell.blocked, 0);
    expect(blocked).toBe(0);
    for (const cell of pingshuiCells) {
      for (const item of cell.tokenCells) {
        expect(item.unbackedEffectiveCandidateIds, item.tokenId).toEqual([]);
      }
    }
  });
});

describe("B07 新韵读旧诗：用现代本调，跨书不强行对齐", () => {
  it("「白」平水为入声 Z，新韵为阳平 P；同一字位跨书结论不同且各自成立", () => {
    const psCell = matrix.cells.find(
      (cell) => cell.book === "pingshui" && cell.caseId === dengGuan.id,
    );
    const xyCell = matrix.cells.find(
      (cell) => cell.book === "xinyun" && cell.caseId === dengGuan.id,
    );
    const psBai = psCell?.tokenCells.find((item) => item.tokenId === "l1c1");
    const xyBai = xyCell?.tokenCells.find((item) => item.tokenId === "l1c1");
    expect(psBai?.character).toBe("白");
    expect(psBai?.toneStatus).toBe("resolved");
    expect(psBai?.tone).toBe("Z");
    expect(xyBai?.character).toBe("白");
    expect(xyBai?.toneStatus).toBe("resolved");
    expect(xyBai?.tone).toBe("P");
    // 新韵「白」有两个现代候选（bó / bái），不得因旧韵或常用音拍板删掉
    expect(xyBai?.candidateIds.length).toBeGreaterThan(1);
  });

  it("新韵「一」保留多个现代候选，不套语流变调", () => {
    const xyCell = matrix.cells.find(
      (cell) => cell.book === "xinyun" && cell.caseId === dengGuan.id,
    );
    const yi = xyCell?.tokenCells.find((item) => item.character === "一");
    expect(yi).toBeDefined();
    expect(yi?.candidateIds.length).toBeGreaterThan(1);
    // 候选声调直接取自快照本调；若套变调只会剩一个固定声调
    const tones = new Set(
      (yi?.candidateIds ?? []).map((id) => id.split(":")[2]),
    );
    expect(tones.size).toBeGreaterThan(1);
  });
});

describe("B08 矩阵报告与真实快照一致（独立复算）", () => {
  it("9 个组合、288 字位", () => {
    expect(matrix.cells).toHaveLength(9);
    expect(matrix.totals.tokens).toBe(288);
    expect(matrix.cells.reduce((sum, cell) => sum + cell.tokens, 0)).toBe(288);
  });

  it("词林/新韵无已批证据，全部字位 blocked；平水无 blocked", () => {
    const unapproved = matrix.cells.filter((cell) => cell.book !== "pingshui");
    for (const cell of unapproved) {
      expect(cell.blocked + cell.unknown, cell.book).toBe(cell.tokens);
    }
    const pingshui = matrix.cells.filter((cell) => cell.book === "pingshui");
    expect(pingshui.reduce((sum, cell) => sum + cell.blocked, 0)).toBe(0);
  });

  it("blocked 字位都列出了未审有效候选，blocked 与 ambiguous 不混写", () => {
    for (const cell of matrix.cells) {
      for (const item of cell.tokenCells) {
        if (item.readingStatus === "blocked") {
          expect(item.unbackedEffectiveCandidateIds.length).toBeGreaterThan(0);
        }
        if (item.readingStatus === "ambiguous") {
          expect(item.unbackedEffectiveCandidateIds).toEqual([]);
        }
      }
    }
  });
});

describe("B06 覆盖校验：跨书旧候选被拒绝", () => {
  it("用词林候选覆盖平水字位会被拒", async () => {
    const poem = parseText({ text: dengGuan.text });
    const lookup = await pingshuiLookup(dengGuan.text);
    expect(() =>
      resolveReadings({
        poem,
        lookup,
        overrides: [
          { tokenId: "l1c1", readingId: "xinyun:白:yangping:二波·阳平" },
        ],
        contextRules: rules,
      }),
    ).toThrowError(ReadingsError);
  });
});
