# Web 交接记录：D1 视图契约与业务状态基础

日期：2026-10-17（D1）。执行者：队员 D + DeepSeek。基线 `main` = `e549194`，
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
| `apps/web/tests/*.test.ts` | 新增 | 65 项业务测试（api-client / store / export） |
| `fixtures/mocks/*.json`、`generate.ts`、`README.md` | 新增 | 五状态开发场景与错配场景，全部通过 Schema |
| `docs/ui.md` | 新增 | 业务交互、失效规则、导出与测试结果 |

未改动：`presentation/`、`public/design/`、`docs/design/`、包清单、lockfile、
Vite/TS 配置、根配置、`packages/contracts`、`apps/api`、金标准。

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

```text
vitest run apps/web/tests              → 65 passed
vitest run                             → 101 passed（36 基线 + 65 新增）
tsc --noEmit                           → exit 0
tsc --noEmit -p apps/web/tsconfig.json → exit 0
eslint .                               → exit 0
vite build（apps/web）                 → exit 0，118 modules，dist/index.html + assets
```

真实链路冒烟（`pnpm dev:api` + `pnpm dev:web`）：

```text
GET  /                     → 200 text/html，引用 /src/main.tsx
GET  /src/main.tsx         → 200 text/javascript（转译通过）
GET  /healthz              → 200
GET  /readyz               → 200
POST /api/v1/analyze       → 200，summary.status=pass，poem.originalText 与请求一致
```

**未执行**：DOM 组件测试（缺 jsdom/Testing Library）、E2E、375/768/1440px 视觉验收、
真实三库与真实名篇、`pnpm verify` 完整串联（见下节环境说明）。

## 环境说明（Windows 符号链接）

本机 Windows 未开启「开发者模式」时，普通用户无法创建符号链接，pnpm 的默认
store 布局会以 `EPERM` 失败。已确认开启
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock!
AllowDevelopmentWithoutDevLicense=1`（即「开发者模式」）后 pnpm 可正常工作。

为完成本批次验证，检出使用了**不进入版本库**的本地配置（`.git/info/exclude`
已忽略 `.pnpm-store/`、`.npmrc`）：

```ini
# poetry-checker/.npmrc（本地，不入库）
store-dir=.pnpm-store
node-linker=hoisted
```

这只影响本机的 `node_modules` 布局与 store 位置，**不修改 lockfile、包清单或根配置**。
其他机器按 README 正常 `pnpm install --frozen-lockfile` 即可，无需这份 `.npmrc`。
`pnpm verify` 的四个子步骤（lint/typecheck/test/build）已在上面逐项实际执行并通过。

## 未解决问题

1. 设计方 `CheckerView` 未交付，当前用 `DevContainer`；接入时替换容器外壳即可，业务逻辑复用。
2. jsdom / React Testing Library 未安装，DOM 组件测试尚未开始（按任务书向 GLM 申请）。
3. 示例入口正文为空：等待 E 提供审核后的来源与版本，不把合成 fixture 挂名真实名篇。
4. 真实 API 的三库、真实名篇、选音生效待 D2；当前 mock 的限制见任务书第 8 节。
5. 开发场景 `mismatch.json` 故意错位，仅用于验证前端拒绝；不得进入任何展示路径。

## 集成方法

1. 设计方把 `CheckerView`（`export function CheckerView(props: CheckerViewProps)`）放入
   `apps/web/src/presentation/`；
2. `main.tsx` 把 `<DevContainer {...props} />` 换成 `<CheckerView {...props} />`；
3. 业务测试与状态逻辑不需要改动；视觉问题交设计方，业务缺陷回 D。

## 数据与规则版本

- `schemaVersion`：`1.0`；`versions.data`：`fixture-only`；
  `versions.rules`：`teaching-v1`。
- 开发场景全部为合成数据，非真实韵书条目，不支撑任何真实格律结论。
