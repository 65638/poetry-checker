/**
 * GoldenCase 结构校验与审核门槛测试（E-D1-09 / E-D1-10）。
 *
 * 结构有效 ≠ 学术批准：pending 不计为语言学通过，approved 必须有人与证据。
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateGoldenCase, validateGoldenCases } from "../src/index.js";

const CASES_DIR = fileURLToPath(
  new URL("../../../tests/golden/cases/", import.meta.url),
);

function readCases(): unknown[] {
  const names = readdirSync(CASES_DIR).filter((name) => name.endsWith(".json"));
  return names.map((name) => {
    const raw = readFileSync(`${CASES_DIR}${name}`, "utf8");
    return JSON.parse(raw) as unknown;
  });
}

function baseCase(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "golden-synthetic-1",
    title: "合成案例",
    author: null,
    text: "字字字字字，字字字字字。",
    sourceCandidates: [],
    request: {
      rhymeBook: "pingshui",
      genreHint: "auto",
      formHint: "auto",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    },
    assertions: [{ path: "genre.formId", equals: "wujue" }],
    reviewStatus: "pending",
    reviewers: [],
    evidenceIds: [],
    notes: "合成结构测试用例，不代表真实作品",
    ...overrides,
  };
}

describe("GoldenCase 结构校验", () => {
  it("三首预期按既有审批落库；审批状态不代表真实 API 已通过", () => {
    const cases = readCases();
    const result = validateGoldenCases(cases);

    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.values).toHaveLength(3);
    for (const value of result.values) {
      expect(value.reviewStatus).toBe("approved");
      expect(value.reviewers.length).toBeGreaterThan(0);
      expect(value.evidenceIds.length).toBeGreaterThan(0);
      expect(value.notes.length).toBeGreaterThan(0);
    }
    // 结构、预期审批、真实 API 通过是三个不同统计，API 另跑 scripts/probe-d2-api.ts。
    const approved = result.values.filter(
      (value) => value.reviewStatus === "approved",
    );
    expect(approved).toHaveLength(3);
  });

  it("缺必填字段的用例被拒绝", () => {
    const result = validateGoldenCase({ id: "x" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "title")).toBe(true);
  });

  it("request 复用冻结契约：古体 + 具体近体形式被 Schema 拒绝", () => {
    const result = validateGoldenCase(
      baseCase({
        request: {
          rhymeBook: "pingshui",
          genreHint: "ancient",
          formHint: "wujue",
          ruleSet: "teaching-v1",
          readingOverrides: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.path.startsWith("request")),
    ).toBe(true);
  });

  it("来源候选必须区分可定位条目与待查线索", () => {
    const result = validateGoldenCase(
      baseCase({
        sourceCandidates: [
          { kind: "located", value: null, note: "只写了库名" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.path === "sourceCandidates[0].value"),
    ).toBe(true);
  });
});

describe("GoldenCase 审核门槛反例", () => {
  it("E-D1-10 approved 却无审核人：拒绝，不允许假批准进入发布集合", () => {
    const result = validateGoldenCase(
      baseCase({ reviewStatus: "approved", reviewStatusNote: "无" }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "reviewers")).toBe(
      true,
    );
  });

  it("E-D1-10 approved 却无证据：拒绝", () => {
    const result = validateGoldenCase(
      baseCase({
        reviewStatus: "approved",
        reviewers: ["审核人甲"],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "evidenceIds")).toBe(
      true,
    );
  });

  it("approved 齐全时才通过结构校验", () => {
    const result = validateGoldenCase(
      baseCase({
        reviewStatus: "approved",
        reviewers: ["审核人甲"],
        evidenceIds: ["ev-genre-1"],
      }),
    );
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("重复 id 被拒绝", () => {
    const result = validateGoldenCases([baseCase(), baseCase()]);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("重复"))).toBe(
      true,
    );
  });

  it("断言为空被拒绝", () => {
    const result = validateGoldenCase(baseCase({ assertions: [] }));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "assertions")).toBe(
      true,
    );
  });
});
