# data/context：语境规则格式与待审队列（D1 建立，D2 接入真实数据）

本目录属于队员 B（见 `docs/ownership.md`）。到 D2 为止仍**没有任何可生效的发布规则**：
格式与队列已就绪，真实语境证据与人工审核都还没有。

## 目录约定

| 文件                           | 作用                                                             | 是否可被运行时加载                                                 |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `review-queue.json`            | 待审核语境清单：候选词组、偏移、要查的词义、正反例、来源状态     | **否**。这是人工整理材料，不是 `ContextRule[]`，加载器不得直接读它 |
| `injection-example.md/js`      | 给 GLM 的最小注入样例：语境证据如何并入 `lookup`                 | **否**。形状示例，ID 带 `example` 前缀                             |
| `d2-coverage-report.json/md`   | 真实数据覆盖统计（四栏口径，带分母）                             | 否。报告产物                                                       |
| `tone-critical-positions.json` | **平仄取决于消歧**的字位清单（候选含平又含仄），人工审核优先目标 | 否。报告产物                                                       |
| `rules.approved.json`          | 已审核、可生效的 `ContextRule[]`                                 | 是。**尚未创建**，避免用未审核内容冒充审核结果                     |

运行时只接受 `reviewStatus = "approved"` 的规则参与自动选音；`unverified` 规则命中时会被 `resolveReadings` 记录为
`CONTEXT_RULE_UNVERIFIED_IGNORED` notice，不改变任何字位的读音。规则已审核但证据缺失/未审核/用途不是 `context` 时，
记为 `CONTEXT_RULE_EVIDENCE_INSUFFICIENT` notice，同样不选音。

## D2 的真实数据状态

- 真实快照：`data/normalized/pingshui.sample-d1.json`（`dataVersion = sample-pingshui-cwr-ff0e9c1-d1`），
  只覆盖 7 个字，证据全部 `unverified`。
- 「更」已有两个真实候选 ID（`pingshui:更:ping:八庚` / `pingshui:更:qu:二十四敬`），
  但义项→候选的对应仍是待审推测，写在 `proposedSelectCandidateIds`，不是 `selectCandidateIds`。
- 覆盖统计与缺口清单见 `d2-coverage-report.md`：三首固定正文共 96 字位，仅 8 字位有候选。

## 为什么现在没有 rules.approved.json

- 真实字表只覆盖 7 个字，三首诗中 88 个字位连候选都没有，`selectCandidateIds` 无从填写。
- 即使是「更」，也还没有可定位的义项证据（韵书条目/字书义项/反切），只有现代读音线索；
  按任务书口径，现代读音不能直接等同古韵义项。
- 候选 ID 属于跨模块契约（`ReadingCandidate.id` 由 A 维护），B 不造 ID、不改字表。
- 本批次没有任何一条语境结论经过人工审核，因此按 `docs/readings.md` 的口径，一条也不能进入发布选择器。

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
→ 通过后把该条移入 `rules.approved.json` 并置 `reviewStatus=approved` → 补一条正例与一条反例测试。

D1 不追求凑满 60 个评测位置，也不报告未做留出验证的准确率。
