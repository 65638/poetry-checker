/**
 * D5 产物守卫：行为映射不漂移、六格预期自洽、草稿材料不冒充可批准。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const DIR = "data/reviews/d5/b";

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, DIR, name), "utf8")) as T;
}

interface BehaviorMap {
  behaviors: Array<{
    id: string;
    cases: Array<{ testFile: string; caseName: string; dataKind: string }>;
  }>;
}

interface SixCell {
  cells: Array<{
    book: string;
    dataVersion: string;
    evidenceApproved: string;
    summary: Record<string, number>;
    tokens: Array<{
      tokenId: string;
      character: string;
      candidateIds: string[];
      possibleTones: string[];
      contextRuleIds: string[];
      currentExpectation: string;
      conditionalExpectation: string;
      conditionalToneStatus: string;
      undetermined: boolean;
      conditionalBasis: string;
    }>;
  }>;
  coverage: Record<string, number>;
}

interface ReviewReady {
  counts: { drafts: number; notApprovalReady: number };
  items: Array<{
    book: string;
    candidateIds: string[];
    proposedSelection: string | null;
    readiness: string;
    reviewStatus: string;
    aSideDependency: { requiredEvidence: string[] };
  }>;
}

const behaviorMap = readJson<BehaviorMap>("context-behavior-map.json");
const sixCell = readJson<SixCell>("six-cell-expectations.json");
const reviewReady = readJson<ReviewReady>("context-review-ready.json");

describe("G34–G36 行为证据映射", () => {
  it("三个行为都有用例，且每条用例名仍能在标注的文件里找到", () => {
    expect(behaviorMap.behaviors.map((item) => item.id)).toEqual([
      "G34",
      "G35",
      "G36",
    ]);
    for (const behavior of behaviorMap.behaviors) {
      expect(behavior.cases.length, behavior.id).toBeGreaterThan(0);
      for (const entry of behavior.cases) {
        const content = readFileSync(path.join(ROOT, entry.testFile), "utf8");
        expect(
          content.includes(entry.caseName),
          `${entry.testFile} 里找不到用例「${entry.caseName}」`,
        ).toBe(true);
        expect(["mechanism", "real-data"]).toContain(entry.dataKind);
      }
    }
  });

  it("受控 fixture 与真实数据用例都被标明，不混称", () => {
    const kinds = behaviorMap.behaviors.flatMap((behavior) =>
      behavior.cases.map((entry) => entry.dataKind),
    );
    expect(kinds).toContain("mechanism");
    expect(kinds).toContain("real-data");
  });
});

describe("六格独立条件预期", () => {
  it("三首 × 词林/新韵 = 6 格、192 字位，且带版本与字位 ID", () => {
    expect(sixCell.cells).toHaveLength(6);
    const books = new Set(sixCell.cells.map((cell) => cell.book));
    expect([...books].sort()).toEqual(["cilin", "xinyun"]);
    expect(
      sixCell.cells.reduce((sum, cell) => sum + cell.tokens.length, 0),
    ).toBe(192);
    for (const cell of sixCell.cells) {
      expect(cell.dataVersion).toBeTruthy();
      expect(cell.evidenceApproved).toMatch(/^\d+\/\d+$/u);
      for (const token of cell.tokens) {
        expect(token.tokenId).toMatch(/^l\d+c\d+$/u);
      }
    }
  });

  it("当前层：证据未齐一律 blocked 或 unknown，绝不给出 resolved 结论", () => {
    for (const cell of sixCell.cells) {
      for (const token of cell.tokens) {
        if (token.candidateIds.length === 0) {
          expect(token.currentExpectation).toBe("unknown");
        } else {
          // 两库当前 evidence approved = 0，因此有候选即 blocked
          expect(token.currentExpectation).toBe("blocked");
        }
      }
    }
  });

  it("条件层：与当前层分开记录，多读同调不写成读音已确定", () => {
    for (const cell of sixCell.cells) {
      for (const token of cell.tokens) {
        if (token.conditionalExpectation === "resolved") {
          expect(token.conditionalToneStatus).toBe("resolved");
        }
        if (token.conditionalExpectation === "ambiguous") {
          // 多读：语调要么已定（同调），要么明确未定
          expect(["resolved", "ambiguous"]).toContain(
            token.conditionalToneStatus,
          );
          if (token.possibleTones.length > 1) {
            expect(token.conditionalToneStatus).toBe("ambiguous");
          }
        }
        if (token.undetermined) {
          expect(token.conditionalExpectation).not.toBe("resolved");
        }
        expect(token.conditionalBasis.length).toBeGreaterThan(0);
        // 词林/新韵当前没有规则，命中规则的字位必须显式标出
        if (token.contextRuleIds.length > 0) {
          expect(cell.book).toBe("pingshui");
        }
      }
    }
  });

  it("覆盖口径：多音位置去重且与字位总数自洽", () => {
    const multiTokens = sixCell.cells
      .flatMap((cell) => cell.tokens)
      .filter((token) => token.candidateIds.length > 1);
    expect(sixCell.coverage.tokens).toBe(192);
    expect(sixCell.coverage.multiReadingPositions).toBeLessThanOrEqual(
      multiTokens.length,
    );
    expect(sixCell.coverage.multiReadingPositions).toBe(38);
  });
});

describe("13 条草稿的可审批材料", () => {
  it("全部标为未达可批准状态，拟选项为空", () => {
    expect(reviewReady.counts.drafts).toBe(13);
    expect(reviewReady.counts.notApprovalReady).toBe(13);
    for (const item of reviewReady.items) {
      expect(item.readiness).toBe("not-approval-ready");
      expect(item.proposedSelection).toBeNull();
      expect(item.reviewStatus).toBe("unverified");
      expect(item.aSideDependency.requiredEvidence.length).toBeGreaterThan(0);
    }
  });

  it("候选 ID 属于本书，没有混入平水", () => {
    for (const item of reviewReady.items) {
      for (const id of item.candidateIds) {
        expect(id.startsWith(`${item.book}:`), `${item.book} 混入 ${id}`).toBe(
          true,
        );
      }
    }
  });
});
