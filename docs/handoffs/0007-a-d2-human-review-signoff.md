# 0007 · A / D2 人工核验签署记录：上声三讲

日期：2026-10-18。签署人：A同学（队员 A 本人）。本文件记录**人审签的范围与边界**，避免把一条签字扩散成整库批准。

## 1. 签署对象与依据

| 项 | 内容 |
|---|---|
| 补丁 | `data/patches/pingshui-shang-sanj-jiang.draft.json` |
| 来源 | `data/raw/wikisource/PingshuiYun-8264804.wikitext`（oldid `8264804`，37,073 字节 / `f0297bff…810ce2` / 658 行） |
| 定位 | 落盘文件第 198-202 行 |
| 方式 | **肉眼逐字核对落盘字节**，非机器比对 |
| 时间 | 2026-10-18 |

## 2. 签署确认的三项内容

1. **9 字正确**：`講`、`港`、`棒`、`蚌`、`項`、`缿`、`玤`、`傋`、`耩`。
   第 8 字确认为 **`傋`（U+508B）**，不是 `偫`（U+506B）——D1 期间该处曾在数组与说明文字间自相矛盾，本次以底本为准定案。
2. **无【詞】段**：第 200 行三讲正文后直接为第 202 行「上聲四{{++|紙}}」，本韵目只有一行正文。
3. **「玤」双归属可接受**：同时存在于上声一董与三讲，保留双候选、不互相覆盖、不删原归属。

## 3. 由签署产生的状态变更（仅此一项）

| 对象 | 变更前 | 变更后 | 说明 |
|---|---|---|---|
| `data/patches/pingshui-shang-sanj-jiang.draft.json` | `status: draft` / `reviewStatus: unverified` / `review: null` | `status: approved` / `reviewStatus: approved` / `review` 实体化 | 含 `reviewer`、`reviewedAt`、`scopeItems`、`scopeLimit` |
| 证据 `ev:pingshui:上:三讲` | `unverified` | **`approved`** | 该证据的断言正是「该韵目正文为这 9 字且无【詞】段」，已被逐字核对 |
| 平水全量快照（含草案） | 106 部、三讲证据 unverified | 106 部、**三讲证据 approved** | 业务内容摘要由 `2b420c48…95ba662` 变为 `51560435…635191e` |

顺带修正补丁中 6 处过期字段：`snapshotPath`（`wikisouce` → `wikisource`，含大小写）、`snapshotSha256`（null → 实际值）、`snapshotBytes`（null → 37073）、`digestStatus`（`pending` → `registered`）、`basis[0].status`（`snapshot_saved_locally` → `verified_locally_digest_registered`）、`retrievedAt`（补记为 2026-10-18）。

## 4. 明确**没有**批准的（重要）

| 对象 | 状态 | 理由 |
|---|---|---|
| 快照级 `reviewStatus` | 仍 `unverified` | 106 部里只有三讲 1 部证据签过，其余 105 部全部未审 |
| `releaseGatePassed` | 仍 `false` | 上一条的直接结果；结构达标不等于内容审核通过 |
| 其余 105 条 evidence | 仍 `unverified` | 未逐部核对 |
| 七字样本的 7 条**部级** evidence | 仍 `unverified` | 见第 5 条 |

构建脚本已改为**从补丁文件读取审批状态**（`readSanJiangEvidenceReviewStatus()`），因此重建不会退回 unverified，也不需要手改快照 JSON。新增两条断言锁定边界：

```
OK  三讲证据状态与补丁人审签结果一致（补丁=approved，证据=approved）
OK  只有三讲 1 条证据 approved，其余证据仍 unverified（不得批量升级）
```

## 5. 七字样本：记为**候选级**核验，不动部级 evidence

记录文件：`data/reviews/pingshui-sample-d1-human-review.json`

- 7 个字 / 8 条候选的韵部归属与声类已人工核对（搜韵网），「更」平/去两读确认后**仍并存**，不择一
- **7 条部级 evidence（`ev:pingshui:下平:八庚` 等）保持 `unverified`**
- 理由：每条 evidence 是部级断言「该韵部共收录 N 个字形」（例如八庚 197 条 / 194 字形）。核了 7 个字不等于核了整部，**由 7 字推广为整部批准属于冒签**

## 6. 签署后的实测状态

| 快照 | dataVersion | 结构 | 证据 approved | 快照 reviewStatus | 门槛 |
|---|---|---|---|---|---|
| 平水原始 | `pingshui-cwr-ff0e9c1-d2-full` | 105/106 缺三讲 | 0 | unverified | false |
| 平水含草案 | `…-sanj-jiang-draft` | **106/106 无空部** | **1（三讲）** | unverified | false |
| 词林 | `cilin-cwr-ff0e9c1-d2-full` | 19 部 / 33 子卷 | 0 | unverified | false |
| 新韵 | `xinyun-rebuild-d2-full` | 14 韵 / 56 子卷 | 0 | unverified | false |

验证：`pnpm verify` → 28 文件 / 410 项通过；`check-normalized.ts` → 四份快照全部通过结构与门槛检查。

## 7. 仍未完成的人工核验

| 项 | 状态 |
|---|---|
| 其余 105 个平水韵目 | 0/105 已审 |
| 词林 19 部 / 33 子卷 | 0 已审 |
| 新韵 14 韵 / 56 子卷 | 0 已审；且十四韵规则出处 `unverified`，规则本身未核前无法批准映射 |
| 「余 ↔ 馀/餘」异体关联 | 未建立（需逐条依据 + 人审签） |
| 278 + 60 抽样 | 7/338 |
| 许可结论 | `{{PD-old}}` 字节事实已记，渲染版权框未核，可用性未定 |
