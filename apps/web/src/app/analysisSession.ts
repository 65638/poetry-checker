import { AnalyzeRequestSchema } from "@poetry/contracts";
import { validateAnalysisResult, type AnalyzeOutcome } from "../api/analyze";
import { sha256Hex } from "../utils/sha256";
import type { CheckerStore } from "./store";

export const ANALYSIS_SESSION_KEY = "poetry-analysis-session-v1";
export const ANALYSIS_SESSION_TTL = 2 * 60 * 60 * 1000;
const MAX_BYTES = 2 * 1024 * 1024;
type Completed = Extract<AnalyzeOutcome, { ok: true }>;

export function encodeAnalysisSession(
  session: string,
  outcome: Completed,
  now = Date.now(),
): string {
  const payload = {
    version: 1,
    session,
    savedAt: now,
    request: outcome.request,
    report: outcome.report,
  };
  const raw = JSON.stringify({
    ...payload,
    checksum: sha256Hex(JSON.stringify(payload)),
  });
  if (raw.length > MAX_BYTES) throw new Error("分析记录过大，跳过临时缓存。");
  return raw;
}
export function decodeAnalysisSession(
  raw: string | null,
  session: string,
  now = Date.now(),
): Completed | null {
  try {
    if (!raw || raw.length > MAX_BYTES) return null;
    const value = JSON.parse(raw);
    if (
      !value ||
      value.version !== 1 ||
      value.session !== session ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now ||
      now - value.savedAt > ANALYSIS_SESSION_TTL
    )
      return null;
    const { checksum, ...payload } = value;
    if (
      typeof checksum !== "string" ||
      sha256Hex(JSON.stringify(payload)) !== checksum
    )
      return null;
    const request = AnalyzeRequestSchema.parse(value.request);
    const outcome = validateAnalysisResult(value.report, request);
    if (!outcome.ok || request.ruleSet !== "teaching-v1") return null;
    if (
      request.readingOverrides.some(
        (override) =>
          !outcome.report.poem.tokens.some(
            (token) =>
              token.tokenId === override.tokenId &&
              token.selectedReadingId === override.readingId,
          ),
      )
    )
      return null;
    return { ...outcome, serverSession: session };
  } catch {
    return null;
  }
}

/** Optional, tab-scoped cache. Storage/network failures never affect the working draft. */
export function connectAnalysisSession(
  store: CheckerStore,
  options: {
    storage: Pick<Storage, "getItem" | "setItem">;
    fetcher?: typeof fetch;
    baseUrl?: string;
    now?: () => number;
  },
) {
  let disposed = false;
  let savedReport = store.getState().report;
  const initial = store.getState();
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  function save() {
    const state = store.getState();
    if (
      !state.analysisSessionId ||
      disposed ||
      state.busy ||
      !state.report ||
      !state.requestSnapshot ||
      state.report === savedReport ||
      state.restoredFromSession
    )
      return;
    try {
      options.storage.setItem(
        ANALYSIS_SESSION_KEY,
        encodeAnalysisSession(
          state.analysisSessionId,
          { ok: true, report: state.report, request: state.requestSnapshot },
          now(),
        ),
      );
      savedReport = state.report;
    } catch {
      /* Temporary cache failure does not replace the successful report. */
    }
  }
  const unsubscribe = store.subscribe(save);
  void (options.fetcher ?? fetch)(`${options.baseUrl ?? ""}/readyz`, {
    signal: controller.signal,
    cache: "no-store",
  })
    .then(async (response) => {
      const value = response.headers.get("X-Poetry-Analysis-Session");
      if (
        !response.ok ||
        response.headers.get("X-Poetry-Mode") !== "real" ||
        !value ||
        !/^[a-f0-9-]{36}$/u.test(value)
      )
        return;
      const body = await response.json();
      if (disposed || body?.status !== "ready") return;
      let restored: Completed | null = null;
      try {
        restored = decodeAnalysisSession(
          options.storage.getItem(ANALYSIS_SESSION_KEY),
          value,
          now(),
        );
      } catch {
        /* Restricted sessionStorage is optional. */
      }
      if (restored) store.restoreCompletedAnalysis(restored, initial);
      save();
    })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
  return () => {
    disposed = true;
    clearTimeout(timer);
    controller.abort();
    unsubscribe();
  };
}
