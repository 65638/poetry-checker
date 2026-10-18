/**
 * classifyGenre D1 最小分支的保护测试（E-D1-01 ~ E-D1-08 + 未实现边界）。
 *
 * 断言只测真实接口不变量与规则预期，不照抄随机 ID 或非关键排序。
 */
import { GenreDecisionSchema } from "@poetry/contracts";
import type { WorkMetadata } from "@poetry/contracts";
import { describe, expect, it } from "vitest";
import { classifyGenre, GenreError } from "../src/index.js";
import {
  makeAnnotatedPoem,
  makeCompleteCandidate,
  makeRegularPoem,
  makeTemplateCandidate,
  makeWorkMetadata,
} from "./fixtures.js";

const NO_METADATA: WorkMetadata[] = [];

describe("classifyGenre：用户显式指定", () => {
  it("E-D1-01 显式古体：not_applicable + basis=user，不自称审核证据", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [],
      metadata: NO_METADATA,
      genreHint: "ancient",
      formHint: "auto",
    });

    expect(result.formFamily).toBe("ancient");
    expect(result.formId).toBeNull();
    expect(result.applicability).toBe("not_applicable");
    expect(result.basisType).toBe("user");
    expect(result.evidenceIds).toEqual([]);
    expect(result.selectedTemplateId).toBeNull();
    const reasons = result.reasons.join("");
    expect(reasons).toContain("用户指定");
    expect(reasons).not.toContain("审核");
    expect(GenreDecisionSchema.safeParse(result).success).toBe(true);
  });

  it("E-D1-02 显式五绝 + 低分候选：保留 wujue，不声称通过", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [
        makeTemplateCandidate({
          id: "tpl-wujue-1",
          formId: "wujue",
          toneFit: 0.2,
        }),
      ],
      metadata: NO_METADATA,
      genreHint: "regulated",
      formHint: "wujue",
    });

    expect(result.formFamily).toBe("regulated");
    expect(result.formId).toBe("wujue");
    expect(result.basisType).toBe("user");
    // 缺关键特征 → 不给出可靠模板
    expect(result.selectedTemplateId).toBeNull();
    expect(result.candidateTemplateIds).toEqual(["tpl-wujue-1"]);
    expect(result.reasons.join("")).not.toContain("通过");
  });

  it("E-D1-03 显式五绝但形制不符：不静默切体式，也不改判古体", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 7),
      candidates: [],
      metadata: NO_METADATA,
      genreHint: "regulated",
      formHint: "wujue",
    });

    expect(result.formFamily).toBe("regulated");
    expect(result.formId).toBe("wujue");
    expect(result.applicability).toBe("uncertain");
    expect(result.reasons.join("")).toContain("不符");
    expect(result.selectedTemplateId).toBeNull();
  });

  it("用户选择近体但形制不匹配：uncertain，不改编古体", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(3, 5),
      candidates: [],
      metadata: NO_METADATA,
      genreHint: "regulated",
      formHint: "auto",
    });

    expect(result.formFamily).toBe("undetermined");
    expect(result.applicability).toBe("uncertain");
    expect(result.formId).toBeNull();
    expect(result.reasons.join("")).toContain("不改判古体");
  });
});

describe("classifyGenre：auto 分支与特征门槛", () => {
  it("E-D1-04 toneFit=1 但其他特征为空：不按单一特征判强近体", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [
        makeTemplateCandidate({ id: "tpl-a", formId: "wujue", toneFit: 1 }),
      ],
      metadata: NO_METADATA,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.formFamily).toBe("undetermined");
    expect(result.applicability).toBe("uncertain");
    expect(result.selectedTemplateId).toBeNull();
    expect(result.candidateTemplateIds).toEqual(["tpl-a"]);
    expect(result.reasons.join("")).toContain("特征未齐");
  });

  it("E-D1-05 并列候选分差小于 0.05：selectedTemplateId=null 且保留全部候选", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [
        makeCompleteCandidate({ id: "tpl-a", formId: "wujue", score: 0.8 }),
        makeCompleteCandidate({ id: "tpl-b", formId: "wujue", score: 0.79 }),
      ],
      metadata: NO_METADATA,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.applicability).toBe("uncertain");
    expect(result.selectedTemplateId).toBeNull();
    expect(result.candidateTemplateIds).toEqual(["tpl-a", "tpl-b"]);
    expect(result.reasons.join("")).toContain("并列");
  });

  it("E-D1-06 关键可判率不足 0.8：不输出高把握判断", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [
        makeTemplateCandidate({
          id: "tpl-a",
          formId: "wujue",
          toneFit: 0.9,
          relationFit: 0.9,
          rhymeFit: 0.9,
          parallelismFit: 0.9,
          score: 0.85,
          evaluatedKeyRate: 0.79,
        }),
        makeTemplateCandidate({
          id: "tpl-b",
          formId: "wujue",
          toneFit: 0.8,
          relationFit: 0.8,
          rhymeFit: 0.8,
          parallelismFit: 0.8,
          score: 0.6,
          evaluatedKeyRate: 0.79,
        }),
      ],
      metadata: NO_METADATA,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.applicability).toBe("uncertain");
    expect(result.reasons.join("")).toContain("0.79");
  });

  it("解析质量 needs_review：直接判 uncertain", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5, "needs_review"),
      candidates: [
        makeCompleteCandidate({ id: "tpl-a", formId: "wujue", score: 0.5 }),
      ],
      metadata: NO_METADATA,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.applicability).toBe("uncertain");
    expect(result.reasons.join("")).toContain("needs_review");
  });

  it("E-D1-07 未审核元数据不得作为免检依据", () => {
    const unverified = [
      makeWorkMetadata({
        id: "meta-1",
        title: "合成作品",
        formFamily: "ancient",
        historicalTags: ["乐府"],
        reviewStatus: "unverified",
      }),
    ];
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [],
      metadata: unverified,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.formFamily).not.toBe("ancient");
    expect(result.basisType).not.toBe("reviewed_metadata");
    expect(result.applicability).toBe("uncertain");
  });

  it("approved 元数据指纹与正文不一致时不被当作识别依据", () => {
    const approved = [
      makeWorkMetadata({
        id: "meta-2",
        title: "合成作品",
        text: "字字字字字",
        formFamily: "ancient",
        reviewStatus: "approved",
        evidenceIds: ["ev-1"],
      }),
    ];
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [],
      metadata: approved,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.formFamily).not.toBe("ancient");
    expect(result.basisType).not.toBe("reviewed_metadata");
    expect(result.reasons.join("")).toContain("指纹与本诗不一致");
  });

  it("排律形制：unsupported，不冒称古体", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(12, 5),
      candidates: [],
      metadata: NO_METADATA,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.formFamily).toBe("unsupported");
    expect(result.applicability).toBe("unsupported");
    expect(result.reasons.join("")).toContain("排律");
  });
});

describe("classifyGenre：高吻合分支与非法请求", () => {
  it("高吻合自动判定返回近体候选，仍由引擎检查合律", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [
        makeCompleteCandidate({ id: "tpl-a", formId: "wujue", score: 0.95 }),
      ],
      metadata: NO_METADATA,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.formFamily).toBe("regulated");
    expect(result.applicability).toBe("applicable");
    expect(result.selectedTemplateId).toBe("tpl-a");
    expect(result.basisType).toBe("heuristic");
  });

  it("古体 + 具体近体形式：非法请求，不产生自相矛盾结果", () => {
    expect(() =>
      classifyGenre({
        poem: makeRegularPoem(4, 5),
        candidates: [],
        metadata: NO_METADATA,
        genreHint: "ancient",
        formHint: "wujue",
      }),
    ).toThrowError(GenreError);
  });
});

describe("classifyGenre：输入不可变与确定性", () => {
  it("E-D1-08 深冻结输入、重复调用：不改输入、结果确定、输出过 Schema", () => {
    const poem = makeRegularPoem(4, 5);
    const candidates = [
      makeTemplateCandidate({ id: "tpl-a", formId: "wujue", toneFit: 0.6 }),
    ];
    const metadata = [
      makeWorkMetadata({
        id: "meta-1",
        title: "合成作品",
        formFamily: "undetermined",
        reviewStatus: "unverified",
      }),
    ];

    const snapshot = JSON.stringify({ poem, candidates, metadata });

    const freezeDeep = <T>(value: T): T => {
      if (value !== null && typeof value === "object") {
        for (const key of Object.keys(value as Record<string, unknown>)) {
          freezeDeep((value as Record<string, unknown>)[key]);
        }
        Object.freeze(value);
      }
      return value;
    };

    freezeDeep(poem);
    freezeDeep(candidates);
    freezeDeep(metadata);

    const first = classifyGenre({
      poem,
      candidates,
      metadata,
      genreHint: "auto",
      formHint: "auto",
    });
    const second = classifyGenre({
      poem,
      candidates,
      metadata,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify({ poem, candidates, metadata })).toBe(snapshot);
    expect(GenreDecisionSchema.safeParse(first).success).toBe(true);
  });

  it("未知字过多（无候选）时不会凭少量吻合得高分", () => {
    const poem = makeAnnotatedPoem([
      [
        { char: "字", tone: "P" },
        { char: "字", tone: null },
        { char: "字", tone: null },
        { char: "字", tone: null },
        { char: "字", tone: null },
      ],
      [
        { char: "字", tone: "P" },
        { char: "字", tone: null },
        { char: "字", tone: null },
        { char: "字", tone: null },
        { char: "字", tone: null },
      ],
      [
        { char: "字", tone: "P" },
        { char: "字", tone: null },
        { char: "字", tone: null },
        { char: "字", tone: null },
        { char: "字", tone: null },
      ],
      [
        { char: "字", tone: "P" },
        { char: "字", tone: null },
        { char: "字", tone: null },
        { char: "字", tone: null },
        { char: "字", tone: null },
      ],
    ]);

    const result = classifyGenre({
      poem,
      candidates: [
        makeTemplateCandidate({ id: "tpl-a", formId: "wujue", toneFit: 1 }),
      ],
      metadata: NO_METADATA,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.applicability).toBe("uncertain");
    expect(result.selectedTemplateId).toBeNull();
  });
});

describe("classifyGenre：D2 已审核正文指纹匹配", () => {
  const WITH_PUNCTUATION = "字字字字字，字字字字字。字字字字字，字字字字字。";

  function approvedMeta(text: string, overrides: Record<string, unknown> = {}) {
    return makeWorkMetadata({
      id: "meta-dengguanquelou",
      title: "合成五绝",
      text,
      formFamily: "regulated",
      formId: "wujue",
      historicalTags: ["五绝"],
      reviewStatus: "approved",
      evidenceIds: ["ev-genre-1"],
      ...overrides,
    });
  }

  it("标点不同的同一正文：指纹一致，basisType=reviewed_metadata 并带证据", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [makeTemplateCandidate({ id: "tpl-a", formId: "wujue" })],
      metadata: [approvedMeta(WITH_PUNCTUATION)],
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.basisType).toBe("reviewed_metadata");
    expect(result.formFamily).toBe("regulated");
    expect(result.formId).toBe("wujue");
    expect(result.applicability).toBe("applicable");
    expect(result.historicalTags).toEqual(["五绝"]);
    expect(result.evidenceIds).toEqual(["ev-genre-1"]);
    expect(result.candidateTemplateIds).toEqual(["tpl-a"]);
    expect(result.reasons.join("")).toContain("正文指纹精确匹配");
    expect(GenreDecisionSchema.safeParse(result).success).toBe(true);
  });

  it("未审核元数据即使指纹一致也不使用", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [],
      metadata: [
        approvedMeta(WITH_PUNCTUATION, { reviewStatus: "unverified" }),
      ],
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.basisType).not.toBe("reviewed_metadata");
    expect(result.applicability).toBe("uncertain");
  });

  it("两条已审核元数据指纹相同：不猜，返回 uncertain 并列出 id", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [],
      metadata: [
        approvedMeta(WITH_PUNCTUATION),
        approvedMeta(WITH_PUNCTUATION, { id: "meta-variant-2" }),
      ],
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.applicability).toBe("uncertain");
    expect(result.formFamily).toBe("undetermined");
    expect(result.reasons.join("")).toContain("meta-variant-2");
    expect(result.reasons.join("")).toContain("人工裁定");
  });

  it("用户显式选择优先于已审核元数据", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [],
      metadata: [approvedMeta(WITH_PUNCTUATION)],
      genreHint: "ancient",
      formHint: "auto",
    });

    expect(result.basisType).toBe("user");
    expect(result.formFamily).toBe("ancient");
  });

  it("简繁不转换：字形不同则指纹不同，不会误匹配", () => {
    const result = classifyGenre({
      poem: makeRegularPoem(4, 5),
      candidates: [],
      metadata: [
        approvedMeta("字字字字字，字字字字字。字字字字字，字字字字字。一"),
      ],
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.basisType).not.toBe("reviewed_metadata");
  });
});
