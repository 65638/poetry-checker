import type { AnalysisResponse } from "@poetry/contracts";
import type { CheckerStore } from "./store";

/**
 * 开发预览专用的 store 注入（生产入口不 import 本模块）。
 *
 * 把 `applyDevReport` 从 store 里分离出来，目的是让生产 bundle 完全不含
 * 这段只在开发期使用的逻辑；store 本身仍是纯业务状态机。
 *
 * 注入时同时合成与该报告一致的请求快照（韵书与 inputHash 取自报告本身），
 * 保持「report / requestSnapshot / snapshotDraft 同源」的不变式。
 */
export function applyDevReport(store: CheckerStore, report: AnalysisResponse): void {
  const draft = {
    text: report.poem.originalText,
    rhymeBook: report.policy.rhymeBook,
    genreHint: "auto" as const,
    formHint: "auto" as const,
  };
  const request = {
    text: report.poem.originalText,
    rhymeBook: report.policy.rhymeBook,
    genreHint: "auto" as const,
    formHint: "auto" as const,
    ruleSet: "teaching-v1" as const,
    inputHash: report.inputHash,
    readingOverrides: [],
  };
  store.applySnapshot({
    draft,
    report,
    request,
    feedback: "已装载开发合成场景；报告不代表真实格律结论。",
  });
}
