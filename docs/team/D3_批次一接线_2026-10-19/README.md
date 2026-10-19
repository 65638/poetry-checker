# D3 批次一：任务书发放入口

日期：2026-10-19。仓库：https://github.com/65638/poetry-checker 。本包用于 Codex 特例层交付后的公共导出、独立验收和 API 接线，不替换 D3 其余批次。

## 发给谁

| 接收者 | 可直接交给其 AI 的任务书 | 本次交付 |
|---|---|---|
| C / DeepSeek | [01_给C_公共导出与独立验收.md](01_给C_公共导出与独立验收.md) | 接现有失败用例、公共导出、补独立验收和规则卡 |
| 组长 / GLM | [02_给GLM_特例资源装载与API接线.md](02_给GLM_特例资源装载与API接线.md) | 装载/校验、真实 API 接线、集成验证 |

技术签名、代码片段与验证细节统一以 [Codex 批次一交接](../../handoffs/d3-codex-exceptions.md) 为准；本包给执行顺序与验收要求，不再复制一份实现。

## 已知基线

- Codex 代码：`codex/d3-reviewed-exceptions@63de97b`，[PR #13](https://github.com/65638/poetry-checker/pull/13)。本包作为后续文档提交追加到同一分支/PR；代码至少包含 `63de97b`。
- C 已推送 `feat/c-d3-exception-acceptance@8ad522b`：首轮 RED 验收与交接已存在，继续补全，不重建分支或删除现有断言。其报告是 1 failed / 5 passed / 5 todo，属于成员回报，本包未重复执行。
- GLM 集成起点：`integrate/d3@d8688e9`；执行时先 fetch 检查新提交，保留在途工作。
- Codex 本地已实跑 `pnpm verify`：46 文件 / 648 项测试通过。该结果不代表 C 独立验收或正式 HTTP 接线已经完成。
- [原 D3 全套任务书](https://github.com/65638/poetry-checker/tree/integrate/d3/docs/team/D3_执行任务书_2026-10-18) 已在 `integrate/d3`，尚未随该分支进入 main。不要因为 main 页面暂时找不到就另造版本。

## 顺序与边界

1. C 合入 Codex 分支，补公共导出、独立测试和规则说明；GLM 可同时编写资源加载部分。
2. C 推送并回传 SHA；GLM 合入 Codex 与 C 的相应增量，接完整 API。
3. GLM 跑真实 HTTP、九组合探针及正式入口；E 按既有职责补金标准与系统验收。

不改 contract-v1、10 个 ruleId、CheckerViewProps 或原审批文档；不为让测试通过改读音、删竞争候选、放行全库。D 示例、A+B 供数、Claude 展示仍按各自原任务书并行推进。本包是执行指示，完成与否以提交和实际结果为准。
