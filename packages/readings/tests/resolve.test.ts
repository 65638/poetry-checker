import { describe, expect, it } from "vitest";
import { AnnotatedPoemSchema, ParsedPoemSchema } from "@poetry/contracts";
import type {
  AnnotatedPoem,
  AnnotatedToken,
  ContextRule,
  LookupResult,
  ParsedPoem,
  ReadingOverride,
} from "@poetry/contracts";
import { ReadingsError, parseText, resolveReadings } from "../src/index.js";
import {
  APPROVED_EVIDENCE,
  RULE_EVIDENCE,
  UNVERIFIED_EVIDENCE,
  contextRule,
  deepFreeze,
  dengGuanQueLouLookup,
  pingPlusUnknownLookup,
  pingZeLookup,
  singleCandidateLookup,
  syntheticCandidate,
  syntheticLookup,
  twoZeLookup,
} from "./fixtures.js";

function poemOf(text: string): ParsedPoem {
  const poem = parseText({ text });
  const parsed = ParsedPoemSchema.safeParse(poem);
  expect(parsed.success, "parseText 输出必须通过 ParsedPoemSchema").toBe(true);
  return poem;
}

/** 每次调用都额外用公共 Schema 校验输出，避免只断言“函数跑通了”。 */
function annotate(input: {
  poem: ParsedPoem;
  lookup: LookupResult;
  overrides?: ReadingOverride[];
  contextRules?: ContextRule[];
}) {
  const result = resolveReadings({
    poem: input.poem,
    lookup: input.lookup,
    overrides: input.overrides ?? [],
    contextRules: input.contextRules ?? [],
  });
  const parsed = AnnotatedPoemSchema.safeParse(result);
  expect(
    parsed.success,
    `输出必须通过 AnnotatedPoemSchema：${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`,
  ).toBe(true);
  return result;
}

function tokenOf(poem: AnnotatedPoem, tokenId: string): AnnotatedToken {
  const token = poem.tokens.find((candidate) => candidate.tokenId === tokenId);
  if (token === undefined) throw new Error(`找不到字位 ${tokenId}`);
  return token;
}

function expectReadingsError(
  run: () => unknown,
  code: ReadingsError["code"],
): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught, `预期抛出 ${code}`).toBeInstanceOf(ReadingsError);
  expect((caught as ReadingsError).code).toBe(code);
}

describe("resolveReadings：候选状态传播", () => {
  it("B-D1-06 没有候选时为 unknown，六个字段全部保持一致", () => {
    const poem = poemOf("疑");
    const result = annotate({
      poem,
      lookup: syntheticLookup({ entries: [], missing: ["疑"] }),
    });
    const token = tokenOf(result, "l1c1");

    expect(token.readingStatus).toBe("unknown");
    expect(token.selectedReadingId).toBeNull();
    expect(token.selectionMethod).toBe("unresolved");
    expect(token.effectiveCandidateIds).toEqual([]);
    expect(token.possibleTones).toEqual([]);
    expect(token.toneStatus).toBe("unknown");
    expect(token.tone).toBeNull();
    expect(token.reason).toContain("missing");
  });

  it("lookup 既不在 entries 也不在 missing 时仍是 unknown，不补造读音", () => {
    const result = annotate({
      poem: poemOf("龘"),
      lookup: syntheticLookup({ entries: [], missing: [] }),
    });
    const token = tokenOf(result, "l1c1");
    expect(token.readingStatus).toBe("unknown");
    expect(token.reason).toContain("未覆盖");
  });

  it("唯一可靠候选为 resolved，平仄由该候选推导", () => {
    const result = annotate({
      poem: poemOf("白"),
      lookup: singleCandidateLookup("白", "Z"),
    });
    const token = tokenOf(result, "l1c1");
    expect(token.readingStatus).toBe("resolved");
    expect(token.selectionMethod).toBe("unique");
    expect(token.selectedReadingId).toBe("c-白-Z");
    expect(token.effectiveCandidateIds).toEqual(["c-白-Z"]);
    expect(token.possibleTones).toEqual(["Z"]);
    expect(token.toneStatus).toBe("resolved");
    expect(token.tone).toBe("Z");
    expect(token.evidenceIds).toContain(APPROVED_EVIDENCE.id);
  });

  it("多个候选含平含仄：ambiguous，possibleTones 为 P、Z，不任选", () => {
    const result = annotate({
      poem: poemOf("更"),
      lookup: pingZeLookup("更"),
    });
    const token = tokenOf(result, "l1c1");
    expect(token.readingStatus).toBe("ambiguous");
    expect(token.selectedReadingId).toBeNull();
    expect(token.selectionMethod).toBe("unresolved");
    expect(token.effectiveCandidateIds).toEqual(["c-更-P", "c-更-Z"]);
    expect(token.possibleTones).toEqual(["P", "Z"]);
    expect(token.toneStatus).toBe("ambiguous");
    expect(token.tone).toBeNull();
    expect(token.candidates).toHaveLength(2);
  });

  it("两个不同读音都是仄：读音 ambiguous，但平仄 resolved 为 Z", () => {
    const result = annotate({
      poem: poemOf("重"),
      lookup: twoZeLookup("重"),
    });
    const token = tokenOf(result, "l1c1");
    expect(token.readingStatus).toBe("ambiguous");
    expect(token.selectedReadingId).toBeNull();
    expect(token.possibleTones).toEqual(["Z"]);
    expect(token.toneStatus).toBe("resolved");
    expect(token.tone).toBe("Z");
  });

  it("已知平声候选加声调未知候选：不掩盖未知", () => {
    const result = annotate({
      poem: poemOf("长"),
      lookup: pingPlusUnknownLookup("长"),
    });
    const token = tokenOf(result, "l1c1");
    expect(token.readingStatus).toBe("ambiguous");
    expect(token.possibleTones).toEqual(["P"]);
    expect(token.toneStatus).toBe("unknown");
    expect(token.tone).toBeNull();
  });

  it("唯一候选但证据未审核：结论标为待核实，不把未核实来源计入已审核证据", () => {
    const lookup = syntheticLookup({
      entries: [
        {
          character: "白",
          candidates: [
            syntheticCandidate({
              id: "c-白-unverified",
              character: "白",
              tone: "Z",
              evidenceIds: [UNVERIFIED_EVIDENCE.id],
            }),
          ],
        },
      ],
    });
    const token = tokenOf(annotate({ poem: poemOf("白"), lookup }), "l1c1");

    expect(token.readingStatus).toBe("resolved");
    expect(token.selectionMethod).toBe("unique");
    expect(token.evidenceIds).toEqual([]);
    expect(token.reason).toContain("待核实");
  });
});

describe("resolveReadings：人工覆盖", () => {
  it("B-D1-07 合法覆盖只改有效候选与 selectionMethod，候选原列表保留", () => {
    const lookup = pingZeLookup("更");
    const result = annotate({
      poem: poemOf("更"),
      lookup,
      overrides: [{ tokenId: "l1c1", readingId: "c-更-Z" }],
    });
    const token = tokenOf(result, "l1c1");

    expect(token.readingStatus).toBe("resolved");
    expect(token.selectionMethod).toBe("user");
    expect(token.selectedReadingId).toBe("c-更-Z");
    expect(token.effectiveCandidateIds).toEqual(["c-更-Z"]);
    expect(token.candidates.map((candidate) => candidate.id)).toEqual([
      "c-更-P",
      "c-更-Z",
    ]);
    expect(token.possibleTones).toEqual(["Z"]);
    expect(token.tone).toBe("Z");
    expect(token.reason).toContain("用户");
    // 用户的选择不是学术证据：证据仍只来自候选自身的已审核记录。
    expect(token.evidenceIds).toEqual([APPROVED_EVIDENCE.id]);
  });

  it("B-D1-08 外字、不存在、越界与重复覆盖都给可识别错误", () => {
    const lookup = dengGuanQueLouLookup();
    const poem = poemOf("更上一层楼");

    expectReadingsError(
      () =>
        resolveReadings({
          poem,
          lookup,
          // 更 的候选只有 c-更-P / c-更-Z，别的字的候选不能被接受。
          overrides: [{ tokenId: "l1c1", readingId: "c-白-Z" }],
          contextRules: [],
        }),
      "OVERRIDE_READING_UNKNOWN",
    );

    expectReadingsError(
      () =>
        resolveReadings({
          poem,
          lookup,
          overrides: [{ tokenId: "l1c1", readingId: "c-不存在的候选" }],
          contextRules: [],
        }),
      "OVERRIDE_READING_UNKNOWN",
    );

    expectReadingsError(
      () =>
        resolveReadings({
          poem,
          lookup,
          overrides: [{ tokenId: "l9c9", readingId: "c-更-Z" }],
          contextRules: [],
        }),
      "OVERRIDE_TOKEN_UNKNOWN",
    );

    expectReadingsError(
      () =>
        resolveReadings({
          poem,
          lookup,
          overrides: [
            { tokenId: "l1c1", readingId: "c-更-P" },
            { tokenId: "l1c1", readingId: "c-更-Z" },
          ],
          contextRules: [],
        }),
      "OVERRIDE_DUPLICATE_TOKEN",
    );
  });

  it("别书候选在数据边界就被拒绝，不会走到覆盖校验", () => {
    const lookup = syntheticLookup({
      book: "pingshui",
      entries: [
        {
          character: "更",
          candidates: [
            syntheticCandidate({
              id: "c-更-xinyun",
              character: "更",
              tone: "P",
              book: "xinyun",
            }),
          ],
        },
      ],
    });
    expectReadingsError(
      () =>
        resolveReadings({
          poem: poemOf("更"),
          lookup,
          overrides: [],
          contextRules: [],
        }),
      "LOOKUP_CANDIDATE_BOOK_MISMATCH",
    );
  });
});

describe("resolveReadings：上下文规则", () => {
  const poem = poemOf("更上一层楼");
  const lookup = dengGuanQueLouLookup();

  it("B-D1-09 unverified 规则不参与自动确定，并留下可检查的 notice", () => {
    const rule = contextRule({
      id: "r-unverified-geng",
      target: "更",
      exactPhrases: ["更上一层楼"],
      targetOffset: 0,
      selectCandidateIds: ["c-更-P"],
      reviewStatus: "unverified",
    });
    const result = annotate({ poem, lookup, contextRules: [rule] });
    const token = tokenOf(result, "l1c1");

    expect(token.readingStatus).toBe("ambiguous");
    expect(token.selectionMethod).toBe("unresolved");
    expect(token.selectedReadingId).toBeNull();
    expect(result.notices.map((notice) => notice.code)).toContain(
      "CONTEXT_RULE_UNVERIFIED_IGNORED",
    );
    expect(token.evidenceIds).not.toContain(RULE_EVIDENCE.id);
  });

  it("approved 规则按最长精确词组优先，并传播规则证据", () => {
    const shortRule = contextRule({
      id: "r-geng-short",
      target: "更",
      exactPhrases: ["更上"],
      targetOffset: 0,
      selectCandidateIds: ["c-更-Z"],
    });
    const longRule = contextRule({
      id: "r-geng-long",
      target: "更",
      exactPhrases: ["更上一层楼"],
      targetOffset: 0,
      selectCandidateIds: ["c-更-P"],
      evidenceIds: [RULE_EVIDENCE.id],
    });

    const result = annotate({
      poem,
      lookup,
      contextRules: [shortRule, longRule],
    });
    const token = tokenOf(result, "l1c1");

    expect(token.selectionMethod).toBe("context_rule");
    expect(token.selectedReadingId).toBe("c-更-P");
    expect(token.reason).toContain("r-geng-long");
    expect(token.evidenceIds).toContain(RULE_EVIDENCE.id);
  });

  it("同优先级规则冲突保留歧义，不任选", () => {
    const ruleA = contextRule({
      id: "r-conflict-a",
      target: "更",
      exactPhrases: ["更上一层楼"],
      targetOffset: 0,
      selectCandidateIds: ["c-更-P"],
    });
    const ruleB = contextRule({
      id: "r-conflict-b",
      target: "更",
      exactPhrases: ["更上一层楼"],
      targetOffset: 0,
      selectCandidateIds: ["c-更-Z"],
    });

    const token = tokenOf(
      annotate({ poem, lookup, contextRules: [ruleA, ruleB] }),
      "l1c1",
    );
    expect(token.readingStatus).toBe("ambiguous");
    expect(token.selectionMethod).toBe("unresolved");
    expect(token.selectedReadingId).toBeNull();
    expect(token.effectiveCandidateIds).toEqual(["c-更-P", "c-更-Z"]);
    expect(token.reason).toContain("冲突");
  });

  it("用户覆盖优先于已审核语境规则", () => {
    const rule = contextRule({
      id: "r-geng-long",
      target: "更",
      exactPhrases: ["更上一层楼"],
      targetOffset: 0,
      selectCandidateIds: ["c-更-P"],
    });
    const token = tokenOf(
      annotate({
        poem,
        lookup,
        contextRules: [rule],
        overrides: [{ tokenId: "l1c1", readingId: "c-更-Z" }],
      }),
      "l1c1",
    );
    expect(token.selectionMethod).toBe("user");
    expect(token.selectedReadingId).toBe("c-更-Z");
  });

  it("规则指向当前数据不存在的候选时抛 CONTEXT_RULE_STALE，不静默生效", () => {
    const staleRule = contextRule({
      id: "r-stale",
      target: "更",
      exactPhrases: ["更上一层楼"],
      targetOffset: 0,
      selectCandidateIds: ["c-更-已下线的候选"],
    });
    expectReadingsError(
      () =>
        resolveReadings({
          poem,
          lookup,
          overrides: [],
          contextRules: [staleRule],
        }),
      "CONTEXT_RULE_STALE",
    );
  });

  it("规则结构自相矛盾时抛 CONTEXT_RULE_INVALID", () => {
    const wrongOffset = contextRule({
      id: "r-wrong-offset",
      target: "更",
      exactPhrases: ["更上一层楼"],
      targetOffset: 2,
      selectCandidateIds: ["c-更-P"],
    });
    expectReadingsError(
      () =>
        resolveReadings({
          poem,
          lookup,
          overrides: [],
          contextRules: [wrongOffset],
        }),
      "CONTEXT_RULE_INVALID",
    );

    const noPhrases = contextRule({
      id: "r-no-phrase",
      target: "更",
      exactPhrases: [],
      targetOffset: 0,
      selectCandidateIds: ["c-更-P"],
    });
    expectReadingsError(
      () =>
        resolveReadings({
          poem,
          lookup,
          overrides: [],
          contextRules: [noPhrases],
        }),
      "CONTEXT_RULE_INVALID",
    );
  });

  it("别的韵书的规则不参与本次分析", () => {
    const cilinRule = contextRule({
      id: "r-cilin",
      target: "更",
      exactPhrases: ["更上一层楼"],
      targetOffset: 0,
      selectCandidateIds: ["c-更-P"],
      book: "cilin",
    });
    const token = tokenOf(
      annotate({ poem, lookup, contextRules: [cilinRule] }),
      "l1c1",
    );
    expect(token.readingStatus).toBe("ambiguous");
    expect(token.selectionMethod).toBe("unresolved");
  });
});

describe("resolveReadings：不变性、确定性与边界", () => {
  it("B-D1-10 不修改输入、重复调用结果一致、输出通过公共 Schema", () => {
    const poem = deepFreeze(poemOf("白日依山尽\n黄河入海流"));
    const lookup = deepFreeze(dengGuanQueLouLookup());
    const overrides = deepFreeze<ReadingOverride[]>([
      { tokenId: "l1c5", readingId: "c-尽-Z" },
    ]);
    const contextRules = deepFreeze<ContextRule[]>([
      contextRule({
        id: "r-geng",
        target: "更",
        exactPhrases: ["更上一层楼"],
        targetOffset: 0,
        selectCandidateIds: ["c-更-P"],
      }),
    ]);

    const first = resolveReadings({ poem, lookup, overrides, contextRules });
    const second = resolveReadings({ poem, lookup, overrides, contextRules });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(AnnotatedPoemSchema.safeParse(first).success).toBe(true);
    expect(first.originalText).toBe(poem.originalText);
    expect(first.inputHash).toBe(poem.inputHash);
    expect(first.book).toBe("pingshui");
    for (const token of first.tokens) {
      expect(first.originalText.slice(token.startUtf16, token.endUtf16)).toBe(
        token.text,
      );
    }
    expect(first.lines).toEqual(poem.lines);
  });

  it("句子末位（可能的押韵位）不能成为额外的选音证据", () => {
    const result = annotate({
      poem: poemOf("白日依山更"),
      lookup: dengGuanQueLouLookup(),
    });
    const ending = tokenOf(result, "l1c5");
    expect(ending.text).toBe("更");
    expect(ending.readingStatus).toBe("ambiguous");
    expect(ending.selectionMethod).toBe("unresolved");
    expect(ending.possibleTones).toEqual(["P", "Z"]);
  });

  it("poem 自相矛盾时抛 POEM_TOKEN_SLICE_MISMATCH", () => {
    const poem = poemOf("白日");
    const broken: ParsedPoem = {
      ...poem,
      tokens: poem.tokens.map((token) =>
        token.tokenId === "l1c1" ? { ...token, endUtf16: 5 } : token,
      ),
    };
    expectReadingsError(
      () =>
        resolveReadings({
          poem: broken,
          lookup: singleCandidateLookup("白", "Z"),
          overrides: [],
          contextRules: [],
        }),
      "POEM_TOKEN_SLICE_MISMATCH",
    );
  });

  it("候选引用不存在的证据时抛 LOOKUP_EVIDENCE_UNKNOWN", () => {
    const lookup = syntheticLookup({
      entries: [
        {
          character: "白",
          candidates: [
            syntheticCandidate({
              id: "c-白-Z",
              character: "白",
              tone: "Z",
              evidenceIds: ["ev-不存在"],
            }),
          ],
        },
      ],
    });
    expectReadingsError(
      () =>
        resolveReadings({
          poem: poemOf("白"),
          lookup,
          overrides: [],
          contextRules: [],
        }),
      "LOOKUP_EVIDENCE_UNKNOWN",
    );
  });
});
