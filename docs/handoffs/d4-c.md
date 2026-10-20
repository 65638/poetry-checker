# D4 · C 交接：独立规则回归与发布口径（2026-10-20）

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
