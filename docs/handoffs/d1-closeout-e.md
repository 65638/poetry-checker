# D1 收口与系统功能验收（E）

日期：2026-10-17。执行者：队员 E / DeepSeek。
分支：`feat/e-d1-closeout`（自 `origin/main` `6375b35` 切出）。
环境：Node v24.21.0、pnpm 11.25.0。

## 一、PR #4 收口情况

| 项         | 实际                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #4 状态 | **已合并关闭**：`state=closed`、`merged=true`，draft 标志为 true 但已无意义                                                                             |
| 合并路径   | 我的 `204a163` 经 GLM `glm/genre-wiring@492adfd`（“merge: 同步 E 的交接单 204a163”）进入 `main`，`git merge-base --is-ancestor 204a163 origin/main` → 0 |
| CI         | PR #4 head `204a163` 的「基础检查」= **success**；`main` head `6375b35` 同样 success                                                                    |
| “转 Ready” | **无法执行也不需要**：PR 已合并关闭。未做任何状态改动，避免制造重复记录                                                                                 |

## 二、D1 范围自检

| 任务书要求                                                | 状态                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `classifyGenre` 最小可靠分支 + 错误码 + GoldenCase 校验器 | ✅ 已在 main（`packages/genre/src/*`、`tsconfig.build.json`）                    |
| 三首名篇 pending 档案                                     | ✅ 保持 `pending`，**未改 approved**（结构 3/3、人工审核 0/3）                   |
| 未实现分支显式化                                          | ✅ auto 高吻合抛 `GENRE_BRANCH_PENDING`（branch=`auto-high-confidence`），未冒充 |
| 包配置（exports/build/test/deps）                         | ✅ 由 GLM 在同一批补齐，已在 main；我未改根依赖/lockfile/API 错误映射            |
| 全仓校验（基线）                                          | ✅ `pnpm verify` exit 0：**28 个测试文件、410 项**                               |

## 三、系统功能验收（在 main `6375b35` 上实测）

脚本：`tests/integration/e2e/acceptance-api.py`（Python，**未被 vitest 收集**，见第六节）。
单独执行命令：

```sh
python tests/integration/e2e/acceptance-api.py
```

| 检查项                                               | 实测                                                                         | 结论                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| API `/healthz`                                       | 200 `{"status":"ok"}`                                                        | ✅                                          |
| API `/readyz`                                        | 200 `ready`，含 versions                                                     | ✅                                          |
| API `/api/v1/rhyme-books`                            | 200，3 本书，`groupCount=[0,0,0]`                                            | ⚠️ 数据结构正确但韵部数为 0（fixture-only） |
| 状态 pass（自带正文）                                | 200，`summary=pass`                                                          | ✅                                          |
| 状态 fail（自带正文）                                | 200，`summary=fail`                                                          | ✅                                          |
| 状态 needs_review（自带正文）                        | 200，**`summary=pass`**                                                      | ❌ 未达预期                                 |
| 状态 not_applicable（自带正文）                      | 200，**`summary=pass`**                                                      | ❌ 未达预期                                 |
| 状态 unsupported（自带正文）                         | 200，**`summary=pass`**                                                      | ❌ 未达预期                                 |
| 状态 needs_review（任意未匹配正文 → 默认分支）       | 200，`summary=needs_review`                                                  | ✅ 唯一可达路径                             |
| 422 非法组合（`genreHint=ancient`+`formHint=wujue`） | 422 `VALIDATION_ERROR`，fieldErrors=1                                        | ✅                                          |
| 422 非法韵书（`rhymeBook=not-a-book`）               | 422，fieldErrors=4                                                           | ✅                                          |
| 413 超 2000 码点                                     | 413 `PAYLOAD_TOO_LARGE`                                                      | ✅                                          |
| 503 单字/规则/来源                                   | 3× 503 `DATA_NOT_READY`                                                      | ✅                                          |
| 未知路由                                             | 404（Fastify 默认错误体，无 `error.code`）                                   | ✅（形态不一致，见缺陷 2）                  |
| 数据与规则引用提示                                   | 每份 analyze 响应 `evidence=2`、`rules=1`、`sources=1`、`policy.notice` 非空 | ✅                                          |
| 前端正式入口 `http://localhost:5173/`                | 200，含 `id="root"` 与入口脚本                                               | ✅                                          |
| 前端代理 → 真实 API                                  | 经 Vite：`/healthz` 200 `{"status":"ok"}`、`/api/v1/rhyme-books` 200         | ✅ 端到端通                                 |
| 前端代理 + 后端未启动                                | `/healthz` 502                                                               | ✅ 符合预期                                 |

### 缺陷 1（阻塞 D1 五状态验收）：五类 fixture 只有 2 种正文，三种状态不可达

最小复现：

```sh
cd fixtures/contracts
python -c "import json,hashlib;[print(n, hashlib.sha256(json.load(open(n+'.json',encoding='utf-8'))['poem']['originalText'].encode()).hexdigest()[:12]) for n in ['pass','fail','needs_review','not_applicable','unsupported']]"
# pass/needs_review/not_applicable/unsupported 四者正文哈希相同（ec19829c335c），仅 fail 不同（c178a6fb5f1c）
```

原因：`apps/api/src/server.ts` 按 `fixtureNames = [pass, fail, needs_review, not_applicable, unsupported]` 顺序、以 `poem.originalText === body.text` 选 fixture，四份正文相同 → 永远先命中 `pass`。
影响：HTTP 层**无法**得到 `not_applicable` / `unsupported`；`needs_review` 只能靠默认分支。
归属：`apps/api` 属 GLM（我未改）。

### 缺陷 2（低）：404 错误体与统一错误结构不一致

`/api/v1/unknown-route` 返回 Fastify 默认 `{message,error,statusCode}`，没有契约里的 `error.code`/`error.fieldErrors`；前端若要统一处理需特判。

### 缺陷 3（低）：analyze 5 类 fixture 的 `genre.basisType` 恒为 `user`

五份 fixture 的体裁都写成“用户指定”（`basisType=user`），因此 HTTP 层**无法**覆盖 `reviewed_metadata` / `heuristic` 两种 basisType。

## 四、未检查项（不具备条件，明确不计为通过）

| 项                                                                     | 原因                                                            | 补救                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| **浏览器发起 HTTP 请求到 API**                                         | 仓库无浏览器自动化（无 Playwright/Puppeteer），我无浏览器可驱动 | 需 GLM 加 Playwright（见第六节）或人工点一次并截图 |
| **375px 移动端操作**                                                   | 同上，无法设置视口                                              | 同上                                               |
| **前端本地输入拦截 vs 后端 422**                                       | 后端 422 已实测；前端本地拦截需浏览器交互                       | 同上                                               |
| **三仄尾 warning / 不适用 / 不支持 / needs_review 在 UI 不混成“通过”** | 需浏览器看真实渲染                                              | 同上                                               |
| 真实韵书、真实读音、完整格律                                           | 数据与引擎未就绪                                                | 属 A/B/Codex                                       |

说明：`pnpm dev:web` 的根 HTML 与代理链路已实测通过，但**页面内 React 请求、状态渲染、移动端布局均未验证**，不能据此宣称闭环。

## 五、结论：功能首版**未通过** D1 系统验收

- 通过：正式入口、代理端到端、API 契约状态码（422/413/503/404）、引用提示（evidence/rules/sources/notice）、pass 与 fail 两状态。
- 未通过：**五状态中 3 态 HTTP 不可达**（缺陷 1），**9 项浏览器类检查未执行**。
- 因此按指令口径，D1 只能记“**部分通过，阻塞项明确**”，不记“功能首版通过”；也不记任何“用户满意/视觉通过”。

## 六、给 GLM 的两项请求

1. **五状态可达性**：让 `fixtures/contracts/{needs_review,not_applicable,unsupported}.json` 使用各自不同的正文（或改为按显式 query/header 选择 fixture 的开发入口），否则 HTTP 层无法验收五状态。
2. **浏览器检查**：为 `apps/web` 增加 Playwright（devDependency + `tests/e2e` 收集配置 + 独立脚本），或指定人工验收步骤；我可在配置就绪后补写场景。
   另：`tests/integration/e2e/acceptance-api.py` 是 Python 脚本，**不会被 `vitest` 收集**，当前只能靠上面的单独命令执行；是否要改成 TS 用例由组长裁定。

## 七、D2 状态：阻塞（未开始实现）

指令指定的核心基线 `b5457e4`（交接 HEAD `14df990`）**在本仓库不可达**：

```
git rev-parse b5457e4  → fatal: Needed a single revision
git rev-parse 14df990  → fatal: Needed a single revision
```

`origin/main` 上的 `matchTemplates` 仍只有 `toneFit`，`relationFit/rhymeFit` 为空。故 D2 的
“featuresComplete 只要求前三特征 / 高吻合分支 / 多候选选模”缺少可验证前提，**未开始**，以免凭合成假设实现再返工。
请求：把核心交付推送为分支（或提供交付包路径），我按指令第二批实现并用 `core-genre-probe.mjs --expect-ready` 实跑。

## 八、回传摘要

- PR 状态：**#4 已 merged/closed**，CI success；无需转 Ready。
- 基线 SHA：`6375b35`（`main`）；本分支 `feat/e-d1-closeout`。
- 已检查：API 契约（healthz/readyz/rhyme-books、pass、fail、422×2、413、503×3、404、引用提示）、前端入口、代理端到端。
- 未检查：浏览器发起请求、375px、前端本地拦截、UI 状态不混、真实数据。
- 最小复现：fixtures 正文哈希 `ec19829c335c` 重复（缺陷 1）；`git rev-parse b5457e4` 失败（D2 阻塞）。
- 是否通过功能首版：**未通过**（3 态不可达 + 9 项浏览器检查未执行）。
