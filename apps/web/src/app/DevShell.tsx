import { useMemo } from "react";
import { Workspace } from "./Workspace";
import { DevScenarioSelector } from "./DevScenarioSelector";
import { useCheckerStore } from "../hooks/useCheckerStore";
import { EXAMPLES } from "./examples";
import { createRuntimeTransport, readWebEnv } from "./config";
import { CheckerStore } from "./store";
import type { CheckerViewProps } from "../view-contract";
import type { DevScenarioId } from "./devScenarios";
import { loadSavedDraft } from "./draftPersistence";

/**
 * 开发壳（DEV only）。
 *
 * 为什么需要它：`CheckerViewProps` 是冻结契约，**没有** `onLoadDevScenario`。
 * 不能给展示组件塞未经约定的新 prop，也不该把开发场景入口塞进展示层。
 * 所以开发预览由「本壳」承载：它渲染 CheckerView（原样 props），
 * 并在其旁边单独挂一个开发场景选择器。
 *
 * 生产入口不渲染本组件；本模块本身也只通过 `import.meta.env.DEV` 分支
 * 与动态 import 被引用，因此合成数据不进发布包。
 */
export function DevShell() {
  const store = useMemo(() => {
    const { transport } = createRuntimeTransport(readWebEnv());
    return new CheckerStore(
      loadSavedDraft(),
      { transport },
    );
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
    onDraftChange: (next) => {
      store.setDraft(next);
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

  const handleLoadScenario = (id: DevScenarioId) => {
    void Promise.all([import("./devScenarios"), import("./devScenarioStore")])
      .then(async ([scenarios, devStore]) => {
        const scenario = await scenarios.loadDevScenario(id, true);
        devStore.applyDevReport(store, scenario.report);
      })
      .catch((cause: unknown) => {
        // 开发期装载失败只提示，不伪造报告。
        console.error("[dev-scenario] 装载失败", cause);
      });
  };

  return (
    <>
      <Workspace {...props} />
      {/*
        开发场景面板：默认收起，避免在 375px 下遮挡正式输入区。
        只在 DEV 构建渲染（DevShell 本身由 main.tsx 的 DEV 分支引入）。
      */}
      <details
        data-testid="dev-shell-panel"
        style={{
          position: "fixed",
          right: 8,
          bottom: 8,
          zIndex: 10,
          maxWidth: 340,
          maxHeight: "50vh",
          overflow: "auto",
          background: "#fff",
          border: "1px solid #DDD8CC",
          borderRadius: 8,
          padding: "4px 8px",
          fontSize: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,.12)",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontWeight: 600,
            padding: "6px 2px",
            minHeight: 32,
            display: "list-item",
          }}
        >
          开发场景（DEV）
        </summary>
        <DevScenarioSelector onLoad={handleLoadScenario} />
      </details>
    </>
  );
}
