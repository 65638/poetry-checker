# 0010 · D2 / A2-08 交付报告：登鹳雀楼（现状，未人审韵部）

日期：2026-10-18。执行：队员 A 的 DeepSeek。分支 `feat/a-d2-data`。
报告性质：**结构覆盖报告 + 证据缺口清单**，不是判音结论，也不是发布级报告。

> 本报告按**当前真实数据**生成，不做任何补签或推测。涉及韵部多数仍为 `unverified`，
> 因此 API 返回 503 是**正确行为**，不是缺陷。

---

## 1. 语料与数据版本

| 项 | 值 |
|---|---|
| 案例 ID | `golden-dengguanquelou-ps-v1` |
| 篇名 / 作者 | 登鹳雀楼 / 王之涣 |
| 正文 | 白日依山尽，黄河入海流。欲穷千里目，更上一层楼。 |
| 字数 / 不同字 | 20 / **20**（无重复字） |
| 正文登记状态 | `reviewStatus: pending`（`data/works/review-queue.json`，来源定位与语言学依据均待核） |

使用的快照：

| 库 | dataVersion | 候选总数 |
|---|---|---|
| 平水（含三讲草案） | `pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft` | 10,387 |
| 词林 | `cilin-cwr-ff0e9c1-d2-full` | 5,403 |
| 新韵（项目重建表） | `xinyun-rebuild-d2-full` | 51,608 |

---

## 2. 三库字覆盖：20/20 全覆盖

| 库 | 覆盖 | 缺字 | 多候选字数 | 说明 |
|---|---|---|---|---|
| 平水 | **20/20** | 0 | 3（里、更、上） | 含三讲草案路径，无占位补字 |
| 词林 | **20/20** | 0 | 1 | 33 子卷口径；本诗不涉及「余」类异体缺口 |
| 新韵 | **20/20** | 0 | 6 | 项目重建表，非官方原始字表 |
| **三库全缺** | — | **0** | — | 没有任何一个字在三库中同时缺失 |

复现命令：

```powershell
node node_modules/tsx/dist/cli.mjs scripts/data/build-works-coverage.ts
# 输出 data/normalized/works-coverage-d2.json
```

---

## 3. 平水逐字候选与证据状态（20 字 / 23 条候选）

证据状态取自 `data/reviews/approved-evidence.json`（8 条已签，其余 unverified）。

| # | 字 | 候选数 | 韵部 | 候选 ID | 证据 | 状态 |
|---|---|---|---|---|---|---|
| 1 | 白 | 1 | 入声十一陌 | `pingshui:白:ru:入声十一陌` | `ev:pingshui:入:入声十一陌` | ✅ approved |
| 2 | 日 | 1 | 入声四质 | `pingshui:日:ru:入声四质` | `ev:pingshui:入:入声四质` | ✅ approved |
| 3 | 依 | 1 | 上平五微 | `pingshui:依:ping:五微` | `ev:pingshui:上平:五微` | ⚠ unverified |
| 4 | 山 | 1 | 上平十五删 | `pingshui:山:ping:十五删` | `ev:pingshui:上平:十五删` | ⚠ unverified |
| 5 | 尽 | 1 | 上声十一轸 | `pingshui:尽:shang:十一轸` | `ev:pingshui:上:十一轸` | ⚠ unverified |
| 6 | 黄 | 1 | 下平七阳 | `pingshui:黄:ping:七阳` | `ev:pingshui:下平:七阳` | ⚠ unverified |
| 7 | 河 | 1 | 下平五歌 | `pingshui:河:ping:五歌` | `ev:pingshui:下平:五歌` | ⚠ unverified |
| 8 | 入 | 1 | 入声十四缉 | `pingshui:入:ru:入声十四缉` | `ev:pingshui:入:入声十四缉` | ⚠ unverified |
| 9 | 海 | 1 | 上声十贿 | `pingshui:海:shang:十贿` | `ev:pingshui:上:十贿` | ⚠ unverified |
| 10 | 流 | 1 | 下平十一尤 | `pingshui:流:ping:十一尤` | `ev:pingshui:下平:十一尤` | ✅ approved |
| 11 | 欲 | 1 | 入声二沃 | `pingshui:欲:ru:入声二沃` | `ev:pingshui:入:入声二沃` | ⚠ unverified |
| 12 | 穷 | 1 | 上平一东 | `pingshui:穷:ping:一东` | `ev:pingshui:上平:一东` | ⚠ unverified |
| 13 | 千 | 1 | 下平一先 | `pingshui:千:ping:一先` | `ev:pingshui:下平:一先` | ⚠ unverified |
| 14 | 里 | **2** | 上声四纸 / 去声四寘 | `pingshui:里:shang:四纸`、`pingshui:里:qu:四寘` | `ev:pingshui:上:四纸`、`ev:pingshui:去:四寘` | ⚠ unverified ×2 |
| 15 | 目 | 1 | 入声一屋 | `pingshui:目:ru:入声一屋` | `ev:pingshui:入:入声一屋` | ⚠ unverified |
| 16 | 更 | **2** | 下平八庚 / 去声二十四敬 | `pingshui:更:ping:八庚`、`pingshui:更:qu:二十四敬` | `ev:pingshui:下平:八庚`、`ev:pingshui:去:二十四敬` | ✅ approved ×2 |
| 17 | 上 | **2** | 上声二十二养 / 去声二十三漾 | `pingshui:上:shang:二十二养`、`pingshui:上:qu:二十三漾` | `ev:pingshui:上:二十二养`、`ev:pingshui:去:二十三漾` | ⚠ unverified ×2 |
| 18 | 一 | 1 | 入声四质 | `pingshui:一:ru:入声四质` | `ev:pingshui:入:入声四质` | ✅ approved |
| 19 | 层 | 1 | 下平十蒸 | `pingshui:层:ping:十蒸` | `ev:pingshui:下平:十蒸` | ⚠ unverified |
| 20 | 楼 | 1 | 下平十一尤 | `pingshui:楼:ping:十一尤` | `ev:pingshui:下平:十一尤` | ✅ approved |

**汇总**：20 字 / 23 条候选；**6 字全部候选已 approved**（白、日、流、更、一、楼），**14 字存在 unverified 候选**。

多候选字 3 个（里、更、上），全部保留两条候选、互不覆盖——由 lexicon 按语境交由 B 消歧，**本报告不代选**。

---

## 4. 缺口清单：16 条证据待审

| 证据 ID | 覆盖本诗的字 |
|---|---|
| `ev:pingshui:上平:五微` | 依 |
| `ev:pingshui:上平:十五删` | 山 |
| `ev:pingshui:上:十一轸` | 尽 |
| `ev:pingshui:下平:七阳` | 黄 |
| `ev:pingshui:下平:五歌` | 河 |
| `ev:pingshui:入:入声十四缉` | 入 |
| `ev:pingshui:上:十贿` | 海 |
| `ev:pingshui:入:入声二沃` | 欲 |
| `ev:pingshui:上平:一东` | 穷 |
| `ev:pingshui:下平:一先` | 千 |
| `ev:pingshui:上:四纸` | 里（上声一读） |
| `ev:pingshui:去:四寘` | 里（去声一读） |
| `ev:pingshui:入:入声一屋` | 目 |
| `ev:pingshui:上:二十二养` | 上（上声一读） |
| `ev:pingshui:去:二十三漾` | 上（去声一读） |
| `ev:pingshui:下平:十蒸` | 层 |

**共 16 条**，全部 `reviewStatus: unverified`。

### 已具备的（无需再签）

| 证据 ID | 覆盖本诗的字 | 依据 |
|---|---|---|
| `ev:pingshui:入:入声十一陌` | 白 | J03 第一批 |
| `ev:pingshui:入:入声四质` | 日、一 | J03 第一批 |
| `ev:pingshui:下平:十一尤` | 流、楼 | J03 第一批 |
| `ev:pingshui:下平:八庚` | 更（平） | J03 第一批 |
| `ev:pingshui:去:二十四敬` | 更（去） | J03 第一批 |

> 注：「日」与「一」同属入声四质，「流」「楼」同属十一尤，因此 5 条证据覆盖了 6 个字。

---

## 5. 为什么 API 现在返回 503 是正确行为

| 层 | 状态 | 说明 |
|---|---|---|
| 字覆盖 | ✅ 20/20 三库齐全，三库全缺 0 | 不是数据缺失问题 |
| 候选与引用完整性 | ✅ 23 条候选、证据引用全部闭合 | `assertSnapshotIntegrity` 校验通过 |
| **证据门槛** | ❌ **16/21 条证据 unverified** | B 的 `LOOKUP_EVIDENCE_UNVERIFIED` 与 GLM 的 503 映射在此生效 |
| 快照级 reviewStatus | ❌ unverified | 8 条证据 approved ≠ 整库批准 |
| releaseGatePassed | ❌ false | 平水仍有 98 条证据未审 |

**结论**：503 表达的是「数据未就绪」，不是「接口故障」。

另需说明：此前词林出现的**冲突 503**（`src:chinese_word_rhyme` 跨库同 ID 不同内容）已在 `8de7965` 修复——来源 ID 按库区分为 `:pingshui` / `:cilin`。**因此现在的 503 已从「来源冲突」性质转为「证据门槛」性质**，这正是预期状态。

不做的替代方案（明确否决）：

- ❌ 为跑通接口把 `reviewStatus` 改成 approved
- ❌ 删除未审核候选让门槛通过
- ❌ 用结构达标（106 部无空部）冒充内容审核通过

---

## 6. 要出真实报告还差什么

**只差人审签，不差数据。** 需逐条签字以下 16 条证据（可参考既有模式：定位到 `data/raw/chinese_word_rhyme/Pingshui_Rhyme.json` 对应韵目段，核对正文用字确在该部）：

```
上平:五微、上平:十五删、上:十一轸、下平:七阳、下平:五歌、入:入声十四缉、
上:十贿、入:入声二沃、上平:一东、下平:一先、上:四纸、去:四寘、
入:入声一屋、上:二十二养、去:二十三漾、下平:十蒸
```

签完后把 ID 加进 `data/reviews/approved-evidence.json` 的 `approvedEvidenceIds`，重跑
`build-pingshui.ts` 与 `build-sample.ts`，断言会自动核对「approved 数 == 清单命中数」。

---

## 7. 本报告的边界（不得被引用为判音结论）

1. 这是**覆盖与证据状态报告**，不含平仄判定、不含粘对/孤平/拗救，也不含体裁判定依据。
2. 「approved」仅表示**该韵目证据经人审**，不表示本诗每一字的读音选择已定；多候选字（里、更、上）仍需按语境消歧。
3. 正文自身 `reviewStatus: pending`，版本与权威出处未核。
4. 词林与新韵侧无任何证据 approved（0/33、0/56），本报告的三库覆盖仅证明**字形可查**，不证明其读音或归部已审。
5. 新韵为项目重建表，规则出处 `unverified`。

---

## 8. 复现方式

```powershell
# 数据快照（若已落盘可跳过）
node node_modules/tsx/dist/cli.mjs scripts/data/build-pingshui.ts
node node_modules/tsx/dist/cli.mjs scripts/data/build-cilin.ts
node node_modules/tsx/dist/cli.mjs scripts/data/build-xinyun.ts

# 覆盖报告与快照校验
node node_modules/tsx/dist/cli.mjs scripts/data/build-works-coverage.ts
node node_modules/tsx/dist/cli.mjs scripts/data/check-normalized.ts
```

产物：`data/normalized/works-coverage-d2.json`（逐字、逐库、逐候选）。
