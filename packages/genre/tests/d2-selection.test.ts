import { describe, expect, it } from "vitest";
import type { AnalyzeRequest, TemplateCandidate } from "@poetry/contracts";
import { classifyGenre } from "../src/index.js";
import {
  makeRegularPoem,
  makeTemplateCandidate,
  makeWorkMetadata,
} from "./fixtures.js";

const candidate = (id: string, score: number | null, rate = 1) =>
  makeTemplateCandidate({
    id,
    formId: "wujue",
    score,
    toneFit: 1,
    relationFit: 1,
    rhymeFit: 1,
    parallelismFit: null,
    evaluatedKeyRate: rate,
  });
function classify(
  candidates: TemplateCandidate[],
  formHint: AnalyzeRequest["formHint"] = "auto",
) {
  return classifyGenre({
    poem: makeRegularPoem(4, 5),
    candidates,
    metadata: [],
    genreHint: "auto",
    formHint,
  });
}

describe("D2 可靠选模边界", () => {
  it("多个候选按综合分选择；P0 对仗评分 null 不阻塞；不受输入顺序影响", () => {
    const pool = [
      candidate("weak", 0.4),
      candidate("best", 1),
      candidate("second", 0.8),
      candidate("last", 0.2),
    ];
    for (const form of ["auto", "wujue"] as const) {
      expect(classify(pool, form).selectedTemplateId).toBe("best");
      expect(classify([...pool].reverse(), form).selectedTemplateId).toBe(
        "best",
      );
    }
  });
  it("最佳候选关键位不足，不能拿其他候选的覆盖率替代", () => {
    const pool = [
      candidate("incomplete", 1, 0.79),
      candidate("covered", 0.8, 1),
    ];
    expect(classify(pool).applicability).toBe("uncertain");
    expect(classify(pool, "wujue").selectedTemplateId).toBeNull();
  });
  it("最高分缺关键特征或任何候选分数为空，不跳过它选低分", () => {
    const best = candidate("incomplete", 1);
    best.features.relationFit = null;
    for (const pool of [
      [best, candidate("covered", 0.8)],
      [candidate("no-score", null), candidate("covered", 1)],
    ]) {
      expect(classify(pool).selectedTemplateId).toBeNull();
      expect(classify(pool, "wujue").selectedTemplateId).toBeNull();
    }
  });
  it("并列保持不确定；精确 0.05 分差按已定阈值选择", () => {
    expect(
      classify([candidate("a", 0.95), candidate("b", 0.92)]).selectedTemplateId,
    ).toBeNull();
    expect(
      classify([candidate("a", 0.95), candidate("b", 0.9)]).selectedTemplateId,
    ).toBe("a");
  });
  it("低分不会变成古体，明确指定体式仍可执行具体模板检查", () => {
    const pool = [candidate("a", 0.6), candidate("b", 0.4)];
    expect(classify(pool).formFamily).toBe("undetermined");
    expect(classify(pool, "wujue").selectedTemplateId).toBe("a");
  });
  it("needs_review 在显式和元数据分支也不得确定模板", () => {
    const poem = makeRegularPoem(4, 5, "needs_review");
    const metadata = [
      makeWorkMetadata({
        id: "test",
        title: "测试",
        text: poem.originalText,
        formFamily: "regulated",
        formId: "wujue",
        reviewStatus: "approved",
        evidenceIds: ["test-evidence"],
      }),
    ];
    for (const formHint of ["auto", "wujue"] as const) {
      expect(
        classifyGenre({
          poem,
          metadata,
          candidates: [candidate("a", 1)],
          formHint,
          genreHint: "auto",
        }).selectedTemplateId,
      ).toBeNull();
    }
  });
  it("已审近体元数据按最佳模板检查，古体不选择模板", () => {
    const poem = makeRegularPoem(4, 5);
    for (const family of ["regulated", "ancient"] as const) {
      const metadata = [
        makeWorkMetadata({
          id: "test",
          title: "测试",
          text: poem.originalText,
          formFamily: family,
          formId: family === "regulated" ? "wujue" : null,
          reviewStatus: "approved",
          evidenceIds: ["test-evidence"],
        }),
      ];
      const result = classifyGenre({
        poem,
        metadata,
        candidates: [candidate("weak", 0.4), candidate("best", 0.6)],
        formHint: "auto",
        genreHint: "auto",
      });
      expect(result.selectedTemplateId).toBe(
        family === "regulated" ? "best" : null,
      );
      expect(result.applicability).toBe(
        family === "regulated" ? "applicable" : "not_applicable",
      );
    }
  });
});
