import { useMemo } from "react";
import { CheckerView } from "../presentation/CheckerView";
import { DevScenarioSelector } from "./DevScenarioSelector";
import { useCheckerStore } from "../hooks/useCheckerStore";
import { EXAMPLES } from "./examples";
import { createRuntimeTransport, readWebEnv } from "./config";
import { CheckerStore } from "./store";
import type { CheckerViewProps } from "../view-contract";
import type { DevScenarioId } from "./devScenarios";

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
      { text: "", rhymeBook: "pingshui", genreHint: "auto", formHint: "auto" },
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
      <CheckerView {...props} />
      <div
        data-testid="dev-shell-panel"
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 10,
          maxWidth: 360,
          background: "#fff",
          border: "1px solid #DDD8CC",
          borderRadius: 8,
          padding: 8,
          fontSize: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,.12)",
        }}
      >
        <DevScenarioSelector onLoad={handleLoadScenario} />
      </div>
    </>
  );
}
