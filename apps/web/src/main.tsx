import { useMemo } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CheckerStore } from "./app/store";
import { DevContainer } from "./app/DevContainer";
import { EXAMPLES } from "./app/examples";
import { createRuntimeTransport, readWebEnv } from "./app/config";
import type { DevScenarioId } from "./app/devScenarios";
import { useCheckerStore } from "./hooks/useCheckerStore";
import type { CheckerViewProps } from "./view-contract";

/** 空草稿：韵书默认为平水韵，体裁与体式自动。 */
const EMPTY_DRAFT = {
  text: "",
  rhymeBook: "pingshui" as const,
  genreHint: "auto" as const,
  formHint: "auto" as const,
};

function App() {
  // 生产入口走 resolveApiConfig：只接受 http transport，
  // 误开 VITE_DEV_MOCK 会在构建产物里直接抛错，不做静默兜底。
  const store = useMemo(() => {
    const { transport } = createRuntimeTransport(readWebEnv());
    return new CheckerStore(EMPTY_DRAFT, { transport });
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
      store.loadExample(
        exampleId,
        example?.text ?? "",
        state.draft,
      );
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

  // 开发场景入口只在开发构建挂载：fixture 与注入逻辑都通过动态 import 形成
  // 独立 chunk，生产入口不传这个 prop，发布包不含合成数据与开发文案。
  const devScenarioHandler = import.meta.env.DEV
    ? (id: DevScenarioId) => {
        void Promise.all([
          import("./app/devScenarios"),
          import("./app/devScenarioStore"),
        ])
          .then(async ([scenarios, devStore]) => {
            const scenario = await scenarios.loadDevScenario(id, true);
            devStore.applyDevReport(store, scenario.report);
          })
          .catch((cause: unknown) => {
            // 开发期装载失败只提示，不伪造报告。
            console.error("[dev-scenario] 装载失败", cause);
          });
      }
    : undefined;

  return <DevContainer {...props} onLoadDevScenario={devScenarioHandler} />;
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
