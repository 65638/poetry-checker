# 诗格律检查器：团队启动仓库

本仓库是 6 人、5 天项目的工程仓库。Codex 交付公共契约与格律核心；组长和本地 GLM 负责 API、根配置及集成；A–E 按任务书并行推进；Claude 交付展示层视觉。D1 冻结契约并合入六模块（main 6375b35，410 项测试）；D2 并入真实 API 编排、三套全量韵书快照装载与 Claude 视觉重设计（main 0aace67，526 项测试）。Web 应用与真实 API 已可运行；发布门槛（证据人工审核）未过，readyz 如实返回未就绪。

## 立即开始

**D4 当前执行入口（2026-10-20）**：[D4总控与历史迁移](docs/team/D4_执行任务书_2026-10-20/00_组长先看_总控与历史迁移.md)。D1–D3遗留统一在D4记账，已完成项保持回归；新UI暂停。本次真实HTTP仍3通过/6阻断/0判错，完整本地基线与远端main尚待统一发布。下列早期批次是历史记录，成员新开工以D4任务书和Codex后续公布的实际基线为准。

D3 D/E 接管复验（2026-10-19）：D 的三首示例和30秒超时已接入；修复失败后复制/导出旧报告，以及 E runner 把缺陷返回值误算通过的问题；补全实际选音重查、覆盖清理与历史体裁标签。最新全仓 **53 文件 / 733 项通过**，浏览器 **18 通过 / 0 阻断 / 0 失败**，真实 HTTP 九格仍 **3 通过 / 6 数据阻断 / 0 判错**。详见 [D/E 接管复核](docs/handoffs/d3-de-takeover-codex.md)。下列为此前各批记录。

D3 A 数据修复（2026-10-19）：已接入 A 至 `5d23a69` 的有效增量并修复六部误批；平水升 review4、词林升 clean1，合法审批范围不变。最新全仓 **51 文件 / 711 项通过**；真实 HTTP 仍 **3 通过 / 6 数据阻断 / 0 判错**。48 条两库候选仅为机器初审，D3 尚未完成。见 [A 修复交接](docs/handoffs/d3-a-repair-codex.md)。

D3 E 第三批复核（A 修复之前，2026-10-19，`codex/d3-b-integration`）：九格真实 HTTP **3 通过 / 6 数据阻断 / 0 判错**。平水黄鹤楼的限定三平尾已是 `not_applicable/info`，整诗仍由其他偏离推导 `fail`。E 第三批集成后浏览器 **11 通过 / 1 阻断 / 0 失败**，新增复制/导出一致性与字格/详情键盘场景；示例入口的 D 交付在 PR #18，尚待集成复验。全仓最新实跑 **50 文件 / 703 项**，仍不代表 E04–E08 全量或 D3 完成。具体执行 SHA、证据与范围见 [E 第三批复核](docs/handoffs/d3-e-third-review-codex.md)。

环境锁定为 Node.js 24.19.0、pnpm 11.25.0。已有环境可直接执行：

```sh
pnpm install --frozen-lockfile
pnpm verify
```

未安装 pnpm 时，使用包含 npm 的标准 Node.js 24 安装后执行 `npm install -g pnpm@11.25.0`，或按 pnpm 官方说明安装同一版本。本地依赖已安装；重新克隆或解压需安装依赖。

`verify` 执行 lint、类型检查、单元测试、两包构建和生成物一致性检查。`pnpm dev` 一条命令同时启动前后端（scripts/dev.mjs，Ctrl+C 统一清理子进程）；也可分开：`pnpm dev:api` 启动 API（**默认真实模式**：按 apps/api 清单装载韵书快照并走六步编排；设 `POETRY_DEV_MOCK=1` 才回退开发 mock；127.0.0.1:3000，`PORT` 可改）；`pnpm dev:web` 启动 Vite 前端（5173，代理 /api、/healthz、/readyz → 3000；用 `localhost` 访问，Vite 绑 IPv6）。当前全量证据尚未人工审核：`/readyz` 返回 503、`/api/v1/analyze` 对证据未审核输入返回 503 DATA_NOT_READY 都是如实门槛，不是故障。

## 已有内容与待开发内容

| 内容         | 当前状态                                                                    |
| ------------ | --------------------------------------------------------------------------- |
| 公共契约     | Zod Schema、推导 TS 类型、7 个约定路径的 OpenAPI 定义                       |
| 契约 fixture | 通过、失败、待复核、不适用、不支持五类合成报告；非真实韵书/名篇金标准       |
| 基础核心     | 16 套整诗模板、基础平仄匹配、三值判断、全部韵脚公共归部集合判断             |
| 工程检查     | 锁文件、ESLint、TypeScript、Vitest、构建、生成物检查、GitHub Actions 工作流 |
| 完整格律判定 | Codex 核心（evaluation.ts，D2 已并入）+ C 独立验收 82 项通过；规则卡人工审核清单已出 |
| 数据与应用 | 真实 API 编排已上线（六步管线、证据门槛、清单装载）；三套全量韵书已入仓（暂全 unverified，词林来源 ID 冲突与新韵读音缺失待 A 修）；解析消歧、体裁、React Web 均已并入；真实金标准与 E2E 待 E |

历史状态（D3 初期 integrate/d3；当前结果以顶部复核记录为准）分项标注：
- **代码检查**：pnpm verify 全绿（45 文件 / 591 测试，基线复验于 f42172f）。
- **真实 API**：平水三首 200 + Schema pass + 金标准 3/3（GLM 实跑 `scripts/probe-d3-matrix.ts`，九组合表见 data/reviews/d3-g02-nine-combos.json）；词林/新韵六组合如实 503（LOOKUP_EVIDENCE_UNVERIFIED，等 D3 批次三 A/B 供数）。
- **浏览器**：`pnpm dev` 双服务可用（healthz ok / web 200 / 代理真数据）；GLM 沙箱内 dev.mjs 的 node→cmd.exe spawn 受阻，用 dev:api/dev:web 分启绕行（真人环境不受影响，免 shell 加固列入 D3 待办）。
- **数据批准**：平水=三讲 1 部 + 83 条候选（J03 两批 + 有限批，登记于 data/reviews/approved-evidence.json，非全量审核）；三库快照级仍 unverified（整库审核为 D3 主线）。
- **已审特例**：黄鹤楼 l4c5-7"空悠悠"三平尾按 13_ 第 8 条转 not_applicable/info（rules/exceptions/reviewed-works-v1.json，其余偏离保持原判、整诗仍如实 fail）。
- **全库发布**：未发布；readyz 如实 503，唯一剩余门槛=三库快照级 approved。
已知问题：黄鹤楼 l4c5”空悠悠”三平尾现报 fail/error，与 13_ 第二批第 8 条裁定（作特征保留不作 error）不一致——D3 批次一（Codex 特例适用层）待接入后修正。

## 发给每位成员

完整任务书含公共契约附录，可各自单独发送给对应的 AI。

| 接收者     | 任务书                                                                            | 当前首要工作                           |
| ---------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| 全组       | [工程大纲](docs/team/01_项目大纲.md) / [发放说明](docs/team/00_发放与启动说明.md) | 统一范围、排期、P0 与 P1               |
| 组长/GLM   | [启动与集成](docs/team/10_组长_启动与集成任务书.md)                               | 复验底座、冻结契约、补 API mock 与集成 |
| A/DeepSeek | [韵书数据](docs/team/11_队员A_韵书数据任务书.md)                                  | 三套真实字表、来源和查询               |
| B/DeepSeek | [文本与读音](docs/team/12_队员B_文本与读音任务书.md)                              | 解析、原文位置、候选消歧与覆盖         |
| C/DeepSeek | [引擎接入与独立验收](docs/team/13_队员C_格律引擎任务书.md)                        | 公共入口、反例、规则依据               |
| D/DeepSeek | [前端](docs/team/14_队员D_前端任务书.md)                                          | 容器/API、选音/导出、交互验收与展示接入    |
| E/DeepSeek | [体裁与系统验收](docs/team/15_队员E_体裁与验收任务书.md)                          | 体裁 fixture、金标准审核框架           |
| Codex      | [契约与核心实现](docs/team/16_Codex_契约与核心实现任务书.md)                      | 下一批完整判断、规则解释与疑难修复     |

Claude 的文件可单独发送：[English design brief](docs/team/17_Claude_Frontend_Design_Brief_EN.md)。它含英文开发说明、同源类型和验收场景；应用 UI 仍用中文。中文分工/规格见 [前端设计约定](docs/team/03_前端设计与协作约定.md)。

## 仓库与命令

```text
packages/contracts/       Schema 与契约测试
packages/prosody/src/core/ Codex 的基础核心
packages/prosody/src/      C 的公共入口与后续封装
apps/api/、apps/web/       真实 API 服务与 React Web 应用
packages/lexicon/、readings/、genre/ 三模块均已并入
tests/integration/        跨模块集成测试（*.test.ts 由根 Vitest 收集；Playwright spec 用独立 runner，勿混入 Vitest）
artifacts/openapi.json    生成的接口说明，不代表 HTTP 服务已上线
fixtures/contracts/      合成响应与输入示例
rules/templates/         生成的基础模板
docs/team/               全套中文工程任务书
```

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm generate:contracts
pnpm check:generated
pnpm --filter @poetry/contracts test
pnpm --filter @poetry/prosody test
```

修改 Schema/模板后运行 generate:contracts 并提交生成物；CI 使用 check:generated 防止漂移。格式化源代码用 `pnpm format`，任务书由源文档生成，不手工改各份公共附录。Claude 英文任务书的公共类型与视图类型也从同一源生成。

本地与托管的区别：本地 `pnpm dev` 由 Vite 把 /api、/healthz、/readyz 代理到 3000 端口的 Fastify，`/design/` 等静态资源按根路径直出；静态托管（如 GitHub Pages）只承载 Web 构建产物、不带后端，且路径按根路径部署假设——单独托管前端时分析功能不可用。

## 接入 GitHub 与交接

协作仓库：[65638/poetry-checker](https://github.com/65638/poetry-checker)，当前为私有仓库。本地 origin 已关联；成员接受邀请后按 [GitHub 指南](docs/github.md) 克隆并协作。推送后自动检查基础代码；云端执行结果以 GitHub Actions 页面为准。

先读 [交付记录](HANDOFF.md)、[路径所有权](docs/ownership.md)、[契约冻结记录](docs/contract-freeze.md)。D1 由组长人工冻结接口；本次首批代码不自动等同于全组已审核冻结。

动效已随 Claude 重设计按授权落地（140–280ms、reduced-motion 回退），不再是 P1 阻塞项。保留 D5 下午至少半天联调和彩排。
