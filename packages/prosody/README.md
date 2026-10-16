# @poetry/prosody：格律引擎（公共入口 + 核心 + 独立验收）

负责人：队员 C（公共入口/报告封装/规则卡/独立验收）；Codex（核心算法）。
契约基线：`contract-v1`（Zod 唯一权威源，`@poetry/contracts`）。

## 公共导出（packages/prosody/src/index.ts）

| 导出 | 说明 |
|---|---|
| `matchTemplates` | 公共模板候选入口，当前转发 `matchTemplatesCore`（仅 toneFit） |
| `evaluateProsody` | 公共完整判定入口，当前转发 `evaluateProsodyCore`（**未实现，抛 `ProsodyNotImplementedError`**） |
| `getTemplates` | 16 套整诗模板（core 辅助，经公共出口暴露） |
| `checkTonePossibilities` | 三值平仄判定（core 辅助） |
| `checkCommonRhyme` | 全体韵脚公共归部判定（core 辅助） |
| `ProsodyNotImplementedError` | 未实现标记（code=`PROSODY_EVALUATION_PENDING`） |

## 已验收能力（tests/acceptance，D1）

- C-D1-01：四体 16 套模板——ID 唯一、句宽/句数、句型序列、正格平仄、必韵句、起式按第二字（对照手工表）。
- 可变位口径（Codex 2026-10-17 确认）：七言 D 型第 1、3 字允许 P/Z、第 5 字固定仄；五言 D 型第 1 字可变、第 3 字固定仄（当前实现一致）。
- C-D1-02：合成 A B C D 五绝/七绝在指定体式下命中正确模板；toneFit/evaluatedKeyRate 正确；**不断言“最终合律通过”**。
- C-D1-03：结构不匹配（句数/字数）返回空候选，不拼接、不改体式。
- C-D1-04/05：P/Z 歧义、无候选、存在未知声调候选 → uncertain，可判位比例下降，不计为失败。
- C-D1-06/07/08：押韵公共归部反例（两两相交全体无交、跨候选拼接、部分同韵、缺字韵脚）。
- C-D1-09：冻结输入重复执行，输入不变、结果稳定。
- 规则卡草案 10 条结构校验（draft-only，非发布数据；ID 采用 2026-10-17 确认口径：`METER.POSITION`、`RHYME.COMMON` 等 10 个，首版 `version="1"`）。
- 补充平面汉字 UTF-16 位置与跨行位置连续性（fixture 构造完整性）。

## 未实现边界（不得计为通过）

- 完整格律判定（平仄诊断、粘对、孤平/尾式、三类拗救、解释关联）：`evaluateProsody` 抛未实现异常。
- `matchTemplates` 的 relationFit/rhymeFit/parallelismFit 均为 null；score 不可用于体裁结论。
- 真实韵书、读音消歧、体裁不由本包负责。

后续核心验收输入/预期见 `tests/acceptance/D2-matrix.md`；规则口径与待核实项见 `docs/rulebook.md`。

## 目录

```text
packages/prosody/
  src/index.ts            # C：公共入口
  src/core/               # Codex：核心算法（C 不修改）
  src/adapters/           # C：核心输入输出适配（需要时才建）
  src/report/             # C：报告结构、规则卡/证据装配与结构校验
  tests/core/             # Codex：核心测试（C 不修改）
  tests/acceptance/       # C：独立验收（fixtures、templates、uncertainty、cards、D2-matrix）
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
- 合成 fixture 只用于结构/界面测试，不得进入真实分析路径。
