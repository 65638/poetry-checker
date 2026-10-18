# @poetry/prosody HANDOFF（队员 C）

## D2 批次（2026-10-18）：核心独立验收、规则证据与报告封装

### 基线与 SHA

| 项 | 值 |
|---|---|
| D1 main 基线 | `6375b35`（D1 终验记录，410 项测试） |
| 核心实现 | `b5457e4`（`feat(prosody): implement explainable meter evaluation and rescues`） |
| 核心交接 HEAD | `14df99017466b718ef2fe2baf54b0553f978c71a` |
| 核心来源 | `support/core-d2.bundle`，`git bundle verify` 通过；按 07 文档导入为 `review/codex-core-d2`（未覆盖 main，未重复 cherry-pick） |
| 验收分支 | `feat/c-d2-acceptance`（基于 `review/codex-core-d2` 合并 `origin/main` 后的 `008943a`） |
| 契约/规则版本 | contract-v1 不变；teaching-v1；10 个 ruleId、`version="1"` 不变 |

### 完成文件与行为

| 文件 | 说明 |
|---|---|
| `packages/prosody/tests/acceptance/d2-core.test.ts` | **新增 32 项**独立验收：C2-01..C2-13（孤平/自救/特拗/对句相救五七言/尾式/A 型小拗/改第 2 字/三值与候选/公共归部与首句入韵/模板与适用性状态/评分与 keyRate/确定性与引用闭合）。预期全部手写，不调用被测实现生成答案 |
| `packages/prosody/tests/acceptance/closure.test.ts` | **新增 3 项**：引用闭合工具验收（正格报告通过、已救报告 resolvedBy 只引用救法、人为破坏逐项报错误码） |
| `packages/prosody/src/report/closure.ts` | **新增**：只读引用闭合工具 `collectRuleReferences` / `checkReportClosure`（ruleId/version/resolvedBy/relatedFindingIds/relations/韵脚/字位），经 `src/index.ts` 导出给 GLM；不改变状态、等级、候选顺序 |
| `packages/prosody/tests/acceptance/fixtures.ts` | 增加 `codeLine`/`makeCodePoem` 字位编码构造器（P/Z/A/U、可按字位指定韵部），供 D2 反例构造 |
| `packages/prosody/tests/acceptance/D2-matrix.md` | 重写为 C2-01..C2-13 实跑矩阵：逐项填“通过/未执行”、附 SHA 与交接给 GLM 的引用闭合约定 |
| `rules/cards/draft-teaching-v1.json` | 10 张规则卡来源待审项具体化（三首案例、核心救法优先；无编造版次/页码）；仍全部 pending |
| `docs/rule-sources.md` | **新增**：规则来源人工审核清单（三首案例 → 核心救法 → 其余规则），给组长可定位摘录；核实后才允许 approved |
| `packages/prosody/README.md` | 更新公共导出、D1/D2 已验收能力、未实现边界 |
| 旧 `templates.test.ts` | **未改动**（Codex 的 3 行占位迁移见下，属 0006 约定范围） |

### 旧 C-D1-02 占位迁移核对（0006）

Codex 在 `b5457e4` 中对 `templates.test.ts` 只改 3 行：C-D1-02 的 `relationFit`/`rhymeFit` 由 null 预期改为正格 1，注释同步；`parallelismFit` 仍为 null。与 `docs/handoffs/0006-core-d2-test-transition.md` 完全一致，未改其它断言、fixture 或规则卡。本次我在其上继续维护该文件，未回退。

### 执行命令与真实结果

```text
pnpm exec vitest run packages/prosody/tests/acceptance
  → exit 0；5 个测试文件、82 项通过（D2 新增 32 + 闭合工具 3）
    templates 28、uncertainty 14、cards 5、d2-core 32、closure 3
pnpm --filter @poetry/prosody test
  → exit 0；core 13 + acceptance 82 = 95 项
pnpm verify
  → exit 0；31 个测试文件、487 项通过（合并后基线 452 + C 新增 35），
    lint、typecheck、构建、8 个生成物一致性全部通过
git diff --check → exit 0
```

### 验收结果与边界

- C2-01..C2-13 **全部通过**（明细见 `tests/acceptance/D2-matrix.md`）。
- **未发现核心缺陷**：首跑 1 处失败为我测试输入笔误（C2-04 救位未知行写成 `PPUPZ`，正确为 `PPUZP`），修正后全绿；无 core 补丁。
- 未执行/边界：首句借邻韵自动放行（无审核表，不实现）；更宽/罕见救法；七言对句相救真实诗例；`parallelismFit` 恒 null；三首名篇真实链路（待 A/B/E）。
- 规则卡 10 条仍 pending（文献未核实），`docs/rule-sources.md` 列出逐条待审项与优先案例；代码通过验收 ≠ 文献审核通过。

### 给 GLM 的引用闭合约定（报告/规则资源）

- 报告内 `Finding.ruleId` 必须是 10 个固定 ID 之一，且 `provenance.rules` 中存在同 `id`、`version="1"` 的规则卡；`resolvedBy` 指向救法规则卡 ID，同样随 provenance 返回。
- `relatedFindingIds` 只引用同一报告内的诊断 ID；`relations[].findingIds`、`rhyme.tokenIds`、`locations[].tokenId` 必须能在 `poem.tokens` 解析（C2-13 已在核心层验证）。
- C 未改动 `src/index.ts`：公共导出（matchTemplates/evaluateProsody/getTemplates/checkTonePossibilities/checkCommonRhyme）已指向新实现，无需额外包装；辅助函数不是第二份 HTTP 协议。
- 汇总状态（summary/HTTP 错误）由 GLM 按契约 §6 实现；C 提供 Finding 的 status/severity 语义。

### 给 GLM 的接入示例（2026-10-18 补充：引用闭合工具）

C 新增 `src/report/closure.ts`，并从 `@poetry/prosody` 导出（只读校验，不改报告、不发 HTTP）：

```ts
import {
  matchTemplates,
  evaluateProsody,
  checkReportClosure,
  collectRuleReferences,
} from "@poetry/prosody";

// 1) 候选 → 2) 体裁（E 侧）→ 3) 完整判定
const candidates = matchTemplates({ poem, formHint, ruleSet: "teaching-v1" });
const report = evaluateProsody({
  poem,
  candidates,
  selectedTemplateId,
  applicability,
  ruleSet: "teaching-v1",
});

// 4) 组装 AnalysisResponse / provenance 前自检引用闭合
const closure = checkReportClosure(report, poem);
if (!closure.ok) {
  // closure.problems: { code, detail }[]，例：resolved_by_unknown / related_finding_missing /
  // check_id_duplicate / rhyme_token_missing / location_mismatch
  // 交 C/Codex 定位，不要静默丢弃或改写状态
}

// 5) provenance.rules 必须同时返回普通规则与救法规则，version 为 "1"
const { ruleIds, rescueRuleIds } = collectRuleReferences(report);
const referenced = [...ruleIds, ...rescueRuleIds];
// 用 referenced 去 rule cards 里取卡（id/version/name/scope/statement/limitations/evidenceIds），
// sources/evidence 按卡内 evidenceIds 装配；不得返回空数组冒充“无引用”。
```

要点：

- `checkReportClosure` 只读：不改变 status/severity/候选顺序，不允许用它“修”报告来通过测试。
- `Finding.resolvedBy` 是 RuleCard ID（仅 `RESCUE.SELF/TEAO/DUIJU`）；`relatedFindingIds` 才是 Finding 实例 ID。
- 示例中的字段以 `@poetry/contracts` 为准（本段是调用形状示意，不是逐字快照）；`ruleVersion` 恒为 `"1"`。
- 若报告来自“未选模板/不适用/未支持”分支，checks 可能为空或仅含待确认项，闭合校验仍应通过。

### 未解决问题 / 下一步

1. 规则文献与真实诗例：按 `docs/rule-sources.md` 逐条核实，核实后才能把 pending 改为 approved 并进入发布来源集合。
2. 公共入口依赖边界：`packages/contracts/tests/fixtures.ts` 与 `scripts/generate-contracts.ts` 仍从 `@poetry/prosody` 导入 `getTemplates`，出口收窄需组长/Codex 确认。
3. 三首名篇真实链路与 E 的体裁接线：需 A 真实韵书、B 真实读音、E 修复后联合复验；C 负责候选特征正确性，E 决定体裁。
4. 与 E 的对齐仍按三项执行（特征正确性/体裁决策分离；parallelismFit null 不得当作缺失扣分；样本分工），见 D2-matrix。

### 需要 GLM 修改的配置

无（分支含 Codex 核心基线用于验收；合入顺序由组长调度）。

---

# D1 批次（2026-10-16）历史记录

日期：2026-10-16（D1），2026-10-17 按 Codex 口径确认补充修订。分支：`feat/c-d1-acceptance`（PR #1，已由组长合并进 main `a5e2415`），基线：`9b27322`（= `contract-v1`）。
执行环境：捆绑 Node v24.21.0 + pnpm 11.25.0（engines 满足；系统 Node 24.18.0）；网络经用户代理 `127.0.0.1:7890` 可通（git 直连被 TLS 重置，需 `git -c http.proxy=...`）。

## D1 完成文件与行为

| 文件 | 说明 |
|---|---|
| `tests/acceptance/fixtures.ts` | 独立合成诗文构造器：`makeAnnotatedPoem`、`makeSyntheticPoem`、`overrideToken`；手工基线 `BASE_PATTERNS`、`SEQUENCES`、`FORM_SHAPES`；全部样本经 `AnnotatedPoemSchema.parse` |
| `tests/acceptance/templates.test.ts` | C-D1-01/02/03 与可变位断言 |
| `tests/acceptance/uncertainty.test.ts` | C-D1-04..09：三值、未知、可判位比例、押韵集合反例、冻结输入、补充平面字位置 |
| `tests/acceptance/cards.test.ts` | 规则卡草案结构校验（10 条、`RuleCardSchema`、`version="1"`、小拗与 6↔5 写入、不伪造出处） |
| `tests/acceptance/D2-matrix.md` | D2 验收矩阵（D2 批次已重写为 C2 实跑结果） |
| `rules/cards/draft-teaching-v1.json` | 规则卡草案（pending，无 evidenceIds） |
| `docs/rulebook.md` | 口径确认记录、规则 ID、采用口径、正反例、来源待核实、实现边界 |
| `packages/prosody/README.md` | 导出、能力、边界、命令、约束 |

`src/index.ts` 未修改：公共导出与组长指令一致，不添加等价包装。

## 口径确认与修订（Codex，2026-10-17）

1. **规则 ID**：全部采用；公共韵部正式名为 `RHYME.COMMON`；首版 `version="1"`。
2. **可变位**：按确认表执行；**撤回**此前“七言 D 型第 3 位实现差异”的错误结论（第 3 字本来就是“中”，实现一致）。
3. **A 型小拗**：采用②允许并标 info（`pass`/`info`、`expected=[P,Z]`、`observed=[Z]`、`resolvedBy=null`，复用 METER.POSITION）。
4. **七言对句相救**：出句第 6 字 ↔ 对句第 5 字；位置正确只是必要条件。

## D1 执行命令与真实结果

```text
pnpm exec vitest run packages/prosody/tests/acceptance → 47 项通过（D1 批）
pnpm verify → 83 项通过（7 文件）
```

## D1 发现的最小反例

未发现核心缺陷；3 处失败为 C 手写预期表笔误（七言起式名称映射、`possibleCommonGroupIds` 码点排序），已修正；七言 D 差异结论已撤回。

## D1 规则卡

10 条 pending、无证据引用；工程口径已确认，文献待核实。

## D1 与 E 对齐（三项）

1. C 负责候选特征正确性，E 负责体裁决策；C 不导入 genre，E 不重算格律。
2. `relationFit`/`rhymeFit` 现由核心实现给出，`parallelismFit` 恒 null；toneFit 高不能让 E 直接认定强近体。
3. C 的规则级样本在 `packages/prosody/tests/acceptance`；E 的作品/体裁样本由 E 管理。

## D1 未解决问题（部分已由 D2 解决）

1. 规则卡文献版本/章节/页码、A 型小拗文献依据、七言相救与特拗真实诗例：待人工核实（D2 已整理 `docs/rule-sources.md`）。
2. 公共入口依赖边界：待确认。
3. 首句借邻韵关系表：待审核（P0 不自动放行）。

## 数据/规则版本

- 契约：contract-v1（9b27322）；规则集：teaching-v1（rules/templates 生成物未改动）。
- 本批不涉及数据；合成 fixture 仅用于规则/算法验收，不得进入真实分析路径。
