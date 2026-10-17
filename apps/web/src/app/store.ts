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
import { normalizeDraft, sameInput, validateDraft } from "./examples";

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
  /** 已提交给服务端的选音覆盖，只对 snapshotDraft 的原文有效。 */
  overrides: ReadingOverride[];
  /** 是否已由内容比对得出「报告已过时」。 */
  stale: boolean;
}

export interface StoreOptions {
  transport: Transport;
  /** 复制实现可注入，便于在无 DOM 环境测试。 */
  writeText?: (text: string) => Promise<void>;
  /** 下载实现可注入，便于在无 DOM 环境测试。 */
  download?: (filename: string, json: string) => void;
  createAbortController?: () => AbortController;
}

let sequence = 0;

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
    stale: false,
  };
}

/**
 * 业务状态协调器：持有 draft/report/busy/stale/error/feedback/选择状态，
 * 负责请求序号守卫、迟到响应丢弃、选音归属校验与导出快照。
 * 纯 TypeScript，不导入 React，也不重判格律。
 */
export class CheckerStore {
  private state: CheckerState;
  private readonly listeners = new Set<() => void>();
  private readonly options: StoreOptions;
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

  private setState(patch: Partial<CheckerState>): void {
    this.state = { ...this.state, ...patch };
    this.recomputeStale();
    for (const listener of this.listeners) listener();
  }

  private recomputeStale(): void {
    const shouldBeStale =
      this.state.report !== null &&
      !sameInput(this.state.draft, this.state.snapshotDraft);
    if (this.state.stale !== shouldBeStale) {
      this.state.stale = shouldBeStale;
    }
  }

  /** 草稿变化：只表达意图，互斥与失效由这里统一处理。 */
  setDraft(next: InputDraft): void {
    const normalized = normalizeDraft(next);
    const previous = this.state.draft;
    const textChanged = previous.text !== normalized.text;
    const bookChanged = previous.rhymeBook !== normalized.rhymeBook;

    const patch: Partial<CheckerState> = {
      draft: normalized,
      error: null,
      feedback: null,
    };

    if (textChanged || bookChanged) {
      patch.overrides = [];
      patch.selectedTokenId = null;
      patch.selectedFindingId = null;
    } else if (
      previous.genreHint !== normalized.genreHint ||
      previous.formHint !== normalized.formHint
    ) {
      patch.selectedFindingId = null;
    }
    this.setState(patch);
  }

  loadExample(exampleId: string, text: string, current: InputDraft): void {
    if (text.trim().length === 0) {
      this.setState({
        feedback: `示例 ${exampleId} 的正文尚未通过来源与版本核对，暂不载入。`,
      });
      return;
    }
    this.setDraft({ ...current, text });
  }

  /** 提交分析。旧请求会先被中止，旧响应由 runId 守卫丢弃。 */
  async analyze(): Promise<void> {
    const invalid = validateDraft(this.state.draft);
    if (invalid !== null) {
      this.setState({ error: { code: "INVALID_DRAFT", message: invalid } });
      return;
    }

    this.activeController?.abort();
    const controller = this.options.createAbortController?.() ?? new AbortController();
    this.activeController = controller;
    const runId = ++this.runId;
    const draftAtRequest: InputDraft = { ...this.state.draft };
    const overrides = [...this.state.overrides];

    this.setState({
      busy: true,
      error: null,
      feedback: null,
    });

    let outcome: AnalyzeOutcome;
    try {
      outcome = await runAnalyze(
        draftAtRequest,
        this.options.transport,
        overrides,
        controller.signal,
      );
    } catch (cause) {
      outcome = {
        ok: false,
        error: new ApiError("CONTRACT_ERROR", "请求执行异常", { cause }),
      };
    }

    // 旧请求的收尾不能污染新请求的 busy/error。
    if (runId !== this.runId) return;

    if (outcome.ok) {
      this.setState({
        busy: false,
        report: outcome.report,
        requestSnapshot: outcome.request,
        snapshotDraft: draftAtRequest,
        overrides,
        error: null,
        feedback: null,
        selectedTokenId: null,
        selectedFindingId: null,
        stale: false,
      });
      return;
    }

    const error = outcome.error;
    if (error.code === "ABORTED") {
      this.setState({ busy: false });
      return;
    }
    // 失败时保留正文与旧报告；旧报告标 stale 并禁用选音/导出。
    this.setState({
      busy: false,
      error: { code: error.code, message: error.userMessage },
    });
  }

  /**
   * 选择当前候选读音。只接受当前报告中存在、且候选 ID 有效的覆盖；
   * 携带该报告的 inputHash 重新请求，不直接改写原报告候选/证据。
   */
  async chooseReading(override: ReadingOverride): Promise<void> {
    const { report, busy, stale } = this.state;
    if (report === null) {
      this.setState({ feedback: "尚无报告，无法选择读音。" });
      return;
    }
    if (stale) {
      this.setState({ feedback: "当前报告已不对应当前输入，请重新分析后再选音。" });
      return;
    }
    if (busy) {
      this.setState({ feedback: "正在分析，请等待本次请求完成后再选音。" });
      return;
    }
    const token = report.poem.tokens.find(
      (item) => item.tokenId === override.tokenId,
    );
    if (token === undefined) {
      this.setState({
        feedback: `字位 ${override.tokenId} 不属于当前报告，未发送请求。`,
      });
      return;
    }
    const candidate = token.candidates.find(
      (item) => item.id === override.readingId,
    );
    if (candidate === undefined) {
      this.setState({
        feedback: `候选 ${override.readingId} 不属于字位 ${override.tokenId}，未发送请求。`,
      });
      return;
    }

    const existing = this.state.overrides.filter(
      (item) => item.tokenId !== override.tokenId,
    );
    const nextOverrides: ReadingOverride[] = [
      ...existing,
      { tokenId: override.tokenId, readingId: override.readingId },
    ];
    this.setState({ overrides: nextOverrides, feedback: null });
    await this.analyzeWithOverrides(nextOverrides);
  }

  private async analyzeWithOverrides(overrides: ReadingOverride[]): Promise<void> {
    this.setState({ overrides, error: null, feedback: null });
    // 复用同一套守卫：先把 overrides 写回状态，再走 analyze()，避免两套并发逻辑。
    await this.analyze();
  }

  selectToken(tokenId: string | null): void {
    const { report } = this.state;
    if (tokenId !== null && report !== null) {
      const exists = report.poem.tokens.some((token) => token.tokenId === tokenId);
      if (!exists) {
        this.setState({ feedback: `字位 ${tokenId} 不在当前报告中。` });
        return;
      }
    }
    this.setState({ selectedTokenId: tokenId });
  }

  selectFinding(findingId: string | null): void {
    const { report } = this.state;
    if (findingId !== null && report !== null) {
      const exists = report.prosody.checks.some(
        (check) => check.id === findingId,
      );
      if (!exists) {
        this.setState({ feedback: `诊断 ${findingId} 不在当前报告中。` });
        return;
      }
    }
    this.setState({ selectedFindingId: findingId });
  }

  closeEvidence(): void {
    this.setState({ selectedTokenId: null });
  }

  private exportState() {
    const { report, requestSnapshot, overrides } = this.state;
    if (report === null || requestSnapshot === null) return null;
    return { report, request: requestSnapshot, overrides };
  }

  async copySummary(): Promise<void> {
    if (this.state.stale) {
      this.setState({ feedback: "当前报告已不对应当前输入，已阻止复制。" });
      return;
    }
    const state = this.exportState();
    if (state === null) {
      this.setState({ feedback: "尚无报告可复制。" });
      return;
    }
    const text = buildSummaryText(state);
    try {
      if (this.options.writeText) {
        await this.options.writeText(text);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("当前环境不支持剪贴板");
      }
      this.setState({ feedback: "摘要已复制到剪贴板。" });
    } catch {
      this.setState({ feedback: "复制失败，请检查剪贴板权限。" });
    }
  }

  downloadReport(): void {
    if (this.state.stale) {
      this.setState({ feedback: "当前报告已不对应当前输入，已阻止导出。" });
      return;
    }
    const state = this.exportState();
    if (state === null) {
      this.setState({ feedback: "尚无报告可导出。" });
      return;
    }
    const json = JSON.stringify(buildReportJson(state), null, 2);
    const filename = reportFileName(state.report);
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
      this.setState({ feedback: `已导出 ${filename}。` });
    } catch {
      this.setState({ feedback: "导出失败，请重试。" });
    }
  }

  /** 中止进行中的请求（卸载或新建请求时）。 */
  abort(): void {
    this.activeController?.abort();
  }

  /** 仅测试用：暴露序号以便断言旧 finally 被丢弃。 */
  get currentRunId(): number {
    return this.runId;
  }

  static nextSequence(): number {
    sequence += 1;
    return sequence;
  }
}
