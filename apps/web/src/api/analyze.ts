import {
  AnalysisResponseSchema,
  AnalyzeRequestSchema,
  type AnalysisResponse,
  type AnalyzeRequest,
  type AnnotatedPoem,
} from "@poetry/contracts";
import { ApiError } from "./errors";
import { readAnalysisStream } from "./analysisStream";
import { sha256Hex, toAnalyzeRequest } from "../utils/sha256";
import type { InputDraft } from "../view-contract";

/** 可注入的传输层：测试用手动控制 Promise 顺序的假实现。 */
export interface Transport {
  post(path: string, body: unknown, signal?: AbortSignal): Promise<Response>;
}

export type AnalyzeOutcome =
  | {
      ok: true;
      report: AnalysisResponse;
      request: AnalyzeRequest;
      serverSession?: string;
    }
  | { ok: false; error: ApiError };

export interface AnalyzeClientOptions {
  /** 默认走 Vite 代理的同源 /api 前缀。 */
  baseUrl?: string;
}

export interface BuiltRequest {
  request: AnalyzeRequest;
  /** 客户端重算的原文摘要，用于和响应交叉核对。 */
  expectedInputHash: string;
}

/**
 * 由草稿合成请求。人工选音时必须带 inputHash，且覆盖只保留当前字位最新一条。
 */
export function buildAnalyzeRequest(
  draft: InputDraft,
  overrides: Array<{ tokenId: string; readingId: string }> = [],
): BuiltRequest {
  const expectedInputHash = sha256Hex(draft.text);
  const request = toAnalyzeRequest(draft, expectedInputHash);
  request.readingOverrides = overrides.map((item) => ({
    tokenId: item.tokenId,
    readingId: item.readingId,
  }));
  const parsed = AnalyzeRequestSchema.safeParse(request);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ApiError("CONTRACT_ERROR", `请求不符合公共契约：${detail}`);
  }
  return { request: parsed.data, expectedInputHash };
}

/** 把 HTTP 状态映射成稳定错误码。 */
function statusToCode(status: number): ApiError["code"] {
  if (status === 422) return "HTTP_422";
  if (status === 413) return "HTTP_413";
  if (status === 503) return "HTTP_503";
  if (status === 404) return "HTTP_404";
  if (status >= 500) return "HTTP_500";
  return "CONTRACT_ERROR";
}

/**
 * 语义核对：公共 Schema 已保证结构合法（含「originalText 切片 == token.text」），
 * 这里补 Schema 不覆盖的**行级自洽**——行文本必须等于其字位文本的拼接，
 * 且行内字位数必须按 **Unicode 码点** 计。
 *
 * 两套坐标必须分开：
 * - `startUtf16` / `endUtf16` 是 **UTF-16 码元** 下标，用于切 `originalText`；
 * - 字位数按 **Unicode 码点** 计，因此 `𠀀`（1 码点、2 码元）只能算一个字位。
 * 误用 `String.length` 会把补充平面汉字算成两个，导致合法报告被误拒。
 */
export function findInternalMismatch(report: {
  poem: {
    originalText: string;
    lines: Array<{ line: number; text: string; tokenIds: string[] }>;
    tokens: Array<{
      tokenId: string;
      text: string;
      startUtf16: number;
      endUtf16: number;
    }>;
  };
}): string | null {
  const byTokenId = new Map(
    report.poem.tokens.map((token) => [token.tokenId, token]),
  );
  for (const token of report.poem.tokens) {
    // 单个字位必须恰好是一个 Unicode 码点（不能是半个代理对，也不能是多字）。
    if ([...token.text].length !== 1) {
      return `字位 ${token.tokenId} 的文本不是单个 Unicode 码点`;
    }
  }
  for (const line of report.poem.lines) {
    const expected = line.tokenIds
      .map((tokenId) => byTokenId.get(tokenId)?.text ?? "")
      .join("");
    if (expected !== line.text) {
      return `第 ${line.line} 行的文本与字位组成不符`;
    }
    // 按码点计数，而非 UTF-16 码元数。
    if ([...line.text].length !== line.tokenIds.length) {
      return `第 ${line.line} 行的字符数与字位数不符`;
    }
  }
  return null;
}

/**
 * 发送分析请求并做三层核对：
 * 1. HTTP 状态与错误体；
 * 2. 出站响应必须通过 AnalysisResponseSchema；
 * 3. 报告必须对应本次提交（inputHash、原文、韵书），否则给可识别的适配错误。
 */
export async function analyze(
  draft: InputDraft,
  transport: Transport,
  overrides: Array<{ tokenId: string; readingId: string }> = [],
  signal?: AbortSignal,
  onReadings?: (poem: AnnotatedPoem) => void,
): Promise<AnalyzeOutcome> {
  let built: BuiltRequest;
  try {
    built = buildAnalyzeRequest(draft, overrides);
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof ApiError
          ? cause
          : new ApiError("CONTRACT_ERROR", "请求构造失败", { cause }),
    };
  }

  let response: Response;
  try {
    response = await transport.post("/api/v1/analyze", built.request, signal);
  } catch (cause) {
    if (signal?.aborted) {
      return {
        ok: false,
        error: new ApiError("ABORTED", "请求已取消", { cause }),
      };
    }
    return {
      ok: false,
      error: new ApiError("NETWORK_ERROR", "无法连接分析服务", { cause }),
    };
  }

  const serverSession = response.headers.get("X-Poetry-Analysis-Session");
  if (
    response.ok &&
    response.headers.get("content-type")?.split(";")[0]?.trim() ===
      "application/x-ndjson"
  ) {
    try {
      response = await readAnalysisStream(
        response,
        (poem) => {
          if (
            poem.inputHash !== built.expectedInputHash ||
            poem.originalText !== draft.text ||
            poem.book !== draft.rhymeBook ||
            findInternalMismatch({ poem }) !== null ||
            poem.tokens.some(
              (token) =>
                poem.originalText.slice(token.startUtf16, token.endUtf16) !==
                token.text,
            )
          ) {
            throw new ApiError(
              "RESPONSE_INPUT_MISMATCH",
              "初步读音与本次提交不一致，已停止展示。",
            );
          }
          if (!signal?.aborted) onReadings?.(poem);
        },
        signal,
      );
    } catch (cause) {
      return {
        ok: false,
        error: signal?.aborted
          ? new ApiError("ABORTED", "请求已取消", { cause })
          : cause instanceof ApiError
            ? cause
            : new ApiError(
                "BAD_JSON",
                "分析结果传输中断，请重试。原文已保留。",
                { cause },
              ),
      };
    }
  }
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const contractError =
      typeof body === "object" && body !== null
        ? (
            body as {
              error?: {
                code?: unknown;
                message?: unknown;
                fieldErrors?: unknown;
              };
            }
          ).error
        : undefined;
    const message =
      typeof contractError?.message === "string"
        ? contractError.message
        : `HTTP ${response.status}`;
    const fieldErrors = Array.isArray(contractError?.fieldErrors)
      ? contractError.fieldErrors.flatMap((item) => {
          if (
            typeof item === "object" &&
            item !== null &&
            typeof (item as { path?: unknown }).path === "string" &&
            typeof (item as { message?: unknown }).message === "string"
          ) {
            return [
              {
                path: (item as { path: string }).path,
                message: (item as { message: string }).message,
              },
            ];
          }
          return [];
        })
      : [];
    return {
      ok: false,
      error: new ApiError(statusToCode(response.status), message, {
        status: response.status,
        fieldErrors,
      }),
    };
  }

  if (body === undefined) {
    return { ok: false, error: new ApiError("BAD_JSON", "响应不是合法 JSON") };
  }

  const outcome = validateAnalysisResult(body, built.request);
  return outcome.ok && serverSession && /^[a-f0-9-]{36}$/u.test(serverSession)
    ? { ...outcome, serverSession }
    : outcome;
}

/** Network and session-restored results use the same content and ownership checks. */
export function validateAnalysisResult(
  body: unknown,
  request: AnalyzeRequest,
): AnalyzeOutcome {
  const draft = {
    text: request.text,
    rhymeBook: request.rhymeBook,
    genreHint: request.genreHint,
    formHint: request.formHint,
  };
  const built = buildAnalyzeRequest(draft, request.readingOverrides);
  if (
    request.inputHash !== undefined &&
    request.inputHash !== built.expectedInputHash
  )
    return {
      ok: false,
      error: new ApiError("RESPONSE_INPUT_MISMATCH", "请求摘要与原文不符"),
    };
  const parsed = AnalysisResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ApiError("BAD_SCHEMA", "响应不符合 AnalysisResponse 契约", {
        cause: parsed.error,
      }),
    };
  }
  const report = parsed.data;

  if (
    report.inputHash !== built.expectedInputHash ||
    report.poem.inputHash !== built.expectedInputHash ||
    report.poem.originalText !== draft.text
  ) {
    return {
      ok: false,
      error: new ApiError(
        "RESPONSE_INPUT_MISMATCH",
        "报告原文/摘要与本次提交不一致，拒绝展示为成功结果",
      ),
    };
  }
  if (
    report.policy.rhymeBook !== draft.rhymeBook ||
    report.poem.book !== draft.rhymeBook
  ) {
    return {
      ok: false,
      error: new ApiError(
        "RESPONSE_BOOK_MISMATCH",
        "报告韵书与本次请求不一致，拒绝展示",
      ),
    };
  }

  const internalMismatch = findInternalMismatch(report);
  if (internalMismatch !== null) {
    return {
      ok: false,
      error: new ApiError("RESPONSE_INPUT_MISMATCH", internalMismatch),
    };
  }

  return { ok: true, report, request: built.request };
}

/** 真实浏览器传输层；开发经 Vite 代理，生产用同源 baseUrl。 */
export function createHttpTransport(
  options: AnalyzeClientOptions = {},
): Transport {
  const baseUrl = options.baseUrl ?? "";
  return {
    async post(path, body, signal) {
      return fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/x-ndjson, application/json",
        },
        body: JSON.stringify(body),
        signal,
      });
    },
  };
}
