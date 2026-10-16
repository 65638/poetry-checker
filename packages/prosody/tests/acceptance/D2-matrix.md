# D2/D3 核心验收矩阵（C 交付给 Codex 的精确输入/预期）

> 状态：**未执行：核心待实现**。当前 `evaluateProsodyCore` 明确抛出
> `PROSODY_EVALUATION_PENDING`（`packages/prosody/src/core/index.ts`），
> `matchTemplates` 仅有 toneFit。**规则卡存在不等于算法已实现**，本矩阵条目一律不计为通过。
> Codex 完成后由 C 将本表逐条换成真实断言，不得留下长期跳过。
>
> 口径基线：**Codex 2026-10-17 确认**（核对基线 `9b27322` / `contract-v1`）——10 个固定规则 ID
> （公共韵部为 `RHYME.COMMON`，首版 `version="1"`）；可变位按四句式允许集合；A 型小拗**②允许并标 info**；
> 七言对句相救位置为出句第 6 字 ↔ 对句第 5 字。引用规则见 `docs/rulebook.md` §0–1。

## 优先顺序

1. D2-01..D2-06：窄义孤平、三类常见变格、三平尾/三仄尾（P0 三类变格必须验收）
2. D2-11..D2-13：A 型小拗政策②的实际输出（复用 METER.POSITION）
3. D2-07：固定模板改第二字 + 对/粘 Finding 定位
4. D2-08：未选模板 / 不适用 / 未支持状态
5. D2-09：解释关联与引用完整性
6. D2-10：evaluateProsody 的确定性与不可变性

## 验收矩阵

| 编号 | 模式/场景 | 输入（合成 P/Z，正格样本由 tests/acceptance/fixtures.ts 构造） | 前提/依据 | 预期 | 负责人 | 状态 |
|---|---|---|---|---|---|---|
| D2-01 | 窄义孤平 | 五言 B 型 `ZPZZP`（已选模板，全字位确定） | 规则卡 GUPING.NARROW；确认口径“不能仅因两个位置为中而放行” | Finding：status=fail，severity=error，ruleId=GUPING.NARROW，字位定位正确；不是“整句只一个平声”宽口径 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-02 | 孤平自救 | 五言 B 型 `ZPPZP`（七言对应尾部） | 规则卡 RESCUE.SELF | 认可自救：`resolvedBy` 指向 RuleCard ID `RESCUE.SELF`，保留原偏离证据并关联 finding；不留未解决的孤平硬错误；不得把所有 B 型偏离都算已救 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-03 | 特拗 | C 型五言 `PPZPZ`；七言对应“中仄平平仄平仄” | 规则卡 RESCUE.TEAO | 匹配完整审核模式后认可；不重复报被认可位置失对；不得把 C 型特拗换成另一句型免检 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-04 | 对句相救（五言） | 同联 A/B 型 `ZZPZZ / PPPZP`（如“野火烧不尽/春风吹又生”） | 规则卡 RESCUE.DUIJU：出句第 4 字 ↔ 对句第 3 字 | 命中救法：`resolvedBy`=`RESCUE.DUIJU`，`relatedFindingIds` 关联出句与对句字位；必须同联 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-04b | 对句相救（七言） | 同联、A/B 型，出句第 6 字 ↔ 对句第 5 字；合成前缀候选 `PPZZPZZ / ZZPPPZP`（待核定测试材料） | 确认口径：位置按五言核心后移两字；位置正确只是必要条件 | 同联且模式完整时才认可；前缀、完整后五字、其他固定位置、候选不确定性都要核对；跨联或救位未知 → 不宣称已救 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-05 | 三平尾 | 末三字 PPP（确定读音） | 规则卡 TAIL.SANPING | Finding：status=fail，severity=error | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-06 | 三仄尾 | 末三字 ZZZ（确定读音，如 C 型 `PPZZZ`） | 规则卡 TAIL.SANZE | Finding：severity=warning；不单独造成整诗 fail | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-07 | 固定模板改第 2 字 + 关系 | 已选 wujue-ze-unrhymed，改首句第 2 字平仄；同联/联间关系 | METER.POSITION / RELATION.DUI / RELATION.NIAN | 必检位平仄 fail 定位到字；允许关联粘对诊断；不得靠换模板或古体免责 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-08 | 未选模板 / 不适用 / 未支持 | selectedTemplateId=null；applicability=not_applicable / unsupported | 契约 §6 | not_applicable 无近体硬错误、保留字音归部；未选模板只输出跨候选共同诊断；不得以空 checks 冒充 pass | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-09 | 解释关联与引用 | 任意 finding，含救法 | 确认口径 §1 引用规则 1–4；契约补充约定 7 | 每条 Finding 有 ruleId/ruleVersion(=「1」)/status/severity/字位/expected/observed/message/templateId/evidenceIds；`resolvedBy` 指向 RuleCard ID（非 Finding ID）；`relatedFindingIds` 引用诊断实例；provenance.rules 含被引用的普通与救法规则 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-10 | 确定性与不可变 | 相同输入重复执行 evaluateProsody；冻结输入 | C-D1-09 延续 | 结果稳定、输入不变、无随机 ID 与时间戳 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-11 | A 型小拗（五言） | A 型 `ZZZPZ`（第三字由平变仄，其余符合 A 型） | 确认口径：政策②允许并标 info | 目标字位：ruleId=METER.POSITION，ruleVersion="1"，status=pass，severity=info，expected=["P","Z"]，observed=["Z"]，resolvedBy=null；不要求对句相救，不单独使全篇 needs_review/fail；复用已有 METER.POSITION 记录，不产生矛盾 fail | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-12 | A 型小拗（七言） | A 型 `PPZZZPZ`（第五字由平变仄） | 同上 | 对应七言第五字 pass/info，其余同 D2-11 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-13 | A 型小拗的边界 | A 型第四字（七言第六字）也变仄；或 `ZZZZZ` 等 | 确认口径：政策②只覆盖五言第三字/七言第五字 | 不适用“小拗允许”免责，另按偏离/救法处理；不得套用 D2-11 免检 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-14 | 已认可救法的关联 | 真正已救的五言同联 A/B 模式 | 确认口径 §1 引用规则 4 | 普通偏离与救法诊断关联，`resolvedBy` 指向规则卡 ID；救法只豁免它覆盖的偏离，其他错误照常保留 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-15 | 不宣称未确认的救法 | 相同声调形状但**跨联**，或救位读音未知 | 确认口径：必须同联；位置正确不是完整判据 | 不输出确定的“对句相救已认可”；按三值语义给出 uncertain 或普通偏离 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-16 | 未知音不当作可平可仄 | 可变位（“中”）位置上的字读音 unknown | 确认口径：未知音不能当作已知可平可仄 | 不因该位置允许 `[P,Z]` 就把 unknown 记为 pass；相关约束按三值给 uncertain | Codex 实现，C 验收 | 未执行：核心待实现 |

## 未纳入本批次的 P0 目标（仅登记）

- 36 组规则级测试为**项目总目标**，D1 不要求全部完成（组长 D1 指令 §六）。
- 首句借邻韵：P0 无审核邻韵表不自动放行，邻韵表待人工审核，不登记实现。
- 更宽跨句救法、罕见救法：P0 不实现，保留“需复核”提示。

## 与 E 的边界（记录于各自 HANDOFF）

- C 负责候选特征是否正确；E 负责如何使用特征决定体裁适用性；C 不导入 genre，E 不重算格律。
- 当前 relationFit/rhymeFit 为空：toneFit 高也不能让 E 直接认定强近体；E 使用独立完整特征 fixture 开发。
- C 的规则级样本在 packages/prosody/tests/acceptance；E 的作品与体裁样本由 E 管理；真实名篇、页码及体裁预期需要人审。
