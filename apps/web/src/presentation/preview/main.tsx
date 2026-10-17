// apps/web/src/presentation/preview/main.tsx
// 开发预览入口（GLM 搭建）：仅消费契约 fixture（needs_review.json，合成数据），
// 不接 API、不代表产品入口；正式入口是 D 的 src/main.tsx。经 presentation-preview.html 访问。
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import fixture from '../../../../../fixtures/contracts/needs_review.json';
import { CheckerView } from '../CheckerView';
import type { AnalysisResponse } from '@poetry/contracts';
import type { InputDraft } from '../../view-contract';

const report = fixture as unknown as AnalysisResponse;
const initialDraft: InputDraft = {
  text: report.poem.originalText,
  rhymeBook: 'pingshui',
  genreHint: 'auto',
  formHint: 'auto',
};

function PreviewApp() {
  const [draft, setDraft] = useState<InputDraft>(initialDraft);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(
    report.poem.tokens.find((t) => t.readingStatus !== 'resolved')?.tokenId
      ?? report.poem.tokens[0]?.tokenId
      ?? null,
  );
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    report.prosody.checks[0]?.id ?? null,
  );

  return (
    <CheckerView
      draft={draft}
      report={report}
      busy={false}
      stale={false}
      error={null}
      feedback={null}
      selectedTokenId={selectedTokenId}
      selectedFindingId={selectedFindingId}
      examples={[{ id: 'preview-1', title: '合成预览数据（非真实名篇）', text: report.poem.originalText }]}
      onDraftChange={setDraft}
      onAnalyze={() => {}}
      onLoadExample={() => {}}
      onSelectToken={setSelectedTokenId}
      onSelectFinding={setSelectedFindingId}
      onChooseReading={() => {}}
      onCloseEvidence={() => setSelectedTokenId(null)}
      onCopySummary={() => {}}
      onDownloadReport={() => {}}
    />
  );
}

const root = document.getElementById('root');
if (root === null) {
  throw new Error('缺少 #root 挂载点');
}
createRoot(root).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
