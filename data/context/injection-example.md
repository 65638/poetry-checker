# 给 GLM：contextRules 的最小数据注入样例

本文件说明 API 层如何把语境规则及其证据装进 `resolveReadings` 的入参。
形状示例见 [`injection-example.json`](./injection-example.json)——**其中 ID 带 `example` 前缀，不是真实审核数据**。

## 为什么需要额外注入

`resolveReadings({ poem, lookup, overrides, contextRules })` 的 `lookup` 由 A 的 `lookupCharacters()` 产出，
而那个查询只带**韵书条目证据**（`kind: "rhyme_entry"`）。语境规则的依据是另一类证据（`kind: "context"`），
A 的字表里不会有，必须由 API 在调用前并进 `lookup`。

## 必须做的三件事

```ts
import type {
  ContextRule,
  Evidence,
  LookupResult,
  SourceRecord,
} from "@poetry/contracts";

const baseLookup = await lookupCharacters({
  characters,
  rhymeBook,
  dataVersion,
});
const { contextRules, contextEvidence, contextSources } =
  loadContextPackage(contextVersion);

// 1) 语境证据并入 lookup.evidence（report.provenance 才有东西可引用）
// 2) 语境来源并入 lookup.sources
// 3) 规则数组直接作为第 4 个参数传入
const lookup: LookupResult = {
  ...baseLookup,
  evidence: [...baseLookup.evidence, ...contextEvidence],
  sources: [...baseLookup.sources, ...contextSources],
};

const annotated = resolveReadings({ poem, lookup, overrides, contextRules });
```

要点：

- **证据必须先并进 `lookup.evidence`**。`resolveReadings` 判定规则能否生效时，只认
  `lookup.evidence` 里 `reviewStatus === "approved"` **且** `kind === "context"` 的条目。
- `contextRules[].evidenceIds` 必须逐条能在并入后的 `lookup.evidence` 里解析到；
  引用了不存在的 ID 等同于“证据缺失”。
- 来源（`SourceRecord`）要一并并入 `lookup.sources`，否则 provenance 里会出现无法解析的 `sourceId`。
- 规则里的 `selectCandidateIds` 必须绑定到**当前 `dataVersion`** 的真实候选 ID；
  升级数据版本时要重新校验所有引用。

## 门槛（不满足会怎样）

| 情况                                                                         | 结果                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 规则 `reviewStatus !== "approved"`                                           | 不参与选音，记 `CONTEXT_RULE_UNVERIFIED_IGNORED` notice    |
| 规则已审核，但 `evidenceIds` 为空 / 解析不到 / 未审核 / `kind !== "context"` | 不参与选音，记 `CONTEXT_RULE_EVIDENCE_INSUFFICIENT` notice |
| 规则指向的候选 ID 在当前数据里不存在                                         | 抛 `CONTEXT_RULE_STALE`                                    |
| 规则选中/冲突保留的候选自身没有已审核证据                                    | 抛 `LOOKUP_EVIDENCE_UNVERIFIED`                            |

最后一行是 D2 前的复验重点：**规则合法 ≠ 候选有依据**，两条闸都要过。

## 建议的包结构

```text
data/context/
  review-queue.json          # 待审清单（不是 ContextRule[]，运行时禁止加载）
  rules.json        # 已审核可生效的 ContextRule[]（尚未创建）
  evidence.json     # kind=context 的已审核证据
  sources.json      # 上述证据引用的来源
  versions.json              # { "context": "2026-10-17.d2" } → AnalysisResponse.versions.context
```

`versions.json` 的 `context` 值要写进 `AnalysisResponse.versions.context`，并与规则文件一起做版本冻结；
候选 ID 随 `dataVersion` 变化时，必须先重跑引用校验再升 context 版本。

## 当前实际状态

- `rules.json`：**不存在**。真实语境规则已审核 0 条。
- `review-queue.json`：4 条待审条目，其中「更」已有真实候选 ID（见 `proposedSelectCandidateIds`），
  但义项证据与人工审核都还没有，`reviewStatus` 一律 `unverified`。
- 因此当前 `resolveReadings` 的实际语境命中数恒为 0，这是正确结果，不是漏配。
