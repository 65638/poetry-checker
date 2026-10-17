import { useMemo } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CheckerStore } from "./app/store";
import { DevContainer } from "./app/DevContainer";
import { EXAMPLES } from "./app/examples";
import { createHttpTransport } from "./api/analyze";
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
  // 生产入口只用真实 HTTP transport；开发场景不得从这里偷偷兜底。
  const store = useMemo(
    () => new CheckerStore(EMPTY_DRAFT, { transport: createHttpTransport() }),
    [],
  );
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

  return <DevContainer {...props} />;
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
