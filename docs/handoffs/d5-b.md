# D5-B：语境依据与六格独立预期（交接）

> 2026-10-21整合说明：本批产物按各文件记录的旧快照及严格审核策略冻结，保留用于追溯。当前主线已合入词林16项批准、新韵V2及参考分析；下文“当前blocked/503”只指本批生成基线，不是当前API行为。当前实测见 [主线整合](main-closeout-2026-10-21.md)。

- 分支：`feat/b-d5-context`
- base：本地 `274ce7d`（PR #23 内容，已并入 main）。**远端 main 实际 SHA 与 PR #28 数据未取到**：本机到 GitHub 的 `git fetch` 反复挂起/`early EOF`，按「不空等」先交最小可核材料，基线待网络恢复后补核。
- head：`29b2a9c`（PR #33，目标 `main`，Draft）；本记录提交后 head 会前移，以 PR 实际 head 为准
- PR：#33（https://github.com/65638/poetry-checker/pull/33）
- 未改：`data/context`、A 快照、API、核心、公共 Schema

## 1. 命令与结果（本轮实际输出）

| 命令                                                                  | 结果                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm --filter @poetry/readings test`                                 | exit 0；**8 文件 / 94 用例通过**（新增 D5 守卫 8 条）                     |
| `pnpm exec tsx packages/readings/scripts/d5-six-cell-expectations.ts` | exit 0；`tokens=192 single=147 multiPositions=38 conditionalResolved=147` |
| `pnpm exec tsx packages/readings/scripts/d5-context-review-ready.ts`  | exit 0；`drafts=13 notReady=13 unapprovedCandidates=31`                   |
| `pnpm verify`                                                         | 见提交前记录（lint/typecheck/test/build/生成物一致性）                    |

环境：Node 24.21.0（仓库锁 24.19.0）、pnpm 11.25.0、hoisted linker。

## 2. 必交 1：G34–G36 行为证据映射

产物：`data/reviews/d5/b/context-behavior-map.json`

- **G34 语境命中**：6 条（最长精确短语、正向 GATE 路径、覆盖优先级、`targetOffset` 精确命中、规则与真实正文绑定、真实平水链路「里」选四纸且保留四寘）
- **G35 语境缺失/依据不足**：10 条（多读含平仄不任选、同调多读、未知不被掩盖、缺字 unknown、FIX-2 四条证据不足不选音、规则不泛化、真实数据不加载语境即阻断）
- **G36 冲突/失效**：5 条（同优先级冲突保留歧义、冲突中未审候选仍抛、`CONTEXT_RULE_STALE`、`CONTEXT_RULE_INVALID`、规则不能借唯一候选绕过门槛）

每条都标了 `dataKind`：`mechanism`（受控 fixture，只证明机制）/ `real-data`（真实快照，可证明真实链路）。
守卫用例 `tests/d5-artifacts.test.ts` 会检查每个用例名**仍存在于标注的文件**，防止改名后映射失效。

**已知缺口**：真实数据上还没有「两条已批准规则同时命中同一字位」的实例，冲突路径目前只有受控 fixture 支撑。没有伪造该场景，已在 JSON 的 `gaps` 里写明。

## 3. 必交 2：13 条草稿的逐条可审批材料

产物：`data/reviews/d5/b/context-review-ready.json` / `.md`

- 13 条全部 `readiness: "not-approval-ready"`、`proposedSelection: null`、`reviewStatus: unverified`
- 涉及 **31 个候选的证据为 0 已审**（词林 `0/33`、新韵 `0/56`）
- 每条列出：本书 candidateId 与逐个证据审核状态、义项依据（沿用平水裁定描述）、反例、A 侧证据依赖、四项待审点
- 已在文件里明确写明：**不是「只差点批准」**，而是候选归属本身未确认

未写 `data/context`：没有精确人审接受记录。

## 4. 必交 3：六格独立条件预期

产物：`data/reviews/d5/b/six-cell-expectations.json` / `.md`

期望由**韵书快照候选 + 已批规则**推导，不调用 API、不抄 API 输出。每字位分两层：

| 作品     | 韵书 | 当前 blocked | 当前 unknown | 条件 resolved | 条件 ambiguous | 条件未定 |
| -------- | ---- | ------------ | ------------ | ------------- | -------------- | -------- |
| 登鹳雀楼 | 词林 | 20           | 0            | 19            | 1              | 0        |
| 静夜思   | 词林 | 20           | 0            | 18            | 2              | 0        |
| 黄鹤楼   | 词林 | 55           | 1            | 50            | 5              | 1        |
| 登鹳雀楼 | 新韵 | 20           | 0            | 14            | 6              | 0        |
| 静夜思   | 新韵 | 20           | 0            | 10            | 10             | 0        |
| 黄鹤楼   | 新韵 | 56           | 0            | 36            | 20             | 0        |

- **当前层**：两库 `evidence approved = 0`，有候选一律 `blocked`（运行时 503）；黄鹤楼词林 1 字缺收为 `unknown`
- **条件层**：192 字位中 **147 个单候选字位在证据审齐后可判**；多音位置（去重）**38 个**，其中 **0 个**能由语境规则定死（两库当前无规则），**38 个必须保持 ambiguous**——不强行选音
- 每条都带 `workId + textSha256 + book + tokenId + dataVersion`，E 可逐行取用

口径说明（给 E 的 G09）：这里只统计**词林/新韵六格**的多音位置（38 个，去重后）；D4 的 44 位置包含平水，两个口径**不混写**，也不把同一位置跨书重复计数。

## 5. 明确未做

- 未取到远端 main 最新 SHA 与 PR #28 数据：拿到后需重跑 `d5-six-cell-expectations.ts` 与 D4 有效候选脚本，旧冻结材料保持原样
- 未运行真实 API 九格（归 Codex/GLM）
- 未做留出评测，不报读音准确率

## 6. 下一责任人

- **C**：复核 G34–G36 映射（产物第 4 节可直接引用）
- **E**：取六格预期进台账，G09 用第 4 节口径
- **组长**：13 条草稿裁定；裁定后才写 `data/context`
- **GLM/Codex**：新数据到达后重跑，并把新 SHA 广播给 B
