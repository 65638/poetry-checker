# data/context：语境规则格式与待审队列（D1 建立，D2 接入真实数据）

本目录属于队员 B（见 `docs/ownership.md`）。J03 第二批 10 条及 D2 收口 1 条语境规则已由 API 加载；均配套已批准的语境依据与所选候选归部证据。Codex 本次接管记录见 `docs/handoffs/0012-codex-d2-closeout.md`。

## 目录约定

| 文件                           | 作用                                                         | 是否可被运行时加载                                                 |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `rules.json`                   | **已审核、可生效**的 `ContextRule[]`（当前 11 条）           | 是。API 硬编码读这个路径                                           |
| `evidence.json`                | 规则引用的 `kind="context"` 已审核证据                       | 由 API 并入 `lookup.evidence` 后生效                               |
| `sources.json`                 | 上述证据的 `SourceRecord`                                    | 由 API 并入 `lookup.sources` 后生效                                |
| `review-queue.json`            | 待审核语境清单：候选词组、偏移、要查的词义、正反例、来源状态 | **否**。这是人工整理材料，不是 `ContextRule[]`，加载器不得直接读它 |
| `injection-example.md/js`      | 给 GLM 的最小注入样例：语境证据如何并入 `lookup`             | **否**。形状示例，ID 带 `example` 前缀                             |
| `d2-coverage-report.json/md`   | 真实数据覆盖统计（四栏口径）与缺口清单                       | 否。报告产物                                                       |
| `tone-critical-positions.json` | 平仄取决于消歧的 10 个位置，人工审核优先清单                 | 否。报告产物                                                       |

运行时只接受 `reviewStatus = "approved"` 的规则参与自动选音；`unverified` 规则命中时会被 `resolveReadings` 记录为
`CONTEXT_RULE_UNVERIFIED_IGNORED` notice，不改变任何字位的读音。规则已审核但证据缺失/未审核/用途不是 `context` 时，
记为 `CONTEXT_RULE_EVIDENCE_INSUFFICIENT` notice，同样不选音。

## 当前状态（2026-10-18，D2 收口批次确认后）

`rules.json` 的 10 条来自 `docs/reviews/13_J03三首核心诗逐字人审_第二批.md` 组长裁定，
逐条绑定：短语、`targetOffset`、被选候选、`kind=context` 的裁定证据与来源。
新增第 11 条来自组长“同意该批次与‘千里’裁定”：只在固定句“欲穷千里目”选择上声四纸，去声四寘竞争候选保留待核。记录见 `data/reviews/d2-closeout-batch-approval.json`，审核方式为接受机器初审批次并裁定异常。本文件只做**选音**，不改任何格律规则。

| 项                   | 值                                                            |
| -------------------- | ------------------------------------------------------------- |
| 规则                 | 11 条，全部 `reviewStatus=approved`                           |
| 规则证据             | 11 条 `kind=context`、approved；来源 `src:j03-review-batch2`、`src:d2-closeout-review` |
| 被选候选已有韵书证据 | **11 / 11**；候选范围审批，不扩成整部批准                     |
| 三首真实 API         | **3/3 返回 200**；合律/不适用/常格偏离分别如实保留            |

**集成事项**：GLM 集成后重启 API 加载 review3，复跑 `scripts/probe-d2-api.ts --require-golden` 并在正式页面验证。全库发布仍未批准；不得将三首通过扩成任意输入均可分析。

字位证据统计以 `data/reviews/golden-token-review-2026-10-18.json/.md` 为准：任一候选获标记 96/96，全部候选获标记 86/96，混合 10/96。语境筛选前 10 字位仍有未审竞争候选；应用已审规则后，有效候选证据 96/96 齐备，见 `data/reviews/d2-remaining-candidate-review.json`。计数不扩大批准范围。

## 为什么之前没有 rules.json

- 早期真实字表只覆盖 7 个字，三首诗中 88 个字位连候选都没有，`selectCandidateIds` 无从填写。
- 当时没有任何一条语境结论经过人工审核，按 `docs/readings.md` 的口径一条也不能进入发布选择器。
- 第二批人审（13\_）才把十处字位逐条裁定为 approved，本批据此落地。

## ContextRule 字段口径（与 `@poetry/contracts` 一致）

| 字段                 | 要求                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `id`                 | 稳定、可读；一经采用不改名，语义变化时新增 ID                                                   |
| `target`             | 单个汉字，必须与短语在 `targetOffset` 处的字完全一致                                            |
| `exactPhrases`       | 精确词组，逐个码点比较，不做分词、不做模糊匹配                                                  |
| `targetOffset`       | 目标字在短语中的**码点**下标，从 0 起；同一规则的所有短语必须偏移一致，否则拆规则               |
| `sense`              | 该规则依据的义项，写清“为什么这个语境选这个读音”                                                |
| `book`               | 只对该韵书生效；`book` 与本次 lookup 不同的规则不参与本次分析                                   |
| `selectCandidateIds` | 必须是目标字在**当前数据版本**下的真实候选 ID；失效时 `resolveReadings` 抛 `CONTEXT_RULE_STALE` |
| `negativeExamples`   | 反例：用来证明规则没有过宽，至少每个规则一条                                                    |
| `evidenceIds`        | 必须指向已存在的 `Evidence`；`reviewStatus=unverified` 的证据不会进入字位 `evidenceIds`         |
| `reviewStatus`       | 只有 `approved` 生效。`pending` 不属于本字段取值，外部审核队列用 `unverified` 表达              |

## 匹配与冲突口径

1. 只在**同一句（同一 line）内**匹配，短语不跨句边界；跨行命中的词组不算命中。
2. 精确最长优先：同一字位被多条规则命中时，取短语码点最长的那一组，短词组不参与。
3. 同优先级冲突：最长相同的多条规则选中不同候选时，保留全部被选候选，`readingStatus=ambiguous`、
   `selectionMethod=unresolved`，`reason` 写明冲突规则 ID，不任选。
4. 优先级：用户覆盖 → 已审核语境规则 → 唯一候选 → 保留歧义。
5. 规则不读格律模板、不看押韵位、不看“哪个读音更合律”。

## 待审队列的用法

`review-queue.json` 每条包含：目标字、待查词组及偏移、需要查证的义项假设、正例/反例、`sourceStatus`
（“尚未查到”要如实写）、以及 `selectCandidateIds: []` + `candidateIdStatus`。

处理顺序：A 交付候选 ID → 逐条补齐 `selectCandidateIds` → 找到可定位来源填 `evidenceIds` → 人工审核义项
→ 通过后把该条移入 `rules.json` 并置 `reviewStatus=approved` → 补一条正例与一条反例测试。

D1 不追求凑满 60 个评测位置，也不报告未做留出验证的准确率。
