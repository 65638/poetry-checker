# @poetry/prosody：格律引擎（公共入口 + 核心 + 独立验收）

负责人：队员 C（公共入口/报告封装/规则卡/独立验收）；Codex（核心算法）。
契约基线：`contract-v1`（Zod 唯一权威源，`@poetry/contracts`）。

## 公共导出（packages/prosody/src/index.ts）

| 导出 | 说明 |
|---|---|
| `matchTemplates` | 公共模板候选入口，转发 `matchTemplatesCore`：16 模板结构筛选 + 特征（toneFit/relationFit/rhymeFit，对仗为 null）与缺项归一 score |
| `evaluateProsody` | 公共完整判定入口，转发 `evaluateProsodyCore`：逐位平仄、押韵、粘对、孤平/尾式、三类救法、A 型小拗、模板/适用性状态 |
| `getTemplates` | 16 套整诗模板（core 辅助，经公共出口暴露） |
| `checkTonePossibilities` | 三值平仄判定（core 辅助） |
| `checkCommonRhyme` | 全体韵脚公共归部判定（core 辅助） |
| `ProsodyNotImplementedError` | 兼容保留的异常类型；teaching-v1 判定已不再抛出 |

## 已验收能力（tests/acceptance）

**D1（C-D1-01..09）**：

- 四体 16 套模板：ID 唯一、句宽/句数、句型序列、正格平仄、必韵句、起式按第二字（对照手工表）。
- 可变位口径（2026-10-17 确认）：七言 D 型第 1、3 字允许 P/Z、第 5 字固定仄；五言 D 型第 1 字可变、第 3 字固定仄。
- 指定体式匹配与结构不符空候选；三值/未知/可判位比例；押韵公共归部反例；冻结输入不可变；补充平面汉字位置；规则卡结构校验。

**D2（C2-01..13，核心 `b5457e4` 首版）**：

- 窄义孤平（仅 B 型 `ZPZZP`）与“单一平声”对照；孤平自救 `ZPPZP` 双向关联闭合、差一位不认定。
- 特拗 `PPZPZ`（含七言）认可、差值反例、粘对不重复硬报；五/七言对句相救（五言 4↔3、七言 6↔5）、跨联/错误前缀/救位未知不放行。
- 三平尾 error、三仄尾 warning；A 型小拗 pass/info（`expected=[P,Z]`、`observed=[Z]`、`resolvedBy=null`）及额外固定位不被豁免。
- 改第 2 字的平仄/失对/失粘定位；三值/未知/候选关联与韵脚跨候选不拼接；公共归部整体无交与首句入韵。
- 模板与适用性状态（not_applicable/unsupported/未选模板/uncertain）；评分权重 .65/.20/.10/.05 缺项归一与 keyRate；确定性、位置与引用闭合。

## 未实现边界（不得计为通过）

- 对仗 `parallelismFit` 恒为 null（未实现语义对仗）；`score` 不能单独作为“强近体”依据，E 需结合 `evaluatedKeyRate` 与分差。
- 首句借邻韵无已审核关系表，不自动放行；更宽跨句救法/罕见救法不在 P0。
- 真实韵书、读音消歧、体裁不由本包负责；三首名篇真实链路需 A/B/E 数据。
- 规则卡全部 pending（文献未核实），不得进入发布来源集合。

## 目录

```text
packages/prosody/
  src/index.ts            # C：公共入口
  src/core/               # Codex：核心算法（C 不修改）
  src/adapters/           # C：核心输入输出适配（需要时才建）
  src/report/             # C：报告结构、规则卡/证据装配与结构校验
  tests/core/             # Codex：核心测试（C 不修改）
  tests/acceptance/       # C：独立验收（fixtures、templates、uncertainty、cards、d2-core、D2-matrix）
```

## 命令

```sh
pnpm exec vitest run packages/prosody/tests/acceptance   # 仅 C 的独立验收
pnpm --filter @poetry/prosody test                        # core + acceptance 全部测试
pnpm verify                                               # 全仓库检查（发布前必须）
```

## 约束

- 不修改 `src/core`、`tests/core`、`rules/templates`、`rules/exceptions`（Codex 独占）。
- 不修改公共契约（冻结于 contract-v1）；变更走组长独立 PR。
- 合成 fixture 只用于规则/算法验收，不得进入真实分析路径；不冒充名篇金标准。
