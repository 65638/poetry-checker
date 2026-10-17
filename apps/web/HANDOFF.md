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
| `apps/web/tests/*.test.ts` | 新增 | 80 项业务测试（api-client / store / export） |
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
- 合并后测试：**215 项 / 13 个文件**（135 项来自 main + 80 项本模块）
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
  $ vitest run                         → 215 passed / 13 files
  $ pnpm build && tsx scripts/generate-contracts.ts --check → 通过（8 个生成物一致）
```

测试构成：**215 = 135（合并进来的 main 基线）+ 80（本模块新增）**。
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

评审指出三项缺陷，均已修复并加独立回归。

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

结果（2026-10-17 实测，清理 `node_modules` 后重装再跑）：

```text
$ eslint .                                    → 通过
$ tsc --noEmit && tsc --noEmit -p apps/web/tsconfig.json → 通过
$ vitest run                                  → 116 passed (7 files)
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

## 未解决问题

1. 设计方 `CheckerView` 未交付，当前用 `DevContainer`；接入时替换容器外壳即可，业务逻辑复用。
2. jsdom / React Testing Library 未安装，DOM 组件测试尚未开始（按任务书向 GLM 申请）。
3. 示例入口正文为空：等待 E 提供审核后的来源与版本，不把合成 fixture 挂名真实名篇。
4. 真实 API 的三库、真实名篇、选音生效待 D2；当前 mock 的限制见任务书第 8 节。
5. 开发场景 `mismatch.json` 故意错位，仅用于验证前端拒绝；不得进入任何展示路径。
   `supplementary.json` 含补充平面汉字，仅用于坐标回归。
6. 本批未执行 DOM/E2E/真实名篇链路；示例正文仍等待 E 的来源与版本核验，
   没有把合成数据挂名真实作品。
7. 已具备转正式 PR 的条件需组长确认：验证只到本机实际执行，
   未覆盖浏览器视觉与真实 API 链路。
8. 本机 pnpm 的 `ERR_PNPM_EPERM` 是环境问题，建议由 GLM 决定是否在
   `pnpm-workspace.yaml` 里统一 `nodeLinker: hoisted`，避免每个成员各自处理。

## 集成方法

1. 设计方把 `CheckerView`（`export function CheckerView(props: CheckerViewProps)`）放入
   `apps/web/src/presentation/`；
2. `main.tsx` 把 `<DevContainer {...props} />` 换成 `<CheckerView {...props} />`；
3. 业务测试与状态逻辑不需要改动；视觉问题交设计方，业务缺陷回 D。

## 数据与规则版本

- `schemaVersion`：`1.0`；`versions.data`：`fixture-only`；
  `versions.rules`：`teaching-v1`。
- 开发场景全部为合成数据，非真实韵书条目，不支撑任何真实格律结论。
