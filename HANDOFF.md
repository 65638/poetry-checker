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
| D        | 用 fixture 开发业务容器，接设计方展示组件                |
| E        | 完整体裁特征 fixture、作品审核框架、系统场景             |
| Codex    | 实现完整格律判定和解释输出，接受 C 的最小反例            |

源码包不含 .git、node_modules 或 dist。协作远端为 https://github.com/65638/poetry-checker.git，主分支 main，本地 origin 已关联。后续成员优先从远端克隆，以保留提交历史；ZIP 仅为源码备份。操作见 docs/github.md。0001/0002 交接记录描述的是首次发布前的历史状态。

---

# GLM 接入：D1 复验、契约冻结与 API mock（2026-10-16）

执行者：组长本地 GLM（ZCode）。在独立 Node 24.19.0 / pnpm 11.25.0 环境复验后完成以下工作。

## 已完成

- 底座复验：全新环境 `pnpm install` + `pnpm verify` 全绿（lint、typecheck、测试、构建、生成物一致性），Codex 声称的基础交付属实。
- 契约冻结：人工审核 Schema/OpenAPI/fixture 与《02\_公共接口契约\_v1.md》一致后，以标签 `contract-v1` 冻结基线；记录见 docs/contract-freeze.md。冻结后公共变更走独立 PR。
- `apps/api`（GLM 所有）：Fastify D1 开发 mock。`/healthz`、`/readyz`、`/api/v1/rhyme-books`、`/api/v1/analyze`（AnalyzeRequestSchema 校验、422 统一错误、413 超限、五类 fixture 确定性选取、请求韵书回写 policy/poem.book、inputHash 重算、出站 Schema 校验）；`characters/rules/sources` 按契约返回 503 DATA_NOT_READY。错误处理保留 Fastify 4xx 状态码，未知错误才映射 500。**不执行真实格律判断。**
- 模块清单：`@poetry/lexicon`、`@poetry/readings`、`@poetry/genre`、`@poetry/web` 补 package.json 声明（仅清单，src 归各负责人）。
- 根配置：新增 `dev` / `dev:api` 脚本；tsconfig include 与 vitest include 纳入 `apps/**`；新增依赖 fastify 5.1.0 并更新 lockfile。
- 验证：`pnpm verify` 36 项测试通过（原 27 + api 9）；真实启动冒烟：healthz 200 / analyze 200+出站校验 / 非法枚举 422 / 坏 JSON 400 / 未知路由 404 / 数据未就绪 503。

## 待办（按任务书）

- API 真实编排：A/B/C/E 模块就绪后按契约第 4 节顺序接入，替换 mock 选 fixture 逻辑；`readyz` 改为反映真实数据装载。
- D 接入 web 后把 `pnpm dev` 扩展为同时启动 API 与 Web。
- 组长 D1 决策项：中华新韵底本（建议直接采用十四韵规则 + pinyin-data 重建并标注重建表）。

---

# GLM 交付：Web 基础环境（2026-10-17，响应 D 的配置需求）

React 19.3.1 / Vite 8.3.4 / plugin-react 6.1.2（registry 实查锁定）；web 独立 tsconfig（DOM/JSX/Bundler）+ 根 typecheck 双项目串联；根 ESLint 覆盖 TSX 与浏览器环境；vitest 增加 .test.tsx 收集（jsdom/Testing Library/MSW 待 D 提需求后统一加入）；`/api`、`/healthz`、`/readyz` 代理已验证；`src/main.tsx` 占位入口移交 D。验证：`pnpm verify` 全绿（36 测试 + vite build），双服务冒烟通过。明细见 docs/handoffs/0003-web-foundation.md。

---

# B 交付：D1 解析与候选传播（2026-10-17）

分支 `feat/b-d1-readings`（基线 `e549194`，`contract-v1` 仍为 `9b27322`，未改契约）。

- `packages/readings`：实现 `parseText`（分句、码点遍历、UTF-16 半开区间、SHA-256、notice、排版白名单）与
  `resolveReadings`（全候选保留、唯一/歧义/未知、用户覆盖校验、平仄双状态、已审核语境规则的最长匹配与冲突处理）。
- `data/context`：规则格式与 4 条待审核语境（更/重/长/行），**0 条生效规则**，不编造候选 ID 与来源。
- `docs/readings.md`：解析政策、选音优先级、notice/错误码表、实现边界。
- 验证：`pnpm verify` 全绿，**67 个用例**（原 36 + readings 31）；单独 `packages/readings/tests` 31 个用例通过。
- 未做：真实字表接入、生产语境规则、覆盖率/准确率评测。
- **待 GLM**：`packages/readings/package.json` 的 `exports`/`build`/`test` 与 `tsconfig.build.json` 申请
  （当前该包无法按包名被其它包导入）；错误码到 HTTP 状态的映射建议。
- 明细与复现差异见 [`packages/readings/HANDOFF.md`](packages/readings/HANDOFF.md)。
