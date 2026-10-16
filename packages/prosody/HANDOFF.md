# @poetry/prosody HANDOFF（队员 C，D1 批次）

日期：2026-10-16（D1）。分支：`feat/c-d1-acceptance`，基线：`9b27322`（= `contract-v1` 标签，契约已由组长冻结）。
执行环境：捆绑 Node v24.21.0 + pnpm 11.25.0（`pnpm --version` = 11.25.0，与 packageManager 锁定一致；组长环境为 Node 24.19.0，本机系统 Node 为 24.18.0，均满足 `engines: >=24 <25`）。网络：直连 GitHub 被 TLS 重置，经用户开启代理（127.0.0.1:7890）后 fetch/pull 正常。

## 完成文件与行为

| 文件 | 说明 |
|---|---|
| `packages/prosody/tests/acceptance/fixtures.ts` | 独立合成诗文构造器：`makeAnnotatedPoem`、`makeSyntheticPoem`、`overrideToken`；手工基线 `BASE_PATTERNS`、`SEQUENCES`、`FORM_SHAPES`、预期辅助（不调用被测生成器产生答案）；全部样本经 `AnnotatedPoemSchema.parse` |
| `packages/prosody/tests/acceptance/templates.test.ts` | C-D1-01/02/03：16 模板结构、起式、韵脚、指定体式匹配、结构不匹配空候选 |
| `packages/prosody/tests/acceptance/uncertainty.test.ts` | C-D1-04/05/06/07/08/09：三值、未知候选、可判位比例、押韵集合反例、冻结输入不可变、补充平面汉字位置 |
| `packages/prosody/tests/acceptance/cards.test.ts` | 规则卡草案结构校验（10 条、RuleCardSchema、pending 状态、不伪造出处） |
| `packages/prosody/tests/acceptance/D2-matrix.md` | Codex 下一批 D2-01..D2-10 的精确输入/预期/依据/负责人，均标“未执行：核心待实现” |
| `rules/cards/draft-teaching-v1.json` | 规则卡草案（draft_only_not_for_release，10 条提案 ID，全部 pending，无 evidenceIds） |
| `docs/rulebook.md` | 规则 ID 对照、采用口径、正反例、来源待核实清单、当前实现边界 |
| `packages/prosody/README.md` | 公共导出、已验收能力、未实现边界、命令与约束 |

`src/index.ts` 未修改：现有公共导出（matchTemplates/evaluateProsody/getTemplates/checkTonePossibilities/checkCommonRhyme）与组长指令描述一致，无实际缺陷，不添加等价包装。

## 执行命令与真实结果

```text
pnpm exec vitest run packages/prosody/tests/acceptance
  → 3 个测试文件、43 项测试通过（exit 0）
    templates.test.ts 26、uncertainty.test.ts 14、cards.test.ts 3
pnpm --filter @poetry/prosody test
  → 通过（exit 0）；core 13 + acceptance 43 = 56 项
pnpm verify
  → 通过（exit 0）；7 个测试文件、79 项测试（基线 36 + 新增 43），
    lint、typecheck、构建、8 个生成物一致性全部通过
git diff --check → exit 0
```

## 16 模板验收结果（C-D1-01）

四体 × 四起式全部对照手工表通过：ID 唯一与枚举顺序、句宽/句数、句型序列、正格平仄、必韵句（偶数句 + 首句入韵加第 1 句）、起式按第二字（五言/七言名称相反）、逐位允许集合非空且包含正格。
**发现的实现差异（非失败）**：`src/core/templates.ts` 的 `allowed()` 将七言 D 型第 3 位放宽为“中”，而任务书建议基线（`中平中仄仄平平`）只有第 1 位为“中”。已列入待组长核定清单，不自行修改（templates 属 Codex 目录）。

## 发现的最小反例

本次验收范围内**未发现核心缺陷**。初跑 3 处失败均为本验收手写预期表笔误，已修正并全绿：
1. 七言起式名称映射（同一句型序列在七言下起式名与五言相反）；
2. `possibleCommonGroupIds` 按 Unicode 码点升序（乙 U+4E59 < 甲 U+7532）。
（保留原始失败记录于本地日志，供追溯。）

## 规则卡草案

10 条（METER.POSITION / RHYME.COMMON_GROUP / RELATION.DUI / RELATION.NIAN / GUPING.NARROW / TAIL.SANPING / TAIL.SANZE / RESCUE.SELF / RESCUE.TEAO / RESCUE.DUIJU），人工审核 0 条，待核实 10 条；全部 pending、无证据引用、不进入发布来源集合。除 METER.POSITION 外均为提案，待 Codex/组长确认。

## 给 Codex 的 D2 优先用例

见 `tests/acceptance/D2-matrix.md`：D2-01 窄义孤平 → D2-02 孤平自救 → D2-03 特拗 → D2-04 对句相救（七言扩展单独核定）→ D2-05/06 三平尾/三仄尾 → D2-07 改第 2 字与对/粘定位 → D2-08 未选模板/不适用/未支持 → D2-09 解释关联 → D2-10 确定性与不可变。

## 与 E 对齐（三项，记录于 D2-matrix.md；面对面确认待执行）

1. C 负责候选特征正确性，E 负责体裁决策；C 不导入 genre，E 不重算格律。
2. 当前 relationFit/rhymeFit 为空：toneFit 高不能让 E 直接认定强近体；E 用独立完整特征 fixture 开发。
3. C 的规则级样本在本包 acceptance；E 的作品/体裁样本由 E 管理；真实名篇与页码需人审。

## 未解决问题 / 待组长核定

1. 可变位（“中”）口径：按任务书建议基线执行？七言 D 型第 3 位与实现差异以谁为准？
2. A 型第三字小拗政策（直接放行 / info / warning / 要求对句相救）四选一。
3. 规则 ID 提案（10 条）待 Codex 确认。
4. 七言对句相救位置及前缀、七言孤平/特拗精确表述待核定。
5. 规则卡文献（王力《诗词格律》等）版本/章节/页码待人工核实，此前一律标“待核实”。
6. 公共入口依赖：`packages/contracts/tests/fixtures.ts` 与 `scripts/generate-contracts.ts` 从 `@poetry/prosody` 导入 `getTemplates`，请确认后续出口收窄的边界。

## 需要 GLM 修改的配置

无。

## 数据/规则版本

- 契约：contract-v1（9b27322）；规则集：teaching-v1（rules/templates 生成物未改动）。
- 本批不涉及数据；合成 fixture 仅用于结构与界面测试，不得进入真实分析路径。
