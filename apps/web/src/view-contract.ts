/**
 * 前端内部视图契约（D1 冻结）。
 *
 * 定义见 docs/team/03_前端设计与协作约定.md 第 3 节、
 * docs/team/14_队员D_前端任务书.md 第 6 节、以及本文件随附的交接记录。
 *
 * 该接口复用 `@poetry/contracts` 的 HTTP 类型，不新增后端字段，
 * 也不重复定义 AnalysisResponse。展示层只消费 props 并触发回调，
 * 不得自行发请求或重判格律；业务状态全部由容器（src/app）持有。
 */
import type {
  AnalyzeRequest,
  AnalysisResponse,
  ReadingOverride,
} from "@poetry/contracts";

/** 草稿只承载输入区需要的字段；inputHash/overrides 由业务层合成。 */
export type InputDraft = Pick<
  AnalyzeRequest,
  "text" | "rhymeBook" | "genreHint" | "formHint"
>;

export interface CheckerViewProps {
  draft: InputDraft;
  report: AnalysisResponse | null;
  busy: boolean;
  /** 当前展示报告是否已不对应当前输入。 */
  stale: boolean;
  error: { code: string; message: string } | null;
  /** 复制成功等非判定反馈。 */
  feedback: string | null;
  selectedTokenId: string | null;
  selectedFindingId: string | null;
  examples: Array<{ id: string; title: string; text: string }>;
  onDraftChange: (
    next: InputDraft,
    options?: { autoAnalyze?: boolean },
  ) => void;
  onAnalyze: () => void;
  onLoadExample: (exampleId: string) => void;
  onSelectToken: (tokenId: string) => void;
  onSelectFinding: (findingId: string) => void;
  onChooseReading: (override: ReadingOverride) => void;
  onCloseEvidence: () => void;
  onCopySummary: () => void;
  onDownloadReport: () => void;
}
