# D2/D3 核心验收矩阵（C 交付给 Codex 的精确输入/预期）

> 状态：**未执行：核心待实现**。当前 `evaluateProsodyCore` 明确抛出
> `PROSODY_EVALUATION_PENDING`（`packages/prosody/src/core/index.ts`），
> `matchTemplates` 仅有 toneFit。本矩阵的条目一律不计为通过，D1 不为其编写伪断言。
> Codex 完成后由 C 将本表逐条换成真实断言，不得留下长期跳过。

## 优先顺序

1. D2-01..D2-06：窄义孤平、三类常见变格、三平尾/三仄尾（P0 三类变格必须验收）
2. D2-07：固定模板改第二字 + 对/粘 Finding 定位
3. D2-08：未选模板 / 不适用 / 未支持状态
4. D2-09：解释关联与引用完整性
5. D2-10：evaluateProsody 的确定性与不可变性

## 验收矩阵

| 编号 | 模式/场景 | 输入（合成 P/Z，正格样本由 tests/acceptance/fixtures.ts 构造） | 前提/依据 | 预期 | 负责人 | 状态 |
|---|---|---|---|---|---|---|
| D2-01 | 窄义孤平 | 五言 B 型 `ZPZZP`（已选模板，全字位确定） | C 任务书 L95–98；规则卡草案 GUPING.NARROW | Finding：status=fail，severity=error，ruleId=GUPING.NARROW（提案），字位定位正确；不是“整句只一个平声”宽口径 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-02 | 孤平自救 | 五言 B 型 `ZPPZP`（七言对应尾部待核定） | C 任务书 L102–112；RESCUE.SELF | 认可自救：resolvedBy 指向 RESCUE.SELF 规则 ID，保留原偏离证据并关联 finding；不得把所有 B 型偏离都算已救 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-03 | 特拗 | C 型五言 `PPZPZ`；七言对应“中仄平平仄平仄” | C 任务书 L108；RESCUE.TEAO | 匹配完整审核模式后认可；不得认可后又对被认可位置重复硬报失对 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-04 | 对句相救 | 同联 A/B 型 `ZZPZZ / PPPZP`（如“野火烧不尽/春风吹又生”） | C 任务书 L108；RESCUE.DUIJU | 命中救法：明确出句第 4 字与对句第 3 字，relatedFindingIds 关联出句与对句字位；七言扩展**单独核定，未核定前不实现** | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-05 | 三平尾 | 末三字 PPP（确定读音） | C 任务书 L99；TAIL.SANPING | Finding：status=fail，severity=error | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-06 | 三仄尾 | 末三字 ZZZ（确定读音） | C 任务书 L99；TAIL.SANZE | Finding：severity=warning；不自动使全篇汇总 fail | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-07 | 固定模板改第 2 字 + 关系 | 已选 wujue-ze-unrhymed，改首句第 2 字平仄；同联/联间关系 | C 任务书 C04、L81–85；METER.POSITION / RELATION.DUI / RELATION.NIAN | 必检位平仄 fail 定位到字；允许关联粘对诊断；不得靠换模板或古体免责 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-08 | 未选模板 / 不适用 / 未支持 | selectedTemplateId=null；applicability=not_applicable / unsupported | 契约 §6；C 任务书 C13、C14 | not_applicable 无近体硬错误、保留字音归部；未选模板只输出跨候选共同诊断；不得以空 checks 冒充 pass | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-09 | 解释关联与引用 | 任意 finding | C 任务书 L120–124；契约补充约定 7 | 每条 Finding 有 ruleId/version/status/severity/字位/expected/observed/message/templateId/evidenceIds；relatedFindingIds 去重同源诊断；每个 ID 可在 provenance 解析 | Codex 实现，C 验收 | 未执行：核心待实现 |
| D2-10 | 确定性与不可变 | 相同输入重复执行 evaluateProsody；冻结输入 | C-D1-09 延续 | 结果稳定、输入不变、无随机 ID 与时间戳 | Codex 实现，C 验收 | 未执行：核心待实现 |

## 未纳入本批次的 P0 目标（仅登记）

- 36 组规则级测试为**项目总目标**，D1 不要求全部完成（组长 D1 指令 §六）。
- 首句借邻韵：P0 无审核邻韵表不自动放行，邻韵表待人工审核，不登记实现。
- 更宽跨句救法、罕见救法：P0 不实现，保留“需复核”提示。

## 与 E 的边界（记录于各自 HANDOFF）

- C 负责候选特征是否正确；E 负责如何使用特征决定体裁适用性；C 不导入 genre，E 不重算格律。
- 当前 relationFit/rhymeFit 为空：toneFit 高也不能让 E 直接认定强近体；E 使用独立完整特征 fixture 开发。
- C 的规则级样本在 packages/prosody/tests/acceptance；E 的作品与体裁样本由 E 管理；真实名篇、页码及体裁预期需要人审。
