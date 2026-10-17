# 开发场景 fixture（D1）

本目录由 `node fixtures/mocks/generate.ts` 生成，全部通过
`AnalysisResponseSchema` 校验。

| 文件 | summary.status | 用途 |
| --- | --- | --- |
| pass.json | pass | D-D1-01 合法五状态之一 |
| fail.json | fail | 明确违规场景 |
| needs_review.json | needs_review | 含 `ambiguous` 读音 |
| not_applicable.json | not_applicable | 古体，不适用近体规则 |
| unsupported.json | unsupported | 未支持形式，不得显示通过 |
| mismatch.json | pass | Schema 合法但行文本与字位错位，前端必须拒绝 |

所有正文均为 `平/仄` 字面量构造的合成文本，**不是**真实名篇，
不得挂《登鹳雀楼》《静夜思》《黄鹤楼》的名字，也不得进入生产分析路径。

重新生成：`node fixtures/mocks/generate.ts`（需要 Node 24）。
