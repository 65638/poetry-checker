/**
 * 体裁判定最小分支（M5 / 队员 E，D1）。
 *
 * 纯函数：不查网络、不读文件、不调用模型、不重算格律 score。
 * 输入对象只读；输出必须是完整的 GenreDecision（strictObject，字段缺一不可）。
 *
 * 规则顺序按 docs/team/15 第 3 节：
 *   1. 用户指定具体形式 → 尊重选择，结构不符也要指出，不改判古体；
 *   2. 用户显式古体   → 近体规则不适用，basisType=user，不伪称学术识别；
 *   3. approved 正文指纹匹配 → D1 未实现（需 core 的指纹与规范化规则）；
 *   4. 四/八句且每句五/七字的 auto → 由候选特征决定近体候选或待确认；
 *   5. 低吻合 → undetermined/uncertain，保留候选，不推断古体；
 *   6. 超出四类支持形式 → unsupported（排律等），不冒称古体；
 *   7. 信息不足 / needs_review / 关键位可判率不足 → 不输出高把握判断。
 */
import type {
  AnalyzeRequest,
  AnnotatedPoem,
  FormId,
  GenreDecision,
  TemplateCandidate,
  WorkMetadata,
} from "@poetry/contracts";
import { GenreError } from "./errors.js";
import { fingerprintText } from "./fingerprint.js";

export interface ClassifyGenreInput {
  poem: AnnotatedPoem;
  candidates: TemplateCandidate[];
  metadata: WorkMetadata[];
  genreHint: AnalyzeRequest["genreHint"];
  formHint: AnalyzeRequest["formHint"];
}

/** 四类近体支持形式的形制：句数与每句字数。 */
export const FORM_SHAPE: Readonly<
  Record<FormId, { readonly lines: number; readonly chars: number }>
> = {
  wujue: { lines: 4, chars: 5 },
  qijue: { lines: 4, chars: 7 },
  wulv: { lines: 8, chars: 5 },
  qilv: { lines: 8, chars: 7 },
};

/**
 * 工程阈值，取自 docs/team/15 第 3 节，待样本校准。
 * score 由 Codex 核心按固定权重生成，本模块只读不重算。
 */
export const GENRE_THRESHOLDS = {
  confidentScore: 0.9,
  possibleScore: 0.75,
  tieMargin: 0.05,
  minEvaluatedKeyRate: 0.8,
} as const;

const HAN = /\p{Script=Han}/u;

function hanCount(text: string): number {
  let count = 0;
  for (const char of text) {
    if (HAN.test(char)) count += 1;
  }
  return count;
}

interface Shape {
  lineCount: number;
  charCounts: number[];
  /** 每句字数一致时给出该字数，否则 null。 */
  uniformChars: number | null;
  inferredFormId: FormId | null;
}

function readShape(poem: AnnotatedPoem): Shape {
  const charCounts = poem.lines.map((line) => hanCount(line.text));
  const first = charCounts[0];
  const uniformChars =
    first !== undefined && charCounts.every((count) => count === first)
      ? first
      : null;
  const lineCount = charCounts.length;

  let inferredFormId: FormId | null = null;
  if (uniformChars !== null) {
    for (const formId of Object.keys(FORM_SHAPE) as FormId[]) {
      const shape = FORM_SHAPE[formId];
      if (shape.lines === lineCount && shape.chars === uniformChars) {
        inferredFormId = formId;
        break;
      }
    }
  }

  return { lineCount, charCounts, uniformChars, inferredFormId };
}

function describeShape(shape: Shape): string {
  const lengths = [...new Set(shape.charCounts)].join("/");
  return `${shape.lineCount} 句、每句 ${lengths || 0} 字`;
}

function decision(
  part: Pick<
    GenreDecision,
    "formFamily" | "applicability" | "basisType" | "reasons"
  > &
    Partial<GenreDecision>,
): GenreDecision {
  return {
    formFamily: part.formFamily,
    formId: part.formId ?? null,
    historicalTags: part.historicalTags ?? [],
    applicability: part.applicability,
    basisType: part.basisType,
    candidateTemplateIds: part.candidateTemplateIds ?? [],
    selectedTemplateId: part.selectedTemplateId ?? null,
    reasons: part.reasons,
    evidenceIds: part.evidenceIds ?? [],
  };
}

function featuresComplete(candidate: TemplateCandidate): boolean {
  const { toneFit, relationFit, rhymeFit, parallelismFit } = candidate.features;
  return (
    toneFit !== null &&
    relationFit !== null &&
    rhymeFit !== null &&
    parallelismFit !== null
  );
}

/** 只有当候选唯一且四项特征齐全时，才值得给出 selectedTemplateId。 */
function pickReliableTemplate(pool: TemplateCandidate[]): string | null {
  if (pool.length !== 1) return null;
  const only = pool[0];
  if (only === undefined) return null;
  return featuresComplete(only) ? only.id : null;
}

/** 用户显式指定了近体形式（formHint=wujue/qijue/wulv/qilv）。 */
function decideByExplicitForm(
  poem: AnnotatedPoem,
  candidates: TemplateCandidate[],
  formHint: FormId,
  shape: Shape,
): GenreDecision {
  const expected = FORM_SHAPE[formHint];
  const pool = candidates.filter((candidate) => candidate.formId === formHint);
  const matchesShape =
    poem.lines.length === expected.lines &&
    poem.lines.every((line) => hanCount(line.text) === expected.chars);

  if (!matchesShape) {
    return decision({
      formFamily: "regulated",
      formId: formHint,
      applicability: "uncertain",
      basisType: "user",
      candidateTemplateIds: pool.map((candidate) => candidate.id),
      reasons: [
        `用户指定 ${formHint}，予以保留`,
        `正文形制与 ${formHint} 不符（${describeShape(shape)}）`,
        "不改判古体；是否合律由格律引擎判定",
      ],
    });
  }

  return decision({
    formFamily: "regulated",
    formId: formHint,
    applicability: "applicable",
    basisType: "user",
    candidateTemplateIds: pool.map((candidate) => candidate.id),
    selectedTemplateId: pickReliableTemplate(pool),
    reasons: [
      `用户指定 ${formHint}，形制相符（${describeShape(shape)}）`,
      "模板选择与合律结论由格律引擎给出，本模块不下合律结论",
    ],
  });
}

/** 用户选择“近体”但未指定具体形式（genreHint=regulated, formHint=auto）。 */
function decideByRegulatedHint(
  candidates: TemplateCandidate[],
  shape: Shape,
): GenreDecision {
  const formId = shape.inferredFormId;
  if (formId === null) {
    return decision({
      formFamily: "undetermined",
      applicability: "uncertain",
      basisType: "user",
      reasons: [
        "用户选择近体，但形制不匹配四类支持形式",
        `正文${describeShape(shape)}`,
        "不改判古体；建议补充近体格式再试",
      ],
    });
  }

  const pool = candidates.filter((candidate) => candidate.formId === formId);
  return decision({
    formFamily: "regulated",
    formId,
    applicability: "applicable",
    basisType: "user",
    candidateTemplateIds: pool.map((candidate) => candidate.id),
    selectedTemplateId: pickReliableTemplate(pool),
    reasons: [
      `用户选择近体；按形制（${describeShape(shape)}）推得 ${formId}`,
      "模板选择与合律结论由格律引擎判定",
    ],
  });
}

/** auto：先看解析质量与形制，再看候选特征完整度与阈值。 */
function decideAuto(
  poem: AnnotatedPoem,
  candidates: TemplateCandidate[],
  shape: Shape,
): GenreDecision {
  if (poem.quality === "needs_review") {
    return decision({
      formFamily: "undetermined",
      applicability: "uncertain",
      basisType: "heuristic",
      candidateTemplateIds: candidates.map((candidate) => candidate.id),
      reasons: ["解析质量 needs_review，不输出高把握体裁判断"],
    });
  }

  const formId = shape.inferredFormId;
  if (formId === null) {
    const looksLikePailu =
      (shape.uniformChars === 5 || shape.uniformChars === 7) &&
      shape.lineCount > 8;
    return decision({
      formFamily: "unsupported",
      applicability: "unsupported",
      basisType: "heuristic",
      reasons: [
        looksLikePailu
          ? `形制疑似排律/长律（${describeShape(shape)}），超出四类支持形式`
          : `形制不匹配四类近体支持形式（${describeShape(shape)}）`,
        "审核古体识别与完整体式区分未实现（D2），此处不冒称古体",
      ],
    });
  }

  const pool = candidates.filter((candidate) => candidate.formId === formId);
  const poolIds = pool.map((candidate) => candidate.id);

  if (pool.length === 0) {
    return decision({
      formFamily: "undetermined",
      formId,
      applicability: "uncertain",
      basisType: "heuristic",
      reasons: ["形制符合近体但缺少候选模板，依据不足"],
    });
  }

  const maxKeyRate = Math.max(
    ...pool.map((candidate) => candidate.evaluatedKeyRate),
  );
  if (maxKeyRate < GENRE_THRESHOLDS.minEvaluatedKeyRate) {
    return decision({
      formFamily: "undetermined",
      formId,
      applicability: "uncertain",
      basisType: "heuristic",
      candidateTemplateIds: poolIds,
      reasons: [
        `关键位可判率 ${maxKeyRate.toFixed(2)} 低于 ${GENRE_THRESHOLDS.minEvaluatedKeyRate}`,
        "依据不足，不输出高把握判断",
      ],
    });
  }

  // 当前底座只有 toneFit；缺关键特征时不得按单一特征下近体结论（E-D1-04）。
  if (pool.some((candidate) => !featuresComplete(candidate))) {
    return decision({
      formFamily: "undetermined",
      formId,
      applicability: "uncertain",
      basisType: "heuristic",
      candidateTemplateIds: poolIds,
      reasons: [
        "候选特征未齐（relationFit/rhymeFit 为空）",
        "不按 toneFit 单项判定近体，留待核心补齐特征",
      ],
    });
  }

  const scored = pool
    .filter(
      (candidate): candidate is TemplateCandidate & { score: number } =>
        candidate.score !== null,
    )
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    return decision({
      formFamily: "undetermined",
      formId,
      applicability: "uncertain",
      basisType: "heuristic",
      candidateTemplateIds: poolIds,
      reasons: ["候选缺少综合 score，依据不足"],
    });
  }

  const best = scored[0];
  const runnerUp = scored[1];
  if (best === undefined) {
    return decision({
      formFamily: "undetermined",
      formId,
      applicability: "uncertain",
      basisType: "heuristic",
      candidateTemplateIds: poolIds,
      reasons: ["候选缺少综合 score，依据不足"],
    });
  }

  if (runnerUp !== undefined) {
    const margin = best.score - runnerUp.score;
    if (margin < GENRE_THRESHOLDS.tieMargin) {
      return decision({
        formFamily: "undetermined",
        formId,
        applicability: "uncertain",
        basisType: "heuristic",
        candidateTemplateIds: poolIds,
        reasons: [
          `最高两个模板分差 ${margin.toFixed(3)} 小于 ${GENRE_THRESHOLDS.tieMargin}，并列待确认`,
          "selectedTemplateId 置空并保留候选，不按数组顺序取第一项",
        ],
      });
    }
  }

  if (best.score >= GENRE_THRESHOLDS.confidentScore) {
    // 高吻合自动判定依赖完整特征与真实样本校准，D1 不实现（见 HANDOFF）。
    throw new GenreError(
      "GENRE_BRANCH_PENDING",
      "自动高吻合分支尚未实现（D2）：需完整特征与样本校准",
      "auto-high-confidence",
    );
  }

  const band =
    best.score >= GENRE_THRESHOLDS.possibleScore
      ? `可能近体区间（${GENRE_THRESHOLDS.possibleScore}–${GENRE_THRESHOLDS.confidentScore}）`
      : `低于 ${GENRE_THRESHOLDS.possibleScore}`;

  return decision({
    formFamily: "undetermined",
    formId,
    applicability: "uncertain",
    basisType: "heuristic",
    candidateTemplateIds: poolIds,
    reasons: [
      `最高吻合 ${best.score.toFixed(3)} 落在${band}`,
      "保留参考检查，不推断为古体，也不声称近体通过",
    ],
  });
}

/** 已审核元数据 → 体裁结论：采用审核的形式与标签，并带上证据。 */
const APPLICABILITY_BY_FAMILY: Readonly<
  Record<WorkMetadata["formFamily"], GenreDecision["applicability"]>
> = {
  regulated: "applicable",
  ancient: "not_applicable",
  undetermined: "uncertain",
  unsupported: "unsupported",
};

function decideByReviewedMetadata(
  entry: WorkMetadata,
  candidates: TemplateCandidate[],
): GenreDecision {
  const formLabel =
    entry.formId === null
      ? entry.formFamily
      : `${entry.formFamily}/${entry.formId}`;
  return decision({
    formFamily: entry.formFamily,
    formId: entry.formId,
    historicalTags: entry.historicalTags,
    applicability: APPLICABILITY_BY_FAMILY[entry.formFamily],
    basisType: "reviewed_metadata",
    candidateTemplateIds: candidates
      .filter((candidate) => candidate.formId === entry.formId)
      .map((candidate) => candidate.id),
    selectedTemplateId: null,
    evidenceIds: entry.evidenceIds,
    reasons: [
      `正文指纹精确匹配已审核作品元数据：${entry.title}`,
      `采用审核的形式与标签（${formLabel}）`,
      "合律判定仍由格律引擎给出，本模块不下合律结论",
    ],
  });
}

export function classifyGenre(input: ClassifyGenreInput): GenreDecision {
  const { poem, candidates, metadata, genreHint, formHint } = input;

  // 契约 Schema 已拒绝“古体 + 具体近体形式”，此处防上游绕过 Schema 直接调用。
  if (genreHint === "ancient" && formHint !== "auto") {
    throw new GenreError(
      "GENRE_REQUEST_INVALID",
      "古体模式不能同时指定近体格式",
    );
  }

  const shape = readShape(poem);

  // 规则 2：用户显式古体。
  if (genreHint === "ancient") {
    return decision({
      formFamily: "ancient",
      applicability: "not_applicable",
      basisType: "user",
      reasons: [
        "用户指定古体，近体规则不适用",
        "依据为用户选择，不是学术识别结论",
      ],
    });
  }

  // 规则 1：用户显式指定近体形式。
  if (formHint !== "auto") {
    return decideByExplicitForm(poem, candidates, formHint, shape);
  }

  // 规则 1b：用户选择近体但形式交由形制推断。
  if (genreHint === "regulated") {
    return decideByRegulatedHint(candidates, shape);
  }

  // 规则 3：已审核作品正文指纹精确匹配（去标点/空白、保留字形字序）。
  // 未审核元数据一律不参与；标题、作者、首句都不作为匹配依据。
  const fingerprint = fingerprintText(poem.originalText);
  const matchedMetadata = metadata.filter(
    (entry) =>
      entry.reviewStatus === "approved" &&
      entry.approvedTextFingerprints.includes(fingerprint),
  );

  const onlyMatch =
    matchedMetadata.length === 1 ? matchedMetadata[0] : undefined;
  if (onlyMatch !== undefined) {
    return decideByReviewedMetadata(onlyMatch, candidates);
  }

  if (matchedMetadata.length > 1) {
    return decision({
      formFamily: "undetermined",
      applicability: "uncertain",
      basisType: "reviewed_metadata",
      candidateTemplateIds: candidates.map((candidate) => candidate.id),
      evidenceIds: matchedMetadata.flatMap((entry) => entry.evidenceIds),
      reasons: [
        `正文指纹同时匹配 ${matchedMetadata.length} 条已审核元数据：${matchedMetadata
          .map((entry) => entry.id)
          .join("、")}`,
        "疑似异文或重复登记，需人工裁定后才能输出体裁结论",
      ],
    });
  }

  // 规则 4 起：auto 分支按形制与候选特征判定。
  const approvedMetadata = metadata.filter(
    (entry) => entry.reviewStatus === "approved",
  );
  const autoDecision = decideAuto(poem, candidates, shape);

  if (
    approvedMetadata.length > 0 &&
    autoDecision.applicability === "uncertain"
  ) {
    return {
      ...autoDecision,
      reasons: [
        ...autoDecision.reasons,
        "存在 approved 作品元数据，但正文指纹与本诗不一致，未作为识别依据",
      ],
    };
  }

  return autoDecision;
}
