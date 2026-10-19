# C 的 D3 交付复核：PR #14

> 本文为 `ebd3213` 的首轮历史复核。C 后续提交 `8dcec2c`、`803e52a` 已补交；最新验收与状态校正见 [收尾复核](d3-c-closeout-review-codex.md)，不重复下达下方旧任务。

复核日期：2026-10-19。复核方：Codex。被核查提交：`ebd3213cafde0b04cdf6e4ac5819d6187d9d7b76`，分支 `feat/c-d3-exception-acceptance`，PR #14。

结论：公共导出、主要独立用例及规则说明已交付，可供 GLM 开始 API 接线；尚有规则卡直接依据引用和独立验收覆盖两项收尾。没有发现本批改坏核心实现；不据此宣告全部 D3 验收完成。

## 实际复验

- 在 Codex 独立 checkout 临时检出 C 的精确提交，Node 24.19.0 / pnpm 11.25.0 执行 `pnpm verify`：**exit 0，47 文件 / 659 测试**。lint、类型检查、各包及 Web 构建、8 个契约/模板生成物检查通过。之后恢复 Codex 原分支，未动 GLM 服务。
- GitHub 查询：PR #14 open、未合并；该 head 的两项基础检查均 success。
- Codex `63de97b` 与 C 搬入的 `3ca3e58` patch-id 相同，核心/特例文件无内容差异。C 的新增工作为公共入口、两份 acceptance 测试、规则卡和交接共 5 个文件。
- 使用该提交的 `buildApp().inject()` 实测规则详情接口，结果见下面问题 1；没有调用或重启正在运行的 dev 服务。

## 1. 规则卡尚未直接关联本次裁定证据

位置：`rules/cards/teaching-v1.json:89`。

TAIL.SANPING 的 statement 已解释《黄鹤楼》特例，但 evidenceIds 只有 `ev:rule:TAIL.SANPING:engineering-scope`。实测 `GET /api/v1/rules/TAIL.SANPING` 返回 200，evidence 数组也只有该条，未返回 `ctx:j03b2:08`。现有工程依据的 locator 确实提及第 13 号裁定，但 source 指向王力书目、assertion 仍是一般尾式口径，不能替代直接随卡返回那条作品裁定。

C 补法：规则卡追加既有 `ctx:j03b2:08` 引用；复用 context 注册表，不在 rules/evidence 复制同 ID 的另一份内容。新增对**实际发布卡**的证据闭合断言，合并读取 rule/context/works 的现成证据与来源；现有 `cards.test.ts` 的 `loadCards()` 仍读 draft-teaching-v1，扩大 ID 前缀正则并未覆盖这张发布卡的新说明。GLM 在集成 HTTP 测试验证规则详情能返回裁定证据及来源。

## 2. 独立用例已绿，但未覆盖任务书全部边界

位置：`packages/prosody/tests/acceptance/d3-reviewed-exceptions.test.ts:379` 起。

| 用例 | 当前实际覆盖 | C 应补的独立断言 |
|---|---|---|
| C05 | 仅 cilin | xinyun 同样不继承平水范围 |
| C06 | 审批 unverified、作品 unverified、错指纹 | 审批记录缺失、sources 断链 |
| C07 | 用户选音，实际仍为 P | 有效音 P/Z 歧义、unknown、有效音改为 Z |
| C09 | 稳定与幂等 | 深度冻结输入或前后快照，确认不修改输入 |
| C10 | ruleId/version、位置等 closure、resolvedBy | 最终报告 evidenceIds 与来源引用逐项可解析 |

这些边界在 Codex 的 core 自测中已有覆盖；本问题是 C 的独立验收尚未完成全部承诺，并非已确认出现同类运行错误。独立用例仍应由 C 自己补，不能只把 Codex 测试数计成 C 独立通过。

## 报告中的历史状态需要更新

- PR #11 已 merged/closed，不是待合并；本次已通过 GitHub API 核实。
- “D1 尚未结束”“API 仍是 mock”“核心待合入”等是旧记录，与当前 main 和 D3 交付不同。保留历史段，但把顶部总体状态和当前待办更新，避免作为新任务重复下达。
- C 包测试并未完成 HTTP 接线；GLM 接入与 E 金标准仍应分别回传实际结果。

## 可直接转发给 C

```text
已复验 PR #14@ebd3213：pnpm verify 全绿，47 文件/659 项；公共导出和主要用例可供 GLM 接线。
请补一小批收尾：
1. TAIL.SANPING 发布卡 evidenceIds 追加现有 ctx:j03b2:08，勿复制证据；补发布卡对合并证据/来源注册表的闭合断言。
2. 补 xinyun、缺审批、来源断链、未知/歧义/变仄、冻结输入、报告 evidence/source 闭合的独立用例。
3. 更新当前状态：PR #11 已合并，旧 D1/mock 待办标成历史。
完成后推送 PR #14，回传 SHA 和实际测试结果。具体复核见 docs/handoffs/d3-c-pr14-review.md（Codex 分支）。
```

## 可直接转发给 GLM

```text
C 的 PR #14@ebd3213 已由 Codex 独立复跑 pnpm verify，47 文件/659 项通过，公共导出可用于接线。
你可以继续批次一资源加载与真实 API 编排；C 同时补规则卡裁定引用和独立边界用例，最终集成复验包含其补丁。
注意 C 分支 3ca3e58 是 Codex 63de97b 的等价 cherry-pick；集成时比较差异，避免重复搬入同一补丁。PR #13 还有后续任务书文档，不要遗漏。
最终验证黄鹤楼目标 TAIL.SANPING=not_applicable/info，规则详情返回 ctx:j03b2:08 及来源，其它偏离保留；九组合、真实页面与 pnpm verify 各自记录。
PR #11 已合并，不必再次处理。
```
