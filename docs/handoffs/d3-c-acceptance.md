# D3 · C 交付：已审特例独立验收（草稿，2026-10-19）

> 状态：**RED 阶段**（预期失败已记录，等 Codex `reviewed-exceptions` 接口；合并前必须转绿）

## 基线与分叉

| 项 | 值 |
|---|---|
| base | `main @ f42172f`（`merge-base --is-ancestor f42172f origin/main` = 真） |
| branch | `feat/c-d3-exception-acceptance` |
| head | 见本提交 SHA（首次提交记录 RED 基线） |

## 变更路径

- `packages/prosody/tests/acceptance/d3-reviewed-exceptions.test.ts`（新增，C 独立预期）
- `docs/handoffs/d3-c-acceptance.md`（本文件）

未改：`src/core/`、`src/reviewed-exceptions/`（Codex 单写）、`rules/exceptions/`（Codex 单写）、`apps/api`、根配置、契约、`rules/cards`（本批尚未改）。

## 依据

- `docs/reviews/13_J03三首核心诗逐字人审_第二批.md` **第 8 条 + 第六节第 2 项**：
  「白云千载空悠悠」的「空」取平声 → 尾三字「空悠悠」= **PPP 三平尾成立**，
  作**古风式律诗特征保留**，不判近体出律、不作 error。
- 固定正文与读音：同记录第 5/6/7/8/9/10 条（乘=P、l2c3 空=P、不=入声、l4c5 空=P、汉=去声、乡=P）。
- 范围：只裁《黄鹤楼》该字位（平水、已审正文），**不扩成全诗免责**；不新增 ruleId、不改契约。

## 当前实际结果（本机 2026-10-19）

```text
pnpm exec vitest run packages/prosody/tests/acceptance/d3-reviewed-exceptions.test.ts
  → 1 failed | 5 passed | 5 todo

C01 [RED] 已审黄鹤楼 l4c5–7=PPP
  现状：TAIL.SANPING=status "fail" / severity "error"
  期望：status "not_applicable" / severity "info" / resolvedBy=null（保留 observed=["P","P","P"]）
  失败断言：expect(sanping.status).toBe("not_applicable") → 收到 "fail"
  （前面「PPP 确实存在」「七律身份保留」两项已通过）
C04a 普通五绝合成 PPP 尾 → fail/error ✅
C04b 普通七律合成 PPP 尾 → fail/error ✅
C08 同诗其他字位真实偏离仍保留（hard fail 计数 > 0）✅
C09 重复运行输出一致 ✅
C10 checkReportClosure ok；ruleId ∈ 10 个固定 ID；resolvedBy ∈ 三个救法 ✅
```

`eslint`（该文件）与根 `tsc --noEmit` 均 exit 0；**未跑全仓 verify**（RED 阶段，且本机内存受限，见 D2 批次 HANDOFF 记录）。

## 待 Codex（T+0.5h 交付物）

1. `reviewed-exceptions` 的**内部函数签名**（输入：作品指纹/正文、rhymeBook、dataVersion、审批记录？输出：命中的例外项）；
2. `rules/exceptions/*` 的**记录结构**（作品标识、字位范围、规则 ID、依据引用、审批范围）；
3. 例外在报告中的落地方式（`not_applicable` + `info`，保留 location/observed/常格对照）。

拿到后 C 会：在 `src/index.ts` 导出内部函数与类型（不编辑实现）→ 补 C02/C03/C05/C06/C07 断言 → 改 `rules/cards/teaching-v1.json` 的 TAIL.SANPING 说明与 limitations → 补例外证据（引用第 13 号裁定，不伪造页码）→ 复跑 acceptance 与 `pnpm verify`。

## 未覆盖 / 风险

- C02/C03/C05/C06/C07 只有 todo，暂无实现级断言（依赖例外接口）；
- `07号Codex任务书` 未在本地找到（桌面与仓库均未见），需组长提供后再按 07 的口径核对范围；
- 例外生效后若 `1` 号记录的字位与 `13` 号记录冲突，以 13 号为准；本文件不扩大审批范围。
