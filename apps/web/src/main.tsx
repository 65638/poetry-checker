import { lazy, Suspense, useMemo } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AUTO_ANALYZE_DELAY_MS, CheckerStore } from "./app/store";
import { Workspace } from "./app/Workspace";
import { EXAMPLES } from "./app/examples";
import { createRuntimeTransport, readWebEnv } from "./app/config";
import { useCheckerStore } from "./hooks/useCheckerStore";
import type { CheckerViewProps } from "./view-contract";
import type { DevShell as DevShellComponent } from "./app/DevShell";
import { loadSavedDraft } from "./app/draftPersistence";

/**
 * 开发壳按需加载。
 *
 * 路径用变量包一层，让打包器**无法静态分析**这个 import：
 * 生产构建就不会为开发壳及其依赖（fixture 装载器、场景文案）产出 chunk。
 * 运行时它在生产里也不会被执行（下面 `import.meta.env.DEV` 为 false）。
 */
const devShellModulePath = "./app/DevShell";
const DevShell = lazy(async () => {
  const mod: { DevShell: typeof DevShellComponent } = await import(
    /* @vite-ignore */ devShellModulePath
  );
  return { default: mod.DevShell };
});

function App() {
  // 生产入口走 resolveApiConfig：只接受 http transport，
  // 误开 VITE_DEV_MOCK 会在构建产物里直接抛错，不做静默兜底。
  const store = useMemo(() => {
    const { transport } = createRuntimeTransport(readWebEnv());
    return new CheckerStore(loadSavedDraft(), {
      transport,
      autoAnalyzeDelayMs: AUTO_ANALYZE_DELAY_MS,
    });
  }, []);
  const state = useCheckerStore(store);

  const props: CheckerViewProps = {
    draft: state.draft,
    report: state.report,
    busy: state.busy,
    stale: state.stale,
    error: state.error,
    feedback: state.feedback,
    selectedTokenId: state.selectedTokenId,
    selectedFindingId: state.selectedFindingId,
    examples: EXAMPLES,
    onDraftChange: (next, options) => {
      store.setDraft(next, options);
    },
    onAnalyze: () => {
      void store.analyze();
    },
    onLoadExample: (exampleId) => {
      const example = EXAMPLES.find((item) => item.id === exampleId);
      store.loadExample(exampleId, example?.text ?? "", state.draft);
    },
    onSelectToken: (tokenId) => {
      store.selectToken(tokenId);
    },
    onSelectFinding: (findingId) => {
      store.selectFinding(findingId);
    },
    onChooseReading: (override) => {
      void store.chooseReading(override);
    },
    onCloseEvidence: () => {
      store.closeEvidence();
    },
    onCopySummary: () => {
      void store.copySummary();
    },
    onDownloadReport: () => {
      store.downloadReport();
    },
  };

  // 开发预览：CheckerView 原样接收 props；开发场景选择器由 DevShell 单独承载，
  // 不给展示组件加任何未约定的 prop。
  if (import.meta.env.DEV) {
    return (
      <Suspense fallback={<main>正在加载开发壳…</main>}>
        <DevShell />
      </Suspense>
    );
  }

  return (
    <Workspace
      {...props}
      preliminaryPoem={state.preliminaryPoem}
      onCancelAnalysis={() => store.cancelAnalysis()}
    />
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("缺少 #root 挂载点");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
