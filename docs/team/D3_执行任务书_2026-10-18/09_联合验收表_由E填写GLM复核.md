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
| 黄鹤楼 | 词林 | **503** | 未产出 | 阻断：l1c1「昔」候选无已审核证据 | BLOCKED |
| 登鹳雀楼 | 新韵 | **503** | 未产出 | 阻断：l1c1「白」候选 `xinyun:白:yangping:二波/四开` 无已审核证据 | BLOCKED |
| 静夜思 | 新韵 | **503** | 未产出 | 阻断：l1c1「床」候选无已审核证据 | BLOCKED |
| 黄鹤楼 | 新韵 | **503** | 未产出 | 阻断：l1c1「昔」候选（去声/阴平）无已审核证据 | BLOCKED |

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
