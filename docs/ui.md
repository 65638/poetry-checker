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

在 Node `24.19.0` / pnpm `11.25.0` 的检出上实际执行（已合并 `origin/main`）：

| 命令（等价） | 结果 |
| --- | --- |
| `vitest run apps/web/tests` | 148 项通过（本模块，见下） |
| `vitest run`（全量） | **431 项通过 / 30 文件**（integrate 基线 + D2 增量） |
| `pnpm verify`（需 `PNPM_CONFIG_NODE_LINKER=hoisted`） | **exit 0**：lint、双 tsconfig 类型检查、431 项测试、构建、生成物一致性全部通过 |
| 真实链路冒烟 | `GET /` 200、`/src/main.tsx` 200、`/healthz` 200、`/readyz` 200、`POST /api/v1/analyze` 200 且 `summary.status=pass`、原文匹配 |

### 类型检查注意

裸 `tsc --noEmit` **只跑根 tsconfig**，其 `include` 为
`packages/**/*.ts`、`apps/api/**/*.ts`、`scripts/**/*.ts`、`vitest.config.ts`，
**不含 `apps/web`**。TSX 的类型检查由 `pnpm verify` 串联的
`tsc --noEmit -p apps/web/tsconfig.json` 承担。因此本模块统一以 `pnpm verify`
作为验收命令，不单独引用裸 `tsc`。

`pnpm verify` 需要环境变量是因为本机 pnpm 在 `node_modules/.pnpm` 建符号链接会
`ERR_PNPM_EPERM`；`verify` 内部会触发一次依赖检查并重新 install，命令行参数传不进去。
用 `node-linker=hoisted`（纯复制）规避：

```powershell
$env:PNPM_CONFIG_NODE_LINKER = 'hoisted'
pnpm verify
```

这是本机环境问题，不影响其他机器按 README 正常安装。

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

---

# D4 增量：状态表与收口

本节是 D4 批次增补。上文 D1 部分保留原样作为历史；**与本轮实际行为冲突处以本节为准**。

基线与结果见 `docs/handoffs/d4-d.md`。

## D4-1 状态表（唯一权威口径）

行=触发事件；列=该事件后各字段的取值。**`stale` 只由 `deriveStale` 派生**
（当前草稿 vs 报告快照），任何路径都不手写。

| 触发 | runId | 在途信号 | busy | error | report | stale | overrides | pendingOverrides | 复制/导出 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 初始 | 0 | — | false | null | null | false | `[]` | `[]` | 阻止（尚无报告） |
| 开始分析 | **+1** | 新建 | true | null | 不变 | 派生 | 不变 | = 本次请求覆盖 | **阻止**（忙） |
| 成功返回（身份匹配） | 不变 | 结束 | false | null | **更新** | 派生（应为 false） | = 本次请求覆盖 | = 本次请求覆盖 | 允许 |
| 失败返回（503/网络/超时，身份匹配） | 不变 | 结束 | false | **设置** | **保留旧报告** | 派生（**不变**） | 不变 | 回退为 `overrides` | **阻止**（error） |
| 超时（客户端 30s） | 不变 | aborted | false | `TIMEOUT` | 保留 | 派生 | 不变 | 回退 | **阻止**（error） |
| 用户取消 `abort()` | **+1** | aborted | false | 不变（不报错） | 保留 | 派生 | 不变 | 不变 | 按时段判定 |
| 迟到响应（成功或失败） | — | — | **不写** | **不写** | **不写** | **不写** | **不写** | **不写** | 不受影响 |
| 改正文 | **+1** | aborted | false | 清空 | 保留→stale | **true** | **清空** | **清空** | **阻止**（stale） |
| 换韵书 | **+1** | aborted | false | 清空 | 保留→stale | **true** | **清空** | **清空** | **阻止**（stale） |
| 改体裁/体式 | **+1** | aborted | false | 清空 | 保留→stale | **true** | 保留 | 保留 | **阻止**（stale） |
| 正文改回原样 | 不变 | — | 不变 | 不变 | 不变 | **false**（自动解除） | 已清空（**不复活**） | 已清空 | 恢复允许 |
| 选音被接受 | **+1** | 新建 | true | null | 成功前不变 | 派生 | 成功后更新 | 新覆盖 | 成功后允许 |
| 选音被拒绝（stale / busy / 非法 token 或 candidate） | 不变 | — | 不变 | 不变 | 不变 | 不变 | 不变 | 不变 | 不变（仅 feedback） |
| 注入已完成结果 `applySnapshot` | **+1** | aborted | false | null | **替换** | 派生（false） | **清空** | **清空** | 允许 |

要点：

1. `runId` 是**唯一**的迟到判定依据；成功、失败、收尾三条路径都先比对身份。
2. `abort()` 也递增 `runId`（D4 修复）——只 abort 信号不够，底层可能已收到响应而忽略信号。
3. 失败**不会**把 `stale` 打开：`stale` 只表达「输入变了」，不是「请求失败了」。
4. 失败后旧报告可查看，但导出由 `error` 拦下，不是由 `stale` 拦下。

## D4-2 对 D1 表述的更正

| 上文位置 | D1 原文 | D4 实际行为 |
| --- | --- | --- |
| §3 第 4 条 | 「错误时……旧报告保留但标 `stale`」 | 失败**不**置 `stale`；旧报告保留且 `stale` 由输入比对决定；复制/导出由 `error` 阻止 |
| §4 表「修改体裁/形式」 | 「清空 `selectedFindingId`；报告过期」 | 正确，且同时**递增请求身份**让在途响应失效 |
| §6（复制与导出） | 未区分「忙」「失败」「stale」 | 三种阻止原因分别给不同文案，见 D4-1 表 |

## D4-3 验收事实与覆盖位置

| 验收事实 | 覆盖 |
| --- | --- |
| A 慢 B 快：页面/复制/下载只对应 B | `concurrency.test.ts`（乱序只保留最后一次）、`closeout-d4.test.ts`（导出载荷只含 B） |
| A 迟到成功不覆盖、迟到失败不污染 | `store.test.ts`、`concurrency.test.ts`、`closeout-d4.test.ts` |
| 请求期间编辑/换书：取消或忽略、draft 不丢、覆盖不串 | `store.test.ts`「编辑使在途请求失效」、`closeout-d4.test.ts` |
| 选音 POST 含正确 tokenId/candidateId/hash | `store.test.ts` 选音请求构造 |
| 超时/网络/503：busy 退出、可恢复、保留输入、旧报告不可冒充导出 | `timeout.test.ts`、`api-errors-d2.test.ts`、`closeout-d4.test.ts` |
| 错误后恢复：允许导出且内容一致 | `store.test.ts` 503 恢复、`closeout-d4.test.ts` 超时恢复 |
| 五类语义状态如实展示、不被降级 | `closeout-d4.test.ts`（状态层不改写）、`report-view.test.ts` |
| 主动取消后迟到成功不落地 | `closeout-d4.test.ts`（D4 新增，修复 `abort()` 不递增身份） |

## D4-4 未运行项

浏览器并发/键盘/移动端验收由 E 用 `pnpm test:e2e` 单写，本批不代跑、不声称通过。
真实触屏未验证；移动视口仿真不等于真机。

---

# D4 收口（G04 缺口）：浏览器实测

本节记录收口批在**月下 V2 UI**（`main@cea831b`）上的浏览器实测。E 写独立验收；
本节是业务侧自测记录，两者不互相替代。

## G04-1 真实 30 秒客户端超时（浏览器路径，非假时钟）

做法：真实 API 跑通一次成功分析 → 用 CDP `Fetch` 拦截把 `/api/v1/analyze` 挂起 →
等待真实 30 秒。

| 观察点 | 实测 |
| --- | --- |
| 挂起期间 `busy` | true（按钮「分析中」） |
| 约 30s 后 | `busy=false`（实测等待 29000–31000ms） |
| 错误条 | 「分析超时：服务在 30 秒内没有返回结果，请重试。输入内容已保留，未展示任何旧报告结论。」`错误代码：TIMEOUT` |
| 旧报告 | 仍可查看（20 字位保留） |
| 正文 | 保留，textarea 未被清空 |
| 复制摘要 | 被阻止，反馈「本次分析未完成，已阻止复制和导出旧报告；请重试成功后再操作。」剪贴板未变 |
| 下载报告 | 被阻止，下载目录 JSON 数量 0 → 0 |
| 重试成功 | 错误清除、报告恢复；复制可用（603 字），下载 0 → 1 |

结论：超时后**可恢复**、**旧报告只读不可导出**，与 D4-1 状态表一致；无需新增业务改动。

## G04-2 needs_review / unsupported 受控状态

通过 DEV 面板注入合成场景（受控 fixture），主路径仍走真实 API。

| 注入 | 结论文案 | 测试模式标识 |
| --- | --- | --- |
| needs_review | **结论：待复核** | 反馈「已装载开发合成场景；报告不代表真实格律结论。」且结论区文案含「合成」 |
| unsupported | **结论：暂不支持** | 同上 |
| 之后重新真实分析 | **结论：通过**（20 字位） | 结论区与反馈区均无「合成」→ 主路径未被污染 |

## G04-3 全键盘主流程

| 项 | 实测 |
| --- | --- |
| Tab 可依次进入控件 | 前 18 次 Tab 命中 18 个控件（BUTTON→BUTTON→BUTTON→TEXTAREA→INPUT→BUTTON…），无空档 |
| 可见焦点 | 18/18 可见，均带 `outline` 焦点环（宽度 > 0） |
| 关闭区块未被 Tab 命中 | 折叠区（`inert`）不会进入 Tab 序列，无对话框内容泄漏 |
| 字位 → 面板 | 聚焦 `l1c1` + Enter 打开，焦点进入对话框 |
| Escape 关闭 | 关闭并**回焦到触发字位** `l1c1` |

### 结构缺口（presentation，交 Codex，本批不改）

黄鹤楼（56 字位）实测：

- 正文字位按钮 **56 个**全部在 Tab 序列中 → 越过正文区需 56 次 Tab；
- 报告区可聚焦元素共 **169 个**（56 字位 + 96 批注按钮 + 复制/下载等）；
- **无「跳到主内容/跳到批注」跳过链接**；
- `.pc-grid` 自身无 `aria-label`（靠 `<section aria-labelledby="pc-grid-heading">` 提供名称，可接受但可补强）。

建议 Codex 集中处理：为报告区加跳转链接（跳到诊断/批注），或把逐字谱改为
roving tabindex（整组一个 Tab 停靠、方向键移动）。**不在业务层改 DOM。**

## G04-4 未运行

真实触屏/真机手势未验证；键盘实测为 Chrome headless + CDP 派发真实按键，非人工手测。
E 的 `pnpm test:e2e` 独立验收为准。

