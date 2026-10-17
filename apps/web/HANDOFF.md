# Web 交接记录：D1 视图契约与业务状态基础

日期：2026-10-17（D1）。执行者：队员 D + DeepSeek。

**基线**：分支创建时 `main` = `e549194`；已按组长要求合并 `origin/main`
（合入 C 的验收测试与 B 的解析/选音模块）。当前基线见下方「基线同步」一节。
`contract-v1` = `9b27322`。分支 `feat/d-d1-web`。

## 变更文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `apps/web/src/view-contract.ts` | 新增 | 冻结的 `CheckerViewProps` 与 `InputDraft`，字段与约定完全一致 |
| `apps/web/src/api/analyze.ts` | 新增 | API client：请求构造、三层核对、错误映射、HTTP transport |
| `apps/web/src/api/errors.ts` | 新增 | `ApiError` 与稳定错误码、用户文案 |
| `apps/web/src/app/store.ts` | 新增 | 业务状态协调器（并发守卫、失效、选音归属、导出快照） |
| `apps/web/src/app/examples.ts` | 新增 | 输入规则、示例入口、标签 |
| `apps/web/src/app/DevContainer.tsx` | 新增 | 临时纯文本开发容器（设计交付前使用） |
| `apps/web/src/features/export.ts` | 新增 | 复制摘要与 JSON 导出纯函数 |
| `apps/web/src/hooks/useCheckerStore.ts` | 新增 | `useSyncExternalStore` 绑定 |
| `apps/web/src/utils/sha256.ts` | 新增 | 纯 TS 的 SHA-256（UTF-8 原文摘要，与服务端口径一致） |
| `apps/web/src/main.tsx` | 覆盖 | 接管占位入口，接真实 HTTP transport 与开发容器 |
| `apps/web/tests/*.test.ts` | 新增 | 171 项业务测试（api-client / store / export / concurrency / config / dev-scenarios / report-view / evidence / fixture-integrity） |
| `fixtures/mocks/*.json`、`generate.ts`、`README.md` | 新增 | 五状态开发场景、错配场景与补充平面汉字场景，全部通过 Schema |
| `docs/ui.md` | 新增 | 业务交互、失效规则、导出与测试结果 |

未改动：`presentation/`、`public/design/`、`docs/design/`、包清单、lockfile、
Vite/TS 配置、根配置、`packages/contracts`、`apps/api`、金标准。

## 基线同步（响应组长要求）

```text
git fetch origin
git merge origin/main        # 无冲突，30 个文件、+5067 行，全部来自他人模块
pnpm install --frozen-lockfile
pnpm verify                  # exit 0
```

- 合并前 `main` 基线：`e549194`；合并后：含 C 的验收测试与 B 的解析/选音模块
- 合并后 `main` 独有 16 个提交，我的分支有 3 个提交，`git merge` **零冲突**
- 合并后测试：**306 项 / 19 个文件**（135 项来自 main + 171 项本模块）
- 冲突处理：本次无冲突；若有冲突，我只改 `apps/web/`、`fixtures/mocks/`、
  `docs/ui.md` 这些本人路径，根配置冲突交组长转 GLM

## ⚠️ 类型检查命令更正

此前文档里写“`tsc --noEmit` 通过”是**误导性的**：根 `tsconfig.json` 的 `include`
只含 `packages/**/*.ts`、`apps/api/**/*.ts`、`scripts/**/*.ts`、`vitest.config.ts`，
**不含 `apps/web`**。裸跑 `tsc --noEmit` 根本不会检查 TSX。

TSX 的实际检查由 `pnpm verify` 串联的第二个项目承担：
`tsc --noEmit && tsc --noEmit -p apps/web/tsconfig.json`。
因此本模块的验收标准统一为 **`pnpm verify`**，不再单独引用裸 `tsc`。

## 完成用例

- `D-D1-01` 五类合法报告注入，原状态保留（pass/fail/needs_review/not_applicable/unsupported）
- `D-D1-02` 请求 A 慢、B 快：A 迟到成功/失败都被丢弃，旧 `finally` 不污染新 `busy`
- `D-D1-03` 请求未完成只改正文：旧响应不成为当前报告，旧选择失效
- `D-D1-04` 已有报告后切韵书：清覆盖、报告过期、不复用旧候选
- `D-D1-05` 合法选音携带 `inputHash`，同位置只保留最新覆盖
- `D-D1-06` 外字/外书 `readingId`、`stale`/`busy` 选音：不发请求并给反馈
- `D-D1-07` 422/413/503/500/网络拒绝/非 JSON/坏 Schema 的映射与保留输入
- `D-D1-08` Schema 合法但原文/韵书/字位不一致的报告被拒绝
- `D-D1-09` 古体与近体形式互斥、纯标点拒绝、按码点计长
- `D-D1-10` 复制/导出只用报告快照，`stale` 时阻止

## 执行命令与结果

合并 `origin/main` 后（本机需 `PNPM_CONFIG_NODE_LINKER=hoisted`，原因见下节）：

```text
$env:PNPM_CONFIG_NODE_LINKER = 'hoisted'
pnpm verify                            → exit 0
  $ eslint .                           → 通过
  $ tsc --noEmit && tsc --noEmit -p apps/web/tsconfig.json → 通过（两个项目都查）
  $ vitest run                         → 306 passed / 19 files
  $ pnpm build && tsx scripts/generate-contracts.ts --check → 通过（8 个生成物一致）
```

测试构成：**306 = 135（main 基线）+ 171（本模块新增）**。
本模块单独跑：`vitest run apps/web/tests` → 80 passed。

`pnpm verify` 的实际通过条件与原因见下节「环境说明」。

真实链路冒烟（`pnpm dev:api` + `pnpm dev:web`）：

```text
GET  /                     → 200 text/html，引用 /src/main.tsx
GET  /src/main.tsx         → 200 text/javascript（转译通过）
GET  /healthz              → 200
GET  /readyz               → 200
POST /api/v1/analyze       → 200，summary.status=pass，poem.originalText 与请求一致
```

**未执行**：DOM 组件测试（缺 jsdom/Testing Library）、E2E、375/768/1440px 视觉验收、
真实三库与真实名篇。

## 审计批次修复（状态与字符）

评审指出三项缺陷。**状态一览**（不是让人从 diff 猜）：

| # | 问题 | 状态 | 回归测试 | 遗留 |
| --- | --- | --- | --- | --- |
| 1 | Unicode 坐标：行长度用 UTF-16 码元，补充平面汉字被算成 2 | **已完成** | `supplementary.json` + `api-client.test.ts` 4 项 | 无 |
| 2 | 失败选音导出：覆盖与报告快照不同源 | **已完成** | `store.test.ts` 5 项（503/网络失败/请求中/一致性/stale） | 无 |
| 3 | 编辑后旧响应回写：编辑不递增请求身份 | **已完成** | `store.test.ts` 5 项（正文/改回/切书/形式/迟到失败） | 无 |

以下为逐项说明。

### 修复 1：汉字码点与 UTF-16 偏移分开

**复现**：正文含补充平面汉字（如 `𠀀`，1 码点 = 2 UTF-16 码元）时，
`findInternalMismatch` 用 `line.text.length` 与字位数比较，把该字算成 2 个字，
合法报告被拒为 `RESPONSE_INPUT_MISMATCH`。

**修复**：行长改为 `[...line.text].length`（码点）比较；`startUtf16/endUtf16`
继续用于切片。生成器同步修正：码点下标取声调、UTF-16 偏移做切片，两者分开推进。

**回归**：`fixtures/mocks/supplementary.json`（含 `𠀀` 的合法报告）；
`api-client.test.ts` 断言该报告被接受，且真错位报告仍被拒绝。

### 修复 2：选音提交与报告快照保持一致

**复现**：`chooseReading` 先写 overrides 再发请求；重算失败时 `report`/
`requestSnapshot` 还是旧的，`stale` 仍为 false，导出会输出「新覆盖 + 旧快照」。

**修复**：状态拆成 `overrides`（= 成功报告的 `requestSnapshot.readingOverrides`）
与 `pendingOverrides`（待提交）。成功时原子提交 report/requestSnapshot/overrides；
失败或中止时 pending 回退到已生效覆盖；请求进行中禁止复制/导出。
`stale` 只有唯一来源 `deriveStale`（当前草稿 vs 报告快照），失败路径不能手写。

**回归**：成功→选音→503、成功→选音→网络失败、请求进行中三类场景，
断言导出 `readingOverrides` 与 `request.readingOverrides` 始终一致。

### 修复 3：编辑但不重新提交也要让旧响应失效

**复现**：慢选音请求在途时只改正文（不重新提交），`runId` 不变，
旧响应到达后仍会重写 report 与 overrides。

**修复**：`setDraft` 对身份参数（正文/韵书/体裁/体式）变化调用
`invalidateInFlight()`：递增请求身份并 abort；旧响应的成功、失败与收尾
都因身份不匹配被丢弃。使用**忽略 abort** 的 transport 做回归，确保验证的是
身份守卫而不是「恰好没发出请求」。

**回归**：慢选音→改正文→旧响应返回（覆盖保持空）、改回原文也不复活、
切韵书失效、形式参数变化失效、迟到失败不覆盖当前状态。

## 环境说明（Windows 符号链接）

本机「开发者模式」已开启（`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock!
AllowDevelopmentWithoutDevLicense=1`），命令行 `mklink /D` 与 Node 的 `fs.symlink`
手工均可成功；但 pnpm 内部对 `node_modules/.pnpm` 做的链接仍稳定报
`ERR_PNPM_EPERM [symlinkAllModules]`。这是本机环境的既有问题，与本次代码无关。

因此本批次用 `node-linker=hoisted`（纯复制，不建符号链接）规避，
并且需要**环境变量**形式，因为 `pnpm verify` 会触发一次依赖状态检查、
内部重新执行 `install`，命令行参数不会传递到那次调用：

```powershell
$env:PNPM_CONFIG_NODE_LINKER = 'hoisted'
pnpm verify          # exit 0
```

结果（2026-10-17 实测）：

```text
$ eslint .                                    → 通过
$ tsc --noEmit && tsc --noEmit -p apps/web/tsconfig.json → 通过
$ vitest run                                  → 306 passed (19 files)
$ pnpm build && tsx scripts/generate-contracts.ts --check → 通过（8 个生成物一致）
```

不设该环境变量时 `pnpm verify` 会在依赖检查阶段以 `EPERM` 退出（测试本身仍通过）。
这只影响本机的安装方式，**不修改 lockfile、包清单或根配置**；其他机器按 README
正常 `pnpm install --frozen-lockfile` 即可。

检出另有**不进入版本库**的本地配置（`.git/info/exclude` 已忽略）：

```ini
# poetry-checker/.npmrc（本地，不入库）
store-dir=.pnpm-store
node-linker=hoisted
```

## D2–D3 推进（本批新增）

### 1. 真实 API 接入准备

新增 `apps/web/src/app/config.ts`，把「运行模式」与「API 目标」从入口里抽成纯函数：

- `resolveApiConfig(env)`：默认同源相对路径 `/api`（开发经 Vite 代理）；
  可用 `VITE_API_BASE_URL` 指定 `http(s)` 绝对地址直连真实 API。
- **生产构建禁止开发 mock**：`PROD` + `VITE_DEV_MOCK` 同时为真时直接抛
  `ApiConfigError`，不做静默兜底。
- `createRuntimeTransport(env, devTransport?)`：mock 模式**必须**显式注入
  transport，不内置任何 mock，避免「请求失败就回退合成数据」。
- `main.tsx` 改为经 `createRuntimeTransport(readWebEnv())` 取 transport。

测试：`config.test.ts` 11 项（默认/生产/绝对地址/非法 URL/mock 注入/误配抛错）。

### 2. 请求取消与并发回归

新增 `concurrency.test.ts` 9 项：

- `signal` 已 abort 的拒绝识别为 `ABORTED`，不显示成 `NETWORK_ERROR`
- 无 signal 的异常仍是 `NETWORK_ERROR`
- 用户取消进行中的提交：不显示错误、旧报告保持且 `stale` 不变
- `abort()` 幂等：连续调用不抛错、不产生错误态
- 新请求会取消旧请求的 signal
- 连续 5 次提交、乱序完成：只保留**最后一次提交**的响应内容
- 前面全部迟到失败也不影响最后成功的结果
- 失败 → 再提交成功：错误被清除
- 失败后 `report` / `overrides` / `requestSnapshot` 三者仍描述同一次成功计算

### 3. 五状态开发预览（任务书第 8 节）

新增 `app/devScenarios.ts`、`app/devScenarios.data.ts`、`app/DevScenarioSelector.tsx`、
`app/devScenarioStore.ts`，以及 store 的通用 `applySnapshot()`：

- **不给 `AnalyzeRequest` 加 scenario 字段**；场景只在开发侧选择，切换时装载
  fixture 自身的正文与韵书。
- 装载走**动态 import**（`devScenarios` → `devScenarios.data` → fixture JSON 各自成 chunk），
  生产入口只在 `import.meta.env.DEV` 时挂 `onLoadDevScenario`。
- 未授权（`allowed=false`）装载直接抛 `DevScenarioUnavailable`；选择器 UI 也用
  `React.lazy`，生产主包不含场景文案。
- 已实测：生产构建两个 chunk 中均**无** fixture 数据
  （`fixture:group` / `仄仄平平仄` 零命中）；fixture 仅作为独立 lazy chunk 的依赖存在，
  且运行时被守卫拒绝。

测试：`dev-scenarios.test.ts` 6 项（守卫、五场景标签、注入后三者同源、
清空旧选择、注入后可直接导出、注入会中止在途请求）。

### 4. 逐字谱 / 诊断 / 押韵接线（D2）

新增 `app/reportView.ts`（纯函数视图模型）+ 接入 `DevContainer`：

- `buildTokenSpectrum`：按原文顺序输出字位、中文平仄、`tonePending`（读音未定）、
  `isRhyme`（来自 `prosody.rhyme.tokenIds`）、关联诊断 id。
- `buildFindings` / `groupFindings`：按 `ruleId` 前缀分组（平仄/押韵/粘对/孤平尾式/
  变格拗救/其他），组内按 `severity` 再 `status` 稳定排序；支持「只看需处理项」。
  **未知前缀归 `other`，不猜。**
- `locateFinding`：finding → 精确字位 + UTF-16 半开区间，返回空数组而不是退回整段。
- `buildRhymeFeet` / `rhymeCommonGroups`：韵脚与共同归部只取报告字段。

**已修复的数据异常**（mock 修复批次）：`fixtures/mocks` 的 `finding.locations`
原先用 `rhymeTokenIds[0]` 当 tokenId，却硬写 `line: 1, column: 1`（如 `l2c5`
被标成 line 1,column 1）。`generate.ts` 已改为:

- 坐标一律取自实际 token 的 `line`/`column`（`buildCheck`）；
- 引用不到 token 时**生成器直接失败**，不再回退 `?? "l1c1"`；
- `expected`/`observed` 由该字位真实平仄推导，不再与场景无关
  （原 `pass` 场景 observed 是 P 却显示通过，自相矛盾）；
- 写盘后重新读回做**语义自检**：切片、行文本、坐标、fail 矛盾、pass 一致，
  不通过则 `process.exit(1)`；
- `mismatch.json` 保持「行文本与字位错位」的拒绝测试目的，自检要求它
  **必须不自洽**，不套用合法场景规则去「修绿」。

测试：`fixture-integrity.test.ts` 23 项固化上述约束
（坐标一致、expected/observed 自洽、observed 等于真实平仄、
补充平面汉字切片、mismatch 仍错位）。

测试：`report-view.test.ts` 26 项（五场景顺序与区间、韵脚标记、分组排序、
只看需处理项、未知前缀、精确定位、补充平面汉字区间、共同归部、粘对关系）。

### 5. 证据抽屉与粘对关系（D3）

新增 `app/evidence.ts`，并把 `buildRelations` 加进 `reportView.ts`：

- `buildTokenEvidence`：单个字位的候选、平仄、贡献标记、选中标记、释义、
  今读、反切、韵部、相关诊断与规则卡。
- **反切缺失显式标记** `fanqie.available=false`，UI 显示「该数据未提供反切」，
  不虚构文本。
- **引用不到的证据/韵部/规则卡会被列出**：`collectEvidenceGaps` 返回
  `missingFanqie` / `unresolvedEvidenceIds` / `findingsWithoutRuleCard`，
  UI 以「数据缺失提示」呈现，不静默丢弃。
- `isUserSpecified` 标注用户指定读音，且**不修改报告原值**（有测试断言）。
- `buildRelations`：`nian`/`dui` → 粘/对，解析字位与 UTF-16 区间；
  引用不到的字位标 `hasUnresolvedTokens` 并以「未解析」呈现。
  当前 fixture 的 `relations` 为**空数组**，UI 明示「未提供，不视为通过」。
- 仍未做：反切/来源的外部链接跳转、长文献折叠、抽屉焦点陷阱（需 DOM 测试）。

测试：`evidence.test.ts` 16 项 + `report-view.test.ts` 新增 3 项粘对。

### 6. 待装配（等两条分支进 main）

`feat/claude-presentation` 已核实：其 `apps/web/src/view-contract.ts` 与本分支
**逐字节同内容**，`CheckerViewProps` 完全匹配，所以装配只需把 `main.tsx` 的
`<DevContainer {...props} />` 换成 `<CheckerView {...props} />`，容器不动。

## 未解决问题

1. 设计方 `CheckerView` 未合入 main，当前用 `DevContainer`；装配方式见上节第 3 点。
2. jsdom / React Testing Library 未安装，DOM 组件测试尚未开始（按任务书向 GLM 申请）。
3. 示例入口正文为空：等待 E 提供审核后的来源与版本，不把合成 fixture 挂名真实名篇。
4. 真实 API 编排待 A 的数据 + Codex 核心到位后由 GLM 通知联调；当前 `analyze` 仍是 fixture mock。
5. 开发场景 `mismatch.json` 故意错位，仅用于验证前端拒绝；不得进入任何展示路径。
   `supplementary.json` 含补充平面汉字，仅用于坐标回归。
6. 本批未执行 DOM/E2E/真实名篇链路；示例正文仍等待 E 的来源与版本核验，
   没有把合成数据挂名真实作品。
7. 本机 pnpm 的 `ERR_PNPM_EPERM` 是环境问题，建议由 GLM 决定是否在
   `pnpm-workspace.yaml` 里统一 `nodeLinker: hoisted`，避免每个成员各自处理。

## 集成方法

1. 设计方 `CheckerView` 合入后，已确认 `view-contract.ts` 同源同内容，无需改契约；
2. `main.tsx` 把 `<DevContainer {...props} />` 换成 `<CheckerView {...props} />`；
3. `src/app/store.ts`、`src/api/`、`src/features/` 不动；视觉问题交设计方，业务缺陷回 D。

### 正式装配（已提交，分支 `feat/d-d3-assembly`）

GLM 要求的「同时含两边的集成分支」尚不存在（`origin/main` 仍为 `0a94212`，
不含 `presentation/`）。为交付可保留的装配提交，本人在本地建立了可复现的集成基线：

```text
基线：feat/d-d1-web @ 7520dde  +  origin/feat/claude-presentation @ b0f9dcc
      → 本地 merge e5d2b79（零冲突）
装配：main.tsx 生产分支渲染 CheckerView；开发壳 DevShell 单独承载场景选择器
```

- **契约核对**：合入前逐字节比对 `apps/web/src/view-contract.ts`，两边**完全一致**，
  字段列表 `Compare-Object` 无差异；未新建第二份类型。
- **Props 边界**：`CheckerViewProps` 没有 `onLoadDevScenario`，因此
  **没有**给展示组件加新 prop。开发场景入口放在新增的 `app/DevShell.tsx`：
  它渲染 `<CheckerView {...props} />`（原样 props），并在旁边单独挂
  `<DevScenarioSelector />`。
- **生产不夹带合成数据**：`DevShell` 用**变量化动态 import**
  （`/* @vite-ignore */` + 路径变量）加载，打包器无法静态分析，
  生产构建不再产出 dev chunk。实测生产产物只有
  `index.html` / `index-*.js` (349 kB) / `index-*.css` (18.2 kB) / `paper-grain.svg`，
  **无任何 dev chunk**，`fixture:group` 与合成正文零命中。
- **业务逻辑零改动**：`CheckerStore`、API transport、并发/取消、`stale`、
  选音重检全部保留；仅 `main.tsx` 换渲染目标，新增 `DevShell.tsx`。

验证（在集成基线上）：

```text
pnpm verify                          → exit 0，306 项测试（19 文件）
vite build                           → 130 modules，CSS 18.23 kB（视觉样式生效）
dev 冒烟                             → / 200、main.tsx 200、DevShell 200、presentation 200
HTTP mock + contracts/pass 正文      → 200，summary=pass，原文匹配，finding 坐标自洽
HTTP mock + contracts/fail 正文      → 200，summary=fail，原文匹配
```

**未执行**：真实浏览器点击验收（无 DOM/E2E 依赖，未装 jsdom/Testing Library）、
375/1440 视觉与键盘现查、真实 API 联调。

### 关于 HTTP mock 的五状态限制（实测结论）

`apps/api` 的 mock 只装载 `fixtures/contracts`，而其中
`pass` / `needs_review` / `not_applicable` / `unsupported` 的**正文完全相同**，
`fail` 是唯一不同的一首。因此：

- 用 `contracts/pass` 正文请求 → 稳定命中 `pass`；
- 用 `contracts/fail` 正文请求 → 稳定命中 `fail`；
- 用 `fixtures/mocks` 的正文请求 → 匹配不到，回退 `needs_review` 模板，
  其正文与请求不同，前端会正确地拒绝为 `RESPONSE_INPUT_MISMATCH`。

所以**五状态预览必须走开发场景注入**（`DevShell`），不能靠 HTTP mock；
而「走一次 HTTP mock」用 `contracts/pass` 正文即可满足。此限制已按实记录。

## 数据与规则版本

- `schemaVersion`：`1.0`；`versions.data`：`fixture-only`；
  `versions.rules`：`teaching-v1`。
- 开发场景全部为合成数据，非真实韵书条目，不支撑任何真实格律结论。
