# G09 规则组盘点：36 组目标 vs 冻结 10 ruleId + 特例层（C 侧如实对照）

日期：2026-10-20　基线：`main @ f3ef270`（C 的 D4 批已并入主线）　作者：C

> **结论先行**：`contract-v1` 冻结 **10 个 ruleId**，因此“36 个规则组”**不可能按 ruleId 凑数**，也不应新增规则 ID。
> 本表按“**每条规则的 正例/反例/边界** + **特例层 命中/不命中/隔离** + **语境规则 命中/缺失/冲突**”三档，机械展开为 **30 + 3 + 3 = 36 组**，逐组标注 C 侧是否有可运行测试证据。
> 结果：**33/36 组有 C 侧测试证据；3 组语境规则属 B/E（C 不越界，未虚开）**。这不等于“36 个独立规则”，也不等于全库审核完成。

## 一、10 个冻结 ruleId 与卡片状态

卡片来源：`rules/cards/teaching-v1.json`（10 张，version 全为 `"1"`）；运行审核状态：`rules/cards/runtime-review-status.json`。

| # | ruleId | 卡片状态（runtime） | 证据 ID | C 侧主要测试证据 | 缺口 |
|---|---|---|---|---|---|
| 1 | METER.POSITION | citation-reviewed-by-c | `ev:rule:METER.POSITION:wangli15-p339-342-343` | templates（16 模板正格）、C2-07 小拗、C2-11 适用性、C2-12 评分、D4-03/D4-05 | A 型小拗“允许并标 info”是工程口径，文献为半拗“可救可不救”，非逐字规定 |
| 2 | RHYME.COMMON | engineering-scope-released | `ev:rule:RHYME.COMMON:engineering-scope` | C2-09 三值与候选、C2-10 公共归部/首句入韵 | 词林 19 部与新韵 14 韵的真实数据交叉核对属 A；工程等级不声称韵书规定 |
| 3 | RELATION.DUI | citation-reviewed-by-c | `ev:rule:RELATION.DUI:wangli15-p333-334` | C2-08（五言）、D4-01（七言逐字位） | 真实诗例只覆盖 API 层（E/Codex），C 用合成样本 |
| 4 | RELATION.NIAN | citation-reviewed-by-c | `ev:rule:RELATION.NIAN:wangli15-p334` | C2-08、D4-01 | 同上 |
| 5 | GUPING.NARROW | citation-reviewed-by-c | `ev:rule:GUPING.NARROW:wangli15-p335-336` | C2-01 窄义孤平 + 单平对照、C2-02 自救 | 七言后五字的真实诗例仍少 |
| 6 | TAIL.SANPING | engineering-scope-released | `ev:rule:TAIL.SANPING:engineering-scope` + `ctx:j03b2:08` | C2-06（五言）、C04b（七言 PPP）、D4-03（未定音）、C01–C16（特例） | 近体“三平尾为病”无专条（王力页 371–372 仅古体依据）；已审特例仅黄鹤楼平水一处 |
| 7 | TAIL.SANZE | engineering-scope-released | `ev:rule:TAIL.SANZE:engineering-scope` | C2-06（五言）、D4-02（七言 ZZZ） | 同上；warning 等级为工程口径 |
| 8 | RESCUE.SELF | approved-by-j03 | `ev:rule:RESCUE.SELF:wangli15-p339` | C2-02 双向关联、差一位反例 | 七言真实诗例待补 |
| 9 | RESCUE.TEAO | approved-by-j03 | `ev:rule:RESCUE.TEAO:wangli15-p336-338` | C2-03 认可 + 差一位反例 | 七言完整模式真实诗例待补 |
| 10 | RESCUE.DUIJU | approved-by-j03 | `ev:rule:RESCUE.DUIJU:wangli15-p339-341` | C2-04 五言、C2-05 七言、C2-06 边界 | 七言纯 (b) 实例仍缺（现有为 (a)(b) 结合） |

## 二、特例层与语境规则（不新增 ruleId）

| 层 | 数量 | 记录位置 | C 侧证据 | 状态 |
|---|---|---|---|---|
| 已审作品特例 | **1 条**（`exception:j03b2:huanghelou:l4:sanping:pingshui`） | `rules/exceptions/reviewed-works-v1.json` | C01–C16（17 项：命中/不命中/新韵与词林隔离/缺审批/指纹不符/用户覆盖/幂等/闭合） | 已验收 |
| 语境规则 | **11 条**（B 维护） | `data/context/rules.json` | C 侧**无**（属 B 与 API 层） | 未在 C 范围 |

## 三、36 组展开对照（30 + 3 + 3）

> 说明：这是把“36 组”落到**行为组**的展开，不是 36 个规则 ID；“有 C 证据”指该组可在 `packages/prosody/tests/acceptance` 找到对应正/反/边界断言。

| 组 | 规则/层 | 变体 | 组名 | C 侧证据 | 状态 |
|---|---|---|---|---|---|
| G01 | METER.POSITION | 正 | 16 模板正格逐位通过 | templates 28 项 | ✅ |
| G02 | METER.POSITION | 反 | 逐位偏离定位字位 | C2-08、D4-05 | ✅ |
| G03 | METER.POSITION | 边界 | A 型小拗 pass/info、额外固定位不豁免 | C2-07 | ✅ |
| G04 | RHYME.COMMON | 正 | 韵脚同部通过、首句入韵 | C2-10 | ✅ |
| G05 | RHYME.COMMON | 反 | 两两相交但整体无交 → fail | C2-10 | ✅ |
| G06 | RHYME.COMMON | 边界 | 三值/未知/候选不拼接 | C2-09 | ✅ |
| G07 | RELATION.DUI | 正 | 五言/七言相对通过 | C2-08、D4-01 | ✅ |
| G08 | RELATION.DUI | 反 | 破对定位（七言 l1c2/l2c2） | D4-01 | ✅ |
| G09 | RELATION.DUI | 边界 | 失对与逐位错误不混报 | C2-08 | ✅ |
| G10 | RELATION.NIAN | 正 | 五言/七言相粘通过 | C2-08、D4-01 | ✅ |
| G11 | RELATION.NIAN | 反 | 破粘定位（七言 l2c4/l3c4） | D4-01 | ✅ |
| G12 | RELATION.NIAN | 边界 | 只报坏的一对，相邻对仍 pass | D4-01 | ✅ |
| G13 | GUPING.NARROW | 正 | B 型 ZPZZP 报孤平 | C2-01 | ✅ |
| G14 | GUPING.NARROW | 反 | 单一平声但非该式不判孤平 | C2-01 | ✅ |
| G15 | GUPING.NARROW | 边界 | 自救后 GUPING pass + resolvedBy 关联 | C2-02 | ✅ |
| G16 | TAIL.SANPING | 正 | 五言/七言 PPP fail/error | C2-06、C04b | ✅ |
| G17 | TAIL.SANPING | 反 | 非 PPP 不触发 | C2-06 | ✅ |
| G18 | TAIL.SANPING | 边界 | 未定音只报 uncertain；已审特例 not_applicable/info | D4-03、C01 | ✅ |
| G19 | TAIL.SANZE | 正 | 五言/七言 ZZZ fail/warning | C2-06、D4-02 | ✅ |
| G20 | TAIL.SANZE | 反 | 非 ZZZ 不触发 | C2-06、D4-02 | ✅ |
| G21 | TAIL.SANZE | 边界 | warning 不升级 error | C2-06、D4-02 | ✅ |
| G22 | RESCUE.SELF | 正 | ZPPZP 认可 + 双向关联 | C2-02 | ✅ |
| G23 | RESCUE.SELF | 反 | 差一位不认定已救 | C2-02 | ✅ |
| G24 | RESCUE.SELF | 边界 | 救法只豁免覆盖字位 | C2-02、D4-05 | ✅ |
| G25 | RESCUE.TEAO | 正 | PPZPZ（含七言）认可 | C2-03 | ✅ |
| G26 | RESCUE.TEAO | 反 | 差一位不认可、第 4 字仍 fail | C2-03 | ✅ |
| G27 | RESCUE.TEAO | 边界 | 不与粘对重复硬报 | C2-03 | ✅ |
| G28 | RESCUE.DUIJU | 正 | 五言 4↔3、七言 6↔5 通过 | C2-04、C2-05 | ✅ |
| G29 | RESCUE.DUIJU | 反 | 跨联/错误前缀不放行 | C2-04、C2-05 | ✅ |
| G30 | RESCUE.DUIJU | 边界 | 救位未知 → uncertain，不判已救 | C2-04 | ✅ |
| G31 | 特例层 | 命中 | 黄鹤楼 l4c5–7 → not_applicable/info、保留 PPP | C01 | ✅ |
| G32 | 特例层 | 不命中 | 改字/换书/缺审批/指纹不符/用户覆盖均不生效 | C03、C05、C06、C07、C11–C14 | ✅ |
| G33 | 特例层 | 隔离 | 同诗其他偏离保留、summary 可 fail、幂等 | C08、C09、C15、C16 | ✅ |
| G34 | 语境规则 | 命中 | 短语/义项命中候选 | — | ⬜ B/API |
| G35 | 语境规则 | 缺失 | 缺语境时保持未定/不猜音 | — | ⬜ B/API |
| G36 | 语境规则 | 冲突 | 候选冲突不静默择一 | — | ⬜ B/API |

## 四、口径差异与缺口（不虚开）

1. **36 → 10**：契约冻结 10 个 ruleId，**没有也不应有第 11 个**；36 组只能按行为展开（本表 30+3+3）。任何“新增 26 条规则”的说法都与 `contract-v1` 冲突。
2. **C 侧覆盖 33/36**：G34–G36（语境规则）属 B 的 11 条语境规则与 API 编排，C 不越界补测；E/Codex 的 API 验收才是它们的证据。
3. **真实数据缺口**：词林/新韵六格仍 503（`LOOKUP_EVIDENCE_UNVERIFIED`，首阻字 白/床/昔），故跨书一致性只到“ruleId 集合/version/未定音”层，真实读音结论未验收。
4. **真实诗例缺口**：七言纯 (b) 对句相救、七言完整特拗、七言孤平后五字的**真实诗例**仍缺；C 用合成样本验证算法，不冒充诗例审核。
5. **文献口径**：8 条有 C 签字定位（王力文集 15 卷页码），尾式两条为“部分依据 + 工程等级”；RHYME 的 19 部/106 韵目交叉核对待 A。工程教学口径不写成韵书原文规定。
6. **特例范围**：仅 `rules/exceptions/reviewed-works-v1.json` 登记的 1 条（平水黄鹤楼 l4c5–7）；词林/新韵不继承，其他作品不适用。
