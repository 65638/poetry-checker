# 前端业务交互说明（D1）

本文件记录 D1 批次已接线的业务交互、测试覆盖与尚未完成的项。视觉与组件由设计方接管后，
本文件继续作为业务侧的行为说明。

## 1. 范围与边界

| 已实现 | 文件 |
| --- | --- |
| 视图契约（冻结） | `apps/web/src/view-contract.ts` |
| API client、错误适配、响应核对 | `apps/web/src/api/analyze.ts`、`src/api/errors.ts` |
| 业务状态协调器 | `apps/web/src/app/store.ts` |
| 输入规则与示例入口 | `apps/web/src/app/examples.ts` |
| 复制摘要、JSON 导出 | `apps/web/src/features/export.ts` |
| 临时纯文本开发容器 | `apps/web/src/app/DevContainer.tsx` |
| React 绑定与入口 | `src/hooks/useCheckerStore.ts`、`src/main.tsx` |
| 开发场景 fixture | `fixtures/mocks/`（生成器 `generate.ts`） |
| 业务测试 | `apps/web/tests/` |

**不改动**：`presentation/`、`public/design/`、`docs/design/`、包清单、Vite/TS 配置、
根配置、contracts、API、其他模块与金标准预期。`CheckerViewProps` 一个字段未改。

## 2. 业务状态

容器（`CheckerStore`）持有：

- `draft`：`text`/`rhymeBook`/`genreHint`/`formHint`；
- `report`：当前展示的 `AnalysisResponse`；
- `requestSnapshot` / `snapshotDraft`：产生该报告的请求与草稿快照；
- `busy`、`error`、`feedback`；
- `selectedTokenId`、`selectedFindingId`；
- `overrides`：已提交给服务端的选音覆盖；
- `stale`：报告是否已不对应当前输入（由内容比对得出，不是手动开关）。

展示层只消费 props、触发回调、管理 DOM 焦点；不发请求、不重判格律。

## 3. 请求与并发规则

1. **请求序号守卫**：每次提交递增 `runId`；迟到响应的收尾不能关闭新请求的 `busy`，
   也不能覆盖新请求的 `report`/`error`。
2. **中止旧请求**：新提交会 `AbortController.abort()` 旧请求；即使旧请求成功返回，
   也由 `runId` 丢弃。
3. **三层核对**：HTTP 状态 → `AnalysisResponseSchema` → 与本次提交的语义比对
   （`inputHash`、`originalText`、`rhymeBook`、行文本与字位自洽）。
4. **失败保留输入**：错误时正文保留，旧报告保留但标 `stale`，并禁用选音与导出；
   不把通信失败显示成 `unknown` 报告。

## 4. 失效规则

| 事件 | 业务层动作 |
| --- | --- |
| 修改正文 | 清空 `overrides`、清空选中项；报告与当前输入不一致即 `stale` |
| 切换韵书 | 清空 `overrides` 与选中项；旧书候选不复用 |
| 修改体裁/形式 | 清空 `selectedFindingId`；报告过期 |
| 选择古体 | 自动把 `formHint` 归为 `auto`，避免矛盾请求 |
| 收到有效新报告 | 清空 `selectedTokenId` / `selectedFindingId`，`stale=false` |

`stale` 由「当前草稿 vs 报告快照」内容比对推导：正文改回原样时自动解除。

## 5. 选音

`onChooseReading({ tokenId, readingId })` 只提交候选 ID，业务层负责：

1. 报告存在、非 `stale`、非 `busy`；
2. `tokenId` 属于当前报告，`readingId` 属于该字位候选；
3. 同位置覆盖只保留最新一条；
4. 携带该报告 `inputHash` 重新分析；
5. 不直接改写原报告候选/证据；服务端的覆盖归属校验仍由 GLM 实现。

不满足时给可读反馈且**不发请求**（按钮禁用之外的业务层兜底）。

## 6. 复制与导出

- 只基于「有效报告 + 其请求快照」，不重新判定格律；
- `stale` 时阻止复制与导出并提示原因；
- 复制摘要：结论、韵书与口径、体式、版本、原文、不确定项、用户指定；
- JSON 导出：`originalText`、`request`、`inputHash`、`readingOverrides`、
  `uncertainties`、完整 `report`、`schemaVersion` 与 `versions`。

## 7. 开发场景（fixtures/mocks）

由 `node fixtures/mocks/generate.ts` 生成，全部通过 `AnalysisResponseSchema`：

| 文件 | status | 用途 |
| --- | --- | --- |
| `pass.json` | pass | 合法通过 |
| `fail.json` | fail | 明确违规 |
| `needs_review.json` | needs_review | 含 `ambiguous` 读音 |
| `not_applicable.json` | not_applicable | 古体不适用 |
| `unsupported.json` | unsupported | 未支持形式 |
| `mismatch.json` | pass | 行文本与字位故意错位，前端必须拒绝 |

正文均用「平/仄」字面量构造，五状态正文互不相同；**不挂真实名篇**，
不进入生产分析路径。真实名篇与三库待 D2 接真实 API 后验证。

## 8. 实际执行的验证

在 Node `24.19.0` / pnpm `11.25.0` 的检出上实际执行：

| 命令（等价） | 结果 |
| --- | --- |
| `vitest run apps/web/tests` | 80 项通过 |
| `vitest run`（全量） | **116 项通过**（36 基线 + 80 新增） |
| `tsc --noEmit`（根） | 通过 |
| `tsc --noEmit -p apps/web/tsconfig.json` | 通过 |
| `eslint .` | 通过 |
| `vite build`（apps/web） | 通过，118 模块，dist 产出 |
| 真实链路冒烟 | `GET /` 200、`/src/main.tsx` 200、`/healthz` 200、`/readyz` 200、`POST /api/v1/analyze` 200 且 `summary.status=pass`、原文匹配 |

未执行：DOM 组件测试（缺 jsdom/Testing Library）、E2E、375/768/1440 视觉验收、
真实三库与真实名篇。这些按任务书属于后续批次或设计方/E 的范围。

## 8.1 审计修复（三项）

| 编号 | 问题 | 修复策略 |
| --- | --- | --- |
| 修复 1 | 行长度用 `String.length`（UTF-16 码元）与字位数比较，`𠀀` 被算成 2，合法报告被误拒 | 行长统一按 `[...text].length`（码点）比较；UTF-16 下标仍用于切片。新增 `supplementary.json` 回归 |
| 修复 2 | `chooseReading` 先改 overrides 再发请求，失败时导出会用「新覆盖 + 旧快照」 | 拆分 `overrides`（已成功报告的覆盖）与 `pendingOverrides`（待提交）；成功时原子提交 report/requestSnapshot/overrides；失败回退 pending；请求中禁止导出 |
| 修复 3 | 编辑但不重提交时 `runId` 不变，在途选音响应迟到仍会改写 report/overrides | `setDraft` 对身份参数（正文/韵书/体裁/体式）变化递增请求身份并 abort；迟到响应由身份守卫丢弃，成功/失败/收尾都不写状态 |

`stale` 只有唯一来源 `deriveStale`（当前草稿 vs 报告快照），任何失败路径都不能手写。

## 9. 待办

- 设计方交付 `CheckerView` 后，把 `DevContainer` 换为 `CheckerView`，业务逻辑不动；
- DOM 组件测试依赖（jsdom/React Testing Library）按需向 GLM 申请；
- 真实 API 接入后复验选音与韵书切换；
- 示例入口的审核正文待 E 提供来源与版本。
