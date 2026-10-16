# 诗格律检查器：团队启动仓库

本仓库是 6 人、5 天项目的首批工程底座。Codex 已开始实现公共契约与格律核心；组长和本地 GLM 接管 API、根配置及集成；A–E 根据各自任务书并行推进。文档包 v1.3 新增 Claude 英文设计任务书：Claude 接入后写视觉/展示组件，D 写前端业务工程，Codex 候补。Claude 尚未接入；尚未交付完整 Web 应用。

## 立即开始

环境锁定为 Node.js 24.19.0、pnpm 11.25.0。已有环境可直接执行：

```sh
pnpm install --frozen-lockfile
pnpm verify
```

未安装 pnpm 时，使用包含 npm 的标准 Node.js 24 安装后执行 `npm install -g pnpm@11.25.0`，或按 pnpm 官方说明安装同一版本。本地依赖已安装；重新克隆或解压需安装依赖。

`verify` 执行 lint、类型检查、单元测试、两包构建和生成物一致性检查。`pnpm dev:api` 启动 API 开发 mock（127.0.0.1:3000，`PORT` 可改）；`pnpm dev:web` 启动 Vite 前端（5173，代理 /api、/healthz、/readyz → 3000）；入口 `src/main.tsx` 已移交 D。

## 已有内容与待开发内容

| 内容         | 当前状态                                                                    |
| ------------ | --------------------------------------------------------------------------- |
| 公共契约     | Zod Schema、推导 TS 类型、7 个约定路径的 OpenAPI 定义                       |
| 契约 fixture | 通过、失败、待复核、不适用、不支持五类合成报告；非真实韵书/名篇金标准       |
| 基础核心     | 16 套整诗模板、基础平仄匹配、三值判断、全部韵脚公共归部集合判断             |
| 工程检查     | 锁文件、ESLint、TypeScript、Vitest、构建、生成物检查、GitHub Actions 工作流 |
| 完整格律判定 | 待实现；evaluateProsodyCore 明确抛出 PROSODY_EVALUATION_PENDING             |
| 数据与应用   | API 开发 mock 已就绪（fixture 支撑、错误码符合契约）；三套韵书、解析消歧、体裁、React Web、真实金标准与 E2E 待实现 |

当前匹配 score 仅有 toneFit，粘对/押韵特征尚为空。不可直接用于正式体裁判别或“全篇合律”结论。合成 fixture 使用字面“平”“仄”构造，只验证结构和界面，版本为 fixture-only。

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
apps/api/、apps/web/       交接目录，尚未实现应用
packages/lexicon/、readings/、genre/ 交接目录
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

## 接入 GitHub 与交接

协作仓库：[65638/poetry-checker](https://github.com/65638/poetry-checker)，当前为私有仓库。本地 origin 已关联；成员接受邀请后按 [GitHub 指南](docs/github.md) 克隆并协作。推送后自动检查基础代码；云端执行结果以 GitHub Actions 页面为准。

先读 [交付记录](HANDOFF.md)、[路径所有权](docs/ownership.md)、[契约冻结记录](docs/contract-freeze.md)。D1 由组长人工冻结接口；本次首批代码不自动等同于全组已审核冻结。

P1 动画只能在所有 P0 验收通过后启动：设计方实现展示层、D 接业务，仍按 D 组织落实 2–4 人时、E 回归约 0.5 人时估算；保留 D5 下午至少半天联调和彩排。
