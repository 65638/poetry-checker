import type {
  AnalysisResponse,
  AnalyzeRequest,
  ReadingOverride,
} from "@poetry/contracts";
import type { InputDraft } from "../view-contract";
import {
  analyze as runAnalyze,
  type AnalyzeOutcome,
  type Transport,
} from "../api/analyze";
import { ApiError } from "../api/errors";
import {
  buildReportJson,
  buildSummaryText,
  reportFileName,
} from "../features/export";
import {
  codePointLength,
  normalizeDraft,
  sameInput,
  validateDraft,
} from "./examples";

/**
 * 业务状态。
 *
 * 一致性模型（修复「选音提交与报告快照不一致」）：
 * - `report` / `requestSnapshot` / `overrides` 是**同一次成功计算**的原子结果；
 * - `overrides` 永远等于 `requestSnapshot.readingOverrides`，不允许单独改；
 * - `pendingOverrides` 是「下一次要提交的选音」，与已成功报告无关；
 * - `stale` 只由一个来源派生：当前草稿 vs 报告快照（`deriveStale`），
 *   任何代码都不能手写 `stale`。
 */
export interface CheckerState {
  draft: InputDraft;
  report: AnalysisResponse | null;
  /** 产生当前报告的请求快照；null 表示尚无报告。 */
  requestSnapshot: AnalyzeRequest | null;
  snapshotDraft: InputDraft | null;
  busy: boolean;
  error: { code: string; message: string } | null;
  feedback: string | null;
  selectedTokenId: string | null;
  selectedFindingId: string | null;
  /** 已成功报告对应的选音覆盖（= requestSnapshot.readingOverrides）。 */
  overrides: ReadingOverride[];
  /** 待提交的选音覆盖；仅表达用户意图，不参与导出。 */
  pendingOverrides: ReadingOverride[];
  /** 由 deriveStale 派生，不可手动设置。 */
  stale: boolean;
}

export interface StoreOptions {
  transport: Transport;
  /** 复制实现可注入，便于在无 DOM 环境测试。 */
  writeText?: (text: string) => Promise<void>;
  /** 下载实现可注入，便于在无 DOM 环境测试。 */
  download?: (filename: string, json: string) => void;
  createAbortController?: () => AbortController;
  /**
   * 单次分析的客户端超时（毫秒），默认 {@link DEFAULT_REQUEST_TIMEOUT_MS}。
   *
   * 服务端偶发不返回时，没有超时会让 `busy` 永久为真、按钮一直「分析中…」，
   * 用户既不能重试也拿不到解释。超时按可重试的失败处理，与用户主动取消区分。
   * 传 0 或负数表示不设超时（仅供需要挂起语义的测试使用）。
   */
  requestTimeoutMs?: number;
}

/** 默认 30 秒：足够慢网络下的真实编排，又不至于让用户干等。 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function initialState(draft: InputDraft): CheckerState {
  return {
    draft,
    report: null,
    requestSnapshot: null,
    snapshotDraft: null,
    busy: false,
    error: null,
    feedback: null,
    selectedTokenId: null,
    selectedFindingId: null,
    overrides: [],
    pendingOverrides: [],
    stale: false,
  };
}

/** 唯一的 stale 来源：报告是否仍对应当前草稿。 */
function deriveStale(state: {
  report: AnalysisResponse | null;
  draft: InputDraft;
  snapshotDraft: InputDraft | null;
}): boolean {
  return state.report !== null && !sameInput(state.draft, state.snapshotDraft);
}

/** 会改变分析身份的参数；任一变化都要让在途请求失效。 */
function draftIdentityChanged(previous: InputDraft, next: InputDraft): boolean {
  return (
    previous.text !== next.text ||
    previous.rhymeBook !== next.rhymeBook ||
    previous.genreHint !== next.genreHint ||
    previous.formHint !== next.formHint
  );
}

/**
 * 业务状态协调器：持有 draft/report/busy/stale/error/feedback/选择状态，
 * 负责请求身份守卫、迟到响应丢弃、选音归属校验与导出快照。
 * 纯 TypeScript，不导入 React，也不重判格律。
 */
export class CheckerStore {
  private state: CheckerState;
  private readonly listeners = new Set<() => void>();
  private readonly options: StoreOptions;
  /** 请求身份：每次新请求或被编辑失效时递增。 */
  private runId = 0;
  private activeController: AbortController | null = null;

  constructor(draft: InputDraft, options: StoreOptions) {
    this.state = initialState(draft);
    this.options = options;
  }

  getState = (): CheckerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 提交状态变更；stale 永远由 deriveStale 重算。 */
  private commit(patch: Partial<CheckerState>): void {
    const next: CheckerState = { ...this.state, ...patch };
    next.stale = deriveStale(next);
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /** 让在途请求失效：递增身份并中止，旧响应的成功/失败/收尾都不得写状态。 */
  private invalidateInFlight(): void {
    this.runId += 1;
    this.activeController?.abort();
    this.activeController = null;
    if (this.state.busy) {
      this.commit({ busy: false });
    }
  }

  /**
   * 草稿变化：只表达意图，互斥与失效由这里统一处理。
   * 会改变分析身份的编辑必须让在途请求失效（修复「编辑不重提交也要失效」）。
   */
  setDraft(next: InputDraft): void {
    const normalized = normalizeDraft(next);
    const previous = this.state.draft;
    if (draftIdentityChanged(previous, normalized)) {
      this.invalidateInFlight();
    }

    const textOrBookChanged =
      previous.text !== normalized.text ||
      previous.rhymeBook !== normalized.rhymeBook;

    const patch: Partial<CheckerState> = {
      draft: normalized,
      error: null,
      feedback: null,
    };

    if (textOrBookChanged) {
      // 覆盖只对某段原文有效，正文/韵书一变即整体作废。
      patch.overrides = [];
      patch.pendingOverrides = [];
      patch.selectedTokenId = null;
      patch.selectedFindingId = null;
    } else if (
      previous.genreHint !== normalized.genreHint ||
      previous.formHint !== normalized.formHint
    ) {
      patch.selectedFindingId = null;
    }
    this.commit(patch);
  }

  loadExample(exampleId: string, text: string, current: InputDraft): void {
    if (text.trim().length === 0) {
      this.commit({
        feedback: `示例 ${exampleId} 的正文尚未通过来源与版本核对，暂不载入。`,
      });
      return;
    }
    this.setDraft({ ...current, text });
  }

  /** 普通提交：沿用已成功报告的选音覆盖。 */
  async analyze(): Promise<void> {
    await this.runAnalysis(this.state.overrides);
  }

  /**
   * 执行一次分析。`overrides` 是本次请求要携带的覆盖；
   * 成功时才把 report/requestSnapshot/overrides 作为一组原子提交。
   */
  private async runAnalysis(overrides: ReadingOverride[]): Promise<void> {
    const invalid = validateDraft(this.state.draft);
    if (invalid !== null) {
      this.commit({
        error: { code: "INVALID_DRAFT", message: invalid },
        pendingOverrides: this.state.overrides,
      });
      return;
    }

    this.activeController?.abort();
    const controller =
      this.options.createAbortController?.() ?? new AbortController();
    this.activeController = controller;
    const runId = ++this.runId;
    const draftAtRequest: InputDraft = { ...this.state.draft };
    const requestOverrides = overrides.map((item) => ({ ...item }));

    this.commit({
      busy: true,
      error: null,
      feedback: null,
      pendingOverrides: requestOverrides,
    });

    // 客户端超时：到点主动 abort，并把「因超时中止」与「用户取消」区分开。
    const timeoutMs =
      this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : null;

    let outcome: AnalyzeOutcome;
    try {
      outcome = await runAnalyze(
        draftAtRequest,
        this.options.transport,
        requestOverrides,
        controller.signal,
      );
    } catch (cause) {
      outcome = {
        ok: false,
        error: new ApiError("CONTRACT_ERROR", "请求执行异常", { cause }),
      };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }

    // 身份守卫：被新请求或编辑失效后，旧响应的任何结果都不得写状态。
    if (runId !== this.runId) return;

    if (outcome.ok) {
      // 原子提交：报告、请求快照、已生效覆盖都来自这一次成功计算。
      this.commit({
        busy: false,
        report: outcome.report,
        requestSnapshot: outcome.request,
        snapshotDraft: draftAtRequest,
        overrides: requestOverrides,
        pendingOverrides: requestOverrides,
        error: null,
        feedback: null,
        selectedTokenId: null,
        selectedFindingId: null,
      });
      return;
    }

    const error = outcome.error;
    if (error.code === "ABORTED") {
      // 超时与主动取消都走 ABORTED，但对用户的意义不同：
      // 超时要说明"没等到结果、可以重试"，取消则不需要报错。
      if (timedOut) {
        this.commit({
          busy: false,
          error: {
            code: "TIMEOUT",
            message: `分析超时：服务在 ${Math.round(timeoutMs / 1000)} 秒内没有返回结果，请重试。输入内容已保留，未展示任何旧报告结论。`,
          },
          pendingOverrides: this.state.overrides,
        });
        return;
      }
      this.commit({ busy: false, pendingOverrides: this.state.overrides });
      return;
    }
    // 失败：保留正文与已成功报告；待提交覆盖退回已生效覆盖，避免两套真相。
    this.commit({
      busy: false,
      error: { code: error.code, message: error.userMessage },
      pendingOverrides: this.state.overrides,
    });
  }

  /**
   * 选择当前候选读音。只接受当前报告中存在、且候选 ID 有效的覆盖；
   * 携带该报告的 inputHash 重新请求，不直接改写原报告候选/证据。
   * 失败时保留旧快照供查看，复制/导出须等重试成功后恢复。
   */
  async chooseReading(override: ReadingOverride): Promise<void> {
    const { report, busy, stale } = this.state;
    if (report === null) {
      this.commit({ feedback: "尚无报告，无法选择读音。" });
      return;
    }
    if (stale) {
      this.commit({
        feedback: "当前报告已不对应当前输入，请重新分析后再选音。",
      });
      return;
    }
    if (busy) {
      this.commit({ feedback: "正在分析，请等待本次请求完成后再选音。" });
      return;
    }
    const token = report.poem.tokens.find(
      (item) => item.tokenId === override.tokenId,
    );
    if (token === undefined) {
      this.commit({
        feedback: `字位 ${override.tokenId} 不属于当前报告，未发送请求。`,
      });
      return;
    }
    const candidate = token.candidates.find(
      (item) => item.id === override.readingId,
    );
    if (candidate === undefined) {
      this.commit({
        feedback: `候选 ${override.readingId} 不属于字位 ${override.tokenId}，未发送请求。`,
      });
      return;
    }

    // 同位置只保留最新一条；其它字位沿用已生效覆盖。
    const nextOverrides: ReadingOverride[] = [
      ...this.state.overrides.filter(
        (item) => item.tokenId !== override.tokenId,
      ),
      { tokenId: override.tokenId, readingId: override.readingId },
    ];
    await this.runAnalysis(nextOverrides);
  }

  selectToken(tokenId: string | null): void {
    const { report } = this.state;
    if (tokenId !== null && report !== null) {
      const exists = report.poem.tokens.some(
        (token) => token.tokenId === tokenId,
      );
      if (!exists) {
        this.commit({ feedback: `字位 ${tokenId} 不在当前报告中。` });
        return;
      }
    }
    this.commit({ selectedTokenId: tokenId });
  }

  selectFinding(findingId: string | null): void {
    const { report } = this.state;
    if (findingId !== null && report !== null) {
      const exists = report.prosody.checks.some(
        (check) => check.id === findingId,
      );
      if (!exists) {
        this.commit({ feedback: `诊断 ${findingId} 不在当前报告中。` });
        return;
      }
    }
    this.commit({ selectedFindingId: findingId });
  }

  closeEvidence(): void {
    this.commit({ selectedTokenId: null });
  }

  /**
   * 导出只能用「同一次成功计算」的快照：
   * 请求进行中说明存在待提交覆盖，此时拒绝导出，避免拼出新旧混合的结果。
   */
  private exportState() {
    const { report, requestSnapshot, overrides, busy, error } = this.state;
    if (report === null || requestSnapshot === null) {
      return { ok: false as const, reason: "尚无报告可导出。" };
    }
    if (busy) {
      return {
        ok: false as const,
        reason: "正在重新分析，请等待本次请求完成后再导出，避免新旧结果混用。",
      };
    }
    if (error !== null) {
      return {
        ok: false as const,
        reason: "本次分析未完成，已阻止复制和导出旧报告；请重试成功后再操作。",
      };
    }
    return {
      ok: true as const,
      state: { report, request: requestSnapshot, overrides },
    };
  }

  async copySummary(): Promise<void> {
    if (this.state.stale) {
      this.commit({ feedback: "当前报告已不对应当前输入，已阻止复制。" });
      return;
    }
    const exported = this.exportState();
    if (!exported.ok) {
      this.commit({ feedback: exported.reason });
      return;
    }
    const text = buildSummaryText(exported.state);
    try {
      if (this.options.writeText) {
        await this.options.writeText(text);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("当前环境不支持剪贴板");
      }
      this.commit({ feedback: "摘要已复制到剪贴板。" });
    } catch {
      this.commit({ feedback: "复制失败，请检查剪贴板权限。" });
    }
  }

  downloadReport(): void {
    if (this.state.stale) {
      this.commit({ feedback: "当前报告已不对应当前输入，已阻止导出。" });
      return;
    }
    const exported = this.exportState();
    if (!exported.ok) {
      this.commit({ feedback: exported.reason });
      return;
    }
    const json = JSON.stringify(buildReportJson(exported.state), null, 2);
    const filename = reportFileName(exported.state.report);
    try {
      if (this.options.download) {
        this.options.download(filename, json);
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      this.commit({ feedback: `已导出 ${filename}。` });
    } catch {
      this.commit({ feedback: "导出失败，请重试。" });
    }
  }

  /** 中止进行中的请求（卸载或新建请求时）。 */
  abort(): void {
    this.activeController?.abort();
  }

  /**
   * 用一个「已完成的计算结果」替换当前状态（不经 HTTP）。
   *
   * 这是通用装配入口，不含任何合成数据或开发文案；开发预览、
   * 离线回放、未来的本地历史都可以复用它。调用方必须保证
   * `request` 与 `report` 同源（典型来源是同一次成功响应）。
   */
  applySnapshot(input: {
    draft: InputDraft;
    report: AnalysisResponse;
    request: AnalyzeRequest;
    feedback?: string | null;
  }): void {
    this.invalidateInFlight();
    this.commit({
      draft: input.draft,
      report: input.report,
      requestSnapshot: input.request,
      snapshotDraft: input.draft,
      busy: false,
      error: null,
      feedback: input.feedback ?? null,
      selectedTokenId: null,
      selectedFindingId: null,
      overrides: [],
      pendingOverrides: [],
    });
  }

  /** 仅测试用：暴露请求身份以便断言旧响应被丢弃。 */
  get currentRunId(): number {
    return this.runId;
  }

  /** 仅测试用：当前正文码点数（与展示层同一口径）。 */
  get draftCodePoints(): number {
    return codePointLength(this.state.draft.text);
  }
}
