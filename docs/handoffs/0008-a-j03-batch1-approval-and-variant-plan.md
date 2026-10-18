# 0008 · J03 第一批人审落库 + 缺陷项方案

日期：2026-10-18。依据：组长 J03 通知（引用 `12_J03人审记录`）。

## 1. 落库的审批结果

| 项 | 结果 | 载体 |
|---|---|---|
| 上声三讲 9 字 | 已 approved（2026-10-18，A同学） | `data/patches/pingshui-shang-sanj-jiang.draft.json` → `review`，证据 `ev:pingshui:上:三讲` = **approved** |
| 白 / 一 / 更 / 流 / 雪 / 物 | **approved（候选级）** | `data/reviews/j03-batch1-human-review.json` |
| 楼 | **pending**（J03 未列入） | 同上 → `pendingCharacters` |
| 其余 105 个平水韵目 | 未审 | — |
| 词林 / 新韵 | 未审 | — |

### 关于「引用 12_J03人审记录」

**该文件当前不在仓库内**（全仓检索 `J03` 零命中，只有 `docs/team/12_队员B_文本与读音任务书.md`）。
处理方式：在 `data/reviews/j03-batch1-human-review.json` 中记 `authority: "组长 J03 第一批人审（引用 12_J03人审记录）"`，同时置 `sourceDocPath: null` 并留 `sourceDocArchiveTodo`。

**不做的事**：不编造该文件的路径、不摘录不存在的内容、不假装它已归档。请组长或 E 把它放进 `docs/reviews/`（或 `data/reviews/`），我再回填 `sourceDocPath`。

## 2. 口径：为什么「升 approved」落在候选级而不是部级

契约里 `reviewStatus` 只存在于**证据（部级）**与**快照**两处，没有候选级字段。因此：

- 候选级的通过 → 记在 `data/reviews/*.json`（逐 `candidateId` + `verdict`）
- 部级 evidence 仍为 `unverified`：它的断言是「该韵部共收录 N 个字形」（八庚 197 条 / 194 字形），通过 6 个字的归属不足以批准整部
- 快照级 `reviewStatus` 仍为 `unverified`，`releaseGatePassed` 仍为 `false`

**若组长要求把相关部级 evidence 也升 approved，需明确一句「接受由 N 字推广到整部」**——那会改变可对外声称的范围，我不能默认升级。

## 3. 缺陷项 ①：楼↔樓 异体映射补齐

### 实测事实

| 表 | 收「楼」(U+697C) | 收「樓」(U+6A13) |
|---|---|---|
| `Pingshui_Rhyme.json` | ✅ | ❌ |
| `Cilin_Rhyme.json` | ✅ | ❌ |
| `Xinyun_Rhyme.json` | ✅ | ❌ |
| `Xinyun_Rhyme_FourRhyme_Edition.json` | ✅ | ❌ |

**缺陷方向是「繁体字形进不来」**：正文若写「黃鶴樓」，查询「樓」当前会进 `missing`。

### 补齐方式（已落文件，未生效）

`data/variants/variant-edges-d2.json`，`status: pending_review`：

| 边 | 关系 | 状态 |
|---|---|---|
| 樓 → 楼 | traditional→simplified | `pending_review` |
| 餘 → 余 | traditional→simplified | `pending_review` |
| 馀 → 余 | variant form | `pending_review` |
| 講 → 讲 | traditional→simplified | `applied_in_patch`（三讲已签） |
| 項 → 项 | traditional→simplified | `applied_in_patch`（三讲已签） |

**硬约束（写进文件的 policy）**：

1. 是**候选关联**，不是等价合并——不合并候选、不改写原表、不覆盖既有归属
2. 未审签前**查询返回值不得据此伪造命中**
3. 不得用本文件直接生成新候选，或让「樓」看起来像被收录
4. 消费方必须校验 `status=approved` 才可启用

## 4. 缺陷项 ②：全库简繁覆盖方案

### 4.1 目标

让「以繁体或异体字写的正文」能够查到当前字表以简体收录的字形，同时**不污染原表的收录事实**。

### 4.2 四步法（每步都有可验收产出）

| 步骤 | 做法 | 产出 | 验收 |
|---|---|---|---|
| S1 采集 | 扫描三首名篇 + `data/works/review-queue.json` 全部正文，收集**不在三库字表内**的字形 | `data/variants/coverage-gap.json`（字形 + 出现位置 + 缺于哪几库） | 每个字形可定位到原文位置 |
| S2 分类 | 对每个缺口字形判定类型：繁体 / 异体 / 真正的生僻字 / 原文录入错误 | 同上文件 `classification` 字段 | 分类需给依据，不得猜测 |
| S3 建边 | 只为「繁体/异体」类建候选边；每边必须有定位与依据 | `variant-edges-*.json` | 边可回溯到 source locator |
| S4 签核 | 逐边人审签；通过后由消费方显式开启 | `status: approved` + 审核人/时间 | 未签不得启用 |

### 4.3 简繁对照表的来源问题（必须先解决）

**不能手写对照表**。建立一个覆盖全库的简繁映射需要对照来源（如 OpenCC 的 `TSCharacters`、Unicode 的 Unihan `kTraditionalVariant`/`kSimplifiedVariant`）：

- 每个候选来源都要登记到 `data/sources/manifest.json`：URL、固定版本、许可、摘要
- **许可未核实前，只能用作「生成候选边」的线索，不得直接作为发布依据**
- 这条与 `AGENTS.md` 第 4、5 条一致：来源先落字节，再谈已核对

**当前状态：未选定来源，属待核实项。**

### 4.4 不做的事

- 不做逐字机械转换（会把「余/餘」「发/髮」「干/乾」等义项不同的字错误合并）
- 不用简繁转换替代异体判定
- 不为了让覆盖率好看而把缺失字硬映射到形近字

## 5. 当前落库后的状态

| 快照 | reviewStatus | evidence approved | 门槛 |
|---|---|---|---|
| 平水原始（105） | unverified | 0 | false |
| 平水含草案（106） | unverified | **1（三讲）** | false |
| 词林（19 部 33 子卷） | unverified | 0 | false |
| 新韵（14 韵 56 子卷） | unverified | 0 | false |

候选级已通过：三讲 9 字 + 白/一/更/流/雪/物（6 字 7 候选）；楼 pending。

## 6. 下一步

1. 组长/E 归档 `12_J03人审记录` → 回填 `sourceDocPath`
2. `楼↔樓` 边人审签 → `楼` 转 approved
3. 选定简繁对照来源并登记 manifest → 执行 S1/S2
4. 落库完成后通知 GLM 跑 J07
