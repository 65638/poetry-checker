# D1 契约冻结记录

| 项目          | 当前值                                                         |
| ------------- | -------------------------------------------------------------- |
| 契约          | 文档 v1.0；任务包 v1.3                                         |
| 实现源        | packages/contracts/src/index.ts（Codex 实现）                  |
| 生成物        | artifacts/openapi.json、fixtures/contracts、编译生成的 TS 声明 |
| 位置单位      | 行列从 1 起、UTF-16 半开区间；字位 ID l{line}c{column}         |
| 原文摘要      | 原始 UTF-8 文本 SHA-256 小写十六进制                           |
| 音系          | 平水/词林历史声类；新韵普通话本调                              |
| 人工冻结人    | 组长（代 6 人小组）                                            |
| 冻结时间      | 2026-10-16                                                     |
| 冻结提交/标签 | 契约内容所在的基线提交为 `9d1ec84`；本记录提交后打标签 `contract-v1`（标签指向含本记录的提交，契约源与 `9d1ec84` 完全一致，本次未改动 contracts） |

## 冻结前核对记录（组长/GLM 执行）

- 交叉核对 `packages/contracts/src/index.ts`、`artifacts/openapi.json`、五类 fixture 与《docs/team/02_公共接口契约_v1.md》的类型、枚举、错误码、位置单位、音系口径一致（该文档附录 SHA-256 `aea7381d…dbe3e0` 已与独立分发包核对一致）。
- 独立环境复验：Node 24.19.0 / pnpm 11.25.0，`pnpm install` + `pnpm verify` 全绿（lint、typecheck、测试、构建、8 个生成物一致性）。
- API 侧消费验证：apps/api D1 mock 以 AnalyzeRequestSchema 入站校验、AnalysisResponseSchema 出站校验，422/413/503 错误行为与契约第 5 节一致（9 项 api 测试 + 真实启动冒烟通过）。

## 冻结后规则

- 公共契约任何变更走独立 PR：同时更新 Schema、生成类型、OpenAPI、fixture 与受影响测试，并更新本记录的版本与提交。
- 成员只提出变更申请，由组长裁定；不得各自维护第二份权威定义。
- 以下仍为待核实项，不因冻结而视为已解决：韵书数据授权链、中华新韵底本选择（建议十四韵规则 + pinyin-data 重建并标注）、规则文献版次页码。
