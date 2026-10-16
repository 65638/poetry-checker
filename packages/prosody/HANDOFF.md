# @poetry/prosody HANDOFF（队员 C，D1 批次）

日期：2026-10-16（D1），2026-10-17 按 Codex 口径确认补充修订。分支：`feat/c-d1-acceptance`（PR #1），基线：`9b27322`（= `contract-v1` 标签，契约已由组长冻结）。
执行环境：捆绑 Node v24.21.0 + pnpm 11.25.0（与 packageManager 锁定一致；组长环境为 Node 24.19.0，本机系统 Node 为 24.18.0，均满足 `engines: >=24 <25`）。网络：直连 GitHub 被 TLS 重置，经用户开启代理（127.0.0.1:7890）后 fetch/pull/push 正常。

## 完成文件与行为

| 文件 | 说明 |
|---|---|
| `packages/prosody/tests/acceptance/fixtures.ts` | 独立合成诗文构造器：`makeAnnotatedPoem`、`makeSyntheticPoem`、`overrideToken`；手工基线 `BASE_PATTERNS`、`SEQUENCES`、`FORM_SHAPES`、预期辅助（不调用被测生成器产生答案）；全部样本经 `AnnotatedPoemSchema.parse` |
| `packages/prosody/tests/acceptance/templates.test.ts` | C-D1-01/02/03 与**可变位口径断言**：16 模板结构、起式、韵脚、指定体式匹配、结构不匹配空候选、七言 D 第 3/5 字与五言 D 第 3 字 |
| `packages/prosody/tests/acceptance/uncertainty.test.ts` | C-D1-04/05/06/07/08/09：三值、未知候选、可判位比例、押韵集合反例、冻结输入不可变、补充平面汉字位置 |
| `packages/prosody/tests/acceptance/cards.test.ts` | 规则卡草案结构校验（10 条、`RuleCardSchema`、`version="1"`、A 型小拗写入 METER.POSITION、七言相救 6↔5、不伪造出处） |
| `packages/prosody/tests/acceptance/D2-matrix.md` | Codex 下一批 D2-01..D2-16 的精确输入/预期/依据/负责人，均标“未执行：核心待实现” |
| `rules/cards/draft-teaching-v1.json` | 规则卡草案（draft_only_not_for_release；10 个确认 ID，首版 `version="1"`，全部 pending，无 evidenceIds） |
| `docs/rulebook.md` | 口径确认记录、规则 ID 对照、采用口径（含 A 型小拗②统一输出约定）、正反例、来源待核实清单、实现边界 |
| `packages/prosody/README.md` | 公共导出、已验收能力、未实现边界、命令与约束 |

`src/index.ts` 未修改：现有公共导出与组长指令描述一致，无实际缺陷，不添加等价包装。

## 口径确认与修订（Codex，2026-10-17）

来源：`C_规则口径确认_2026-10-17`（确认人 Codex，核对基线 `9b27322`）。落地改动：

1. **规则 ID**：全部采用，公共韵部正式名由提案 `RHYME.COMMON_GROUP` 改为 **`RHYME.COMMON`**；首版规则卡 `version` 由 `"draft-1"` 改为字符串 **`"1"`**；其余 9 个 ID 不变。
2. **可变位**：按确认表执行（五言 A 中仄中平仄 / B 中平中仄平 / C 中平中仄仄 / D 中仄仄平平；七言对应表）。**撤回我先前的错误结论**：七言 D 型确认表 `中平中仄仄平平` 的第 3 字本来就是“中”，当前 `templates.ts`（七言 D 放开下标 0、2）与确认表一致——**不存在“实现差异”，不改实现**。前一轮 PR 描述与 HANDOFF 中的“发现 1 处实现差异”表述有误，本文件即为更正。已新增独立断言固化该口径。
3. **A 型小拗**：采用**②允许并标 info**。统一输出：`ruleId=METER.POSITION`（不新增第 11 个 ID）、`ruleVersion="1"`、`status=pass`、`severity=info`、`locations`=五言第三字/七言第五字、`expected=["P","Z"]`、`observed=["Z"]`、`resolvedBy=null`，复用同字位 METER.POSITION 记录，不产生矛盾 fail；只覆盖 A 型第三字（七言第五字），不是 RESCUE.TEAO，也不覆盖出句第四字（七言第六字）大拗。
4. **七言对句相救**：位置确认为出句第 6 字 ↔ 对句第 5 字（按五言核心后移两字）；位置正确只是必要条件，完整判据（前缀、完整后五字、其他固定位置、候选不确定性）留 D2 验收；合成测试材料 `PPZZPZZ / ZZPPPZP` 仅用于说明位置对应。

## 执行命令与真实结果（2026-10-17 复跑）

```text
pnpm exec vitest run packages/prosody/tests/acceptance
  → 3 个测试文件、47 项测试通过（exit 0）
    templates.test.ts 28、uncertainty.test.ts 14、cards.test.ts 5
pnpm --filter @poetry/prosody test
  → 通过（exit 0）；core 13 + acceptance 47 = 60 项
pnpm verify
  → 通过（exit 0）；7 个测试文件、83 项测试（基线 36 + 新增 47），
    lint、typecheck、构建、8 个生成物一致性全部通过
git diff --check → exit 0
```

（D1 首次交付时记录为：acceptance 43、verify 79；本次口径修订后为 47 / 83。）

## 16 模板与可变位验收结果（C-D1-01 及确认补充）

四体 × 四起式全部对照手工表通过：ID 唯一与枚举顺序、句宽/句数、句型序列、正格平仄、必韵句、起式按第二字（五言/七言名称相反）、逐位允许集合非空且包含正格。
可变位断言：七言 D 型第 1、3 字为 `[P,Z]`、第 5 字只有 `Z`；五言 D 型第 1 字为 `[P,Z]`、第 3 字只有 `Z`——与确认口径一致。

## 发现的最小反例

本次验收范围内**未发现核心缺陷**。D1 首跑 3 处失败为 C 手写预期表笔误（七言起式名称映射、`possibleCommonGroupIds` 码点排序），已修正；此前上报的“七言 D 型实现差异”经确认为**我误读基线表**，已撤回（见上）。

## 规则卡草案

10 条（`METER.POSITION`、`RHYME.COMMON`、`RELATION.DUI`、`RELATION.NIAN`、`GUPING.NARROW`、`TAIL.SANPING`、`TAIL.SANZE`、`RESCUE.SELF`、`RESCUE.TEAO`、`RESCUE.DUIJU`），`version="1"`，人工文献审核 0 条，待核实 10 条；全部 pending、无证据引用、不进入发布来源集合。工程口径已确认，文献版次/页码仍待 C 人工核实。

## 给 Codex 的 D2 优先用例

见 `tests/acceptance/D2-matrix.md`：D2-01 窄义孤平 → D2-02 孤平自救 → D2-03 特拗 → D2-04/04b 对句相救（五言/七言）→ D2-05/06 三平尾/三仄尾 → D2-11/12/13 A 型小拗与边界 → D2-07 改第 2 字与对/粘定位 → D2-08 未选模板/不适用/未支持 → D2-09 引用与关联 → D2-10 确定性 → D2-14/15/16 救法关联、跨联不宣称、未知音不当作可平可仄。

## 与 E 对齐（三项，记录于 D2-matrix.md；面对面确认待执行）

1. C 负责候选特征正确性，E 负责体裁决策；C 不导入 genre，E 不重算格律。
2. 当前 relationFit/rhymeFit 为空：toneFit 高不能让 E 直接认定强近体；E 用独立完整特征 fixture 开发。
3. C 的规则级样本在本包 acceptance；E 的作品/体裁样本由 E 管理；真实名篇与页码需人审。

## 未解决问题

1. 规则卡文献（王力《诗词格律》等）版本/章节/页码、A 型小拗口径的文献依据、七言相救与特拗的真实诗例：待人工核实，此前一律标“待核实”。
2. 公共入口依赖：`packages/contracts/tests/fixtures.ts` 与 `scripts/generate-contracts.ts` 从 `@poetry/prosody` 导入 `getTemplates`，后续出口收窄边界待确认。
3. 首句借邻韵关系表待人工审核（P0 不自动放行）。
4. 其余按 `D2-matrix.md` 等核心实现后逐条验收。

（上一版列出的“可变位口径、A 型小拗政策、规则 ID、七言相救位置”四项已由 Codex 2026-10-17 确认。）

## 需要 GLM 修改的配置

无。

## 数据/规则版本

- 契约：contract-v1（9b27322）；规则集：teaching-v1（rules/templates 生成物未改动）。
- 本批不涉及数据；合成 fixture 仅用于结构与界面测试，不得进入真实分析路径。
