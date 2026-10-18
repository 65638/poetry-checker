import {
  AnalysisResponseSchema,
  type AnalysisResponse,
  type AnalyzeRequest,
  type Evidence,
  type SourceRecord,
} from "@poetry/contracts";
import { lookupCharacters } from "@poetry/lexicon";
import { parseText, resolveReadings } from "@poetry/readings";
import { matchTemplates, evaluateProsody } from "@poetry/prosody";
import { classifyGenre } from "@poetry/genre";
import { toReadingsErrorResponse } from "./readings-errors.js";
import { toGenreErrorResponse } from "./genre-errors.js";
import { toLexiconErrorResponse } from "./lexicon-errors.js";
import type { Resources } from "./resources.js";

export type OrchestrationResult =
  | { kind: "ok"; response: AnalysisResponse }
  | { kind: "error"; status: number; body: { error: { code: string; message: string; fieldErrors: Array<{ path: string; message: string }> } } };

function mapModuleError(error: unknown): OrchestrationResult | null {
  const mapped =
    toReadingsErrorResponse(error) ??
    toGenreErrorResponse(error) ??
    toLexiconErrorResponse(error);
  return mapped === null ? null : { kind: "error", status: mapped.status, body: mapped.body };
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
export async function analyze(request: AnalyzeRequest, resources: Resources): Promise<OrchestrationResult> {
  const dataVersion = resources.lexiconVersions[request.rhymeBook];
  if (dataVersion === undefined) {
    return dataNotReady([
      `韵书 ${request.rhymeBook} 无已装载版本`,
      ...resources.notReadyReasons,
    ]);
  }

  try {
    // 1. 解析
    const parsed = parseText({ text: request.text });
    if (parsed.inputHash !== request.inputHash && request.inputHash !== undefined) {
      return {
        kind: "error",
        status: 422,
        body: { error: { code: "STALE_READING_OVERRIDE", message: "inputHash 与当前原文不一致", fieldErrors: [] } },
      };
    }

    // 2. 查字（真实 lexicon）
    const characters = [...new Set(parsed.tokens.map((t) => t.text))];
    const lookup = await lookupCharacters({
      characters,
      rhymeBook: request.rhymeBook,
      dataVersion,
    });

    // 3. 证据装配：A 的 lookup 证据与 B 的语境证据按 ID 去重合并后传入
    const mergedEvidence = dedupeById<Evidence>(lookup.evidence, []);
    const mergedSources = dedupeById<SourceRecord>(lookup.sources, []);
    const annotated = resolveReadings({
      poem: parsed,
      lookup: { ...lookup, evidence: mergedEvidence, sources: mergedSources },
      overrides: request.readingOverrides,
      contextRules: resources.contextRules,
    });

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

    // 6. 完整格律判定
    const prosody = evaluateProsody({
      poem: annotated,
      candidates,
      selectedTemplateId: genre.selectedTemplateId,
      applicability: genre.applicability,
      ruleSet: request.ruleSet,
    });

    // 7. 汇总（summary 按冻结契约由检查结果推导）
    const response: AnalysisResponse = {
      schemaVersion: "1.0",
      inputHash: parsed.inputHash,
      versions: {
        data: dataVersion,
        rules: "teaching-v1",
        context: "none-loaded",
        works: "none-loaded",
      },
      policy: {
        rhymeBook: request.rhymeBook,
        toneBasis: request.rhymeBook === "xinyun" ? "mandarin_base" : "historical",
        notice:
          resources.unverifiedVersions.includes(dataVersion)
            ? "当前装载的是未审核样本快照，仅供开发联调，不作为发布结论。"
            : "",
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
    };
    const checked = AnalysisResponseSchema.safeParse(response);
    if (!checked.success) {
      return {
        kind: "error",
        status: 500,
        body: { error: { code: "INTERNAL_ERROR", message: "出站响应未通过 AnalysisResponse 校验", fieldErrors: [] } },
      };
    }
    return { kind: "ok", response: checked.data };
  } catch (error) {
    const mapped = mapModuleError(error);
    if (mapped !== null) return mapped as OrchestrationResult;
    return {
      kind: "error",
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "分析过程中发生未预期错误", fieldErrors: [] } },
    };
  }
}

function dedupeById<T extends { id: string }>(a: readonly T[], b: readonly T[]): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const prev = map.get(item.id);
    if (prev !== undefined && JSON.stringify(prev) !== JSON.stringify(item)) {
      throw new Error(`资源冲突：ID ${item.id} 在不同来源中内容不一致`);
    }
    map.set(item.id, item);
  }
  return [...map.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

function deriveSummary(
  prosody: AnalysisResponse["prosody"],
  genre: AnalysisResponse["genre"],
  parseQuality: "ok" | "needs_review",
): AnalysisResponse["summary"] {
  if (genre.applicability === "unsupported") {
    return { status: "unsupported", message: "当前版本尚不支持此形式或关键规则。" };
  }
  if (genre.applicability === "not_applicable") {
    return { status: "not_applicable", message: "该作品不适用近体规则；逐字音韵信息仍可查看。" };
  }
  const hardFail = prosody.checks.some((c) => c.status === "fail" && c.severity === "error" && c.resolvedBy === null);
  if (hardFail) {
    return { status: "fail", message: "存在明确违规项，详见诊断。" };
  }
  const uncertain = prosody.checks.some((c) => c.status === "uncertain") ||
    parseQuality === "needs_review" || prosody.selectedTemplateId === null;
  if (uncertain) {
    return { status: "needs_review", message: "部分读音、模板或依据未定，结论待复核。" };
  }
  return { status: "pass", message: "已实现规则内必检项通过。" };
}
