# M2 readings：解析政策、选音优先级与实现边界

模块：`@poetry/readings`（M2，队员 B）。D1 批次产出。
本文记录**已实现**的口径；未实现的部分在文末单列，不混进“已完成”。

## 1. 范围

两个纯函数，无副作用、不查网络、不查数据库、不调用模型：

```ts
parseText(input: { text: string }): ParsedPoem

resolveReadings(input: {
  poem: ParsedPoem;
  lookup: LookupResult;
  overrides: ReadingOverride[];
  contextRules: ContextRule[];
}): AnnotatedPoem
```

- `lookup`、`overrides`、`contextRules` 全部由调用方（API）注入；本模块不装载数据。
- 模块不返回 HTTP 对象，只抛带 `code` 的 `ReadingsError`；状态码映射由 GLM 在 API 层完成（见第 6 节）。
- 不改字表、不改公共契约；类型与 Schema 全部来自 `@poetry/contracts`。
- **不为了合律选音**：本模块的输入里没有格律模板、没有押韵位信息，也没有体裁。

## 2. 不变量

| 编号 | 不变量                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------- |
| I1   | `originalText` 与输入文本逐码点相同，任何字符都不删、不改。                                               |
| I2   | 只为**表意汉字**（Script=Han 且 Ideographic）建 token；按码点遍历，`startUtf16/endUtf16` 是原文半开区间。 |
| I3   | 每个 token 满足 `originalText.slice(startUtf16, endUtf16) === token.text`。                               |
| I4   | `line`、`column` 从 1 起；`tokenId = l{line}c{column}`；标点不占格律字位。                                |
| I5   | `lines[i].text` 等于该行全部字位文本按序拼接，`lines[i].tokenIds` 等于该行字位 ID 序列。                  |
| I6   | `inputHash` 是原始文本 **UTF-8 字节**的 SHA-256 小写十六进制。                                            |
| I7   | 两个函数都不修改入参（深冻结入参后仍可运行），相同输入产生相同输出。                                      |
| I8   | 输出必须能通过 `ParsedPoemSchema` / `AnnotatedPoemSchema`。                                               |

`lines[i].text` 取**汉字序列**而不是原始行切片：这样标点版与四行版得到相同的“汉字行序列”，
逐字的原文位置仍由 `tokens` 的 UTF-16 区间表达（原文连同标点完整保存在 `originalText`）。

## 3. 文本解析政策

### 3.1 句边界

以下字符结束一句；换行（`\n`、`\r\n`、`\r`）同样结束一句，`CRLF` 视为**同一次**换行。

```
，  。  ；  ？  ！     ,  .  ;  ?  !
```

- 连续边界（`，，`、`。\n`、`！？`）只算一次换行，不生成空诗句。
- 空行不生成空诗句。
- 顿号 `、`、冒号 `：` **不是**句边界（见白名单）。

### 3.2 排版白名单

下列字符保留在原文中、不占格律字位、不产生 notice、不降级 `quality`：

| 类别           | 字符                                             |
| -------------- | ------------------------------------------------ | --- |
| 空白           | `空格` `\t` `\u00a0` `\u3000`(全角空格) `\u200b` |
| 引号           | `“ ” ‘ ’` `「 」『 』`                           |
| 括号           | `（ ） ( )` `《 》〈 〉【 】〔 〕`               |
| 句内停顿与装饰 | `、` `： :` `·` `・` `— – …` `～ ~` `｜          | `   |

白名单是**显式字符集合**，实现在 `packages/readings/src/parse.ts` 的 `LAYOUT_TOLERANT_CHARACTERS`，
与 `parse.test.ts`、本文三处必须同步。不允许用宽泛正则整体吞掉符号。

### 3.3 其它非汉字内容

白名单外的非字位内容（拉丁字母、数字、emoji、未列符号等）：

- 保留在 `originalText`，**不删除**；
- 每个字符记一条 `PARSE_UNSUPPORTED_CHARACTER` notice（带该字符的 UTF-16 区间）；
- 整篇 `quality = needs_review`；
- 后续汉字的偏移照常精确。

**哪些码点算“汉字字位”**：必须是**表意汉字**，即 Unicode `Script=Han` **且** `Ideographic`。

只用 `Script=Han` 会把下面这些错算成字位，凭空多占一格并让后面每一列错位：

| 码点        | 字符                | Script | Ideographic | 处理                                    |
| ----------- | ------------------- | ------ | ----------- | --------------------------------------- |
| U+3005      | `々`                | Han    | 否          | 不建字位，保留原文 + notice（重复记号） |
| U+303B      | `〻`                | Han    | 否          | 不建字位，保留原文 + notice（重复记号） |
| U+2F00–2FDF | 康熙部首（如 `⼀`） | Han    | 否          | 不建字位，保留原文 + notice（部首）     |
| U+3007      | `〇`                | Han    | 是          | 正常建字位（有读音，不能一概排除）      |
| U+20000     | `𠀀`                | Han    | 是          | 正常建字位（2 个 UTF-16 码元）          |

`々` 这类重复记号本模块**不**自动展开成前一个字：展开会改变字位数与语义，必须由人确认。

### 3.4 quality 与 notice

`quality` 只有 `ok` / `needs_review`。任一以下情况降级为 `needs_review`：
非白名单非字位内容、疑似标题、无边界长串、全文无汉字。

| notice code                          | 何时产生                                              | 是否降级                       |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------ |
| `PARSE_UNSUPPORTED_CHARACTER`        | 白名单外的非字位内容（含重复记号、部首）              | 是                             |
| `PARSE_NO_HAN_TEXT`                  | 全文没有汉字（空串/纯标点）                           | 是（且 lines/tokens 为空数组） |
| `PARSE_SUSPECTED_TITLE`              | 首行汉字数 ≤ 8 且严格短于第二行                       | 是                             |
| `PARSE_LINE_SPLIT_UNCERTAIN`         | 全文无任何句边界且汉字数 > 7                          | 是                             |
| `CONTEXT_RULE_UNVERIFIED_IGNORED`    | 未审核语境规则命中某字位（由 `resolveReadings` 追加） | 否                             |
| `CONTEXT_RULE_EVIDENCE_INSUFFICIENT` | 规则已审核但证据缺失/未审核，命中后不参与选音（同上） | 否                             |

### 3.5 启发式只提示，不下结论

- **标题**：只提示“疑似标题、正文范围需确认”，**不删除**任何一行，不做作品识别，也不推断作者。
- **长串**：全文没有任何句边界且汉字数 > 7 时提示“需要先确认分句”，**不**按五/七言自动断句。
- 这两个都是保守启发式，判断错时只会多一条待确认提示，不会改动原文或字位。
- 不做繁简/异体转换，不做 NFKC 归一；字位始终对应原输入字形。
- 空文本或纯标点：`lines`、`tokens` 为空数组 + `PARSE_NO_HAN_TEXT`，由 API 的请求校验负责拒绝（422）；
  本模块**不**构造空诗句。

### 3.6 索引示例

输入 `𠀀白，日`（`𠀀` 是补充平面汉字，2 个 UTF-16 码元）：

| tokenId | 字  | line | column | startUtf16 | endUtf16 |
| ------- | --- | ---- | ------ | ---------- | -------- |
| `l1c1`  | 𠀀  | 1    | 1      | 0          | 2        |
| `l1c2`  | 白  | 1    | 2      | 2          | 3        |
| `l2c1`  | 日  | 2    | 1      | 4          | 5        |

逗号占用了原文 `[3, 4)`，所以 `日` 从 4 开始——标点占原文位置但不占格律字位。

## 4. 读音解析政策

### 4.1 优先级（固定，不可调换）

1. **用户覆盖**（`selectionMethod = "user"`）
2. **已审核语境规则**（`"context_rule"`；需 `reviewStatus = "approved"` **且**规则证据齐备）
3. **唯一候选**（`"unique"`；需该候选自身证据已审核）
4. **保留歧义**（`"unresolved"`）

“出现在押韵位”“更贴近某个模板”“哪个读音更合律”——都不是判音证据，本模块不读这些信息。

### 4.2 状态矩阵

| 输入情形                          | readingStatus                                                     | selected | selectionMethod | possibleTones  | toneStatus  | tone       |
| --------------------------------- | ----------------------------------------------------------------- | -------- | --------------- | -------------- | ----------- | ---------- |
| 没有候选                          | `unknown`                                                         | `null`   | `unresolved`    | `[]`           | `unknown`   | `null`     |
| 唯一候选且证据已审核              | `resolved`                                                        | 该候选   | `unique`        | 该候选声调     | 按候选      | 按候选     |
| 唯一候选但证据未审核/为空         | **抛 `LOOKUP_EVIDENCE_UNVERIFIED`**（数据未就绪，不返回任何状态） |
| 多个候选含 P、Z（均已审核）       | `ambiguous`                                                       | `null`   | `unresolved`    | `["P","Z"]`    | `ambiguous` | `null`     |
| 两个不同读音但同为 Z（均已审核）  | `ambiguous`                                                       | `null`   | `unresolved`    | `["Z"]`        | `resolved`  | `"Z"`      |
| 已知 P + 声调未知候选（均已审核） | `ambiguous`                                                       | `null`   | `unresolved`    | `["P"]`        | `unknown`   | `null`     |
| 多候选中部分证据未审核            | **抛 `LOOKUP_EVIDENCE_UNVERIFIED`**（未审核候选会进入有效候选集） |
| 合法用户覆盖（候选已审核）        | `resolved`                                                        | 用户所选 | `user`          | 按所选候选     | 按所选候选  | 按所选候选 |
| 用户覆盖指向未审核候选            | **抛 `LOOKUP_EVIDENCE_UNVERIFIED`**                               |
| 规则命中同一候选且证据齐备        | `resolved`                                                        | 该候选   | `context_rule`  | 按该候选       | 按该候选    | 按该候选   |
| 规则证据不足 / 未审核             | `ambiguous`                                                       | `null`   | `unresolved`    | 按全部候选     | 按全部候选  | 按全部候选 |
| 规则证据齐备但候选自身未审核      | **抛 `LOOKUP_EVIDENCE_UNVERIFIED`**                               |
| 同优先级规则冲突（候选均已审核）  | `ambiguous`                                                       | `null`   | `unresolved`    | 按保留候选合集 | 按合集      | 按合集     |
| 同优先级规则冲突且含未审核候选    | **抛 `LOOKUP_EVIDENCE_UNVERIFIED`**                               |

**统一证据门槛**：凡是进入 `effectiveCandidateIds` 的候选（即会参与读音、平仄、归部推导的候选），
都必须至少有一条已审核证据。覆盖、规则、冲突、唯一候选、保留歧义共用同一处检查，
不存在“某条路径提前返回确定状态”的特例。

平仄推导规则（与 `AnnotatedTokenSchema` 的 refinement 完全一致）：

- 有效候选为空，**或**任一有效候选 `tone === null` → `toneStatus = unknown`，`tone = null`，
  `possibleTones` 只放已知声调（**不能**用另一个已知候选掩盖未知）。
- 全部有效候选声调已知且唯一 → `toneStatus = resolved`，`tone` = 该声调。
- 全部已知但 P、Z 并存 → `toneStatus = ambiguous`，`tone = null`，`possibleTones = ["P","Z"]`。

“读音歧义但平仄确定”（上表第 4 行）是刻意保留的结果，下游 C/E 必须能消费它。

### 4.3 证据口径

- 每个字位的 `evidenceIds` = 生效候选的 `evidenceIds` ∪ 生效规则带来的 `evidenceIds`，
  并且**只保留 `reviewStatus = "approved"` 的证据**。
- `unverified` 证据不进入字位结论（契约第 3 节第 8 条：未核实证据不得支撑确定的发布结论）；
  它仍保留在 `lookup.evidence` / provenance 中供待核查展示。
- 用户覆盖不是学术证据：覆盖后字位 `evidenceIds` 仍只来自候选与规则，`reason` 写明“人工覆盖，非系统推断”。

**证据同时决定能否下结论**（不只是显示）：

| 情形                                            | 结论                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 候选的 `evidenceIds` 里至少有一条 approved 证据 | 该候选“可支撑”，可以进入有效候选集                                                              |
| 候选的 `evidenceIds` 为空，或全部是 unverified  | 该候选**不可**支撑，不能进入有效候选集                                                          |
| 任一进入 `effectiveCandidateIds` 的候选不可支撑 | **抛 `LOOKUP_EVIDENCE_UNVERIFIED`**（数据未就绪），不返回 `resolved/ambiguous/unknown` 任一状态 |
| 用户覆盖指向不可支撑候选                        | 同上（覆盖不是证据，不能把未审核来源变成已审核来源）                                            |
| 语境规则（含冲突保留）选中不可支撑候选          | 同上（规则合不合法与候选有没有依据是两件事）                                                    |

为什么是抛错而不是返回 `unknown`：契约只有 `resolved / ambiguous / unknown`，没有“证据待核实”。
拿 `unknown` 顶替会把“已收录但未审核”显示成“未收录”，下游无法区分，等于换了个方式放行；
而只清空 `effectiveCandidateIds` 或只改 `readingStatus` 也不够——平仄仍会从残余候选推导出来。
因此只要有效候选缺依据就按**数据未就绪**处理，由 API 映射为 503（见第 5 节）。

同时**不通过丢弃未审核候选来缩小读音集合**：证据不足时整条报错，而不是把未审核候选删掉后
在剩余候选上假造“唯一候选”。

### 4.4 唯一候选不等于已核实事实

只有一个候选时，只有在该候选**自身证据已审核**的前提下才给 `readingStatus = resolved`（`selectionMethod = unique`）。

若该候选没有已审核证据，`resolveReadings` 抛 `LOOKUP_EVIDENCE_UNVERIFIED`：
不返回 `resolved`，也不用 `unknown` 冒充“未收录”，由 API 映射为 503 数据未就绪。

> 契约张力：`AnnotatedToken` 没有“待核实”状态位。`unknown` 与“未收录”无法区分，
> 因此选择显式报错而不是换一种方式放行。可选契约变更见第 7 节。

### 4.5 用户覆盖校验

`resolveReadings` 逐条校验，任一条不满足即抛 `ReadingsError`，绝不静默忽略或任选：

| 情形                                               | code                         |
| -------------------------------------------------- | ---------------------------- |
| `tokenId` 不在本篇                                 | `OVERRIDE_TOKEN_UNKNOWN`     |
| 同一字位覆盖两次                                   | `OVERRIDE_DUPLICATE_TOKEN`   |
| `readingId` 不属于该字位候选（别字、别书、不存在） | `OVERRIDE_READING_UNKNOWN`   |
| 覆盖合法但所选候选没有已审核证据                   | `LOOKUP_EVIDENCE_UNVERIFIED` |

最后一行是本次评审修复的绕过路径：覆盖路径曾经提前返回 `resolved`，连 `toneStatus` 也变成 `resolved`。
人工选择只表示“用户指定这个读音”，不构成该读音的已审核依据。

**本模块不做**“请求原文 vs 当前原文”的陈旧覆盖校验：`resolveReadings` 的签名里没有请求 hash
（`inputHash` 只在本篇内），这项由 API 用 `inputHash` 完成后返回 `STALE_READING_OVERRIDE`。

### 4.6 语境规则执行

已实现，不是占位：

1. **只匹配同句**：短语不跨句边界，跨行命中不算命中。
2. **精确匹配**：逐码点比较，不分词、不模糊、不做同义替换。
3. **最长优先**：同一字位被多条规则命中时，只保留短语码点最长的那一组。
4. **同长冲突**：最长相同的规则选中不同候选时，保留全部被选候选，`ambiguous` + `unresolved`，`reason` 写明冲突规则 ID。
   冲突保留的候选同样要过证据门槛：其中任一缺已审核证据即抛 `LOOKUP_EVIDENCE_UNVERIFIED`。
5. **只认 `approved`**：`unverified` 规则命中会被记录为 `CONTEXT_RULE_UNVERIFIED_IGNORED` notice，不改变读音。
6. **规则证据必须齐备且用途正确**：`reviewStatus = approved` 还不够——`evidenceIds` 必须非空、每条都能在
   `lookup.evidence` 中解析到、全部是 `approved`，**并且 `kind = "context"`**。
   候选自己的韵书归部证据（`rhyme_entry`）不能顶替语境依据。任一不满足即视为证据不足，不参与选音，
   命中记录为 `CONTEXT_RULE_EVIDENCE_INSUFFICIENT` notice。
7. **候选证据是独立的一道闸**：规则合法 ≠ 候选有依据。规则（或冲突保留、或被覆盖选中）指向的候选
   自身没有已审核证据时，抛 `LOOKUP_EVIDENCE_UNVERIFIED`，不返回任何确定状态。
8. **只认本韵书**：`rule.book` 与 `lookup.book` 不同的规则不参与本次分析。
9. **规则与数据脱节即报错**：生效规则指向当前字不存在的候选 → `CONTEXT_RULE_STALE`（不静默失效）。
10. **结构自相矛盾即报错**：无短语、`selectCandidateIds` 为空、`targetOffset` 越界、`target` 与短语不符 → `CONTEXT_RULE_INVALID`。

## 5. 错误码（模块内部，交 GLM 映射）

模块只抛 `ReadingsError`，带稳定 `code` 与定位 `details`（只含 ID，不含原文全文）：

| code                                  | 含义                                                                                                         | 建议映射（供 GLM 决策）                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `POEM_TOKEN_SLICE_MISMATCH`           | poem 自身不一致，区间切不回原文                                                                              | 500（服务端自身 bug）                    |
| `POEM_TOKEN_DUPLICATE`                | 同一 `tokenId` 出现两次                                                                                      | 500                                      |
| `LOOKUP_ENTRY_DUPLICATE`              | 同字多条 entry                                                                                               | 503 `DATA_NOT_READY`                     |
| `LOOKUP_CANDIDATE_CHARACTER_MISMATCH` | 候选字与 entry 不符 / 非单码点                                                                               | 503                                      |
| `LOOKUP_CANDIDATE_BOOK_MISMATCH`      | 跨书候选                                                                                                     | 503                                      |
| `LOOKUP_CANDIDATE_DUPLICATE`          | 同字重复候选 ID                                                                                              | 503                                      |
| `LOOKUP_EVIDENCE_UNKNOWN`             | 候选引用不存在的证据                                                                                         | 503                                      |
| `LOOKUP_EVIDENCE_UNVERIFIED`          | 参与读音/平仄/归部推导的候选缺已审核证据（原始候选全未审核、覆盖选中未审核候选、规则或冲突保留的候选未审核） | **503 `DATA_NOT_READY`**，不得降级成 200 |
| `OVERRIDE_TOKEN_UNKNOWN`              | 覆盖指向不存在的字位                                                                                         | 422                                      |
| `OVERRIDE_DUPLICATE_TOKEN`            | 同一字位重复覆盖                                                                                             | 422                                      |
| `OVERRIDE_READING_UNKNOWN`            | 覆盖指向别字/别书/不存在的候选                                                                               | 422                                      |
| `CONTEXT_RULE_STALE`                  | 规则指向当前数据不存在的候选                                                                                 | 503                                      |
| `CONTEXT_RULE_INVALID`                | 规则结构自相矛盾                                                                                             | 503                                      |
| `CONTEXT_RULES_PENDING`               | 保留码：若将来关闭规则执行，遇到 approved 规则必须显式抛出                                                   | 501 / 503                                |

数据类错误给 `503` 的意图是：宁可让 API 报“数据未就绪”，也不要把缺证据的候选当成已核实事实返回。

## 6. D1 明确未做（D2 起）

1. ~~真实字表接入~~：D2 已接 A 的七字真实快照做联调；全量字表仍未交付（见第 9 节）。
2. `data/context/rules.approved.json` 尚未创建：没有义项证据、没有人工审核，一条规则都不生效。
3. 同义/近义词表、分词、跨句指代：不做，只有精确短语。
4. 覆盖率与准确率：**只报带分母的事实统计**，不报读音准确率/自动覆盖率——没有已审核证据与已审核规则，
   任何比例都是拿未核实数据算出来的。
5. ~~`package.json` 配置~~：GLM 已补 `exports`/`build`/`test`，本模块可按包名导入。

## 7. 交接要求

**给 A（`@poetry/lexicon`）**

- 需要 `LookupResult.dataVersion` 稳定、可比较；候选 ID 一经发布不改名。
- 候选必须带 `book`，禁止跨书混装；`character` 必须是单个码点且与所属 entry 一致。
- `evidenceIds` 必须能在 `lookup.evidence` 里解析到；`reviewStatus` 要如实标注（本模块据此过滤）。
- `missing` 必须显式声明未收录的字；本模块不把“未声明”当作“未收录”。

**给 C / E**

- 标注状态有三个：`resolved` / `ambiguous` / `unknown`；`unknown` 不是第三种声调。
- “读音歧义但平仄确定”是正常结果（第 4.2 节第 4 行），不要把它当失败。
- “存在未知候选”时 `toneStatus = unknown`，不能用另一个已知候选顶上。
- 字位区间始终可切回原文；`lines[].text` 是汉字序列，不含标点。

**给 GLM**

- 入口：`@poetry/readings` 导出 `parseText`、`resolveReadings`、`ReadingsError`、`READINGS_ERROR_CODES`。
- `packages/readings/package.json` 的 `exports` / `build` / `test` 已由 GLM 补齐，本模块可按包名导入。
- 错误码映射见第 5 节；任何未实现分支都不能被 API 转成 200。
- **语境证据必须由 API 并入 `lookup`**：`contextRules[].evidenceIds` 指向的 `kind="context"` 证据要并进
  `lookup.evidence`，其 `SourceRecord` 并进 `lookup.sources`。最小样例见 `data/context/injection-example.md`。
- 可选契约变更建议：`AnnotatedToken` 增加“数据/证据待核实”状态位，替代目前走异常的口径。

## 8. 复现

```powershell
# 单元测试（合成 fixture + 真实快照各一组）
pnpm exec vitest run packages/readings/tests
pnpm --filter @poetry/readings test

# 真实数据覆盖统计（生成 data/context/d2-coverage-report.{json,md}）
node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d2-coverage.ts

pnpm typecheck
pnpm verify
```

## 9. D2：真实数据联调现状（2026-10-17）

### 9.1 数据现状

| 项           | 值                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 快照         | `data/normalized/pingshui.full-d2-patched.json`（= API `snapshot-manifest.json` 声明的当前 pingshui 快照），`dataVersion = pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft` |
| 覆盖字数     | **8240 字 / 10387 候选 / 106 部**（API 清单快照，含上声三讲补缺；词林、新韵全量同批）                                                                                     |
| 快照审核身份 | `reviewStatus: unverified`；**evidence approved = 0 / 106**                                                                                                               |
| 语境规则     | **approved 0 条**；`rules.approved.json` 不存在                                                                                                                           |

> 按 AGENTS.md 数据纪律：结构完整性通过 ≠ 内容审核通过。上表最后一列才是决定能否出结论的一栏。

### 9.2 三首固定正文的实测（分母=字位，全量表）

| 项目 | 结构完整性                         | 机器对照                 | 人工核验                    | evidence approved |
| ---- | ---------------------------------- | ------------------------ | --------------------------- | ----------------- |
| 现状 | 引用/结构通过（快照 `unverified`） | 96/96 字位有候选，缺字 0 | 作品审核 0/3，语境规则 0 条 | **0/106**         |

| 作品     | 字位 | 有候选字位 | 缺字位 | 多候选字位 | 其中平仄取决于消歧 | 无已审核证据字位 | `resolveReadings` 结果          |
| -------- | ---- | ---------- | ------ | ---------- | ------------------ | ---------------- | ------------------------------- |
| 登鹳雀楼 | 20   | 20         | 0      | 3          | 1                  | 20               | 抛 `LOOKUP_EVIDENCE_UNVERIFIED` |
| 静夜思   | 20   | 20         | 0      | 4          | 3                  | 20               | 抛 `LOOKUP_EVIDENCE_UNVERIFIED` |
| 黄鹤楼   | 56   | 56         | 0      | 15         | 6                  | 56               | 抛 `LOOKUP_EVIDENCE_UNVERIFIED` |

生成命令见第 8 节；明细在 `data/context/d2-coverage-report.{json,md}`。

读法：

- 字表覆盖已经不是瓶颈：三首 96 字位全部有候选。
- 唯一的卡点是 **evidence 未审核**：106 条证据没有一条 approved，因此 96 字位全部不能出结论。
- 因此本批次**没有**自动覆盖率、也没有读音准确率可报。

### 9.3 平仄取决于消歧的 10 个位置

候选里同时存在平与仄的字位——选错会直接改变格律结论，是人工审核的优先目标。
其余多音字位属于「读音歧义但平仄已定」，不影响格律。

| 作品     | 位置                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 登鹳雀楼 | 更（l4c1）                                                             |
| 静夜思   | 望（l3c3）、思（l4c3）、乡（l4c5）                                     |
| 黄鹤楼   | 乘（l1c4）、空（l2c3）、不（l3c5）、空（l4c5）、汉（l5c5）、乡（l7c3） |

逐位置候选 ID 见 `data/context/tone-critical-positions.json`。

### 9.4 「更」的真实候选

| 候选 ID                   | 声类 | 平仄 | 韵部       |
| ------------------------- | ---- | ---- | ---------- |
| `pingshui:更:ping:八庚`   | ping | P    | 下平八庚   |
| `pingshui:更:qu:二十四敬` | qu   | Z    | 去二十四敬 |

这两条是**真实候选**，已写入 `data/context/review-queue.json` 的 `proposedSelectCandidateIds`。
但“副词义→去声”“夜间计时义→平声”的对应关系仍是**待审假设**，缺可定位义项证据，
所以 `selectCandidateIds` 留空、`reviewStatus` 保持 `unverified`，运行时不生效。

## 10. 语境规则与证据的绑定规则（D2 起）

- 候选 ID 绑定 `dataVersion`：升级数据版本必须重新校验所有 `selectCandidateIds` 与 `evidenceIds`。
- `ContextRule.evidenceIds` 必须指向 `kind="context"` 的已审核证据；`Evidence.sourceId` 必须能在 `lookup.sources` 解析。
- 一条规则要生效，需同时满足：规则 `approved`、证据齐备且用途正确、**被选候选自身也有已审核证据**。
  前两条不满足 → notice；第三条不满足 → 抛 `LOOKUP_EVIDENCE_UNVERIFIED`。
- `targetOffset` 按码点计，不用 UTF-16 长度；跨行短语不命中（只匹配同句）。
