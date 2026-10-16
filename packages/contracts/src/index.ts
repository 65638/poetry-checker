import { z } from "zod";

const id = z.string().min(1);
const ids = z.array(id);
const positive = z.number().int().positive();
const offset = z.number().int().nonnegative();
const ratio = z.number().min(0).max(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
export const BookIdSchema = z.enum(["pingshui", "cilin", "xinyun"]);
export const FormIdSchema = z.enum(["wujue", "qijue", "wulv", "qilv"]);
export const ToneSchema = z.enum(["P", "Z"]);
export const CheckStatusSchema = z.enum([
  "pass",
  "fail",
  "uncertain",
  "not_applicable",
  "unsupported",
]);
export const SummaryStatusSchema = z.enum([
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
]);
export const VersionsSchema = z.strictObject({
  data: id,
  rules: id,
  context: id,
  works: id,
});
export const SourceRecordSchema = z.strictObject({
  id,
  title: id,
  edition: z.string().nullable(),
  url: z.url().nullable(),
  license: id,
  snapshotSha256: sha256.nullable(),
  revision: z.string().nullable(),
  retrievedAt: z.iso.datetime().nullable(),
});
export const EvidenceSchema = z.strictObject({
  id,
  sourceId: id,
  kind: z.enum([
    "rhyme_entry",
    "dictionary",
    "fanqie",
    "context",
    "work_metadata",
  ]),
  locator: id,
  assertion: id,
  excerpt: z.string().nullable(),
  reviewStatus: z.enum(["approved", "unverified"]),
});
export const RuleCardSchema = z.strictObject({
  id,
  version: id,
  name: id,
  scope: id,
  statement: id,
  limitations: z.array(z.string()),
  evidenceIds: ids,
});
export const ReadingCandidateSchema = z.strictObject({
  id,
  character: z
    .string()
    .refine((s) => [...s].length === 1, "必须为单个 Unicode 码点"),
  book: BookIdSchema,
  toneClass: z.enum([
    "ping",
    "shang",
    "qu",
    "ru",
    "yinping",
    "yangping",
    "neutral",
    "ze_unspecified",
  ]),
  tone: ToneSchema.nullable(),
  groupIds: ids,
  gloss: z.string().nullable(),
  modernReading: z
    .strictObject({
      pinyin: id,
      toneNumber: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
      ]),
      evidenceIds: ids,
    })
    .nullable(),
  fanqie: z.strictObject({ text: id, evidenceIds: ids }).nullable(),
  evidenceIds: ids,
});
export const RhymeGroupSchema = z.strictObject({
  id,
  book: BookIdSchema,
  name: id,
  toneClass: z.string().nullable(),
  evidenceIds: ids,
});
export const LookupResultSchema = z.strictObject({
  book: BookIdSchema,
  dataVersion: id,
  entries: z.array(
    z.strictObject({
      character: id,
      candidates: z.array(ReadingCandidateSchema),
    }),
  ),
  missing: z.array(z.string()),
  groups: z.array(RhymeGroupSchema),
  evidence: z.array(EvidenceSchema),
  sources: z.array(SourceRecordSchema),
});
export const ParsedTokenSchema = z.strictObject({
  tokenId: id,
  text: id,
  line: positive,
  column: positive,
  startUtf16: offset,
  endUtf16: offset,
});
export const ParseNoticeSchema = z.strictObject({
  code: id,
  message: id,
  startUtf16: offset,
  endUtf16: offset,
});
export const ParsedPoemSchema = z.strictObject({
  originalText: z.string(),
  inputHash: sha256,
  lines: z.array(
    z.strictObject({ line: positive, text: z.string(), tokenIds: ids }),
  ),
  tokens: z.array(ParsedTokenSchema),
  quality: z.enum(["ok", "needs_review"]),
  notices: z.array(ParseNoticeSchema),
});
export const ReadingOverrideSchema = z.strictObject({
  tokenId: id,
  readingId: id,
});
export const ContextRuleSchema = z.strictObject({
  id,
  target: id,
  exactPhrases: z.array(id),
  targetOffset: offset,
  sense: id,
  book: BookIdSchema,
  selectCandidateIds: ids,
  negativeExamples: z.array(z.string()),
  evidenceIds: ids,
  reviewStatus: z.enum(["approved", "unverified"]),
});
export const AnnotatedTokenSchema = ParsedTokenSchema.extend({
  candidates: z.array(ReadingCandidateSchema),
  effectiveCandidateIds: ids,
  readingStatus: z.enum(["resolved", "ambiguous", "unknown"]),
  selectedReadingId: id.nullable(),
  selectionMethod: z.enum(["unique", "context_rule", "user", "unresolved"]),
  possibleTones: z.array(ToneSchema),
  toneStatus: z.enum(["resolved", "ambiguous", "unknown"]),
  tone: ToneSchema.nullable(),
  reason: z.string(),
  evidenceIds: ids,
}).superRefine((token, ctx) => {
  if (token.endUtf16 <= token.startUtf16)
    ctx.addIssue({ code: "custom", message: "字位范围必须非空" });
  const available = new Set(token.candidates.map((c) => c.id));
  if (
    new Set(token.effectiveCandidateIds).size !==
      token.effectiveCandidateIds.length ||
    token.effectiveCandidateIds.some((key) => !available.has(key))
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["effectiveCandidateIds"],
      message: "有效候选必须存在且不重复",
    });
  }
  if (
    token.readingStatus === "resolved" &&
    (token.effectiveCandidateIds.length !== 1 ||
      token.selectedReadingId !== token.effectiveCandidateIds[0])
  ) {
    ctx.addIssue({ code: "custom", message: "已确定读音必须对应唯一有效候选" });
  }
  if (token.readingStatus !== "resolved" && token.selectedReadingId !== null) {
    ctx.addIssue({ code: "custom", message: "未确定读音不能静默选候选" });
  }
  const effective = token.candidates.filter((c) =>
    token.effectiveCandidateIds.includes(c.id),
  );
  const known = [
    ...new Set(effective.flatMap((c) => (c.tone === null ? [] : [c.tone]))),
  ].sort();
  const unknown =
    effective.length === 0 || effective.some((c) => c.tone === null);
  const expectedStatus = unknown
    ? "unknown"
    : known.length === 1
      ? "resolved"
      : "ambiguous";
  const expectedTone = expectedStatus === "resolved" ? known[0] : null;
  if (
    JSON.stringify([...token.possibleTones].sort()) !== JSON.stringify(known) ||
    token.toneStatus !== expectedStatus ||
    token.tone !== expectedTone
  ) {
    ctx.addIssue({
      code: "custom",
      message: "平仄状态必须由全部有效候选一致推导",
    });
  }
});
export const AnnotatedPoemSchema = z.strictObject({
  ...ParsedPoemSchema.shape,
  book: BookIdSchema,
  tokens: z.array(AnnotatedTokenSchema),
});
export const TemplateCandidateSchema = z.strictObject({
  id,
  formId: FormIdSchema,
  lineTypes: z.array(z.enum(["A", "B", "C", "D"])),
  expectedTones: z.array(z.array(z.array(ToneSchema).min(1))),
  requiredRhymeLines: z.array(positive),
  evaluatedKeyRate: ratio,
  features: z.strictObject({
    toneFit: ratio.nullable(),
    relationFit: ratio.nullable(),
    rhymeFit: ratio.nullable(),
    parallelismFit: ratio.nullable(),
  }),
  score: ratio.nullable(),
});
export const WorkMetadataSchema = z.strictObject({
  id,
  title: id,
  author: z.string().nullable(),
  approvedTextFingerprints: z.array(sha256),
  formFamily: z.enum(["regulated", "ancient", "undetermined", "unsupported"]),
  formId: FormIdSchema.nullable(),
  historicalTags: z.array(z.string()),
  evidenceIds: ids,
  reviewStatus: z.enum(["approved", "unverified"]),
});
export const GenreDecisionSchema = z.strictObject({
  formFamily: z.enum(["regulated", "ancient", "undetermined", "unsupported"]),
  formId: FormIdSchema.nullable(),
  historicalTags: z.array(z.string()),
  applicability: z.enum([
    "applicable",
    "not_applicable",
    "uncertain",
    "unsupported",
  ]),
  basisType: z.enum(["user", "reviewed_metadata", "heuristic"]),
  candidateTemplateIds: ids,
  selectedTemplateId: id.nullable(),
  reasons: z.array(z.string()),
  evidenceIds: ids,
});
export const FindingSchema = z.strictObject({
  id,
  ruleId: id,
  ruleVersion: id,
  status: CheckStatusSchema,
  severity: z.enum(["error", "warning", "info"]),
  locations: z.array(
    z.strictObject({ tokenId: id, line: positive, column: positive }),
  ),
  expected: z.array(z.string()),
  observed: z.array(z.string()),
  message: id,
  templateId: id.nullable(),
  evidenceIds: ids,
  resolvedBy: id.nullable(),
  relatedFindingIds: ids,
});
export const ProsodyReportSchema = z.strictObject({
  candidates: z.array(TemplateCandidateSchema),
  selectedTemplateId: id.nullable(),
  checks: z.array(FindingSchema),
  rhyme: z.strictObject({
    status: CheckStatusSchema,
    tokenIds: ids,
    commonGroupIds: ids,
  }),
  relations: z.array(
    z.strictObject({
      kind: z.enum(["nian", "dui"]),
      tokenIds: ids,
      status: CheckStatusSchema,
      findingIds: ids,
    }),
  ),
});
export const AnalyzeRequestSchema = z
  .strictObject({
    text: z
      .string()
      .min(1)
      .refine(
        (text) => [...text].length <= 2000,
        "正文超出 2000 个 Unicode 码点",
      )
      .refine((text) => /\p{Script=Han}/u.test(text), "正文必须包含汉字"),
    rhymeBook: BookIdSchema,
    genreHint: z.enum(["auto", "regulated", "ancient"]),
    formHint: z.union([z.literal("auto"), FormIdSchema]),
    ruleSet: z.literal("teaching-v1"),
    inputHash: sha256.optional(),
    readingOverrides: z.array(ReadingOverrideSchema),
  })
  .superRefine((request, ctx) => {
    if (request.genreHint === "ancient" && request.formHint !== "auto") {
      ctx.addIssue({
        code: "custom",
        path: ["formHint"],
        message: "古体模式不能同时指定近体格式",
      });
    }
    if (
      request.readingOverrides.length > 0 &&
      request.inputHash === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["inputHash"],
        message: "人工选音必须附上原文摘要",
      });
    }
    if (
      new Set(request.readingOverrides.map((o) => o.tokenId)).size !==
      request.readingOverrides.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["readingOverrides"],
        message: "同一字位不能重复覆盖",
      });
    }
  });
export const AnalysisResponseSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    inputHash: sha256,
    versions: VersionsSchema,
    policy: z.strictObject({
      rhymeBook: BookIdSchema,
      toneBasis: z.enum(["historical", "mandarin_base"]),
      notice: id,
    }),
    poem: AnnotatedPoemSchema,
    genre: GenreDecisionSchema,
    prosody: ProsodyReportSchema,
    provenance: z.strictObject({
      groups: z.array(RhymeGroupSchema),
      sources: z.array(SourceRecordSchema),
      evidence: z.array(EvidenceSchema),
      rules: z.array(RuleCardSchema),
    }),
    summary: z.strictObject({ status: SummaryStatusSchema, message: id }),
  })
  .superRefine((report, ctx) => {
    if (
      report.inputHash !== report.poem.inputHash ||
      report.policy.rhymeBook !== report.poem.book
    ) {
      ctx.addIssue({
        code: "custom",
        message: "报告与标注的原文摘要及韵书必须一致",
      });
    }
    const expectedBasis =
      report.policy.rhymeBook === "xinyun" ? "mandarin_base" : "historical";
    if (report.policy.toneBasis !== expectedBasis)
      ctx.addIssue({ code: "custom", message: "韵书与音系口径不符" });
    for (const token of report.poem.tokens) {
      if (
        report.poem.originalText.slice(token.startUtf16, token.endUtf16) !==
        token.text
      ) {
        ctx.addIssue({
          code: "custom",
          message: `原文字位不匹配：${token.tokenId}`,
        });
      }
    }
  });
export const ErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: id,
    message: id,
    fieldErrors: z.array(z.strictObject({ path: z.string(), message: id })),
  }),
});
export const RhymeBooksResponseSchema = z.strictObject({
  books: z.array(
    z.strictObject({
      id: BookIdSchema,
      name: id,
      dataVersion: id,
      groupCount: offset,
      coverageNotice: id,
    }),
  ),
});
export const RuleResponseSchema = z.strictObject({
  rule: RuleCardSchema,
  evidence: z.array(EvidenceSchema),
  sources: z.array(SourceRecordSchema),
});
export const SourceResponseSchema = z.strictObject({
  source: SourceRecordSchema,
  evidence: z.array(EvidenceSchema),
});
export const HealthResponseSchema = z.strictObject({ status: z.literal("ok") });
export const ReadyResponseSchema = z.strictObject({
  status: z.literal("ready"),
  versions: VersionsSchema,
});

export type BookId = z.infer<typeof BookIdSchema>;
export type FormId = z.infer<typeof FormIdSchema>;
export type Tone = z.infer<typeof ToneSchema>;
export type CheckStatus = z.infer<typeof CheckStatusSchema>;
export type SummaryStatus = z.infer<typeof SummaryStatusSchema>;
export type Versions = z.infer<typeof VersionsSchema>;
export type SourceRecord = z.infer<typeof SourceRecordSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type RuleCard = z.infer<typeof RuleCardSchema>;
export type ReadingCandidate = z.infer<typeof ReadingCandidateSchema>;
export type RhymeGroup = z.infer<typeof RhymeGroupSchema>;
export type LookupResult = z.infer<typeof LookupResultSchema>;
export type ParsedToken = z.infer<typeof ParsedTokenSchema>;
export type ParseNotice = z.infer<typeof ParseNoticeSchema>;
export type ParsedPoem = z.infer<typeof ParsedPoemSchema>;
export type ReadingOverride = z.infer<typeof ReadingOverrideSchema>;
export type ContextRule = z.infer<typeof ContextRuleSchema>;
export type AnnotatedToken = z.infer<typeof AnnotatedTokenSchema>;
export type AnnotatedPoem = z.infer<typeof AnnotatedPoemSchema>;
export type TemplateCandidate = z.infer<typeof TemplateCandidateSchema>;
export type WorkMetadata = z.infer<typeof WorkMetadataSchema>;
export type GenreDecision = z.infer<typeof GenreDecisionSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type ProsodyReport = z.infer<typeof ProsodyReportSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type RhymeBooksResponse = z.infer<typeof RhymeBooksResponseSchema>;
export type RuleResponse = z.infer<typeof RuleResponseSchema>;
export type SourceResponse = z.infer<typeof SourceResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;

export interface MatchInput {
  poem: AnnotatedPoem;
  formHint: "auto" | FormId;
  ruleSet: "teaching-v1";
}
export interface EvaluateInput {
  poem: AnnotatedPoem;
  candidates: TemplateCandidate[];
  selectedTemplateId: string | null;
  applicability: GenreDecision["applicability"];
  ruleSet: "teaching-v1";
}

export const schemaRegistry = {
  AnalyzeRequest: AnalyzeRequestSchema,
  AnalysisResponse: AnalysisResponseSchema,
  ErrorResponse: ErrorResponseSchema,
  LookupResult: LookupResultSchema,
  RuleCard: RuleCardSchema,
  SourceRecord: SourceRecordSchema,
  Evidence: EvidenceSchema,
  ReadingCandidate: ReadingCandidateSchema,
  ParsedPoem: ParsedPoemSchema,
  AnnotatedPoem: AnnotatedPoemSchema,
  TemplateCandidate: TemplateCandidateSchema,
  GenreDecision: GenreDecisionSchema,
  ProsodyReport: ProsodyReportSchema,
  RhymeBooksResponse: RhymeBooksResponseSchema,
  RuleResponse: RuleResponseSchema,
  SourceResponse: SourceResponseSchema,
  HealthResponse: HealthResponseSchema,
  ReadyResponse: ReadyResponseSchema,
};

export function createOpenApiDocument() {
  const content = (schemaName: string) => ({
    "application/json": {
      schema: { $ref: `#/components/schemas/${schemaName}` },
    },
  });
  const errors = Object.fromEntries(
    [404, 413, 422, 503, 500].map((status) => [
      status,
      { description: "参见契约错误码", content: content("ErrorResponse") },
    ]),
  );
  return {
    openapi: "3.1.0",
    info: {
      title: "诗格律检查器 API",
      version: "1.0",
      description:
        "契约基线。复杂跨字段校验以 Zod 实现为准；HTTP 服务尚待接入。",
    },
    paths: {
      "/api/v1/analyze": {
        post: {
          operationId: "analyze",
          requestBody: { required: true, content: content("AnalyzeRequest") },
          responses: {
            "200": {
              description: "含明确结果或不确定项的完整报告",
              content: content("AnalysisResponse"),
            },
            ...errors,
          },
        },
      },
      "/api/v1/rhyme-books": {
        get: {
          operationId: "listRhymeBooks",
          responses: {
            "200": {
              description: "已加载韵书与覆盖说明",
              content: content("RhymeBooksResponse"),
            },
            "503": errors[503],
            "500": errors[500],
          },
        },
      },
      "/api/v1/characters/{char}": {
        get: {
          operationId: "lookupCharacter",
          parameters: [
            {
              name: "char",
              in: "path",
              required: true,
              description: "单个 Unicode 码点的汉字",
              schema: { type: "string", minLength: 1, maxLength: 1 },
            },
            {
              name: "book",
              in: "query",
              required: true,
              schema: z.toJSONSchema(BookIdSchema),
            },
          ],
          responses: {
            "200": {
              description: "全部候选及来源；缺字在 missing 中表达",
              content: content("LookupResult"),
            },
            "422": errors[422],
            "503": errors[503],
            "500": errors[500],
          },
        },
      },
      "/api/v1/rules/{ruleId}": {
        get: {
          operationId: "getRule",
          parameters: [
            {
              name: "ruleId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": {
              description: "规则及证据",
              content: content("RuleResponse"),
            },
            "404": errors[404],
            "503": errors[503],
            "500": errors[500],
          },
        },
      },
      "/api/v1/sources/{sourceId}": {
        get: {
          operationId: "getSource",
          parameters: [
            {
              name: "sourceId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": {
              description: "来源及证据",
              content: content("SourceResponse"),
            },
            "404": errors[404],
            "503": errors[503],
            "500": errors[500],
          },
        },
      },
      "/healthz": {
        get: {
          operationId: "health",
          responses: {
            "200": {
              description: "进程存活",
              content: content("HealthResponse"),
            },
          },
        },
      },
      "/readyz": {
        get: {
          operationId: "ready",
          responses: {
            "200": {
              description: "全部真实数据与规则就绪",
              content: content("ReadyResponse"),
            },
            "503": errors[503],
          },
        },
      },
    },
    components: {
      schemas: Object.fromEntries(
        Object.entries(schemaRegistry).map(([name, schema]) => [
          name,
          z.toJSONSchema(schema, { target: "draft-2020-12" }),
        ]),
      ),
    },
  };
}
