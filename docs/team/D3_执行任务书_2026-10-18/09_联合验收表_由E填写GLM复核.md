# D3 联合验收表：由 E 填实际结果，GLM 核对整合版本

这份09号是**检查清单和结果台账**，不是需要组长逐字签名的工作表，也不是脚本。组长把它发给E和GLM即可；他们执行后填写证据，组长最后看失败/阻塞项。新数据异常怎么处理看10号。

基线：包含 `f42172f` 的最新main。
> **本次填写（2026-10-19，队员 E）**：批次 `D3-E05-E08-01`，基于 `origin/codex/d3-b-integration`。
> 只填**实跑**项；没有执行的一律写「未运行」。历史数字不照抄。
> Codex 复核说明：以下数值保留 E 在 `f6b52ef` 的回报。其原始运行 JSON/截图未随 PR #17 入仓，不能用别人的旧归档冒充；runner 已有覆盖的描述已按代码校正。复核与后续验收见 `docs/handoffs/d3-e-second-review-codex.md`。

## 一、每次验收先填

```text
验收批次ID：D3-E05-E08-01
实际main/集成SHA：f6b52ef6849058a614f783f15e31a1cc37444a49（dirty=false，runner 与 server 同一提交）
分支：feat/e-d3-acceptance-e05-e08（基线 origin/codex/d3-b-integration）
前端URL / API URL：runner 自起临时 Vite + API，随机空闲端口（不占用 3000/5173）；
                  实际端口见 artifacts/acceptance/d3-api.json 的 apiUrl 与 browser/result.json 的 url
模式：真实（readyz 响应声明 mode=real；未使用 fixture）
数据版本：pingshui=pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-review3
          cilin=cilin-cwr-ff0e9c1-d2-full
          xinyun=xinyun-rebuild-d2-full
规则版本：teaching-v1+reviewed-works-v1　　语境：context-rules:11　　作品：works:3
执行者：队员 E（DeepSeek）　日期：2026-10-19
命令 / exit：
  pnpm verify              → exit 0，50 文件 / 684 测试
  pnpm test:acceptance     → exit 2，3 通过 / 6 阻断 / 0 判错
  pnpm test:e2e            → exit 2，9 通过 / 1 阻断 / 0 失败（Edge 155.0.4283.62，CDP）
日志/证据：artifacts/acceptance/d3-api.json、artifacts/acceptance/browser/result.json（含 pageErrors）
环境：Node v24.21.0（任务书要求 24.19.0，engines>=24<25 满足）、pnpm 11.25.0
```

## 二、九组合真实 API（必须逐行）

| 案例 | 韵书 | HTTP/Schema | 体裁/summary/尾式/押韵 | 有效候选证据 | 执行证据 |
|---|---|---|---|---|---|
| 登鹳雀楼 | 平水 | **200 / schema pass** | 五绝 `regulated/wujue`；summary=**pass** | 齐备：ev=302、rules=10；dataVersion `pingshui-…review3` | `test:acceptance` PASS |
| 静夜思 | 平水 | **200 / schema pass** | 古体 `ancient/null`；summary=**not_applicable** | 齐备：ev=302 | PASS |
| 黄鹤楼 | 平水 | **200 / schema pass** | 七律 `regulated/qilv`；summary=**fail**（来自其他偏离）；**三平尾特例非 error**（runner 精确断言 status/severity/字位/PPP/resolvedBy/审批依据） | 齐备：ev=302 | PASS |
| 登鹳雀楼 | 词林 | **503 `DATA_NOT_READY`** | 未产出（保护行为正确，可用范围未完成） | 阻断：`LOOKUP_EVIDENCE_UNVERIFIED` l1c1「白」候选 `cilin:白:ru:第十七部·入声` 无已审核证据 | BLOCKED |
| 静夜思 | 词林 | **503** | 未产出 | 阻断：l1c1「床」候选 `cilin:床:ping:第二部·平声` 无已审核证据 | BLOCKED |
| 黄鹤楼 | 词林 | **503** | 未产出 | 阻断：l1c1「昔」候选 `cilin:昔:ru:第十七部·入声` 无已审核证据 | BLOCKED |
| 登鹳雀楼 | 新韵 | **503** | 未产出 | 阻断：l1c1「白」候选 `xinyun:白:yangping:二波·阳平`、`xinyun:白:yangping:四开·阳平` 无已审核证据 | BLOCKED |
| 静夜思 | 新韵 | **503** | 未产出 | 阻断：l1c1「床」候选 `xinyun:床:yangping:十唐·阳平` 无已审核证据 | BLOCKED |
| 黄鹤楼 | 新韵 | **503** | 未产出 | 阻断：l1c1「昔」候选 `xinyun:昔:qu:二波·去声`、`xinyun:昔:yinping:十二齐·阴平` 无已审核证据 | BLOCKED |

**汇总：通过 3 / 阻断 6 / 判错 0 / 未运行 0；runner exit 2。**
按本表定义：503 属「保护行为正确、可用范围未完成」，**这 6 格不记为完成**，列入 D3 功能主线欠账。

## 三、系统与特例门槛

| 编号 | 检查 | 负责人 | 结果/证据 |
|---|---|---|---|
| D3-CHECK-01 | 固定黄鹤楼特例正确；普通PPP仍error；换字/错书/缺证据不免责 | Codex/C/E | **部分**：真实黄鹤楼特例已过；C 的独立包测试已覆盖普通 PPP、换字/错书/缺证据（见 C 收尾复核）；E 层系统对照尚未运行，作为 D3 后续任务，不自动推迟到 D4 |
| D3-CHECK-02 | 三首示例可点、正文正确、配置不被偷换 | D/E | **阻断**：示例按钮全部 disabled（1 个阻断项），归 D 批次二 |
| D3-CHECK-03 | 正式首页三首→诊断→字位依据→规则来源 | D/E | **部分**：E04×3 包含正式 `/` 手动输入→真实响应→点首字→候选/来源文本可见→Esc 返回焦点；示例入口阻断，完整规则详情打开及证据 ID/来源逐项 UI 核对未覆盖 |
| D3-CHECK-04 | 已审可用候选的人工覆盖、重查、旧hash/跨书拒绝 | B/D/E | **未运行** |
| D3-CHECK-05 | 编辑/切书/并发迟到/stale/复制导出 | D/E | **部分**：正文编辑触发 `E05-stale`、切词林真实提交显示 503 已覆盖；选音覆盖清理、迟到响应、复制导出未运行 |
| D3-CHECK-06 | 375/768/1440、键盘、焦点返回、触控与减弱动效 | D/E | **部分**：三档布局、字格宽度≥44px、reduced-motion、Esc 回原字位已覆盖；全键盘矩阵、其他焦点路径及真实触控未运行 |
| D3-CHECK-07 | 可复现API/浏览器runner，个人路径移除，CI覆盖范围明确 | E/GLM | **工具已具备，E 本批产物待归档**：两条命令使用仓库内单一 runner；push/PR CI 跑 verify，另有手动 workflow_dispatch 验收并上传产物，本批未触发该云端验收 |
| D3-CHECK-08 | 当前commit pnpm verify与GitHub CI通过 | GLM | **部分**：本地 `pnpm verify` exit 0（684 项）；GitHub CI 由 GLM 核对 |
| D3-CHECK-09 | 两个视觉代表页、实际触发动效、前后对照 | Claude/GLM/Codex | **未运行**（非 E） |
| D3-CHECK-10 | 组长对代表页观感反馈，与技术检查分开 | 组长 | **未运行**（非 E） |
| D3-CHECK-11 | 新批次ID/摘要/实际确认、未批竞争候选保留、版本差异 | A/B/GLM | **未运行**（非 E） |
| D3-CHECK-12 | 全库异常逐项归属、发布范围、旧PR与台账收敛 | A/GLM | **未运行**（非 E） |

## 四、不能混淆的四个结论

| 结论 | 依据 | 不代表什么 |
|---|---|---|
| 工程通过 | 当前SHA verify/CI成功 | 不代表数据事实全部正确 |
| 指定案例可用 | 九组合逐格实测＋独立预期＋有效证据 | 不代表任意输入都支持 |
| 页面验收通过 | 正式入口真实操作及故障/可访问性证据 | 不代表用户认可审美 |
| 全库发布通过 | 结构完整＋明确批准范围覆盖＋版本/引用/异常门槛 | 不能由前三项自动推导 |

`/readyz` 未全库发布时允许503；报告要说明原因。健康检查`/healthz`只表示进程活着。不能删数据或改门槛让这两者都绿。

**本次 `/readyz`**：503 `DATA_NOT_READY`，`mode=real`，versions 如上，表示整库发布条件未满足。九格 `/analyze` 错误 message 内的 `LOOKUP_EVIDENCE_UNVERIFIED` 则定位某次请求的候选证据问题；两者不能混作同一响应。

## 五、D3结束回传（E 填写部分）

| 分类 | 内容 |
|---|---|
| 已通过 | 工程：`pnpm verify` 684 项；API：平水三首 200/schema/证据齐备；特例：黄鹤楼三平尾非 error 且有审批依据；浏览器：正式入口三首手动输入、375/768/1440、reduced-motion、stale、词林 503 提示（9 项） |
| 失败 | **0** 项（本批） |
| 阻塞 | ①词林/新韵六格 503（`LOOKUP_EVIDENCE_UNVERIFIED`，A/B 证据审核）②示例按钮 disabled（D 批次二） |
| 未运行 | E04 示例→点击及完整规则详情链路；E05 选音/覆盖清理/并发；E06 复制导出；E07 受控五态与网络故障；E08 全键盘/其他焦点路径/真实触控；E09 干净 clone；E10 系统层普通 PPP 对照 |
| 证据位置 | `artifacts/acceptance/d3-api.json`、`artifacts/acceptance/browser/result.json`、`tests/integration/d3-acceptance.md`、`docs/handoffs/d3-e-system.md` |

D4处理有限修复与定稿，D5至少半天留联调和彩排。若D3九组合仍存在503，将其列功能主线欠账，不把它移成可选加分项。

## 六、Codex 对第二批的独立复核（不覆盖 E 上述历史回报）

- 批次：D3-CODEX-E-SECOND-REVIEW；执行 SHA：`e0eefe17ad9aadfe328e40f32866069c63500107`，工作树干净，真实模式。
- Node v24.19.0 / pnpm 11.25.0 / Edge 155.0.4283.45；临时 API/Vite，实际 URL/时间/版本均在原始 JSON。
- 真实 HTTP：3 通过 / 6 阻断 / 0 判错；浏览器：9 通过 / 1 阻断 / 0 失败，pageErrors=[]；两个 runner JSON 均 exitCode=2。未改数据门槛。
- 归档：`tests/integration/e2e/evidence/d3-codex-e-second-review/api.json`、`browser.json`、`report-375.png`、`report-1440.png`。
- 上表六格补齐了实际候选 ID。它们只是每个请求早停时的首个缺口，不是完整待审字表；不据此宣称审核三个字即可解除六格。
- 本次未新增 E05–E08 场景，也未重新跑全仓 verify。最新本地全仓依据为 C 集成的 694 项；本次没有把这 10 项增量计成 E 新交付。
- E 后续场景与原始产物要求见 `docs/handoffs/d3-e-second-review-codex.md`。D3 仍未收口。

## 七、E 第三批原始回报（D3-E06-E08-02，2026-10-19）

> **说明**：保留 E 在旧基线上的原始回报。当前集成版保留上方已填写的第二批台账，本节不覆盖历史结果。第三批独立复验及发现的覆盖缺口见 `docs/handoffs/d3-e-third-review-codex.md`。


| 项 | 结果 |
| --- | --- |
| 基线 / 分支 | 本地 `origin/codex/d3-b-integration` @ `f6b52ef`（`git fetch` 连续 10 次失败，未能确认是否最新）；分支 `feat/e-d3-e06-e08-scenarios` |
| 实跑 SHA / 模式 | `fdfac790e6a9`，**dirty=false**，`mode=real`，Node v24.21.0 |
| `pnpm test:acceptance` | exit 2：3 通过 / 6 阻断 / 0 判错（与上批一致，**未新增覆盖**） |
| `pnpm test:e2e` | exit 2：**11 通过 / 1 阻断 / 0 失败**（上批 9 通过，本批 **+2**） |
| `pnpm verify` | exit 0：50 文件 / 684 测试 |
| **新增 E06**（CHECK-05 增量） | 复制摘要与下载 JSON 与当前真实报告逐项一致：结论、韵书、体式、数据版本、规则版本、inputHash、原文、字位数量、请求快照；编辑致 stale 后**复制被阻止、剪贴板不变、导出目录不新增文件** |
| **新增 E08**（CHECK-06 增量） | 纯键盘：Tab→字格、Enter/Space 打开详情、对话框内 Tab 到可操作按钮、Space 激活关闭、Space/Escape 关闭后**焦点回到触发字**；实际用键 Tab/Enter/Space/Escape |
| 证据目录 | `tests/integration/e2e/evidence/d3-e-e06-e08-2026-10-19/`：`api.json`、`browser.json`、`report-1440/768/375.png`、`summary.json`（含 SHA/mode/时间/计数） |
| 覆盖声明 | E04/E05/E07 属 Codex 批既有覆盖，**不计入 E 本批新成果**；上批 E 的原始产物已归档，未造历史记录 |
| 仍未运行 | 已审候选选音→重查、正文/切书后的旧覆盖清理、受控五态与网络故障替身、全键盘矩阵（焦点环/跳过链接）、干净 clone、真人审美 |

### 本批发现并修复的 runner 缺陷

`tests/e2e/cdp.mjs` 的 `key()` 只发 `keyDown/keyUp`、不带 `text`，因此 **Enter/Space 无法激活按钮**（实测：复制按钮已聚焦但 6 秒无反馈）。已扩展 `key()` 支持可选 `text`（旧调用保持兼容），并在 Enter/Space 调用处传入 `\r` / 空格。该修复是本批 E06/E08 能通过的前提。

## 八、Codex 第三批独立复核（当前增量）

执行者 Codex；Node v24.19.0 / pnpm 11.25.0 / Edge 155.0.4283.45。

| 项目 | 实际结果 |
|---|---|
| 全仓检查 | `f7a33bd`，`pnpm verify` exit 0，50 文件/703 项；比此前集成版新增 9 项校验器检查 |
| 九格 HTTP | `643f96e`、dirty=false，3 通过/6 阻断/0 判错，JSON exitCode=2 |
| 浏览器 | `f7a33bd`、dirty=false，11 通过/1 阻断/0 失败，pageErrors=[]，JSON exitCode=2 |
| CHECK-05 / E06 | 复制摘要/下载完整报告与实际请求和响应一致；stale 后剪贴板不同测试标记保留、下载文件名及哈希不变。请求失败/进行中/选音后的导出仍待补 |
| CHECK-06 / E08 | 实际 Tab 3 次到字格，再在详情中 Tab 3 次到关闭按钮，期间焦点留在对话框；Enter/Space 打开，Space/Escape 关闭回原字位。分析准备使用鼠标，完整页面纯键盘矩阵仍未完成 |
| 证据目录 | `tests/integration/e2e/evidence/d3-codex-e-third-review/`；含初次失败、最终结果、布局截图与真实下载 JSON |
| 基线整合 | 保留 C/前批 E 内容，解决 E 旧基线文档追加冲突；D PR #18 及 A 新分支未在本批接入 |

E 第三批原回报的内层 Tab 实际为 0；剪贴板读取失败跳过、复用旧下载文件和部分字段比较的问题均已在本批修复。首次复验因 Codex 的 Windows 换行/初始焦点假设失败，已修正并复跑，详见 `docs/handoffs/d3-e-third-review-codex.md`。

第七节“上批原始产物已归档”仅能证明其列出的第三批 fdfac79 产物，不证明第二批 f6b52ef 原件已补交。原文件保留其实际 SHA；Codex 的新运行独立归档，不冒充 E 的历史执行。D3 仍未收口。
