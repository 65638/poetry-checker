# 首批工程底座交付记录

> **当前排期已转D4（2026-10-20）**：[D4总控](docs/team/D4_执行任务书_2026-10-20/00_组长先看_总控与历史迁移.md)。组长要求D3及以前全部遗留统一进入D4，暂停新UI；Codex接GLM总集成。此轮只生成任务包并复跑API起点，没有执行代码合并、基线发布或新数据批准。远端本次fetch为main@05e1acb、codex/d3-b-integration@7918281；本地完整工作基线4d39037；以下旧main与进度描述保留为历史。

> **D3 D/E 最新接管复验**：733项通过；浏览器18/0/0，三首示例、选音重查、失败/进行中导出限制已完成；HTTP仍3/6/0，D3未收口。见 [交接](docs/handoffs/d3-de-takeover-codex.md)。以下为此前各批记录。

> **D3 A 修复（2026-10-19）**：六部误批已撤回，保留83候选+三讲；平水 review4、词林 clean1。全仓711项通过，真实九格3/6/0，48条新候选仍待批准。详见 [A 修复交接](docs/handoffs/d3-a-repair-codex.md)。

> **当前状态（2026-10-19，Codex 集成复核）**：本文按交付批次追加，以下 D1 段落为历史。
> `main@f42172f` 包含 D1/D2 交付，PR #11 已合并。D3 工作位于 `integrate/d3` 及其上游待合批次 `codex/d3-b-integration`（PR #16），尚不等于已进入 main。
> D3 特例已接入 orchestrator，真实 HTTP 已验证平水《黄鹤楼》限定尾式为 `not_applicable/info`，其他偏离保留。C 的 PR #14 新增收尾提交 `8dcec2c`、`803e52a` 已纳入本集成分支。
> 三首 golden 的 approved 仅覆盖已有正文/体裁等断言；词林、新韵六格仍有数据阻断，不能宣告 D3 全部完成。
> 当前 C 复核见 [`docs/handoffs/d3-c-closeout-review-codex.md`](docs/handoffs/d3-c-closeout-review-codex.md)；E 第三批已新增复制/导出与键盘验收，最新实跑 703 项 / 浏览器 11 通过、1 阻断，详见 [`docs/handoffs/d3-e-third-review-codex.md`](docs/handoffs/d3-e-third-review-codex.md)。

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

## 待办（按任务书；以下为 D1 期记录，2026-10-19 全部标为历史）

- **【历史】** API 真实编排：A/B/C/E 模块就绪后按契约第 4 节顺序接入，替换 mock 选 fixture 逻辑；`readyz` 改为反映真实数据装载。
  → 已由 D2 的 GLM 批次落地（真实六步编排，`analyze` 不再是 fixture mock）。
- **【历史】** D 接入 web 后把 `pnpm dev` 扩展为同时启动 API 与 Web。
  → 已由 `scripts/dev.mjs` 提供一条命令双边启动。
- **【历史】** 组长 D1 决策项：中华新韵底本（建议直接采用十四韵规则 + pinyin-data 重建并标注重建表）。
  → 已按该口径重建并在数据文档标注，归 A 的 D1/D2 数据侧结论。

---

# GLM 交付：Web 基础环境（2026-10-17，响应 D 的配置需求）

React 19.3.1 / Vite 8.3.4 / plugin-react 6.1.2（registry 实查锁定）；web 独立 tsconfig（DOM/JSX/Bundler）+ 根 typecheck 双项目串联；根 ESLint 覆盖 TSX 与浏览器环境；vitest 增加 .test.tsx 收集（jsdom/Testing Library/MSW 待 D 提需求后统一加入）；`/api`、`/healthz`、`/readyz` 代理已验证；`src/main.tsx` 占位入口移交 D。验证：`pnpm verify` 全绿（36 测试 + vite build），双服务冒烟通过。明细见 docs/handoffs/0003-web-foundation.md。

---

# A 交付：D1 韵书来源、缺部检查与查询入口（2026-10-17）

执行者：队员 A 的 DeepSeek。基线：本地 `feat/a-d1-lexicon` 从 `main` 的 `3080a1c`（C 的 PR #1 已合入；任务书写的 `e549194` 已被新提交推进，`contract-v1` 仍为 `9b27322`，未改动）。

## 交付了什么

| 路径                                                  | 内容                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/lexicon/src/index.ts`                       | 导出 `lookupCharacters`（签名与冻结契约一致）＋ `createLexicon` / `registerSnapshot` / `deserializeSnapshot`                                        |
| `packages/lexicon/src/lookup.ts`                      | 显式版本注册、批量去重、码位稳定排序、多候选保留、引用收集、`LookupResultSchema` 出站校验、`LexiconError`                                           |
| `packages/lexicon/src/snapshot.ts`                    | 快照定义与 **引用完整性**校验（悬空 evidence / group / source 一律拒绝）                                                                            |
| `packages/lexicon/src/completeness.ts`                | 三套门槛（平水 106 部逐字比对 / 词林 19 部 33 子卷 / 新韵 14 韵 56 子卷）＋ `checkCompleteness`                                                     |
| `packages/lexicon/src/xinyun/`                        | 十四韵规则表、拼音正规化（调号/ü/jqx/yw/iu-ui-un/舌尖元音）、归部                                                                                   |
| `packages/lexicon/src/adapters/chinese-word-rhyme.ts` | 原表 → 快照的纯函数导入（不改写、不补缺部、不补反切义项）                                                                                           |
| `packages/lexicon/src/digest.ts`                      | 规范化 + SHA-256 业务内容摘要（下载时间不入摘要）                                                                                                   |
| `packages/lexicon/tests/`                             | `fixture.test.ts`、`completeness.test.ts`、`xinyun.test.ts`、`reproducibility.test.ts`、`real-sample.test.ts`、`fixtures.ts`，覆盖 A-D1-01～A-D1-10 |
| `scripts/data/fetch-sources.ts`                       | 下载与导入分开；按 manifest 摘要比对，不符即拒写                                                                                                    |
| `scripts/data/inspect.ts`                             | 读取本地快照做统计与缺口报告（只读）                                                                                                                |
| `scripts/data/build-sample.ts`                        | 生成真实七字小样本（可重复，摘要稳定）                                                                                                              |
| `scripts/data/rebuild-xinyun.ts`                      | 新韵重建覆盖 / 未映射 / 冲突报告；`--full` 另存全表                                                                                                 |
| `data/sources/manifest.json`                          | 4 个来源：URL、固定提交/标签、许可线索、字节数与 SHA-256、上游待核实项、不可达记录                                                                  |
| `data/raw/`                                           | 8 个原样快照（平水/词林/新韵粗分/新韵四声/两份 LICENSE/上游 README/pinyin.txt）＋ 说明                                                              |
| `data/normalized/`                                    | 真实七字小样本（`unverified`）＋ 命名与生成说明                                                                                                     |
| `data/patches/`                                       | 三讲缺部草案、新韵“一”冲突草案（均 `draft` / `unverified`，未发布）                                                                                 |
| `data/releases/`                                      | 只有 README，明确**当前无发布包**                                                                                                                   |
| `docs/data-provenance.md`、`docs/data-quality.md`     | 来源与实际统计、缺口、冲突、抽样队列、风险                                                                                                          |
| `packages/lexicon/README.md`                          | 调用方式、可用 `dataVersion`、错误码、门槛、命令                                                                                                    |

## 实际基线（实跑，不是转述）

- 平水：5 卷 / **105 部**（上平 15、下平 15、**上 28**、去 30、入 17），缺**上声三讲**；原表条目 10,671 → 去重候选 10,378；字形 8,232；多归部字形 1,823；85 个韵部存在同字内部重复。
- 词林：19 部 / 33 子卷 / 归属 5,575 / 字形 5,037 / 无空卷；仄声一律 `ze_unspecified`。
- 新韵候选表（仅对照）：14 韵 / 56 子卷 / 归属 7,693 / 字形 6,730；“一”= 十二齐·阴平 + 十二齐·去声（冲突单列）。
- 新韵重建表：读音源 41,923 字形 / 53,457 读音 → 已归部 53,414、未映射 43、轻声丢弃 241、`er` 规则待核实影响 104；覆盖 41,803 字形 / 56 子卷全非空；业务内容摘要 `5e9bbd0a…b2ce84`。
- 七字真实小样本：业务内容摘要 `1ec87329…617ab8`，重复生成一致；逐字归部与源表一致（白=入声十一陌、一=入声四质、更=八庚+二十四敬、流/楼=十一尤、雪=入声九屑、物=入声五物）。

## 测试与验证（用户本机终端实跑，2026-10-17，vitest 5.0.5）

- 包内测试：`pnpm exec vitest run packages/lexicon/tests` → Test Files 5 passed (5)、Tests 66 passed (66)，覆盖 A-D1-01～A-D1-10。
- 全仓回归：`pnpm test` → Test Files 12 passed (12)、Tests 149 passed (149)，未造成 contracts/prosody/api 回归。
- 类型检查：`pnpm typecheck` → 0 错误（含 apps/web/tsconfig.json 第二条 tsc）。
- 静态检查：`pnpm lint` → 0 问题；`pnpm check:generated` → 8 个契约/模板核对通过，无漂移。
- 来源摘要复核：`node scripts/data/fetch-sources.ts --check` → 8/8 与 manifest 一致，0 不一致。
- 数据脚本实跑：inspect / build-sample / rebuild-xinyun 均实际运行，统计数字见上文。
- 人工审核：**0 条**（七字小样本仅机器对照），不因测试通过视为已审核。
- “数据门槛失败（平水 105/106）”与“检查器测试通过”是两件事：前者是数据事实，后者是代码行为。

## 人工核验（2026-10-17，队员 A 本人执行）

### 七字抽检：7/7 已人工核验

| 字  | 核验来源 | 人工结论                                     | 与系统判定一致 |
| --- | -------- | -------------------------------------------- | -------------- |
| 更  | 搜韵网   | 下平八庚（平）+ 去声二十四敬（去），两读并存 | ✅             |
| 白  | 搜韵网   | 入声十一陌                                   | ✅             |
| 一  | 搜韵网   | 入声四质                                     | ✅             |
| 流  | 搜韵网   | 下平十一尤                                   | ✅             |
| 楼  | 搜韵网   | 下平十一尤                                   | ✅             |
| 雪  | 搜韵网   | 入声九屑                                     | ✅             |
| 物  | 搜韵网   | 入声五物                                     | ✅             |

- 「更」的平/去两读经人工确认。代码侧两条候选均保留、互不覆盖：
  `pingshui:更:ping:八庚` 与 `pingshui:更:qu:二十四敬`（`data/normalized/pingshui.sample-d1.json`），
  由 A-D1-02 断言（`packages/lexicon/tests/fixture.test.ts:66`「更的平声与去声候选同时保留，不互相覆盖」），
  在 66 项测试中通过。
- 核验来源为搜韵网，**人工网页查阅，非机器抓取**：该站未登记进 `data/sources/manifest.json`，
  不进入 `data/raw`，也不参与 `snapshotSha256` 覆盖。
- 与原表 `chinese_word_rhyme` 固定提交逐字一致（八庚段起 3387 行、二十四敬段起 8490 行等）。

### 上声三讲补缺：9 字已人工肉眼核实并补录，oldid 已取得，但**未定稿生效**

- 已由人工在维基文库网页端**肉眼核实**并补录 9 字：讲、港、棒、蚌、项、缿、玤、傋、耩
  （`data/patches/pingshui-shang-sanj-jiang.draft.json` → `proposedCharacters`）。
- **已获取并填入维基文库对应页面的修订号（oldid）：8264804**
  （固定链接 `https://zh.wikisource.org/w/index.php?oldid=8264804`）。
- 因此补丁维持 `status: draft`、`reviewStatus: unverified`，**未生效、未进 `data/releases`**；
  平水仍按 **105/106** 记录，`releaseGatePassed` 仍为 `false`。
- 后续：保存 wikitext 快照到 `data/raw/wikisource/` → 重跑 `scripts/data/inspect.ts`
  确认 15+15+29+30+17=106 且三讲非空 → 人审签后才可改 `reviewStatus`。

## 未完成 / 明确未做

1. 全量三库导入、106/19/14 发布验收：**0 条发布级审核**，全部转 D2；人工抽样已完成 7 条（七字），
   其余 278+60 队列未开始（当前 7/338）。
2. 平水三讲：9 字已由人工肉眼核实并补入草案，oldid 已取得（8264804），但补丁仍
   `draft`/`unverified`、未生效；平水仍记 105/106（见「人工核验」节）。
3. 新韵“一”冲突：只登记与分列，未裁决。
4. 十四韵规则权威出处：**未取得**，状态 `unverified`（`er → 十二齐` 也在待核实）。
5. 已提交 `24e42ce` 并推送 `feat/a-d1-lexicon`；草稿 PR 待开（不自行合入）。

## 未验证项（不得当成已通过）

| 项              | 现状                                                                           | 为什么不算通过                                      |
| --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| 词林 / 新韵门槛 | CILIN_GATE、XINYUN_GATE 只在合成数据上验证过常量形状（19/33、14/56）           | 没有真实快照，门槛从未在真实数据上跑过              |
| 发布包统计      | data/releases/README.md 的「19 部 33 子卷齐全无空卷」「56 子卷 / 41,803 字形」 | 仅为文档断言，无测试覆盖                            |
| 七字真实小样本  | 人工审核 7 / 7（搜韵网，2026-10-17）                                           | 只与搜韵网核对，未与《平水韻》权威文本逐字对照      |
| 平水 106 部门槛 | 三讲 9 字已人工肉眼核实并补入草案，oldid 8264804 已取得                        | 补丁仍 draft/unverified，未生效，106 未真正校验通过 |
| 新韵十四韵规则  | rulesProvenance.status = unverified                                            | 规则文本、发布机构、版次均未取得                    |
| 上游许可        | 仅核对仓库 LICENSE 声明                                                        | 转载字表的上游授权链未核实，不得称“可商用”          |

## 执行环境限制与需要人工处理的事项

1. **原检出目录已消失**：开工时的 `D:\新建文件夹 (2)\poetry-checker` 现已不存在；本次落盘目标为 `D:\a\poetry-checker`（`feat/a-d1-lexicon`，本批从 `3080a1c` 起，现 HEAD `24e42ce`，已装 `node_modules`）。
2. **AI 执行环境无法访问 GitHub**（TLS 叶子证书校验失败：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`，schannel 侧 `SEC_E_NO_CREDENTIALS`）；实际推送由用户终端完成，已成功（`24e42ce` 已在 `origin/feat/a-d1-lexicon`）。来源快照取回因此改用 jsdelivr 的同一固定 ref，并用“提交/标签双侧摘要一致”约束内容。
3. **维基文库不可达**（`UND_ERR_CONNECT_TIMEOUT`），《平水韻》《詞林正韻》正文与修订号未取得，记为 `unreachable` / 未核实。

## 给 B

- 入口：`lookupCharacters({ characters, rhymeBook, dataVersion })`，返回 `LookupResult`（用 `LookupResultSchema` 校验过）。
- 可用 `dataVersion`：`sample-pingshui-cwr-ff0e9c1-d1`（真实七字小样本，`unverified`）。测试用 `fixture-lexicon-d1` / `fixture-lexicon-xinyun-d1`（合成，不得当判音依据）。
- ID 规则：候选 `pingshui:<字>:<声类>:<韵目>`；韵部 `group:<book>:<卷>:<韵目>`；证据 `ev:<book>:<卷>:<韵目>`；来源 `src:chinese_word_rhyme` / `src:pinyin-data`。
- `missing` 只给未收录字，**不会**补默认平仄或拼音；`candidates` 保留全部多读多部，同一字可能平仄不同——需要你按语境消歧，我不替你挑“更”的读法。
- 所有候选目前 `fanqie`/`gloss`/`modernReading` 为 `null`，别把缺证当成“无此读法”。

## 给 GLM（需要你接线，**尚不可执行**）

1. **`packages/lexicon/package.json` 已知缺口**：目前只声明了 `name`/`version`/`private`/`type`，**没有**
   - `dependencies`: `@poetry/contracts`（`workspace:*`）
   - `exports`: `{ ".": { types, development: "./src/index.ts", import: "./dist/index.js" } }`
   - `scripts`: `build`（`tsc -p tsconfig.build.json`）、`test`（`vitest run --root ../.. packages/lexicon/tests`）
   - `tsconfig.build.json`

   后果：`import "@poetry/contracts"` 现在**只有在仓库根目录运行时**才能解析（靠根 `node_modules/@poetry/contracts` 的
   workspace 链接）；一旦把包单独发布/单独安装，解析会失败。`pnpm --filter @poetry/lexicon test` 也**还不存在**。
   需 GLM 补依赖、exports、脚本与编译配置后，本包的测试/构建才算接线完成。

2. 根命令 `data:build` / `data:check` 还不存在，需在脚本落地后接线；不要把本文件里的命令写成“已经可用”。
3. `/api/v1/rhyme-books` 与 `/api/v1/characters/{char}` 的实测：数据未达发布门槛前应继续 503，`readyz` 不要因本批数据变 ready。
4. 新韵对外文案请使用“中华新韵（十四韵，项目重建表，非官方原始字表）”。
5. 运行入口：测试 `pnpm exec vitest run packages/lexicon/tests`；脚本需 `tsx` 或 Node 24 原生类型剥离，
   且**从仓库根目录**执行（`node --conditions=development scripts/data/{inspect,build-sample,rebuild-xinyun}.ts`，
   或 `pnpm exec tsx scripts/data/<script>.ts`）。

## D2 第一步

取得维基文库《平水韻》三讲正文与修订号（有网环境）→ 出补丁差异并人审 → 让平水达到 106 部且逐部非空；同时把 `chinese_word_rhyme` 原表全量导入成发布候选（词林 19 部、新韵重建 56 子卷），再接 `data:build` / `data:check` 与 278+60 抽样。

---

三讲正文与修订号已取得（oldid `8264804`，9 字已人工肉眼核实并补录，但 wikitext 快照与许可页脚转录未完成，补丁仍 draft/unverified）→ 出补丁差异并人审 → 让平水达到 106 部且逐部非空；同时把 `chinese_word_rhyme` 原表全量导入成发布候选（词林 19 部、新韵重建 56 子卷），再接 `data:build` / `data:check` 与 278+60 抽样。

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

---

# E 追加：D2 已审核正文指纹匹配（2026-10-17）

同一分支 `feat/e-d1-genre` 追加提交（未改契约、未触碰他人路径）。

## 已实现

- `packages/genre/src/fingerprint.ts`：`normalizeForFingerprint`（只保留汉字，去标点/空白，**不**做简繁转换与异文归并）
  与 `fingerprintText`（规范化后 SHA-256）；`isHanCharacter` 与解析侧同判定、不引入跨包依赖。
- `classifyGenre` 规则 3 落地：`approved` 元数据按 `approvedTextFingerprints` 精确匹配——
  - 命中 1 条 → 采用其 formFamily/formId/historicalTags，`basisType=reviewed_metadata`，透传 `evidenceIds`；
  - 命中多条 → `uncertain` 并列出命中 id（疑似异文/重复登记），交人工裁定；
  - 无命中但有 approved 元数据 → 明确写入 reasons：“指纹与本诗不一致，未作为识别依据”；
  - `unverified` 元数据一律不参与；用户显式选择优先于元数据。

## 验证

- `pnpm exec vitest run packages/genre/tests`：**29 项通过**（D1 的 24 + 指纹 5）。
- `pnpm verify` exit 0：12 文件 **164 项**；`typecheck` / `prettier --check` 通过。

## 仍待

- 真实作品分析 0/3 未运行；异文规则、指纹版本管理、真实语料接入未做。
- 高吻合自动判定分支仍抛 `GENRE_BRANCH_PENDING`（等核心补齐 relationFit/rhymeFit 与样本校准）。
- 包配置与 API 接线仍待 GLM。

## 交接单

给组长的验收单（交付清单、行为规格、决策项、GLM/C 请求、复现步骤、回滚）见
[`docs/handoffs/0005-e-genre-d1.md`](docs/handoffs/0005-e-genre-d1.md)；对应 PR
[#4](https://github.com/65638/poetry-checker/pull/4)（draft）。

---

# B 交付：D2 真实数据联调与语境规则准备（2026-10-17）

分支 `feat/b-d2-context`（基线 `main = 6375b35`，D1 已合入），PR #8（draft）。保留 D1 全部实现与证据门槛。

- **真实数据复现**：`packages/readings/scripts/d2-coverage.ts` 用 A 的 `sample-pingshui-cwr-ff0e9c1-d1`
  （7 字真实快照）对三首固定正文跑 parse → lookup → resolve。
- **覆盖报告（带分母）**：`data/context/d2-coverage-report.json` / `.md`。96 字位中 8 字位有候选、88 字位缺字；
  登鹳雀楼与黄鹤楼因证据未审核抛 `LOOKUP_EVIDENCE_UNVERIFIED`，静夜思全字缺收故正常返回全 `unknown`。
- **待审队列接真实候选 ID**：`data/context/review-queue.json` 中「更」写入两个真实候选
  （`pingshui:更:ping:八庚` / `pingshui:更:qu:二十四敬`）；义项→候选仍是待审假设，`selectCandidateIds` 留空。
- **最小注入样例给 GLM**：`data/context/injection-example.md`，说明 `kind=context` 证据与来源必须并入 `lookup`。
- **测试**：新增 `tests/real-pingshui.test.ts`（6 条真实数据用例）与 2 条 B2-04 规则匹配用例；
  `pnpm --filter @poetry/readings test` → 3 文件 / 51 用例通过。
- **真实语境规则 approved 数仍为 0**：`rules.approved.json` 未创建，不把待审条目算成覆盖。
- 未做：全量字表、留出评测与准确率、分词/同义匹配。
- 明细见 [`packages/readings/HANDOFF.md`](packages/readings/HANDOFF.md) 第 11–16 节。

---

本批尚未包含：真实韵书字表（A 的 D1 见本文件「A 交付：D1」节，随 A 的 PR 合入）、体裁（E）、完整格律判定（Codex 下一批）、真实 API 编排（GLM，等前三者就绪）。analyze 仍为 fixture mock。

---

# E / D2 首批：作品元数据与《静夜思》版本决策（2026-10-18）

完成：
- 定《静夜思》正文版本：采用《唐诗三百首》系统（`床前明月光，疑是地上霜。举头望明月，低头思故乡。`），
  指纹 `9d68fef608c1ae6010cfc3ddd7fb2429e60a861bab8c6453874c2adb16d0bdef`；
  固定古绝身份：`formFamily=ancient`、`formId=null`、`historicalTags=["古绝","五言古体"]`、近体适用性 `not_applicable`。
- 登记异文：宋刊《李太白文集》系统（`床前看月光…举头望山月`），指纹
  `cc9d8fe1bcac368b135aa6a47c10d5676f0f6d5e57a021b478d57dcd89589826`；两版同为 20 字、差两处（明→看、明→山），
  **不合并、不进 approvedTextFingerprints**。
- 三首元数据草案 + 版本说明 + 异常清单 + 9 项机器验收用例。

修改文件：
- `data/works/metadata.json`（新增，3 条 unverified 裸数组）
- `data/works/versions.md`（新增，正文/版本/异文/指纹/待核实）
- `data/works/anomalies.md`（新增，G-101～G-108）
- `data/works/README.md`、`data/works/review-queue.json`（更新）
- `packages/genre/tests/works-metadata.test.ts`（新增 9 项）
- `tests/integration/e2e/print-work-fingerprints.ts`（新增，指纹复算脚本）

未完成：
- J05 选模修复、J11 集成测试文件：**未开始**——任务书压缩包内无 J 编号定义，且核心基线 `b5457e4`/`14df990` 仍不在仓库，无法按新核心实现选模。需组长给 J 清单与核心分支。
- 三首正文版次/页码（evidenceIds 仍为空）、古绝与特殊拗律的文献依据、乐府标签是否启用。
- 高吻合自动判定（G-101）仍抛 `GENRE_BRANCH_PENDING`。

异常清单：见 `data/works/anomalies.md`（G-101 高吻合未实现、G-102 版本冲突已决策、G-103 特殊拗律、G-104 证据全空、G-105 特征不全、G-106 古绝与五绝同形、G-107 乐府标签、G-108 异文同字数）。

运行命令与真实结果：
- `pnpm exec vitest run packages/genre/tests` → 3 文件 **38 项通过**（新增 works-metadata 9 项）
- `pnpm verify` → exit 0，29 文件 **419 项通过**
- 指纹复算：`node node_modules/tsx/dist/cli.mjs tests/integration/e2e/print-work-fingerprints.ts`

下一步：
1. 组长签字确认《静夜思》版本决策与古绝定性 → GLM 生成正式 `metadata.json`（approved + evidenceIds）。
2. 给 J05/J11 的清单与核心分支，我按第二批指令实现选模修复与集成测试。
3. 补齐三首出处版次页码后，三首档案才可转 approved。

需要组长决策：
- 《静夜思》采用《唐诗三百首》系统是否确认（影响 GLM 生成 metadata.json）。
- 「乐府旧题」是否写入 `historicalTags`（AGENTS 第 5 条：乐府标签与形式分开）。
- J05/J11 的定义与优先级。
