# D4 · C 交接：独立规则回归与发布口径（2026-10-20）

> PR（D4 主批）：**#22** https://github.com/65638/poetry-checker/pull/22 （`feat/c-d4-closeout` → `integrate/d4`，已并入 main）
> PR（D4 收口批）：**#26** https://github.com/65638/poetry-checker/pull/26 （`feat/c-d4b-confirm` → `main`；创建时 head `832889d`，已用 `git ls-remote refs/pull/26/head` 核对）

## 基线与分支

| 项 | 值 |
|---|---|
| base | `origin/integrate/d4 @ 898b1a0a26a5f6e8e79a0b2cb31848b24537a185`（Codex 发布的 D4 基线） |
| branch | `feat/c-d4-closeout`（从上述基线建，未 reset/clean/覆盖他人提交） |
| head | 本提交（commit 后见 `git log -1`） |
| 环境 | Node 24.21.0（本机 runtime）、pnpm 11.25.0；任务书固定 Node 24.19.0，本机无法切换，已在下方注明 |

## 改动文件（均在 C 授权范围）

| 文件 | 说明 |
|---|---|
| `packages/prosody/tests/acceptance/d4-regression.test.ts` | **新增 10 项**：七言粘对逐字位（正/破粘/破对）、七言三仄尾 warning、跨书 ruleId 一致性、未定音不假绿、发布卡校验器正/负例、Finding 字段不变量 |
| `packages/prosody/src/report/rule-cards.ts` | **新增**：`validateRuleCards(cards, evidence, sources, frozenRuleIds)`，只读校验 ruleId/version/重复/证据解析/证据 approved/来源解析，返回稳定错误码 |
| `packages/prosody/src/index.ts` | 导出 `validateRuleCards` 及 `RuleCardProblem*` 类型（C 独占文件） |
| `docs/rules/d4-coverage.md` | **新增**：按语义场景盘点 16 类覆盖（已有 / D4 新增 / 未覆盖） |
| `docs/handoffs/d4-c.md` | 本文件 |

未改：`src/core/`、`src/reviewed-exceptions/`、`rules/exceptions/`、`apps/api`、根配置/CI、公共契约与 10 个 ruleId、A/B/E 数据与审批原件。

## 输入版本与依赖

沿用 D4 基线记录的真实资源版本（未在本批改动）：

| 资源 | 版本 |
|---|---|
| 平水 | `pingshui-cwr-ff0e9c1-d3-full-sanj-jiang-review4` |
| 词林 | `cilin-cwr-ff0e9c1-d3-full-clean1` |
| 新韵 | `xinyun-rebuild-d2-full` |
| 规则 | `teaching-v1+reviewed-works-v1` |
| 语境 / 作品 | `context-rules:11` / `works:3` |

## 实际执行与结果（本机 2026-10-20）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `vitest run packages/prosody/tests/acceptance` | 0 | **7 文件 / 114 项**通过（D4 新增 10；原 6/104） |
| `vitest run --maxWorkers=1`（全仓） | 0 | **54 文件 / 743 项**通过（基线 733 + 新增 10） |
| `tsc --noEmit` | 0 | 通过（含新增模块与测试） |
| `eslint .`（本批实际跑 `packages/prosody`） | 0 | 通过 |
| `tsx scripts/generate-contracts.ts --check` | 0 | 8 个契约/模板文件一致 |
| `pnpm install --frozen-lockfile` | 未运行 | 复用既有 node_modules；本机内存受限，未新装 |
| `pnpm verify` | **未整体运行** | 见下：本机可用提交内存不足（曾 OOM exit 134），逐项等价执行 |
| 真实 API 三首 / 六格 | 未运行 | 属 E/Codex；当前基线记录为 3 通过/6 阻断（503 `LOOKUP_EVIDENCE_UNVERIFIED`） |
| 浏览器 E2E | 未运行 | 属 E/D |

> 说明：`pnpm verify` = lint + typecheck + test + check:generated；本批已分别执行并全部 exit 0，但因本机内存不足未以单命令重跑，请勿把“逐项通过”写成“`pnpm verify` 通过”。Node 版本为 24.21.0（本机），与任务书固定的 24.19.0 有差异，Codex 已在 D3 复核中指出；本批未因此改动代码。

## 覆盖与缺口

- 语义场景覆盖表见 `docs/rules/d4-coverage.md`：16 类中 14 类有 C 侧正反例（含字位），2 类属真实 API/数据（不计为通过）。
- 本批只补**未覆盖缺口**，未复制既有断言；D2/D3 的 104 项保持原样通过。
- 发布卡完整性：新增校验器 + 6 类负例，满足“ID/版本/来源不一致即报错”，且**不把期望改成现有错误**。
- 特例（黄鹤楼 l4c5–7）沿用 D3 C01–C16；本批未改实现，仅在覆盖表中标注其边界。

## 未完成 / 下一责任人

| 项 | 责任方 |
|---|---|
| 真实 API 三首与 `/readyz`、九格验收 | E / Codex（08 台账） |
| 词林/新韵数据补审（六格 503） | A / B |
| 浏览器/移动端/导出 | E / D |
| 三库整库人工审核、全库简繁覆盖 | A / 组长 |
| `pnpm verify` 单命令在固定 Node 24.19.0 环境重跑 | Codex（集成环境） |

## 备注（口径）

- 工程教学口径（`engineering-scope` 证据）与有固定文献定位的规则在证据标题/limitations 中仍分开；本批未新增文献页码，也未把工程等级写成文献规定。
- `validateRuleCards` 只校验引用闭合与冻结约定，不判断 statement 的语文学正确性。
- 未向其他成员发消息；PR 由组长转发。

---

# D4 收口（2026-10-20 晚，基线 main @ f3ef270）

> 任务卡：`docs/team/D4_收口任务书_2026-10-20/03_给C_终验复跑与数量盘点.md`
> 卡内写的 main 为 `c409d20`；实际执行时 main 已前进到 **`f3ef270`**（含 PR #22 合并、B/D 批与月下 UI 文档），本记录以实际 SHA 为准。

## 一、新基线复跑（G03 收口动作）

分支：`feat/c-d4b-confirm`（`git switch -c ... origin/main`）。工作树干净。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `vitest run packages/prosody/tests/acceptance/d4-regression.test.ts` | 0 | **1 文件 / 10 项**通过 |
| `vitest run packages/prosody/tests/acceptance`（C2 全量 + D3/D4） | 0 | **7 文件 / 114 项**通过 |
| `pnpm verify`（lint + typecheck + 全仓 test + check:generated） | 0 | **56 文件 / 763 项**通过，与任务卡 763 基线一致 |

结论：**main=f3ef270 上复跑通过**；D4 批与最新 main（B/D 批、月下 UI 文档）无冲突，prosody 未回归。

## 二、G09 规则组盘点

见 `docs/rules/g09-rule-groups.md`：36 组按“10 ruleId × 正/反/边界（30）+ 特例层 命中/不命中/隔离（3）+ 语境规则 命中/缺失/冲突（3）”展开；**33/36 有 C 侧测试证据，G34–G36 语境规则属 B/API**。结论与缺口在该文档“四、口径差异与缺口”一节，未虚开规则组。

## 三、黄鹤楼演示口径（给 E，可直接放进提纲第 4 段）

**一句话结论**：黄鹤楼的体裁是**七律**；第四联「白云千载空悠悠」的**三平尾属已审特例**，按例外层记为“不适用/提示”，不是拗救、也不是整首免检；**同诗其余常格差异仍逐项列出**，所以报告整体可以是 `fail`——这是“特例保留 + 其余照报”，不是“全合律”，也不是“全出律”。

**出处指向（演示时念这一句即可）**：`docs/reviews/13_J03三首核心诗逐字人审_第二批.md §五 第 8 条`；王力《诗词格律》把《黄鹤楼》举为“古风式的律诗”（页 343 起，C 已签字定位）。

**建议话术**（约 20 秒）：
> “这首我们按七律核。‘空悠悠’确实是三平尾，专家已裁定它是这首诗的古风本色，所以系统把它标成‘受限特例、不判出律’，依据记在 13 号人审记录第 8 条；但同一首里的失粘、失对和其他字位偏离仍照常报，所以整首结论仍是‘有出律项’。它既不是全合律，也不是全出律。”

**不要说的话**：“黄鹤楼全部合律”“特殊拗律所以全部免检”“三平尾被系统忽略了”。

---

# D5 复核（2026-10-21，基线 main @ cea831b）

> 任务卡：`D5_最后一轮任务书_2026-10-21/03_给C_独立复核与规则口径收口.md`
> 分支：`feat/c-d5-review`（从 `origin/main @ cea831b` 建）；本批**只审不重写**：不改核心、不改 B/E 数据与台账。

## 1. G34–G36 逐组复核（结论：35/36）

逐组证据、断言要点与运行结果见 **`docs/rules/d5-g34-g36-review.md`**，原表已同步更新为 **`docs/rules/g09-rule-groups.md`**：

| 组 | 结论 | 依据 |
|---|---|---|
| G34 语境命中 | **补齐** | `packages/readings/tests/d3-acceptance.test.ts` B01（L94/L119）：`selectionMethod=context_rule`、选中四纸、竞争候选保留、命中数 2/3/6 |
| G35 语境缺失不猜音 | **补齐（样本单一）** | 同文件 B02（L143）：不命中时不允许 context_rule，结果只允许 blocked/ambiguous |
| G36 语境冲突不静默择一 | **仍缺** | 只有间接证据（B03/B04 竞争候选保留、B06 跨书拒绝），没有“规则间/规则与证据冲突”的直接用例 → 责任 B |

```text
pnpm exec vitest run packages/readings/tests/d3-acceptance.test.ts
  → exit 0；1 文件 / 11 项通过
```

## 2. C 验收在基线 cea831b 的复跑（最终候选 SHA 待 GLM 广播后再跑）

```text
pnpm exec vitest run packages/prosody/tests/acceptance   → exit 0；7 文件 / 114 项
pnpm verify                                              → exit 0；56 文件 / 763 项
```

重点语义均在 114 项内：黄鹤楼限定特例（C01/C11–C16）、非特例偏离保留（C08）、跨书隔离（C05/C11）、未定音不假绿（D4-03）。
**最终候选 SHA 未到（GLM 将合并 #27/#28/#29 后广播）**，本记录只证明 cea831b；最终 SHA 到达后需重跑 114 项并更新本行，不用旧运行冒充新运行。

## 3. 给 E 的可粘贴结论（G09 表述更正 + 三首口径）

```text
【给 E · G09 表述更正 + 三首解释核对（C，2026-10-21）】

1) G09-2 的 3 组缺口表述需更正：
   不是“同一 ruleId 下的用例/诗例覆盖不足”，而是 B 的语境规则在 readings/API 层的行为证据：
   G34 语境命中、G35 语境缺失不猜音、G36 语境冲突不静默择一（均不新增 ruleId）。
   经 C 复核：G34/G35 已在 packages/readings/tests/d3-acceptance.test.ts 的 B01/B02
   有独立断言与可运行用例（11 项全过）；G36 仍缺“规则间冲突/规则与证据冲突”的直接用例
   → 规则组计数由 33/36 更新为 35/36（G36 缺口，责任 B）。

2) 三首口径核对（可直接进提纲）：
   - 登鹳雀楼：五绝（近体），平水通过，证据闭合。
   - 静夜思：古绝（古体），not_applicable（不适用近体），字音仍展示；
     不是“凡不合律一律判古体”。
   - 黄鹤楼：七律；l4c5–7「空悠悠」三平尾属已审特例，
     按例外层记 not_applicable/info（非拗救、非整首免检）；
     同诗其余常格差异照报，故整诗 summary 可 fail。
     一句话：“特例保留、其余照报——不是全合律，也不是全出律。”

3) 出处：docs/reviews/13_J03三首核心诗逐字人审_第二批.md §五 第 8 条；
   王力《诗词格律》页 343 起「古风式的律诗」。
```


