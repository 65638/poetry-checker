# D3 系统验收交接（E）

> 下方第一至十节为首批历史；第二批见文末。Codex 对 PR #17@31072cd 的接收范围、台账校正与后续任务见 [第二批复核](d3-e-second-review-codex.md)。第二批是复跑与台账交付，尚未新增 E05–E08 场景代码。

日期：2026-10-18。执行者：队员 E / DeepSeek。
基线：`main @ f42172f`（release：三张工程口径规则卡升 approved）。分支：`feat/e-d3-system-acceptance`。
环境：Node **v24.21.0**（任务书要求 24.19.0，`engines >=24 <25` 满足，差异已记录）、pnpm 11.25.0。

## 一、本轮实际结果

| 命令                                                       | 结果                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `node tests/integration/e2e/d3-acceptance-api.mjs --spawn` | 九格：**通过 2 / 阻断 6 / 判错 1**；退出码 1（有真实判错） |
| `pnpm verify`                                              | **exit 0**，45 文件 **591 项**通过                         |
| `eslint tests/integration`                                 | exit 0                                                     |

## 二、九格结果（真实 HTTP，2026-10-18 实跑）

| 作品     | 平水                                | 词林     | 新韵     |
| -------- | ----------------------------------- | -------- | -------- |
| 登鹳雀楼 | 通过 200 / pass / wujue / ev=302    | 阻断 503 | 阻断 503 |
| 静夜思   | 通过 200 / not_applicable / ancient | 阻断 503 | 阻断 503 |
| 黄鹤楼   | **判错** 200 / fail / qilv / ev=302 | 阻断 503 | 阻断 503 |

术语分开记：**阻断 ≠ 判错**。503 `DATA_NOT_READY` 是数据未就绪（A/GLM），不是判定错误；
判错只有一格（黄鹤楼平水三平尾），责任在格律核心。

## 三、金标准新增独立断言（平水《黄鹤楼》）

不只看 `formId`/`summary`，脚本对该格额外断言五项：

| #   | 断言                                          | 结果                  |
| --- | --------------------------------------------- | --------------------- |
| A1  | 七律身份 `regulated` + `qilv`                 | 通过                  |
| A2  | PPP 成立：`l4c5/l4c6/l4c7`（空悠悠）皆平      | 通过                  |
| A3  | `TAIL.SANPING` 在第 4 句不得为 `error`/`fail` | **失败**（现为 fail） |
| A4  | 该特例检查带 `evidenceIds`                    | 通过                  |
| A5  | 其他偏离保留：`summary` 不得 `pass`           | 通过（fail）          |

A3 依据：`docs/reviews/13_J03…` 第 8 条「空取平声；三平尾成立，作古风式律诗特征保留，**不判出律**」。

## 四、runner 执行方法

```sh
node tests/integration/e2e/d3-acceptance-api.mjs --spawn
node tests/integration/e2e/d3-acceptance-api.mjs --api-url http://127.0.0.1:3000 --out /tmp/d3.json
```

- `--spawn`：自起 `apps/api/src/server.ts`，**随机空闲端口**（不占 3000），只杀自己起的进程。
- `--api-url`：连已运行服务；`--timeout-ms` 默认 20000；失败退出码 1。
- 结果 JSON：`tests/integration/e2e/d3-acceptance-last.json`，含时间、API URL 的 SHA、模式、数据版本、Node 版本、逐格 issues。
- **未纳入 `pnpm verify`**（verify 只跑 vitest 套件）；因此九格结果需单独执行。若要进 CI，需 GLM 加 `pnpm test:acceptance`。
- `pnpm test:acceptance` / `pnpm test:e2e` **目前不存在**，GLM 添加前不得宣称可运行。
- 旧 D1 mock 脚本已改名为 `d1-mock-api.py` 并加历史横幅，**不要用它对真实模式做验收**。

## 五、证据状态：浏览器 vs 手工（必须分开）

| 类型             | 状态       | 说明                                                                      |
| ---------------- | ---------- | ------------------------------------------------------------------------- |
| 自动化 API 验收  | **已运行** | 九格 + 五条黄鹤楼断言，结果见上                                           |
| 自动化浏览器验收 | **未运行** | 仓库仅有 `tests/e2e/README.md`，D 的 Chrome/CDP 脚本未入库；无 Playwright |
| 人工浏览器操作   | **未做**   | E04–E08 全部未覆盖                                                        |

**不得**把 API 200 或根 HTML 200 写成「页面闭环通过」。

## 六、失败复现（最小）

```sh
node tests/integration/e2e/d3-acceptance-api.mjs --spawn
# 期望输出：[FAIL] 黄鹤楼 / pingshui … 三平尾被判 fail，但 13 号第 8 条要求不判出律
```

其余六格：

```sh
# 任选古体/近体，切 cilin 或 xinyun
node tests/integration/e2e/d3-acceptance-api.mjs --spawn | grep BLOCKED
# 期望：6 行 BLOCKED，错误码 DATA_NOT_READY
```

## 七、D1 旧结论的三栏对照（保留历史，不当作当前状态）

| D1 项                                               | 现在                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 缺陷 1：五类 fixture 仅 2 种正文 → 三态 HTTP 不可达 | **已替代**：真实 API 下三首可区分 pass / not_applicable / fail；`unsupported` 仍需受控替身（E07） |
| 缺陷 2：404 无统一错误体                            | **仍存在**（本轮未复测，待 GLM）                                                                  |
| 缺陷 3：fixture `basisType` 恒 `user`               | **已替代**：真实 API 返回真实 `basisType`                                                         |
| 浏览器类 9 项未检查                                 | **仍存在**（D3-B4）                                                                               |

## 八、阻断与交接

| ID      | 阻断                                                                        | 责任      | 需要什么                                                                            |
| ------- | --------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| `D3-B1` | 词林/新韵六格 503                                                           | A + GLM   | 数据入库并装载后重跑同一脚本                                                        |
| `D3-B2` | 黄鹤楼平水三平尾被判 fail                                                   | **Codex** | 修 `TAIL.SANPING` 特例；A3 应变绿                                                   |
| `D3-B3` | `/readyz` 无 `versions`                                                     | GLM       | 返回三库 `dataVersion`；否则只能记「模式未声明」                                    |
| `D3-B4` | 无浏览器 runner                                                             | GLM + D   | 0.5h 内定：优先把 D 的 Chrome/CDP 脚本整理成 `tests/e2e/d3-browser.mjs`；避免双框架 |
| `D3-B5` | 「09 号验收表」「作品 review-closure」「三首 canonical 金标准」未在仓库找到 | 组长/GLM  | 给路径或补入库；本轮以 13 号裁定 + `data/works/` + `tests/golden/cases/` 代替       |

## 九、D4 未完项（本批不做）

- E04–E06、E08、E09 的浏览器/人工验收（依赖 D3-B4）。
- E10 的对照用例：需补「普通近体 PPP 仍 error」的合成用例（当前只有特例侧）。
- E02 九格补齐（依赖 D3-B1）；288 字位逐字表（依赖词林/新韵取到 tokens）。
- E07 的受控替身需明确标注为合成，不能混报真实语文学结论。

## 十、变更路径

- 新增 `tests/integration/d3-acceptance.md`（当前矩阵）
- 新增 `tests/integration/e2e/d3-acceptance-api.mjs`（九格 runner）
- 新增 `tests/integration/e2e/d3-acceptance-last.json`（最近一次结果，含 SHA/时间）
- 改名 `tests/integration/e2e/acceptance-api.py` → `d1-mock-api.py`（历史）
- 修改 `tests/integration/acceptance-plan.md`（顶部标历史）

---

# D3 第二批（2026-10-19，基线 origin/codex/d3-b-integration @ f6b52ef）

Codex 按组长授权接管 apps/api 就绪诊断、根命令与验收基础设施；E 改为在其交付上追加场景，不再维护第二套 runner。

## 实跑结果

| 命令                   | 结果                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `pnpm verify`          | exit 0，**50 文件 / 684 测试**                                  |
| `pnpm test:acceptance` | exit 2，**3 通过 / 6 阻断 / 0 判错**                            |
| `pnpm test:e2e`        | exit 2，**9 通过 / 1 阻断 / 0 失败**（Edge 155.0.4283.62，CDP） |

- 九格：平水三首 200/schema/证据齐备；词林/新韵六格 HTTP 503，公开错误码仍为 `DATA_NOT_READY`，message 中含 `LOOKUP_EVIDENCE_UNVERIFIED` 的具体候选定位（A/B 处理依据与语境，集成方装载；新异常按既有审批流程处理）。
- 黄鹤楼平水：`qilv`、`summary=fail`（其他偏离）、**三平尾特例非 error**，runner 已精确断言 status/severity/字位/PPP/resolvedBy/审批依据 → 上一批的判错已消除。
- 浏览器：正式入口三首手动输入真实响应、375/768/1440、reduced-motion、stale、词林 503 提示共 9 项通过；阻断项为示例按钮全部 disabled（D 批次二）。
- 已有 runner 还包含点字后候选/来源文本可见、Esc 关闭且焦点回原字位、正文编辑触发 stale、切词林后的真实 503 提示、字格宽度不小于 44px；不把这些写成未运行。未覆盖的是示例点击链路、完整选音/编辑/切书覆盖清理与并发、复制导出、受控五态与网络故障、全键盘/所有焦点路径/真实触控、干净 clone、E 层普通 PPP 对照。

## 与上一批的关系

- `tests/integration/e2e/d3-acceptance-api.mjs` 是当前 `pnpm test:acceptance` 入口，Codex 在原路径加固；本次没有新建第二套 runner。
- 我在 `d3-acceptance.md` 顶部登记了权威结果，旧数字保留标注。
- 09 号验收表已按实跑填写（批次 `D3-E05-E08-01`），未运行项一律写「未运行」。

## 仍存阻断

1. 词林/新韵六格 503：候选证据未审核（`LOOKUP_EVIDENCE_UNVERIFIED`）——A/B 补审核批次后复跑。
2. 示例按钮 disabled——D 批次二交付后补 E04 点击链路。
3. `pnpm test:acceptance` / `test:e2e` 非零是**如实阻断**，不得改预期使其全绿。

---

# D3 第三批：E06 / E08 场景增量（2026-10-19）

> 以下为 E 原始交付记录；集成侧复验与 runner 加固见 [第三批复核](d3-e-third-review-codex.md)。

批次 `D3-E06-E08-02`。分支 `feat/e-d3-e06-e08-scenarios`，头 `eaf3b1a`。
基线：本地 `origin/codex/d3-b-integration` @ `f6b52ef`；**`git fetch` 连续 10 次失败（github.com:443 超时）**，
未能确认远端是否已更新，若已前进需 rebase 后重跑。

## 新增（场景增量，不是重复九格）

- **E06 复制/导出一致性**（`E06-copy-download-consistency`）：真实平水报告下，复制摘要与下载 JSON 与当前 API 报告逐项一致
  （结论、韵书、体式、数据版本、规则版本、inputHash、原文、字位数量、请求快照）；
  编辑致 `stale` 后**复制被阻止、剪贴板不变、导出目录不新增文件**。
- **E08 纯键盘**（`E08-keyboard-token-dialog`）：Tab 到字格 → Enter/Space 打开详情 → 对话框内 Tab 到可操作按钮 →
  Space 激活关闭 → Space 再开、Escape 关闭，两种关闭路径**焦点都回到触发字**；实际用键 Tab/Enter/Space/Escape。
  不重复已有的“鼠标点字 + Esc”。

## 本批修复的 runner 缺陷（关键）

`tests/e2e/cdp.mjs` 的 `key()` 只发 `keyDown/keyUp`、不带 `text`，**Enter/Space 无法激活按钮**：
实测复制按钮已聚焦但 6 秒无任何反馈。已扩展 `key()` 支持可选 `text`（旧调用保持兼容），Enter/Space 传 `\r` / 空格。

## 实跑结果

| 命令                   | 结果                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `pnpm verify`          | exit 0，50 文件 / 684 测试                                     |
| `pnpm test:acceptance` | exit 2，3 通过 / 6 阻断 / 0 判错（与上批一致，**未新增覆盖**） |
| `pnpm test:e2e`        | exit 2，**11 通过 / 1 阻断 / 0 失败**（上批 9 通过，本批 +2）  |

## 证据归档

`tests/integration/e2e/evidence/d3-e-e06-e08-2026-10-19/`：`api.json`、`browser.json`、
`report-1440/768/375.png`、`summary.json`（含 `gitSha=fdfac790e6a9`、`dirty=false`、`mode=real`、执行时间、计数）。
先以未跟踪状态产生过一次 `dirty=true` 的产物，随后提交工作树并重跑覆盖，**未保留或伪造 dirty 记录**。

## 更正（前一批的错误说明）

`pnpm test:acceptance` **就是** `tests/integration/e2e/d3-acceptance-api.mjs`；它没有被废弃，
也不存在 `tests/acceptance/` 替代入口。已在 09 表与 `tests/integration/d3-acceptance.md` 说明中更正。

## 09 表增量

`docs/team/D3_执行任务书_2026-10-18/09_联合验收表_由E填写GLM复核.md` 第五节后新增「六、本批增量」，
含 SHA/mode/三条命令结果/证据目录/覆盖声明/未运行清单。注意：本分支的 09 表仍是未填模板，
上批的九格填写在 PR #17 分支，本节只记增量。

## 未运行（不计为通过）

已审候选选音→重查、正文/切书后的旧覆盖清理、受控五态与网络故障替身、全键盘矩阵（焦点环/跳过链接）、
干净 clone、真人审美；示例按钮仍 disabled（D 批次二），词林/新韵六格仍 503（A/B 证据审核）。

## 下一步

1. E05：已审候选选音→重查、正文/切书后旧覆盖清理。
2. E07：明确标识的可控故障替身（网络失败/超时/迟到）。
3. 数据六格与示例按钮到位后复跑对应阻断项。
4. 若 codex 分支已前进：rebase 后重跑三条命令并重出证据（不沿用旧 SHA）。

---

# D3 第四批：E07 可控故障 + 失败态导出闸门（2026-10-19）

批次 `D3-E05-E07-01`。分支 `feat/e-d3-e05-e07`，基线 `origin/codex/d3-b-integration@2662ba5`。

## SHA 区分（按要求）

| 用途             | SHA                                      |
| ---------------- | ---------------------------------------- |
| **实际运行 SHA** | `c887a4c801de`（dirty=false，mode=real） |
| **归档提交 SHA** | `d4a94c8b1ee5`（证据目录由该提交引入）   |

## 新增场景

- **E07-controlled-network-failure**：CDP `Network.setBlockedURLs` 只阻断 `/api/v1/analyze`；
  断言错误横幅 `[role=alert]` 出现、提交按钮恢复可用、解除阻断后重新 200。
  不使用停服务/改端口等不可控手段。
- **E05-failure-blocks-export**：请求失败后点“下载报告”→ 被阻止且导出目录无文件；
  每轮用新的下载目录（复用 Codex 加固口径）。若将来允许导出旧结论，场景以 `blocked + defect + repro` 记录，不改预期。

## 实跑

| 命令                   | 结果                                                      |
| ---------------------- | --------------------------------------------------------- |
| `pnpm verify`          | exit 0，50 文件 / **703 项**                              |
| `pnpm test:acceptance` | exit 2，3 通过 / 6 阻断 / 0 判错                          |
| `pnpm test:e2e`        | exit 2，**13 通过 / 1 阻断 / 0 失败**（上批 11，本批 +2） |

## 证据

`tests/integration/e2e/evidence/d3-e-e05-e07-2026-10-19/`：`api.json`、`browser.json`、
`report-1440/768/375.png`、`summary.json`（`runSha`、`runDirty=false`、`mode=real`、计数、`notRun`）。
不覆盖 Codex 的既有证据目录。

## 阻塞：E05 主体无法用页面驱动

`EvidencePanel.tsx:118-135` 的候选是只读 `<li>`；`apps/web` 全量搜索无 `onSelect/setOverride` 消费者，
`pendingOverrides` 只在 `store.ts` 内部。因此“选音→真实重查”缺少 UI 入口，**未运行**。
不用控制台直调 store 伪造通过。`apps/web` 属 D 目录，需明确由谁补控件。

## 其他

- D 的 PR #18 交接在 `origin/feat/d-d3-live-flow` 的 docs 下未找到，需路径或允许按 diff 读；示例链路仍未复跑，1 阻断未消除。
- 仍未运行：编辑/切书旧覆盖清理（当前无覆盖可清）、busy 中导出分支、全键盘矩阵、干净 clone。
- 网络 fetch 本次一次成功；若再次持续失败，只记录一次具体错误即报告，不再连试十次。
