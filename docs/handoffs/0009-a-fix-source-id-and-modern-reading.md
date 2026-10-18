# 0009 · GLM 钉住缺陷修复：跨库来源 ID 冲突 + 新韵 modernReading

日期：2026-10-18。触发：GLM 在 `c0e88ab`（分支 `glm/d2-real-api`）加的测试钉住两处硬伤。本次只改数据与构建脚本，**未运行全仓测试**（由 A 在外部终端执行）。

## 缺陷 1：跨库来源 ID 冲突

### 现象

`apps/api/src/resources.ts` 用 `dedupeById(sources, "source", loadErrors)` 合并三库 sources。平水与词林都来自 `chinese_word_rhyme` 仓库，但**文件不同**（`Pingshui_Rhyme.json` / `Cilin_Rhyme.json`），`snapshotSha256`、`url`、`title` 都不同，却共用同一个来源 ID `src:chinese_word_rhyme` → 触发同 ID 不同内容冲突，词林被降级为冲突 503。

### 修法：来源 ID 按库区分

| 迁移前 | 迁移后 | 说明 |
|---|---|---|
| `src:chinese_word_rhyme`（平水） | **`src:chinese_word_rhyme:pingshui`** | 指向 `Pingshui_Rhyme.json` |
| `src:chinese_word_rhyme`（词林） | **`src:chinese_word_rhyme:cilin`** | 指向 `Cilin_Rhyme.json` |
| `src:pinyin-data`（新韵） | 不变 | 本来就唯一 |
| `src:wikisource:pingshuiyun`（三讲） | 不变 | 本来就唯一 |

实现：`packages/lexicon/src/adapters/chinese-word-rhyme.ts` 的 `CwrSourceOptions` 新增可选 `sourceId`，省略时退回默认 `src:chinese_word_rhyme`（仅为兼容既有测试构造，测试不传即不受影响）。四个调用点分别传入按库 ID：`build-pingshui.ts`、`build-cilin.ts`、`build-sample.ts`、`inspect.ts`。

**迁移影响面**：`evidence.sourceId` 与 `source.id` 同步变更，均在快照内部闭合；消费方若硬编码过旧 ID，需按下表替换。上游 `data/sources/manifest.json` 的 `src:chinese_word_rhyme` 仍是**上游仓库条目**，不随快照来源 ID 改名。

### 验证

```
pingshui.full-d2.json  → src:chinese_word_rhyme:pingshui
cilin.full-d2.json     → src:chinese_word_rhyme:cilin
xinyun.full-d2.json    → src:pinyin-data
```
三库来源 ID 两两不同，合并时不再触发同 ID 冲突。

## 缺陷 2：新韵 modernReading 全空

### 现象与根因

51,608 条候选的 `modernReading` 全为 `null`。根因不只是"没填"：原聚合用 `Map<子卷, Set<字形>>`，**字形一层就把读音合并掉了**，天然无法回答"这个字形在这个子卷里读什么"。这正是"把同归部当成同读音"的陷阱。

### 修法

1. 聚合改为 `Map<子卷, Map<字形, Set<"无调号拼音#调值">>>`，**每个具体读音单独保留**
2. 新增 `tonelessPinyin()`：去调号但保留 `ü`（`lǜ → lü`，不能并成 `lu`）；兼容 `nv3` / `nu:4` 写法
3. 按契约 `modernReading` 是 strictObject，填 `{ pinyin, toneNumber, evidenceIds }`
4. **同 (字形, 子卷) 多读音**：候选只能承载一条 modernReading，其余不得静默丢弃 → 全部写入 `data/patches/xinyun-reading-collisions.dev.json`（**1,508 组**）

### 抽查（实跑）

| 候选 ID | pinyin | toneNumber |
|---|---|---|
| `xinyun:一:yinping:十二齐·阴平` | yi | 1 |
| `xinyun:一:yangping:十二齐·阳平` | yi | 2 |
| `xinyun:一:qu:十二齐·去声` | yi | 4 |
| `xinyun:白:yangping:二波·阳平` | bo | 2 |
| `xinyun:白:yangping:四开·阳平` | bai | 2 |
| `xinyun:雪:shang:三皆·上声` | xue | 3 |

新增断言（全部 OK）：候选均带 modernReading（缺失 0）、pinyin 无调号（0 条）、toneNumber 与声调类一致（异常 0）、pinyin 非空（0）。

## 状态落库：证据审批改由清单驱动

新增 `data/reviews/approved-evidence.json` 作为**唯一**审批来源，构建脚本读它设置 `evidence.reviewStatus`，不再硬编码：

| 证据 | 依据 |
|---|---|
| `ev:pingshui:上:三讲` | A 本人肉眼核对（2026-10-18） |
| `ev:pingshui:下平:八庚`、`ev:pingshui:去:二十四敬` | J03：更 平/去两读 |
| `ev:pingshui:入:入声十一陌`、`ev:pingshui:入:入声四质` | J03：白、一 |
| `ev:pingshui:下平:十一尤` | J03：流、楼（本批把楼补入通过范围） |
| `ev:pingshui:入:入声九屑`、`ev:pingshui:入:入声五物` | J03：雪、物 |

**共 8 条 approved；其余 98 条（平水）+ 33 条（词林）+ 56 条（新韵）仍 unverified。**
断言锁定：`approved 证据数（8）等于审批清单命中数（8）`、`审批清单之外的证据不得为 approved（0 条）`、`仍有 98 条证据为 unverified（部分批准不等于整库批准）`。

快照级 `reviewStatus` 仍为 `unverified`，`releaseGatePassed` 仍为 `false` —— **8 条部级证据批准不等于整库批准**。

同步修改的测试：`packages/lexicon/tests/real-sample.test.ts:109` 原本断言样本 evidence 必须 `unverified`，现改为断言 `approved`（样本 7 个韵部证据全部在审批清单内）。

## 重建后的快照指纹

| 快照 | 候选 | 业务内容摘要 |
|---|---|---|
| `pingshui.full-d2.json` | 10,378 | `ecf6c42466771b616cc611cb6ed265208145d73eb01f752ceca0cc2b625d8d1f` |
| `pingshui.full-d2-patched.json` | 10,387 | `4d75fc46d04ef87cf76f1db5ebf329e0353f0fac7c5d9ed98c7ebd27339d64ea` |
| `xinyun.full-d2.json` | 51,608 | `4a68bd5782ec6e2de7e0682edca0a38534307f4dd28702db487875815c690ae5` |
| `pingshui.sample-d1.json` | 8 | `d92508eaeb8c0d12bb7b82abb60385cc1cbd82afa78ac77ff965ff92bebff4ab` |

## 验证与未验证

**已跑**：四个构建脚本 EXIT=0；`check-normalized.ts` EXIT=0（四份快照结构与门槛检查）；`tsc --noEmit` EXIT=0。

**未跑**：`pnpm test` / `pnpm verify`（按指示由 A 在外部终端执行）。

## 仍需 GLM 处理

1. `c0e88ab` 的 `expect(JSON.stringify(r.loadErrors)).toContain("src:chinese_word_rhyme")` 断言的是**缺陷存在**，修复后应改为断言 `loadErrors` 为空或不含该冲突
2. `snapshot-manifest.json` 中 xinyun 的 `reason` 写着「modernReading 缺失为 A 已知缺陷待修」，应更新
3. 消费方若硬编码 `src:chinese_word_rhyme`，按本文迁移表改为 `:pingshui` / `:cilin`
