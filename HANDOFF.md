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

## 未完成 / 明确未做

1. 全量三库导入、106/19/14 发布验收、278+60 人工抽样：**0 条人工审核**，全部转 D2。
2. 平水三讲：只有缺口记录与草案，`proposedCharacters: null`（维基文库不可达，拒绝猜字）。
3. 新韵“一”冲突：只登记与分列，未裁决。
4. 十四韵规则权威出处：**未取得**，状态 `unverified`（`er → 十二齐` 也在待核实）。
5. 已提交 `24e42ce` 并推送 `feat/a-d1-lexicon`；草稿 PR 待开（不自行合入）。

## 未验证项（不得当成已通过）

| 项 | 现状 | 为什么不算通过 |
|---|---|---|
| 词林 / 新韵门槛 | CILIN_GATE、XINYUN_GATE 只在合成数据上验证过常量形状（19/33、14/56） | 没有真实快照，门槛从未在真实数据上跑过 |
| 发布包统计 | data/releases/README.md 的「19 部 33 子卷齐全无空卷」「56 子卷 / 41,803 字形」 | 仅为文档断言，无测试覆盖 |
| 七字真实小样本 | 人工审核 0 / 7 | 只做了机器与原表对照，未与韵书权威文本核 |
| 平水 106 部门槛 | 仅有「预期失败」断言 | 三讲正文未取得（unreachable），未真正通过 |
| 新韵十四韵规则 | rulesProvenance.status = unverified | 规则文本、发布机构、版次均未取得 |
| 上游许可 | 仅核对仓库 LICENSE 声明 | 转载字表的上游授权链未核实，不得称“可商用” |

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
