import { describe, expect, it } from "vitest";
import {
  AnalysisResponseSchema,
  AnalyzeRequestSchema,
  AnnotatedTokenSchema,
  createOpenApiDocument,
} from "../src/index.js";
import { makeFixture } from "./fixtures.js";

const request = {
  text: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
  rhymeBook: "pingshui",
  genreHint: "auto",
  formHint: "auto",
  ruleSet: "teaching-v1",
  readingOverrides: [],
};

describe("请求契约", () => {
  it("接受三个韵书枚举", () => {
    for (const rhymeBook of ["pingshui", "cilin", "xinyun"]) {
      expect(
        AnalyzeRequestSchema.safeParse({ ...request, rhymeBook }).success,
      ).toBe(true);
    }
  });
  it("拒绝拼错字段、未知韵书和无汉字文本", () => {
    expect(
      AnalyzeRequestSchema.safeParse({ ...request, rhymebook: "pingshui" })
        .success,
    ).toBe(false);
    expect(
      AnalyzeRequestSchema.safeParse({ ...request, rhymeBook: "tongyun" })
        .success,
    ).toBe(false);
    expect(
      AnalyzeRequestSchema.safeParse({ ...request, text: "..." }).success,
    ).toBe(false);
  });
  it("按码点而非 UTF-16 长度执行上限", () => {
    expect(
      AnalyzeRequestSchema.safeParse({ ...request, text: "𠀀".repeat(2000) })
        .success,
    ).toBe(true);
    expect(
      AnalyzeRequestSchema.safeParse({ ...request, text: "𠀀".repeat(2001) })
        .success,
    ).toBe(false);
  });
  it("拒绝古体与具体近体格式冲突", () => {
    expect(
      AnalyzeRequestSchema.safeParse({
        ...request,
        genreHint: "ancient",
        formHint: "wujue",
      }).success,
    ).toBe(false);
  });
  it("人工覆盖需要摘要且每个字位唯一", () => {
    const override = { tokenId: "l4c1", readingId: "example" };
    expect(
      AnalyzeRequestSchema.safeParse({
        ...request,
        readingOverrides: [override],
      }).success,
    ).toBe(false);
    expect(
      AnalyzeRequestSchema.safeParse({
        ...request,
        inputHash: "a".repeat(64),
        readingOverrides: [override],
      }).success,
    ).toBe(true);
    expect(
      AnalyzeRequestSchema.safeParse({
        ...request,
        inputHash: "a".repeat(64),
        readingOverrides: [override, override],
      }).success,
    ).toBe(false);
  });
});

describe("响应契约与原文映射", () => {
  it.each([
    "pass",
    "fail",
    "needs_review",
    "not_applicable",
    "unsupported",
  ] as const)("%s 合成场景通过结构校验", (status) => {
    expect(AnalysisResponseSchema.safeParse(makeFixture(status)).success).toBe(
      true,
    );
  });
  it("拒绝偏移和音系口径错配", () => {
    const shifted = makeFixture();
    shifted.poem.tokens[0]!.startUtf16 = 2;
    expect(AnalysisResponseSchema.safeParse(shifted).success).toBe(false);
    const mixed = makeFixture();
    mixed.policy.toneBasis = "mandarin_base";
    expect(AnalysisResponseSchema.safeParse(mixed).success).toBe(false);
  });
  it("允许读音歧义但平仄一致", () => {
    const token = makeFixture().poem.tokens[0]!;
    const another = { ...token.candidates[0]!, id: "another-same-tone" };
    token.candidates.push(another);
    token.effectiveCandidateIds.push(another.id);
    token.readingStatus = "ambiguous";
    token.selectedReadingId = null;
    token.selectionMethod = "unresolved";
    expect(AnnotatedTokenSchema.safeParse(token).success).toBe(true);
  });
  it("拒绝把未知有效候选掩盖为确定平仄", () => {
    const token = makeFixture().poem.tokens[0]!;
    const unknown = { ...token.candidates[0]!, id: "unknown-tone", tone: null };
    token.candidates.push(unknown);
    token.effectiveCandidateIds.push(unknown.id);
    token.readingStatus = "ambiguous";
    token.selectedReadingId = null;
    token.selectionMethod = "unresolved";
    expect(AnnotatedTokenSchema.safeParse(token).success).toBe(false);
    token.toneStatus = "unknown";
    token.tone = null;
    expect(AnnotatedTokenSchema.safeParse(token).success).toBe(true);
  });
  it("生成 OpenAPI 时保留三韵书枚举与严格对象", () => {
    const api = createOpenApiDocument();
    expect(api.openapi).toBe("3.1.0");
    expect(api.components.schemas.AnalyzeRequest?.additionalProperties).toBe(
      false,
    );
    expect(JSON.stringify(api.components.schemas.AnalyzeRequest)).toContain(
      "xinyun",
    );
    expect(Object.keys(api.paths).sort()).toEqual([
      "/api/v1/analyze",
      "/api/v1/characters/{char}",
      "/api/v1/poetry-assistant",
      "/api/v1/reading-suggestions",
      "/api/v1/reading-suggestions/status",
      "/api/v1/rhyme-books",
      "/api/v1/rhyme-words",
      "/api/v1/rules/{ruleId}",
      "/api/v1/sources/{sourceId}",
      "/healthz",
      "/readyz",
    ]);
    const references = JSON.stringify(api).matchAll(
      /"\$ref":"#\/components\/schemas\/([^"]+)"/gu,
    );
    for (const match of references)
      expect(api.components.schemas).toHaveProperty(match[1]!);
  });
});
