# D3 · C 交付：已审特例独立验收（2026-10-19）

> 状态：**GREEN**（C01–C10 全部有独立断言并通过；全仓 47 文件 659 项通过）

## 基线与分叉

| 项 | 值 |
|---|---|
| base | `main @ f42172f`（含 f42172f，`merge-base --is-ancestor` 已验证） |
| Codex 实现 | `codex/d3-reviewed-exceptions @ 63de97b`，按单提交 cherry-pick 到本分支（未改实现） |
| branch | `feat/c-d3-exception-acceptance` |
| head | 见本提交 |

## 变更路径（均在 C 授权范围）

- `packages/prosody/src/index.ts`：新增 `applyReviewedWorkExceptions` / `parseReviewedWorkExceptions` / `ReviewedWorkExceptionError` 与 `ApplyReviewedWorkExceptionsInput` / `ReviewedWorkException` 的**公共导出**（不编辑实现）。
- `packages/prosody/tests/acceptance/d3-reviewed-exceptions.test.ts`：新增 **C01–C10 共 11 项**独立验收（含 C04a 五绝 / C04b 七律两个反例）。
- `packages/prosody/tests/acceptance/cards.test.ts`：证据命名断言放宽到 `ev:rule:` / `ev:work:` / `ctx:` 并校验 source 可解析。
- `rules/cards/teaching-v1.json`：**TAIL.SANPING** 说明改为「一般近体三平尾 error；已审作品字位按登记范围作特征解释（not_applicable/info，非拗救、不豁免其他规则）」，limitations 列明范围与继承限制。
- `docs/handoffs/d3-c-acceptance.md`（本文件）。

**未改**：`src/core/`、`src/reviewed-exceptions/`（Codex 单写）、`rules/exceptions/`（Codex 单写）、`apps/api`、根配置、契约、A/B/E 的审批记录与数据。

## 依据

- `docs/reviews/13_J03三首核心诗逐字人审_第二批.md` §五 第 8 条（+ §六 第 2 项）：黄鹤楼 l4c5–7「空悠悠」= PPP，作**古风式律诗特征**保留，不判近体出律、不作 error；「空」取平声（`pingshui:空:ping:一东`）。
- 作品元数据：`data/works/metadata.json` 的 `work:huanghelou`（approved、qilv、指纹 `7b65737c…`、证据 `ev:work:huanghelou:j03`）。
- 例外记录：`rules/exceptions/reviewed-works-v1.json`（Codex）；审批证据 `ctx:j03b2:08` 复用 B 已落库的 `data/context/evidence.json`（同 locator，未在 `rules/evidence` 重复定义，避免资源冲突）。

## 当前实际结果

```text
pnpm exec vitest run packages/prosody/tests/acceptance
  → exit 0；6 文件、94 项通过（含 D3 新增 11）
pnpm exec vitest run --maxWorkers=1（全仓）
  → exit 0；47 文件、659 项通过
tsc --noEmit / eslint . / generate-contracts --check  → 均 exit 0
```

| 用例 | 断言要点 | 结果 |
|---|---|---|
| C01 | 固定正文+已审读音：l4c5–7 observed=PPP；应用例外后 `not_applicable/info`、`resolvedBy=null`、locations 仍 l4c5–7、message 含「已审作品特例」、evidenceIds 含 `ctx:j03b2:08`；七律模板身份保留 | ✅ |
| C02 | 仅加标点/换行（汉字序列相同）：仍命中；明确 `inputHash ≠ fingerprint` | ✅ |
| C03 | 正文改一字（末字愁→秋）：不命中，仍 fail/error | ✅ |
| C04a/b | 普通五绝 / 普通七律合成 PPP 尾：仍 fail/error | ✅ |
| C05 | 同一正文换 `cilin`：不套用平水特例 | ✅ |
| C06 | 审批证据 unverified / 作品未批 / 指纹不符：三种都不生效 | ✅ |
| C07 | 用户覆盖（`selectionMethod="user"`）在 l4c5：不命中，读音不被改动 | ✅ |
| C08 | 同诗其他字位硬错保留（硬错数恰好 −1，仅尾式转 info）；METER 判读不被顺手消除 | ✅ |
| C09 | 两次运行一致；对已应用报告再应用一次结果不变（幂等） | ✅ |
| C10 | `checkReportClosure` ok；ruleId ∈ 10 固定 ID；resolvedBy 不伪填 RESCUE | ✅ |

## 与任务书/07 号的对照

- 07 号要求「通用核心之后、summary 之前的纯函数适用层」：C 的测试按此调用顺序验证（core report → apply → closure），未验证 API 层。
- 07 号要求「命中时保留字位、PPP 观察、原常格期望和可读解释」：C01/C08 断言 observed、locations、message 与其它硬错保留。
- 07 号要求「不凭题名/标签/templateId 免责」：C03/C05/C06 断言改字、换书、缺审批均不命中。
- 07 号要求「不伪写 pass、不造 ruleId」：断言 `status=not_applicable`、`severity=info`、`resolvedBy=null`，10 个 ruleId 不变。

## 未覆盖 / 后续（非 C 单方可完成）

1. **GLM**：在 orchestrator 中调用 `applyReviewedWorkExceptions`（传入 genre 决策、真实指纹、`rules/exceptions` 记录、合并后的 evidence/sources），并用真实黄鹤楼走 `/analyze` 验证；C 的包测试不能替代页面/HTTP 验收。
2. **E**：把第 13 号第 8 条写进金标准逐字预期（TAIL.SANPING=保留特征），三首 golden 的 reviewStatus 仍 pending。
3. **Codex**：`rules/exceptions` 记录与 `data/context/evidence.json` 的 `ctx:j03b2:08` 已在测试中按同 locator 对齐；若后续改 locator 需同步。
4. 旧 PR #7 的三次审批提交与当前 main 的逐项对照：C 未重复合并，留 GLM 处理。

## 依据/版本影响

- 契约不变（contract-v1）、ruleId 不变（10）、模板不变；仅新增内部例外适用层与 TAIL.SANPING 卡说明。
- 例外**只**对 `rules/exceptions/reviewed-works-v1.json` 登记且作品元数据/指纹/审批证据三者 approved 的范围生效；词林/新韵不继承。
