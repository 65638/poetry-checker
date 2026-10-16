import { createHash } from "node:crypto";
import { getTemplates } from "@poetry/prosody";
import type {
  AnalysisResponse,
  AnnotatedToken,
  ReadingCandidate,
  SummaryStatus,
  TemplateCandidate,
} from "../src/index.js";

// 纯合成接口场景：不是韵书数据或语言学金标准，不能用于真实分析。
export function makeFixture(status: SummaryStatus = "pass"): AnalysisResponse {
  const text = (
    status === "fail"
      ? ["仄平平平仄", "平平仄仄平", "平平平仄仄", "仄仄仄平平"]
      : ["仄仄平平仄", "平平仄仄平", "平平平仄仄", "仄仄仄平平"]
  ).join("\n");
  const inputHash = createHash("sha256").update(text, "utf8").digest("hex");
  const sourceId = "fixture:source";
  const reading = (character: string): ReadingCandidate => ({
    id: `fixture:reading:${character}`,
    character,
    book: "pingshui",
    toneClass: character === "平" ? "ping" : "ze_unspecified",
    tone: character === "平" ? "P" : "Z",
    groupIds: [`fixture:group:${character}`],
    gloss: "合成接口测试候选，非韵书条目",
    modernReading: null,
    fanqie: null,
    evidenceIds: [`fixture:evidence:${character}`],
  });
  let cursor = 0;
  const tokens: AnnotatedToken[] = [];
  const lines = text.split("\n").map((lineText, index) => {
    const line = index + 1;
    const tokenIds = [...lineText].map((character, columnIndex) => {
      const candidate = reading(character);
      const tokenId = `l${line}c${columnIndex + 1}`;
      tokens.push({
        tokenId,
        text: character,
        line,
        column: columnIndex + 1,
        startUtf16: cursor,
        endUtf16: cursor + character.length,
        candidates: [candidate],
        effectiveCandidateIds: [candidate.id],
        readingStatus: "resolved",
        selectedReadingId: candidate.id,
        selectionMethod: "unique",
        possibleTones: [candidate.tone!],
        toneStatus: "resolved",
        tone: candidate.tone,
        reason: "合成测试候选",
        evidenceIds: candidate.evidenceIds,
      });
      cursor += character.length;
      return tokenId;
    });
    cursor += 1;
    return { line, text: lineText, tokenIds };
  });
  if (status === "needs_review") {
    const first = tokens[0]!;
    Object.assign(first, {
      candidates: [],
      effectiveCandidateIds: [],
      readingStatus: "unknown",
      selectedReadingId: null,
      selectionMethod: "unresolved",
      possibleTones: [],
      toneStatus: "unknown",
      tone: null,
      reason: "合成缺字场景",
      evidenceIds: [],
    });
  }
  const definition = getTemplates("wujue").find(
    (t) => t.id === "wujue-ze-unrhymed",
  )!;
  const template: TemplateCandidate = {
    id: definition.id,
    formId: definition.formId,
    lineTypes: definition.lineTypes,
    expectedTones: definition.expectedTones,
    requiredRhymeLines: definition.requiredRhymeLines,
    evaluatedKeyRate: status === "needs_review" ? 0.8 : 1,
    features: {
      toneFit: null,
      relationFit: null,
      rhymeFit: null,
      parallelismFit: null,
    },
    score: null,
  };
  const inactive = status === "not_applicable" || status === "unsupported";
  const checkStatus = status === "needs_review" ? "uncertain" : status;
  return {
    schemaVersion: "1.0",
    inputHash,
    versions: {
      data: "fixture-only",
      rules: "teaching-v1",
      context: "fixture-only",
      works: "fixture-only",
    },
    policy: {
      rhymeBook: "pingshui",
      toneBasis: "historical",
      notice: "合成接口/界面场景，不用于真实格律判断",
    },
    poem: {
      originalText: text,
      inputHash,
      lines,
      tokens,
      quality: "ok",
      notices: [],
      book: "pingshui",
    },
    genre: {
      formFamily:
        status === "not_applicable"
          ? "ancient"
          : status === "unsupported"
            ? "unsupported"
            : status === "needs_review"
              ? "undetermined"
              : "regulated",
      formId: inactive ? null : "wujue",
      historicalTags: [],
      applicability:
        status === "needs_review"
          ? "uncertain"
          : inactive
            ? status
            : "applicable",
      basisType: "user",
      candidateTemplateIds: inactive ? [] : [template.id],
      selectedTemplateId:
        inactive || status === "needs_review" ? null : template.id,
      reasons: ["合成场景，不代表真实体裁识别"],
      evidenceIds: [],
    },
    prosody: {
      candidates: inactive ? [] : [template],
      selectedTemplateId:
        inactive || status === "needs_review" ? null : template.id,
      checks: [
        {
          id: "fixture:check",
          ruleId: "METER.POSITION",
          ruleVersion: "1",
          status: checkStatus,
          severity: status === "fail" ? "error" : "info",
          locations: [{ tokenId: "l1c2", line: 1, column: 2 }],
          expected: ["Z"],
          observed: status === "fail" ? ["P"] : ["Z"],
          message: `合成 ${status} 场景，仅用于契约/界面测试`,
          templateId: inactive ? null : template.id,
          evidenceIds: [],
          resolvedBy: null,
          relatedFindingIds: [],
        },
      ],
      rhyme: {
        status: checkStatus,
        tokenIds: ["l2c5", "l4c5"],
        commonGroupIds: inactive ? [] : ["fixture:group:平"],
      },
      relations: [],
    },
    provenance: {
      groups: ["平", "仄"].map((character) => ({
        id: `fixture:group:${character}`,
        book: "pingshui",
        name: `合成${character}部`,
        toneClass: character === "平" ? "ping" : "ze_unspecified",
        evidenceIds: [`fixture:evidence:${character}`],
      })),
      sources: [
        {
          id: sourceId,
          title: "项目自建合成测试源（非韵书）",
          edition: "fixture-v1",
          url: null,
          license: "仅作项目接口测试",
          snapshotSha256: null,
          revision: null,
          retrievedAt: null,
        },
      ],
      evidence: ["平", "仄"].map((character) => ({
        id: `fixture:evidence:${character}`,
        sourceId,
        kind: "rhyme_entry",
        locator: `synthetic/${character}`,
        assertion: "仅证明测试构造内的数据关联，不证明真实韵书归属",
        excerpt: null,
        reviewStatus: "approved",
      })),
      rules: [
        {
          id: "METER.POSITION",
          version: "1",
          name: "逐位允许集合",
          scope: "合成接口场景",
          statement: "比较有效候选与允许平仄集合",
          limitations: ["此 fixture 不执行真实判定"],
          evidenceIds: [],
        },
      ],
    },
    summary: { status, message: `合成 ${status} 场景，不是实际分析结果` },
  };
}
