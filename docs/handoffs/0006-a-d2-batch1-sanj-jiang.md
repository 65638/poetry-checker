# 0006 · A / D2 批次一：基线核对与三讲来源字节化

日期：D2（具体日历日期未取得，见 §5）。
分支：`feat/a-d2-data`，基于 `main` @ `6375b35`（D1 已合入），本批改动只落在 `data/` 与本文档。
执行：队员 A 的 DeepSeek（数据工程）。**未运行任何数据脚本、未运行测试**，原因见 §6。

---

## 1. 基线核对结果

| 检查项 | 结果 |
|---|---|
| `main` 是否为 `6375b35` | ✅ 是 |
| `6375b35` 之后 `origin/main` 有无新提交 | ✅ **0 个**（`git log 6375b35..origin/main` 为空） |
| `feat/a-d2-data` 基点 | `d596173` = `6375b35` + 1 个文档提交（rebase 后线性） |
| GLM 的 lexicon 接线是否在位 | ✅ 在位：`packages/lexicon/package.json` 有 `dependencies`/`exports`/`scripts`；`tsconfig.build.json` 存在；`apps/api/src/lexicon-errors.ts` 含 6 码映射（`LEXICON_INVALID_INPUT`/`LEXICON_BOOK_MISMATCH` 422、`LEXICON_VERSION_NOT_FOUND` 503、`LEXICON_DUPLICATE_ID`/`LEXICON_REFERENCE_UNRESOLVED`/`LEXICON_INVALID_RESULT` 500） |
| 平水现状 | `inspect.ts` 实跑：105 部，上平15/下平15/**上28**/去30/入17，缺**三讲**，`releaseGatePassed=false` |
| 词林 / 新韵现状 | 词林 19 部 33 子卷；新韵候选表 14 韵 56 子卷（均无缺口、无空卷） |
| 来源摘要复核 | `fetch-sources.ts --check` 8/8 与 manifest 一致 |

**结论：`packages/lexicon/README.md` 与 `HANDOFF.md` §8 里「需 GLM 接线」的未完成项已经过期**（接线已合入），
但这两份文件的正文尚未改写；按纪律只在本文件记录，不擅自同改他人正在用的文档，留待批次一 PR 一并处理。

---

## 2. 本批改了什么（只动数据文件）

| 文件 | 改动 |
|---|---|
| `data/sources/manifest.json` | `src:wikisource:pingshuiyun` 由 `revision: null` / `status: unreachable` 改为 `revision: 8264804` / `status: snapshot_saved_locally`；新增 `fixedUrl`、`retrievedVia`、`files[0]`（落盘路径 + 摘要待补标记）、`namingDeviation`；`manifestVersion` → `d2-1`；补 `updatedAtNote`；`environmentNotes` 中维基文库一条改为「D2 由用户本机取回」 |
| `data/patches/pingshui-shang-sanj-jiang.draft.json` | 补 `target.expectedGroupId`、`byteLevelEvidence`、`charactersProvenance`（9 字逐项）、`diff`（前后对照 + 逐条 membership）、`contentDigest`/`contentDigestNote`、`review`（**null**）/`reviewNote`；`status` 仍 `draft`、`reviewStatus` 仍 `unverified`、`publishedAt` 仍 `null` |

未改动：`packages/`（含 `lexicon` 源码与测试）、`readings`/`contracts`/`core`/API、`package.json`、`tsconfig`、根脚本、`data/releases/`。

---

## 3. 三讲逐字核对（依据：落盘字节 oldid 8264804，第 198-200 行）

底本正文「**講港棒蚌項缿玤傋耩**」共 **9 字**，该韵目**无【詞】段**（只有一行正文）。

| # | 底本（繁） | 目标表用字（简） | 原表是否已收 | 原表所属韵部 | 说明 |
|---|---|---|---|---|---|
| 1 | 講 | 讲 | 否 | — | 简繁**不同形**；转写属转换，非底本原文，待人审签 |
| 2 | 港 | 港 | 否 | — | 简繁同形 |
| 3 | 棒 | 棒 | 否 | — | 简繁同形 |
| 4 | 蚌 | 蚌 | 否 | — | 简繁同形 |
| 5 | 項 | 项 | 否 | — | 简繁**不同形**；转写属转换，待人审签 |
| 6 | 缿 | 缿 | 否 | — | 简繁同形 |
| 7 | 玤 | 玤 | **是** | **上声一董**（`Pingshui_Rhyme.json:4372`） | **一字多部**：底本同时列于上聲一董（第 188 行）与上聲三講（第 200 行）。须新增三讲归属、**保留**一董 |
| 8 | 傋 | 傋 | 否 | — | 简繁同形；`pinyin-data` 记 U+508B 有 jiǎng／gòu，仅旁证，非韵书依据 |
| 9 | 耩 | 耩 | 否 | — | 简繁同形 |

**缺部的字节级证据**（不是转述）：`Pingshui_Rhyme.json` 的 `"上声部"` 起于第 4349 行，其下键序为
`一董`(4350) → `二肿`(4390) → `四纸`(4435)，序号由「二」直接跳到「四」；再以 `讲`/`講`/`项`/`項` 检索全文命中 0 处。
所以 **105 = 106 − 1 是统计结果**，不是被谁告知的数字。

去重口径：9 条归属中 **8 条是新字、1 条（玤）是新增归属**，净增字形 8、归属 9。

---

## 4. 两处事实纠正（与 D1 占位记录不一致）

1. **许可不是 CC BY-SA 4.0。** 落盘字节第 655-656 行页脚为 `{{PD-old}}` 与 `{{wikipedia}}`，第 658 行 `[[Category:韻書]]`。
   D1 的「页面声明 CC BY-SA 4.0（依任务书记录，本次未能亲自复核）」与字节不符，已在 manifest 与补丁中改为如实记录，
   并标 `pendingReview`：`{{PD-old}}` 的适用条件与渲染后版权框仍需人工复核，**复核前不下许可结论**。
2. **底本是繁体、目标表是简体。** 原表用简体（`董`/`肿`/`纸`/`白`），底本用繁体（`講`/`項`）。
   `講→讲`、`項→项` 是按标准简繁对应的**转换**，已在补丁 `charactersProvenance` 逐字标注，
   不得表述为「底本原文如此」。

---

## 5. 四栏统计（本批实际达到的位置）

| 项目 | 结构完整性 | 机器对照 | 人工核验 | evidence approved |
|---|---|---|---|---|
| 平水（未打补丁，105 部） | 105/106，缺三讲（字节级证据见 §3） | 7 字与源表一致；`--check` 8/8 | 7/7（D1，搜韵网）+ 三讲 9 字本批按字节复核（AI 执行，**非人审**） | **0** |
| 三讲补丁（draft） | 结构可达 106（`diff` 已列出 9 条归属） | 与落盘字节逐字一致 | **未签**（`review: null`） | **0** |
| 词林 19 部 33 子卷 | 齐全无空卷 | 真实快照已跑通 | 0 | **0** |
| 新韵重建 14 韵 56 子卷 | 齐全无空卷 | 真实快照已跑通 | 0 | **0** |

**没有任何 `approved`。** 补丁仍未生效，平水对外仍须记 **105/106**。

---

## 6. 未完成项（不造事实补齐）

1. **`data/raw/wikisouce/pingshuiyun-8264804.wikitext` 的字节数与 SHA-256 未登记**（`bytes`/`snapshotSha256` 均为 `null`）。
   本批被要求不运行终端命令，无哈希手段；因此 manifest 里该条 与 补丁 `basis` 都只能写
   「**来源已定位、字节已落盘、摘要未登记**」，不得写成「已核对」。
   注意 `fetch-sources.ts --check` **不覆盖**此条（脚本只遍历内建 8 个 CDN 文件，且 `expectedHashes` 跳过 `null`），
   所以「--check 8/8 通过」不能用来推断本条已校验。
2. **落盘时刻未记录**，`retrievedAt` 为 `null`；`manifest.updatedAt` 仍是 d1-1 的 `2026-10-17T12:26:28.017Z`，已在 `updatedAtNote` 说明。
3. **落盘路径名有拼写偏差**：实际为 `data/raw/wikisouce/`（少一个 `r`）、文件名小写；手册约定为
   `data/raw/wikisource/PingshuiYun-8264804.wikitext`。未重新转录（避免字节漂移），已在 manifest 标 `namingDeviation`。
4. **平水全量（106 部非空快照）未生成**：需要 `scripts/data/` 的构建路径，本批禁止运行脚本。
   现有 `data/normalized/pingshui.sample-d1.json` 仍只有 7 字，**不是**全量。
5. **三讲补丁未生效**：`review` 为 `null`，无人审签，`reviewStatus` 不得改。
6. **`contentDigest` 留空**：需构建脚本生成，不手填占位。
7. `packages/lexicon/README.md` 与 `HANDOFF.md` §8 的「需 GLM 接线」已过期但未改写（见 §1）。
8. 词林 / 新韵的真实数据门槛仍未在真实快照上跑过 `checkCompleteness` 门槛判定（本批未运行脚本）。

---

## 7. 需要人工完成的三件事

1. **补摘要**：对 `data/raw/wikisouce/pingshuiyun-8264804.wikitext` 取字节数与 SHA-256（例：`Get-FileHash -Algorithm SHA256 <path>`），
   连同作业日期回填 `data/sources/manifest.json` 的 `files[0]` 与补丁 `basis[0]`，再把 `digestStatus` 改为 `registered`。
2. **改路径名**：把该文件**改名**（非重新转录）到 `data/raw/wikisource/PingshuiYun-8264804.wikitext`，并同步 manifest 的 `path`。
3. **人审签**：确认 9 字与 `講→讲`/`項→项` 两处转换，记录审核人、时间、依据；签署后 `review` 才可非 null，
   之后才谈补丁生效与 106 部验收。

---

## 8. 复现方式

```powershell
# 基线（已由用户本机完成）
git switch main; git pull --ff-only origin main        # -> 6375b35
git switch -c feat/a-d2-data

# 结构缺口（需 tsx）
node_modules/.bin/tsx scripts/data/inspect.ts

# 来源摘要（只覆盖内建 8 个 CDN 文件）
node --conditions=development scripts/data/fetch-sources.ts --check
```

本批的字节级核对全部可用 `read`/检索在 `data/raw/` 与 `data/patches/` 上直接复核，无需联网。
