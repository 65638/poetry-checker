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

分支 `feat/b-d1-readings`（基线 `e549194`，`contract-v1` 仍为 `9b27322`，未改契约）；PR #3（→ `main`，未自行合并）。

- `packages/readings`：实现 `parseText`（分句、码点遍历、UTF-16 半开区间、SHA-256、notice、排版白名单）与
  `resolveReadings`（全候选保留、唯一/歧义/未知、用户覆盖校验、平仄双状态、已审核语境规则的最长匹配与冲突处理）。
- `data/context`：规则格式与 4 条待审核语境（更/重/长/行），**0 条生效规则**，不编造候选 ID 与来源。
- `docs/readings.md`：解析政策、选音优先级、notice/错误码表、实现边界。
- 验证：`pnpm verify` 全绿，**79 个用例**（原 36 + readings 43）；单独 `packages/readings/tests` 43 个用例通过。
- 评审后修复两项：① **统一证据门槛**——凡是进入 `effectiveCandidateIds` 的候选（覆盖/规则/冲突/唯一/歧义全路径）都必须有已审核证据，否则抛 `LOOKUP_EVIDENCE_UNVERIFIED`（数据未就绪，请 GLM 映射 503）；② 语境规则必须引用**存在、已审核且 `kind=context`** 的证据才能选音，否则不参与（新增 notice `CONTEXT_RULE_EVIDENCE_INSUFFICIENT`）。
- 未做：真实字表接入、生产语境规则、覆盖率/准确率评测。
- **待 GLM**：`packages/readings/package.json` 的 `exports`/`build`/`test` 与 `tsconfig.build.json` 申请
  （当前该包无法按包名被其它包导入）；错误码到 HTTP 状态的映射建议。
- 明细与复现差异见 [`packages/readings/HANDOFF.md`](packages/readings/HANDOFF.md)。

---

# 批次合入：B 的解析/选音模块 + 接线（PR #3，2026-10-17）

汇合版本：main `3080a1c` + B `feat/b-d1-readings` `d8b4ecf` + `glm/readings-wiring` `da4e4f7`，双方修改全部保留（两次 merge commit）。GLM 本地复验 `pnpm verify` exit 0：10 个测试文件、135 项测试全过，与 Codex 隔离联合验收结论一致。

本批内容边界：M2 解析与候选传播（B）、readings 包接线与 API 错误映射（GLM，14 个错误码显式映射，503 族统一 DATA_NOT_READY 错误体）。B 的证据门槛三连修（8e48d10 未审核证据不支撑确定读音 → 6e8eb16 显式数据未就绪 → d8b4ecf 堵住用户覆盖/规则选音/歧义保留三条绕过路径）全部包含。

尚未包含：真实韵书字表（A）、体裁（E）、完整格律判定（Codex 下一批）、真实 API 编排（GLM，等前三者就绪）。analyze 仍为 fixture mock。

---

# E 交付：D1 体裁最小分支与金标准审核框架（2026-10-17）

分支 `feat/e-d1-genre`（基线 `main` = `0a94212`；`contract-v1` 仍为 `9b27322`，**未改契约**）。

## 已实现

- `packages/genre/src/classify.ts`：`classifyGenre` 最小可靠分支——用户显式古体、显式近体形式、用户选择近体、
  auto 的形制判定、特征完整度门槛、并列（<0.05）、关键可判率（<0.8）、`quality=needs_review`、排律/超支持形制。
  `selectedTemplateId` 只在“唯一候选且四项特征齐全”时给出；其余一律 `null` 并保留候选。
- `packages/genre/src/errors.ts`：`GENRE_ERROR_CODES` 与 `GenreError`；未实现分支抛 `GENRE_BRANCH_PENDING`
  （`branch=auto-high-confidence`），**不用 uncertain 占位冒充完成**。
- `packages/genre/src/golden-case.ts`：手写 GoldenCase 校验器（不依赖 zod 传递依赖），`approved` 必须有审核人与可解析证据；
  批量校验拒绝重复 `id`；`request` 直接复用冻结的 `AnalyzeRequestSchema`。
- `packages/genre/tests`：fixtures 与 24 项测试（E-D1-01 ~ E-D1-08 + 未实现分支/非法组合/排律/未知字过多/不可变/确定性）。
- `tests/golden/cases/*.json`：登鹳雀楼、静夜思、黄鹤楼三首 **pending** 档案（结构有效、来源待核实、未运行）。
- `data/works/`：候选登记与待审核清单，**0 条 approved**，不加载为元数据。
- 文档：`docs/test-report.md`（运行台账）、`docs/limitations.md`（已知边界）、`tests/integration/acceptance-plan.md`（D2–D5 矩阵，全部未运行）。

## 验证（实际结果）

- `pnpm install --frozen-lockfile` exit 0（271 条锁定项）。
- `pnpm verify` 改动前 exit 0（135 项）；改动后 exit 0（**159 项**，12 个测试文件）。
- `pnpm exec vitest run packages/genre/tests`：2 文件 **24 项通过**。
- `pnpm typecheck` exit 0；`pnpm exec eslint packages/genre` exit 0。
- 环境：Node v24.21.0 / pnpm 11.25.0（任务书要求 24.19.0，`engines >=24 <25` 满足，已记录）。

## 未做 / 待人工核实

- **真实作品：3 首待审核、真实分析 0/3 未运行**（分开报，不因结构校验通过而视为已审核）。
- auto 高吻合自动判定、`approved` 正文指纹匹配（D2）。
- API 接线、错误码映射（GLM）；真实韵书/读音/格律（A/B/Codex）；前端展示（D）。
- 三首正文的权威出处、异文版本、体裁依据、读音依据均待人工核实。

## 待 GLM

1. `packages/genre/package.json` 补 `exports` / `build` / `test` / `dependencies: @poetry/contracts` 与 `tsconfig.build.json`
   （当前该包不能按包名被其它包导入，跨包导入依赖根链接与 tsconfig paths）。
2. `GENRE_BRANCH_PENDING` 到 HTTP 状态的映射建议（应显式“未就绪”，不得捕获为成功或降级为 uncertain）。
3. 若要求 GoldenCase 用 Zod，需为 genre 显式加 `zod` 依赖；当前为手写校验。
