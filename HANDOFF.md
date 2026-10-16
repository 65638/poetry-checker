# 首批工程底座交付记录

日期：2026-10-16。执行者：Codex。文档包已更新至 v1.3，公共契约仍为 v1.0 候选。当前交付工程底座与成员任务书；完整应用尚未实现，D1 人工冻结尚待组长完成。

## 已实现

- contracts：Zod Schema、推导 TS 类型、全部 7 条约定路径的 OpenAPI 定义。
- 校验：三韵书枚举、严格字段、2,000 码点上限、古体与具体近体形式冲突、人工覆盖需要摘要、字位重复覆盖、有效候选和平仄状态一致性、响应 UTF-16 原文切片与音系口径。
- fixture：五种报告状态；测试专用合成数据，来源标为内部合成，非真实韵书或已审核作品。
- prosody：16 套整诗基本模板、基础平仄匹配与候选排序、三值平仄约束、整体公共韵部集合判断；覆盖两两相交但全局不相交、读音内部平仄与归部关联、不确定和状态上限。
- 工程：锁定 Node/pnpm、workspace、ESLint/TypeScript/Vitest、生成器及漂移检查、GitHub Actions 配置、团队任务书和 GitHub 接入说明。

## 待实现和已知边界

1. evaluateProsodyCore 目前抛出明确的 PROSODY_EVALUATION_PENDING。完整平仄诊断、粘对、孤平、尾式、拗救、解释关联仍由 Codex 后续实现，C 独立验收。
2. matchTemplatesCore 当前仅有 toneFit，其他特征为 null；score 不能用于发布时的体裁结论。模板允许集合仅是基本谱，不自动豁免孤平和尾式。
3. A/B/E 的真实字表、解析消歧、体裁/元数据未实现；API、Web、数据构建、集成和 E2E 未实现。没有 pnpm dev，没有运行中的网页。
4. Schema 不替代 API 的摘要重算、选音归属校验、100 句限制、证据外键完整性和 HTTP 错误映射。Zod 的跨字段 refinement 不会完整表达在 OpenAPI 中，服务端须调用同一 Schema。
5. 尚无真实语言学金标准的运行结果。文献定位、韵书授权链及人工审核见任务书中的待核实项。

## 前端分工更新

Claude 接入后负责视觉/展示组件，D 与 DeepSeek 负责业务工程；Claude 尚未接入，Codex 候补。新增英文设计任务书、具体视觉基线和 CheckerViewProps 约定，尚未实现网页。详见 docs/handoffs/0002-frontend-design.md。

## 验证记录

基础执行结果记录在 [基础验证报告](docs/foundation-verification.md)。文档包另做链接、JSON、附录与 ZIP 完整性校验。本次首次提交前再次运行 pnpm verify：27 项测试、类型/代码检查、构建和生成物一致性全部通过。云端状态见 [GitHub Actions](https://github.com/65638/poetry-checker/actions)。

## 写入交接与下一步

根配置、包清单、lockfile 和 CI 交组长/GLM；prosody/src/index.ts 交 C；契约源/生成器和 core 仍由 Codex 负责。详见 [所有权](docs/ownership.md)。

| 角色     | 接收后第一项工作                                         |
| -------- | -------------------------------------------------------- |
| 组长/GLM | 安装并复验底座，人工冻结契约，补 API mock 与所有模块清单 |
| A        | 导入真实三韵书，核查缺部与来源                           |
| B        | 原文解析、码点/UTF-16 映射和候选消歧                     |
| C        | 核心公共入口、规则卡和独立正反例                         |
| D        | 用 fixture 开发业务容器，接设计方展示组件                  |
| E        | 完整体裁特征 fixture、作品审核框架、系统场景             |
| Codex    | 实现完整格律判定和解释输出，接受 C 的最小反例            |

源码包不含 .git、node_modules 或 dist。协作远端为 https://github.com/65638/poetry-checker.git，主分支 main，本地 origin 已关联。后续成员优先从远端克隆，以保留提交历史；ZIP 仅为源码备份。操作见 docs/github.md。0001/0002 交接记录描述的是首次发布前的历史状态。
