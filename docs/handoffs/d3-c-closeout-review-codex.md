# C 的 D3 收尾交付复核

日期：2026-10-19。复核方：Codex。输入：C 的《项目完成情况(2).md》及 PR #14@`803e52a8ceb1b3795dc1fb308e5b9b6b996c2427`。

结论：**C 本批验收通过，已接入 D3 集成分支；不等于 D3 全部完成或已经合入 main。** 没有发现需要退回 C 重做的代码问题。个人报告中的跨模块进度基于旧 main，需要按以下事实校正。

## 接收范围与写入交接

- 复核基线：`codex/d3-b-integration@f6b52ef`，其上游为 `integrate/d3@dcf1892`。main 仍为 `f42172f`。
- C 前批 `ebd3213` 的内容已在 D3 集成基线，本次不重复搬入核心实现。
- 原提交 `8dcec2c` → 集成提交 `32c9ff8`：两份 acceptance 测试、发布卡及运行审核表。
- 原提交 `803e52a` → 集成提交 `174d385`：C 交接和历史标记。保留 C 作者信息。
- 按组长此前接管 GLM 的授权，Codex 在本分支负责上述 cherry-pick、集成检查和交接文档纠偏。C 的测试/卡片代码保持原交付；原审批原件、contracts、A/B/E 数据均未改动。根 HANDOFF 本轮由 Codex 维护，成员后续写各自交接文件，避免覆盖。
- 交付入口为 PR #16（目标 `integrate/d3`）。PR #14 在本次查询时仍 open，不能因内容已接入集成分支就宣称它已被 GitHub 合并。

## 三项要求的验收

| 首轮要求 | 本轮实际结果 |
|---|---|
| 发布 TAIL.SANPING 卡直接关联审批依据 | 卡及运行审核表均新增既有 `ctx:j03b2:08`；没有在规则证据库复制 context 记录 |
| 独立边界用例补齐 | C11–C16 覆盖新韵隔离、缺审批/作品证据、来源断链、unknown/PZ 歧义/变仄、冻结输入、报告证据与来源闭合 |
| 真实发布卡引用验收 | 新增 4 项检查，覆盖 10 个冻结 ruleId/version、证据唯一解析/approved/来源、审批引用不复制、运行表与发布卡一致 |

C01–C16 含 C04a/C04b，共 17 项特例测试；整个 acceptance 目录为 6 文件/104 项。本轮净增 10 项，不把 C 的旧 669 项加到现有总数上重复计数。

## Codex 实际复验

环境：Node v24.19.0 / pnpm 11.25.0。C 报告的 Node 24.18.0 / pnpm 11.24.0 与固定版本存在差异，本次已用固定环境复验，无需因此退回同一批代码。

1. `pnpm exec vitest run packages/prosody/tests/acceptance apps/api/tests/golden-real.test.ts`：exit 0，**7 文件/111 项**。
2. `pnpm verify`：exit 0，**50 文件/694 项**；lint、类型检查、构建及 8 个生成物一致性检查通过。
3. 全仓检查包含 `apps/api/tests/reviewed-exceptions-http.test.ts`：通过 Fastify inject 调用真实资源与真实编排，验证限定 PPP 特例、保留其他偏离、规则详情返回审批证据与来源。该检查是 HTTP 路由集成测试，不称作浏览器点击。

执行时实现提交为 `174d385`；期间只校正 Markdown 交接状态，未修改通过测试的代码/资源。本轮没有重跑浏览器，也没有把上轮结果写成这轮新结果。上轮九格独立 HTTP 为 **3 通过/6 阻断/0 判错**，浏览器首批为 **9 通过/1 阻断/0 失败**，可复现实现在 `c803952`，证据路径见 [E 复核](d3-e-review-codex.md)。

GitHub 查询时 C 的精确 head `803e52a` 两项“基础检查”均 success。PR #16 本轮推送后的 CI 结果以对应新 head 的 Actions 为准，不能沿用推送前 `f6b52ef` 的绿灯。

## 个人报告中应纠正的状态

| C 报告的表述 | 本集成分支实际情况 |
|---|---|
| orchestrator 特例未接、黄鹤楼目标仍 fail/error | 已接；平水固定正文 l4c5–7 的 TAIL.SANPING 为 not_applicable/info，resolvedBy=null，规则版本包含 reviewed-works-v1。全诗 summary=fail 来自其他偏离，符合裁定 |
| 接线是 D3 唯一阻塞 | 不成立；词林/新韵六格仍缺可放行数据，示例按钮与完整系统回归仍待后续批次 |
| 三首 golden 仍 pending | 三份实际 JSON 均 approved，仅覆盖所列正文/体裁等断言；不得扩展为全部逐字、全部韵书已批准 |
| auto 高吻合分支仍抛 GENRE_BRANCH_PENDING | 当前分类器没有此抛出路径；该字符串仅保留在错误码枚举，不能凭枚举判断实现尚未完成 |
| D1 模块入口仍在开发 | 是旧记录，D1 已收口，不再作为当前待办 |
| PR #14 复核文档找不到 | 路径为 `docs/handoffs/d3-c-pr14-review.md`，在集成分支；查旧 main 不代表仓库所有分支都缺失 |

根 HANDOFF 与 C 仓库内交接已校正；用户提供的个人报告原件不改写。三库整库审核门槛仍保持；本轮只补引用及验收，不产生新的审批。

## 可直接转发给 C

```text
你的 D3 收尾已验收通过。8dcec2c、803e52a 已纳入 codex/d3-b-integration（PR #16），固定 Node 24.19.0 / pnpm 11.25.0 环境 pnpm verify 为 50 文件/694 项全绿；你的 acceptance 为 6 文件/104 项。

发布卡 ctx:j03b2:08 引用、4 项发布卡检查和 C11–C16 全部收到，不用重做核心或继续补同一批测试。

请更新个人《项目完成情况》的当前状态：特例已接入真实 API；三首 golden 已按限定范围 approved；GENRE_BRANCH_PENDING 只是保留枚举；main 尚未包含 D3 集成批次，不能用旧 main 推断整个项目未完成哪些功能。D3 仍有词林/新韵数据与系统验收待办。

先 git fetch origin，对照 origin/codex/d3-b-integration 阅读最新交接；不要再向根 HANDOFF 追加全项目旧状态。后续只处理 E 回归发现的规则说明/证据引用/验收缺口，新的编码批次从最新集成分支另开 C 自己的分支，不推送集成分支。复核详情：docs/handoffs/d3-c-closeout-review-codex.md。
```
