import {
  AnalysisResponseSchema,
  type AnalysisResponse,
  type AnalyzeRequest,
  type Evidence,
  type SourceRecord,
  type ReadingSuggestion,
} from "@poetry/contracts";
import { lookupCharacters } from "@poetry/lexicon";
import { parseText, resolveReadings } from "@poetry/readings";
import {
  matchTemplates,
  evaluateProsody,
  applyReviewedWorkExceptions,
} from "@poetry/prosody";
import { classifyGenre, fingerprintText } from "@poetry/genre";
import { toReadingsErrorResponse } from "./readings-errors.js";
import { toGenreErrorResponse } from "./genre-errors.js";
import { toLexiconErrorResponse } from "./lexicon-errors.js";
import type { Resources } from "./resources.js";
import type { ReadingAssistantService } from "./reading-assistant.js";

export type OrchestrationResult =
  | { kind: "ok"; response: AnalysisResponse }
  | {
      kind: "error";
      status: number;
      body: {
        error: {
          code: string;
          message: string;
          fieldErrors: Array<{ path: string; message: string }>;
        };
      };
    };

function mapModuleError(error: unknown): OrchestrationResult | null {
  const mapped =
    toReadingsErrorResponse(error) ??
    toGenreErrorResponse(error) ??
    toLexiconErrorResponse(error);
  return mapped === null
    ? null
    : { kind: "error", status: mapped.status, body: mapped.body };
}

function dataNotReady(reasons: string[]): OrchestrationResult {
  return {
    kind: "error",
    status: 503,
    body: {
      error: {
        code: "DATA_NOT_READY",
        message: `真实资源未就绪：${reasons.join("；")}`,
        fieldErrors: [],
      },
    },
  };
}

/** 按固定顺序编排真实分析；任何模块错误经约定映射，未知错误 500 不泄栈。 */
export async function analyze(
  request: AnalyzeRequest,
  resources: Resources,
  options: {
    readingAssistant?: ReadingAssistantService;
    signal?: AbortSignal;
  } = {},
): Promise<OrchestrationResult> {
  if (resources.loadErrors.length > 0)
    return dataNotReady(resources.loadErrors);
  const dataVersion = resources.snapshots[request.rhymeBook]?.dataVersion;
  if (dataVersion === undefined) {
    return dataNotReady([
      `韵书 ${request.rhymeBook} 无已装载版本`,
      ...resources.notReadyReasons,
    ]);
  }

  try {
    // 1. 解析
    const parsed = parseText({ text: request.text });
    if (
      parsed.inputHash !== request.inputHash &&
      request.inputHash !== undefined
    ) {
      return {
        kind: "error",
        status: 422,
        body: {
          error: {
            code: "STALE_READING_OVERRIDE",
            message: "inputHash 与当前原文不一致",
            fieldErrors: [],
          },
        },
      };
    }

    // 2. 查字（真实 lexicon）
    const characters = [...new Set(parsed.tokens.map((t) => t.text))];
    const lookup = await lookupCharacters({
      characters,
      rhymeBook: request.rhymeBook,
      dataVersion,
    });

    // 3. 证据装配：A 的 lookup 证据与注册表按 ID 去重合并后传入。
    // 同 ID 不同内容=资源冲突（冻结契约）：按数据未就绪 503 报告，不静默择一、不算服务端内部错。
    let mergedEvidence: Evidence[];
    let mergedSources: SourceRecord[];
    try {
      mergedEvidence = dedupeById<Evidence>(
        lookup.evidence,
        resources.evidenceRegistry,
      );
      mergedSources = dedupeById<SourceRecord>(
        lookup.sources,
        resources.sourceRegistry,
      );
    } catch (conflict) {
      return {
        kind: "error",
        status: 503,
        body: {
          error: {
            code: "DATA_NOT_READY",
            message: `资源冲突（数据侧缺陷，待 A 修复）：${(conflict as Error).message}`,
            fieldErrors: [],
          },
        },
      };
    }
    const readingInput = {
      poem: parsed,
      lookup: { ...lookup, evidence: mergedEvidence, sources: mergedSources },
      overrides: request.readingOverrides,
      contextRules: resources.contextRules,
      evidencePolicy: "advisory" as const,
    };
    let annotated = resolveReadings(readingInput);
    let assistant: AnalysisResponse["readingAssistant"];
    const service = options.readingAssistant;
    if (service) {
      const targets = annotated.tokens.filter(
        (token) =>
          token.candidates.length > 1 && token.selectionMethod !== "user",
      );
      const suggestions: ReadingSuggestion[] = [];
      let processed = 0;
      let failure: string | undefined;
      if (service.configured && targets.length) {
        const deadline = AbortSignal.timeout(service.analysisTimeoutMs);
        const signal = options.signal
          ? AbortSignal.any([options.signal, deadline])
          : deadline;
        for (let offset = 0; offset < targets.length; offset += 24) {
          try {
            signal.throwIfAborted();
            const result = await service.suggest(
              {
                text: request.text,
                rhymeBook: request.rhymeBook,
                targetTokenIds: targets
                  .slice(offset, offset + 24)
                  .map((token) => token.tokenId),
              },
              signal,
            );
            suggestions.push(...result.suggestions);
            processed += result.suggestions.length;
          } catch {
            failure =
              "GLM暂不可用或等候超时，其余字位已使用韵书与语境规则分析。";
            break;
          }
        }
      }
      if (suggestions.length)
        annotated = resolveReadings({
          ...readingInput,
          modelReadings: suggestions,
        });
      const appliedTokenIds = annotated.tokens
        .filter((token) => token.selectionMethod === "model")
        .map((token) => token.tokenId);
      const state = !targets.length
        ? "not_needed"
        : !service.configured || processed === 0
          ? "unavailable"
          : appliedTokenIds.length === targets.length
            ? "applied"
            : "partial";
      assistant = {
        provider: "zhipu",
        model: service.model,
        state,
        appliedTokenIds,
        message: !targets.length
          ? "当前读音无需进一步辨析。"
          : !service.configured
            ? "GLM尚未配置，已使用本地韵书与语境规则分析。"
            : (failure ??
              (state === "applied"
                ? `GLM已自动辨析并应用${appliedTokenIds.length}个字位。`
                : `GLM已自动应用${appliedTokenIds.length}个字位，其余保留原候选与语境判断。`)),
      };
    }

    // 4/5. 模板与体裁（API 调度，不建环依赖）
    const candidates = matchTemplates({
      poem: annotated,
      formHint: request.formHint,
      ruleSet: request.ruleSet,
    });
    const genre = classifyGenre({
      poem: annotated,
      candidates,
      metadata: resources.works,
      genreHint: request.genreHint,
      formHint: request.formHint,
    });

    // 6. 完整格律判定 + 已审作品特例适用（D3 批次一：核心报告不变，
    //    已审精确范围在 summary 前转换；其他偏离保持原判）
    const coreReport = evaluateProsody({
      poem: annotated,
      candidates,
      selectedTemplateId: genre.selectedTemplateId,
      applicability: genre.applicability,
      ruleSet: request.ruleSet,
    });
    const prosody = applyReviewedWorkExceptions({
      poem: annotated,
      textFingerprint: fingerprintText(annotated.originalText),
      genre,
      report: coreReport,
      works: resources.works,
      exceptions: resources.reviewedWorkExceptions,
      evidence: mergedEvidence,
      sources: mergedSources,
    });

    // 7. 汇总（summary 按冻结契约由检查结果推导）
    const response: AnalysisResponse = {
      schemaVersion: "1.0",
      inputHash: parsed.inputHash,
      versions: {
        data: dataVersion,
        rules: "teaching-v1+reviewed-works-v1",
        context:
          resources.contextRules.length > 0
            ? `context-rules:${resources.contextRules.length}`
            : "none-loaded",
        works:
          resources.works.length > 0
            ? `works:${resources.works.length}`
            : "none-loaded",
      },
      policy: {
        rhymeBook: request.rhymeBook,
        toneBasis:
          request.rhymeBook === "xinyun" ? "mandarin_base" : "historical",
        notice:
          "参考分析：韵书数据与AI读音可能有误，未经全面人工核验；不作为权威结论。",
      },
      poem: annotated,
      genre,
      prosody,
      provenance: {
        groups: lookup.groups,
        sources: mergedSources,
        evidence: mergedEvidence,
        rules: resources.ruleCards,
      },
      summary: deriveSummary(prosody, genre, parsed.quality),
      ...(assistant ? { readingAssistant: assistant } : {}),
    };
    const checked = AnalysisResponseSchema.safeParse(response);
    if (!checked.success) {
      return {
        kind: "error",
        status: 500,
        body: {
          error: {
            code: "INTERNAL_ERROR",
            message: "出站响应未通过 AnalysisResponse 校验",
            fieldErrors: [],
          },
        },
      };
    }
    return { kind: "ok", response: checked.data };
  } catch (error) {
    const mapped = mapModuleError(error);
    if (mapped !== null) return mapped as OrchestrationResult;
    return {
      kind: "error",
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "分析过程中发生未预期错误",
          fieldErrors: [],
        },
      },
    };
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function dedupeById<T extends { id: string }>(
  a: readonly T[],
  b: readonly T[],
): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const prev = map.get(item.id);
    if (prev !== undefined && stableStringify(prev) !== stableStringify(item)) {
      throw new Error(`资源冲突：ID ${item.id} 在不同来源中内容不一致`);
    }
    map.set(item.id, item);
  }
  return [...map.values()].sort((x, y) =>
    x.id < y.id ? -1 : x.id > y.id ? 1 : 0,
  );
}

function deriveSummary(
  prosody: AnalysisResponse["prosody"],
  genre: AnalysisResponse["genre"],
  parseQuality: "ok" | "needs_review",
): AnalysisResponse["summary"] {
  if (genre.applicability === "unsupported") {
    return {
      status: "unsupported",
      message: "当前版本尚不支持此形式或关键规则。",
    };
  }
  if (genre.applicability === "not_applicable") {
    return {
      status: "not_applicable",
      message: "该作品不适用近体规则；逐字音韵信息仍可查看。",
    };
  }
  const hardFail = prosody.checks.some(
    (c) =>
      c.status === "fail" && c.severity === "error" && c.resolvedBy === null,
  );
  if (hardFail) {
    return { status: "fail", message: "存在明确违规项，详见诊断。" };
  }
  const uncertain =
    prosody.checks.some((c) => c.status === "uncertain") ||
    parseQuality === "needs_review" ||
    prosody.selectedTemplateId === null;
  if (uncertain) {
    return {
      status: "needs_review",
      message: "部分读音、模板或依据未定，结论待复核。",
    };
  }
  return { status: "pass", message: "已实现规则内必检项通过。" };
}
