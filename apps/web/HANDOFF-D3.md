# Web D3 交接：示例接入与正式页面业务闭环

日期：2026-10-18（D3）。执行者：队员 D + DeepSeek。
**base** `f42172f`（main，含 review3 三首真实 200） → **本批 head** 见提交记录。
分支 `feat/d-d3-live-flow`。

D1 见 `HANDOFF.md`，D2 见 `HANDOFF-D2.md`。本文件只记 D3 增量。

## 一、变更路径（本轮全部在 D 的写入范围内）

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `apps/web/src/app/examples.ts` | 修改 | 三首示例从空正文改为已批准固定正文；新增 `ExampleWork`（多 `author` 字段），正文逐字照抄 golden 用例 |
| `apps/web/src/app/store.ts` | 修改 | 新增客户端请求超时（默认 30s）与 `TIMEOUT` 错误；超时与用户取消区分 |
| `apps/web/tests/examples.test.ts` | 新增 | 11 项：正文与 golden 逐字一致、指纹命中 `approvedTextFingerprints`、异文不被采用 |
| `apps/web/tests/timeout.test.ts` | 新增 | 7 项：超时结束、busy 恢复、正文保留、不伪造报告、可重试、与取消区分 |
| `tests/e2e/d3-real-flow.mjs` | 新增 | D01–D06 真实 API 浏览器验收驱动（单进程编排 API+Web+Chrome） |
| `tests/e2e/d3-faults-a11y.mjs` | 新增 | D07–D09 故障注入 / 视口 / 键盘 / reduced-motion |
| `tests/e2e/artifacts/d3-real-api/` | 新增 | 真实成功类证据（7 张截图 + `d01-d06-results.json`） |
| `tests/e2e/artifacts/d3-faults/` | 新增 | 模拟故障与视口类证据（10 张截图 + `d07-d09-results.json`），与真实成功分开存放 |
| `tests/e2e/artifacts/README.md` | 新增 | 三类记录分开存放的约定，待 E 正式接管 |

未改：`apps/web/src/presentation/**`、`view-contract.ts`、根配置/lockfile、`apps/api`。

## 二、示例正文来源与边界

- 来源：`tests/golden/cases/{dengguanquelou,jingyesi,huanghelou}.json`
  （`reviewStatus=approved`；审查者组长 J03 2026-10-18 与 C；证据 `ev:work:*:j03`）。
- 权威指纹：`data/works/metadata.json` 的 `approvedTextFingerprints`。
- 只取**题名与正文**：来源报告、逐字审核表、证据正文都不进前端包。
- 正文逐字照抄（**含原标点、不加换行**）：
  - 登鹳雀楼 `白日依山尽，黄河入海流。欲穷千里目，更上一层楼。`
  - 静夜思 `床前明月光，疑是地上霜。举头望明月，低头思故乡。`
  - 黄鹤楼 `昔人已乘黄鹤去，此地空余黄鹤楼。…烟波江上使人愁。`
- 为什么可以单行：`packages/readings/parse.ts` 明确「换行与句读都是句边界」，
  `packages/genre/fingerprint.ts` 只取汉字求 SHA-256。故单行照抄既等价已批正文，
  也能正确切成 4 句/8 句。
- 示例操作沿用既有 `store.loadExample`：先 `setDraft` 再走统一失效逻辑，
  保留当前韵书与体裁/体式，不强制回平水，不注入任何 mock。

## 三、真实操作记录（按任务书分类存放，不混算）

### A. 真实 API 成功类 — `tests/e2e/artifacts/d3-real-api/`

API 直连实测（真实编排，非 fixture）：

| 作品 | status | summary | 字位 | 体裁 | checks | versions.data |
| --- | --- | --- | --- | --- | --- | --- |
| 登鹳雀楼 | 200 | pass | 20 | wujue / applicable | 36 | `pingshui-…-review3` |
| 静夜思 | 200 | not_applicable | 20 | ancient / null | 0 | 同上 |
| 黄鹤楼 | 200 | **fail**（存在明确违规） | 56 | qilv / applicable + `特殊拗律` | 96 | 同上 |

`versions` = `{data: pingshui-…-review3, rules: teaching-v1, context: context-rules:11, works: works:3}`，
**不含 fixture-only**。`/readyz` 仍 503（快照未审核，发布门槛），但 `/api/v1/analyze` 正常返回——
任务书「readyz503 不能被前端误作所有分析不可用」在服务端与前端都成立。

浏览器实测（`d3-real-flow.mjs`，Chrome 151 headless + CDP）：

| ID | 结果 | 记录 |
| --- | --- | --- |
| D01 三首示例按钮可用、正文与已批一致、不偷偷换书 | **PASS** | 24/24/64 码点，`book` 前后均 pingshui |
| D02 平水登鹳雀楼真实提交：20 字位、非 fixture、有结论 | **PASS** | tokens=20，页面无「合成」字样 |
| D03 静夜思不适用且仍可看逐字 | **PASS** | 不适用=true，tokens=20 |
| D03 黄鹤楼 56 字位、真实诊断保留 | **PASS** | 结论「不合律」+ 96 条检查，未隐藏红字 |
| D03 黄鹤楼 `特殊拗律` 标签可见 | **FAIL（展示缺口）** | API 返回 `historicalTags: ["七律","特殊拗律","半古半律"]`，presentation 从不渲染该字段 |
| D04 字位→候选→选音→重查 | **PASS** | 「更」2 候选、可选 1；选后重查 20 字位 |
| D05 编辑正文 → 旧报告 stale | **PASS** | `stale=true` |
| D05 stale 时导出被阻止 | **PASS** | 反馈「当前报告已不对应当前输入，已阻止导出。」 |
| D05 换韵书 → stale 保持 | **PASS** | `stale=true`，书切到 cilin |
| D06 复制摘要与当前报告一致 | **PASS** | 585 字，无「合成」 |
| **D03/D08 视觉：单行正文下报告出现竖排重叠文字** | **FAIL（展示缺陷）** | 见下节，影响全部单行正文 |

汇总：`d01-d06-results.json` 18 项中 17 通过，1 项为上述标签缺口。

### B. 模拟故障类 — `tests/e2e/artifacts/d3-faults/`

用 CDP `Fetch` 拦截注入（不改 `apps/api`）：

| ID | 结果 | 记录 |
| --- | --- | --- |
| D07 503 | **PASS** | 保留输入、busy 结束、显示「原因：…」+ HTTP_503 |
| D07 503 不伪造报告 | **PASS** | tokens=0 |
| D07 离线 | **PASS** | NETWORK_ERROR，保留输入 |
| D07 超时 | **PASS（本批新修）** | 30s 后 busy=false，提示「分析超时…请重试」 |
| D08 375/768/1440 无横向溢出 | **PASS** | 溢出 0px（三档，登鹳雀楼报告） |
| D08 正式 UI 触控 ≥44px | **PASS** | 最小 44px；开发壳 25px 不计入（仅 DEV） |
| D08 Enter 开抽屉 + 焦点进入 | **PASS** | — |
| D08 Escape 关闭 + 焦点返回字位 | **PASS** | 焦点回到 `l1c1` |
| D09 reduced-motion 可分析且不人为延迟 | **PASS** | 285ms，20 字位 |

汇总：`d07-d09-results.json` 14 项全通过。

### C. 合成五状态类

本轮未重跑；沿用 D2 的 `apps/web/tests/dev-scenarios.test.ts` 与
`tests/e2e/artifacts`（D2 的 `d2-*` 记录在本地工作区，未入库）。
**合成场景绝不进入真实分析路径**：DEV 壳只在 `import.meta.env.DEV` 分支加载。

## 四、本批修复的业务缺陷（真实复现驱动）

### 客户端没有请求超时（D07）

浏览器实测：服务端不应答 15s 后按钮一直是「分析中…」，用户既不能重试也无解释。
`apps/web/src/app` 内 **grep `timeout` 零命中**。

修复：`StoreOptions.requestTimeoutMs`（默认 `DEFAULT_REQUEST_TIMEOUT_MS = 30_000`，
`0` 表示不设超时仅供挂起语义测试）。到点 `controller.abort()` 并标记 `timedOut`，
在 `ABORTED` 分支区分「超时」与「用户取消」：超时提交 `code: "TIMEOUT"` 的可重试文案，
取消不报错。`finally` 里 `clearTimeout`，不泄漏定时器。

复验：30s 后 `busy=false`、正文保留、`tokens=0`、提示含「未展示任何旧报告结论」。

## 五、未完成 / 阻塞（交组长转发，不自行改 presentation）

### 阻塞 1：单行正文导致报告出现竖排重叠文字（严重，影响主流程）

**复现**：正式入口填入三首任一示例（单行、含标点）→ 分析 → 报告区出现一列竖排重复诗句。
已确认登鹳雀楼、黄鹤楼都中招；横竖屏三档视口 `scrollWidth == clientWidth`（不产生文档溢出），
但文字压在「批注诗文」上，属于显示错误。

**定位**（presentation，Claude 负责）：
`apps/web/src/presentation/components/ReportView.tsx`

- `trailing()`（约 41 行）在「无下一字位」时把 `end` 落到 `original.length`：

```ts
const end = next ? next.startUtf16 : nl === -1 ? original.length : nl;
```

- 调用处（约 140 行）只在**本句内**找下一个字位：
  `tokens.get(line.tokenIds[i + 1] ?? '')` → 每句末字 `next === undefined`。
- 单行正文没有 `\n`，`nl === -1`，于是切片变成「本句末字到全文结尾」，
  再被 `.pc-punct`（`width: 32px`）挤成一列。

**建议修法**：把「下一个字位」改为**全诗顺序**的下一个 token（跨句），
仅当该 token 就是全诗最后一个时才切到 `original.length`。

**为什么 D2 没暴露**：D2 验收提交的是带换行的多行正文，`nl` 存在，切片被换行截断。
单行粘贴是用户最常见操作，必须修。

### 阻塞 2：`historicalTags` 从未渲染

`ReportView.tsx` 全文无 `historicalTags`。API 对黄鹤楼返回
`["七律","特殊拗律","半古半律"]`，任务书要求「七律特殊性保留」。
需要在报告头/口径区展示已审核的历史体裁标签，且不改判定等级。

### 其余待办

1. **黄鹤楼真实 fail 的展示复核**：目前如实显示「不合律」+96 条检查（符合「不要在 UI 按标题隐藏红字」）。
   Codex 修异常规则后需复验，不在本批。
2. **`tests/e2e` 归档交接**：本批入库两个驱动脚本
   `tests/e2e/d3-real-flow.mjs`（D01–D06）与 `tests/e2e/d3-faults-a11y.mjs`（D07–D09），
   请 E 纳入单一 runner 并确定 artifacts 命名（约定见 `tests/e2e/artifacts/README.md`）。
   定位 B1 时用过的一次性 probe 脚本（overflow / vertical / narrow）已按用途删除，
   结论与行号已写在本文件「阻塞 1」。
3. **`/readyz` 503 与前端**：目前只影响发布门槛，前端不据此禁用分析；若后续要在 UI 显示就绪状态，需新增契约字段（本批未改）。
4. `API` 启动日志仍打印「D1 开发 mock 已启动」（`apps/api/src/server.ts` 约 283 行），
   实际走真实编排。属 GLM 路径，仅记录。

## 六、复现命令

```sh
# 依赖（本机 pnpm 符号链接限制，见 HANDOFF-D2.md）
PNPM_CONFIG_NODE_LINKER=hoisted pnpm install --frozen-lockfile --config.node-linker=hoisted

# 全仓校验
PNPM_CONFIG_NODE_LINKER=hoisted pnpm verify

# 真实 API + 前端（官方一键）
pnpm dev            # API :3000 + Web :5173

# 浏览器验收（需本机 Chrome；脚本自己拉起 API+Web，端口 3000/5180）
node tests/e2e/d3-real-flow.mjs      # D01–D06
node tests/e2e/d3-faults-a11y.mjs    # D07–D09（含 30s 超时等待）
```

## 七、实际测试结果

```text
pnpm verify → exit 0
  eslint / tsc（根 + apps/web）/ vitest / generate-contracts --check 全部通过
  609 passed（47 文件）← 基线 591（45 文件）+ 本批新增 18 项（examples 11 + timeout 7）
```

浏览器：D01–D06 17/18（1 项 presentation 标签缺口）、D07–D09 14/14。
