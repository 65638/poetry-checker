# D2 独立验收矩阵（C2-01..C2-13）与实跑结果

> 本轮基线：D1 main `6375b35`；核心实现 `b5457e4`（交接 HEAD `14df990`，经 `support/core-d2.bundle` 导入审查分支 `review/codex-core-d2`）；验收分支 `feat/c-d2-acceptance`。
> 测试文件：`packages/prosody/tests/acceptance/d2-core.test.ts`（32 项）；预期全部按任务书矩阵、已确认口径与冻结规则表手工书写，不调用被测实现生成答案。
> 合成样本只验证算法；三首名篇真实链路仍待 A/B/E 真实数据，不把合成测试算作名篇验收。

## 1. 实跑结果

命令：`pnpm exec vitest run packages/prosody/tests/acceptance` → **4 个文件、79 项通过（D2 新增 32）**；`pnpm verify` 见 HANDOFF。

| 编号 | 场景 | 输入摘要（合成） | 手写预期 | 结果 |
|---|---|---|---|---|
| C2-01 | 窄义孤平 | B 型 `ZPZZP`；对照 `ZZZZP`（单一平声但非该式） | 仅 `ZPZZP` 报 GUPING.NARROW fail/error，定位后五字；对照句不判孤平、其他错误照报 | ✅ 通过 |
| C2-02 | 孤平自救 | B 型 `ZPPZP`；差一位 `ZZPZP` | 自救认可：GUPING 通过并 `resolvedBy=RESCUE.SELF`，双向关联闭合；差一位不认定已救、第 2 字仍 fail | ✅ 通过 |
| C2-03 | 特拗 | C 型 `PPZPZ`；差一位 `PZZPZ` | 第 4 字 pass 且 `resolvedBy=RESCUE.TEAO`；第 3/4 句第 4 字相对不被重复硬报；差一位不认可、第 4 字仍 fail | ✅ 通过 |
| C2-04 | 五言对句相救 | 同联 `ZZPZZ / PPPZP`；跨联同形；救位未知 | 命中：拗位 pass + `resolvedBy=RESCUE.DUIJU`；跨联不宣称已救、拗位 fail；救位未知 → 救法 uncertain、拗位 uncertain | ✅ 通过 |
| C2-05 | 七言对句相救 | 同联 `PPZZPZZ / ZZPPPZP`；错误前缀 `ZPZZPZZ` | 窄模式第 6↔5 字可认可；错误前缀不放行、第 6 字 fail | ✅ 通过 |
| C2-06 | 尾式 | 末三字 `PPP` / `ZZZ` | 前者 TAIL.SANPING fail/error；后者 TAIL.SANZE fail/warning（不升级 error） | ✅ 通过 |
| C2-07 | A 型小拗 | 五言 `ZZZPZ`、七言 `PPZZZPZ`；七言第 6 字再破坏 | 五言第 3/七言第 5 字 pass/info，`expected=[P,Z]`、`observed=[Z]`、`resolvedBy=null`；额外固定位错误不被豁免 | ✅ 通过 |
| C2-08 | 改第 2 字与关系 | 固定 `wujue-ze-unrhymed`，首句第 2 字改平 | 平仄 fail/error 定位 l1c2；同联失对 fail；联间相粘仍 pass；模板不切换 | ✅ 通过 |
| C2-09 | 三值与候选关联 | P/P 多候选、P/Z 歧义、无候选、中位未知；韵脚声调与归部交叉候选 | 平仄 resolved / ambiguous / unknown 正确；中位未知不当作可平可仄；韵脚不跨候选拼接 → 判 fail | ✅ 通过 |
| C2-10 | 公共归部与首句入韵 | 四个韵脚两两相交整体无交；首句入韵用异部 | 前者 fail；后者 fail 且首句韵脚在检查范围内，提示借邻韵不自动放行 | ✅ 通过 |
| C2-11 | 模板与适用性状态 | not_applicable / unsupported / 未选模板 / uncertain | 不适用无 checks 无硬错误；不支持明确标记；未选模板只输出共同诊断并待确认；uncertain 时错误降级 warning | ✅ 通过 |
| C2-12 | 评分与 keyRate | 正格诗；押韵失败诗；全未知；13 固定位仅 1 位可判 | 前三特征 1/1/1、对仗 null、score=1；押韵失败 score=(0.65+0.20)/0.95；全未知 score/toneFit 等为 null；keyRate=1/13 | ✅ 通过 |
| C2-13 | 确定性与引用闭合 | 冻结输入重复执行；补充平面汉字；救法诗全量检查 | 结果稳定、输入不变；`𠀀` 位置与诊断定位准确；ID 唯一、ruleId/版本在冻结集合、relatedFindingIds/relations/韵脚引用闭合 | ✅ 通过 |

## 2. 未执行 / 边界（不按通过计数）

| 事项 | 状态 | 说明 |
|---|---|---|
| 首句借邻韵自动放行 | 未实现 | 无已审核邻韵关系表，P0 不自动放行（矩阵要求即如此） |
| 更宽跨句救法、罕见救法 | 未实现 | 不在 P0；保留复核提示 |
| 七言对句相救真实诗例 | 未核实 | 合成材料 `PPZZPZZ / ZZPPPZP` 仅用于位置对应说明；语文学依据与真实诗例待 C/组长核定 |
| parallelismFit（对仗） | 恒为 null | 核心未实现语义对仗；评分按缺项归一化 |
| 三首名篇真实链路 | 未执行 | 需 A 真实韵书 + B 真实读音 + E 体裁；合成测试不能替代 |
| provenance.rules 装配 | GLM 负责 | C 交付规则卡与引用闭合说明，API 侧汇总时纳入普通规则与 resolvedBy 救法规则 |

## 3. 交接给 GLM 的引用闭合约定

- 报告内出现的 `Finding.ruleId` 必须是 10 个固定 ID 之一，且能在 `provenance.rules` 找到同 `id`、`version="1"` 的规则卡。
- `resolvedBy` 指向救法规则卡 ID（`RESCUE.SELF/TEAO/DUIJU`），同样要随 `provenance.rules` 返回；`relatedFindingIds` 只引用同一报告内的诊断 ID。
- `relations[].findingIds`、`rhyme.tokenIds`、`locations[].tokenId` 均须能在 `poem.tokens` 中解析（C2-13 已在核心层验证闭合）。
- 规则卡为草案（pending），不得进入发布来源集合；文献未核实前不能标记人工审核通过。
