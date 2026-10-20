# D4 E 批次 01：基线复跑 + 并发迟到场景

日期：2026-10-19。执行者：队员 E / DeepSeek。
分支 `feat/e-d4-closeout`；**base** = `origin/integrate/d4 @ 4146371`（已发布、已核对与 `c409d20` 的祖先关系）。
**head** = `169446e80d7d`（证据归档提交）；**实际运行 SHA** = `dba8684c4c00`（dirty=false，mode=real）。

## 改动文件

- `tests/e2e/d3-browser.mjs`：新增 `E05-concurrent-submit-keeps-latest`
- `tests/integration/e2e/evidence/d4-e-01/`：api.json、browser.json、report-1440/768/375.png、summary.json
- `docs/handoffs/d4-e.md`、`docs/team/08_D4联合验收台账.md`（本节）

## 输入版本 / 依赖

- Node **v24.21.0**（任务书要求 24.19.0，`engines >=24 <25` 满足）、pnpm 11.25.0
- 数据版本：pingshui / cilin / xinyun（见 summary.json 的 `versions.data`）
- 规则 `teaching-v1+reviewed-works-v1`；语境 `context-rules`；作品 `works:3`

## 命令与真实结果（基线 4146371 上、提交后干净树）

| 命令                                                          | exit  | 计数                                 |
| ------------------------------------------------------------- | ----- | ------------------------------------ |
| `pnpm verify`                                                 | **0** | 56 文件 / **763 测试**               |
| `pnpm test:acceptance --out artifacts/acceptance/d4-api.json` | 2     | 九格 **3 通过 / 6 阻断 / 0 判错**    |
| `pnpm test:e2e --out artifacts/acceptance/d4-browser`         | **0** | 浏览器 **19 通过 / 0 阻断 / 0 失败** |

已通过项属继承（D3 的 18 项；本批仅新增 1 项），**不计新成果**。

## 新增场景：E05-concurrent-submit-keeps-latest

受控延迟（CDP `Fetch` 暂停 A 的 analyze 请求）→ B 后提交并先完成 → 再处理 A：

- 应用在提交 B 时会 `abort()` 旧请求（实测 `Invalid InterceptionId`），记为 `aborted-by-app-on-new-submit`；
- 若实现改为"忽略迟到响应"，`Fetch.continueRequest` 会成功，记为 `released-late`；
- 两种实现下都断言：**最终导出 `inputHash` 与请求快照均为 B**；迟到 A 不覆盖报告、不改写请求快照。

这一条覆盖了 D4 卡片列出的"并发迟到成功/迟到失败"中的归属问题，并**记录了实现用的是取消而非忽略**。

## 可定位产物

`tests/integration/e2e/evidence/d4-e-01/summary.json`（runSha、dirty、mode、node、浏览器版本、计数、`versions`、`notRun`）、`api.json`、`browser.json`、三张视口截图。

## 明确未运行

- 迟到**失败**（A 以 503 迟到）单独场景；
- 客户端 30 秒真实超时后的恢复与禁导出（需与 D 约定预期）；
- 受控五态中 `needs_review` / `unsupported` 的浏览器覆盖；
- 完整键盘主任务（Tab 顺序、可见焦点、示例/韵书/提交、候选、折叠）；
- 折叠/定位设计回归并入统一 runner（去重）；
- 干净 clone 安装/构建/启动、导出数据可解析；
- 12 首金标准扩编（G09）、词林/新韵独立期望（等 A/B 依据）。

## 待与 D 约定

30 秒超时的前端表现与失败文案、以及"进行中"状态的按钮禁用口径——本批未改前端，等待 D 的确认后再补场景。
