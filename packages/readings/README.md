# @poetry/readings（M2）

诗格律检查器的文本解析与读音传播模块。负责把用户原文变成逐字标注：原文位置、全部候选、
有效候选、读音状态、平仄可能集与证据。上游是 A 的字表（`LookupResult`），下游是 C 的格律入口与 E 的体裁模块。

**口径与边界见 [`docs/readings.md`](../../docs/readings.md)；本文件只讲怎么调用。**

## 模块边界

- 纯函数，不查网络、不查数据库、不调用模型判音。
- 不修改字表、不修改公共契约、不返回 HTTP 对象。
- 不读格律模板、不看押韵位、不按“哪个读音更合律”选音。
- 数据（`lookup`）、人工覆盖（`overrides`）、语境规则（`contextRules`）全部由调用方注入。

## 调用

```ts
import { parseText, resolveReadings, ReadingsError } from "@poetry/readings";

const poem = parseText({
  text: "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。",
});

const annotated = resolveReadings({
  poem,
  lookup, // A 提供的 LookupResult（含 book / dataVersion / candidates / evidence）
  overrides: [], // ReadingOverride[]
  contextRules: [], // ContextRule[]；只有 reviewStatus==="approved" 会生效
});
```

`poem.tokens` 的每个字位保证满足 `poem.originalText.slice(startUtf16, endUtf16) === token.text`。

## 输出形态

每个字位（`AnnotatedToken`）关心的字段：

| 字段                    | 含义                                                |
| ----------------------- | --------------------------------------------------- |
| `candidates`            | 该字在本次韵书下的**全部**候选，原样保留            |
| `effectiveCandidateIds` | 参与结论的候选（覆盖/规则/歧义合集）                |
| `readingStatus`         | `resolved` / `ambiguous` / `unknown`                |
| `selectedReadingId`     | 只有 `resolved` 时非空                              |
| `selectionMethod`       | `unique` / `context_rule` / `user` / `unresolved`   |
| `possibleTones`         | 有效候选里出现过的已知声调，升序去重                |
| `toneStatus` / `tone`   | 任一有效候选声调未知则为 `unknown`；同调可 resolved |
| `reason`                | 人可读的判定说明（含“证据未审核”“规则冲突”等）      |
| `evidenceIds`           | 只含 `reviewStatus=approved` 的证据                 |

关键组合：「读音歧义但平仄确定」（两个读音都是仄）是正常结果，不是失败。

## 测试

```powershell
# 仓库根目录
node node_modules/vitest/vitest.mjs run packages/readings/tests
pnpm verify
```

D1 实际结果见 [`HANDOFF.md`](./HANDOFF.md)：43 个 readings 用例、全仓 79 个用例、`pnpm verify` 通过。

`packages/readings/package.json` 目前**没有** `exports` / `build` / `test` 脚本（属于 GLM 的写入路径，
D1 未改动），所以 `pnpm --filter @poetry/readings test` 还不存在，其它包也还不能按包名导入本模块。
需要的配置见 HANDOFF 的“给 GLM 的申请”。

## fixture 的性质

`tests/fixtures.ts` 全部是**合成数据**，来源标题、证言、韵部 ID 都带 synthetic 标记：

- 不代表任何真实韵书结论；
- 不进入 `data/` 发布路径；
- 候选 ID 只在测试内有效，A 交付真实 ID 后才有生产规则。

## 目录

```
src/index.ts    公共导出
src/parse.ts    parseText：分句、码点遍历、UTF-16 区间、SHA-256、notice
src/resolve.ts  resolveReadings：候选传播、覆盖校验、语境规则、平仄推导
src/errors.ts   ReadingsError 与稳定错误码
tests/          parse / resolve 用例与合成 fixture
```

数据侧材料在仓库根的 `data/context/`（规则格式与待审核队列）。
