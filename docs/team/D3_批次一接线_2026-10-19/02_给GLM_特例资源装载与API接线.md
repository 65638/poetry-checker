# 给 GLM：接入 D3 批次一特例层

请在 https://github.com/65638/poetry-checker 的现有 `integrate/d3` 继续。Codex 特例实现已到，可以开始资源装载和接线。C 已有首轮 RED 独立用例，正在接公共导出；其后续完成情况以新提交为准。

实现分支：`codex/d3-reviewed-exceptions`；代码提交 `63de97b`；[PR #13](https://github.com/65638/poetry-checker/pull/13)。先读 `AGENTS.md`、`docs/ownership.md` 与 [Codex 批次一交接](../../handoffs/d3-codex-exceptions.md)，使用其中最终签名及调用片段。

## 集成顺序

1. `git status`、`git fetch origin`，保护当前改动；在你的集成分支合入 `origin/codex/d3-reviewed-exceptions`。不要覆盖运行中的其它 checkout。
2. 同时推进资源装载。C 的 `feat/c-d3-exception-acceptance@8ad522b` 仅是首轮失败用例，尚无公共导出，不能当作最终通过批次。待 C 补好导出/验收后合入对应增量；不要先把失败用例单独推入 main，也不替 C 改公共入口。
3. 公共入口就绪后，在 `evaluateProsody` 后、`deriveSummary` 前调用特例纯函数。保持通用核心、适用层、汇总三步顺序；完整代码在上述交接中。
4. 完成测试、真实 HTTP 与页面复验后，按原仓库流程推进合并与回传。批次一完成不代表三库供数或 D3 全部完成。

## 装载契约

- 显式文件：`rules/exceptions/reviewed-works-v1.json`。调用 `parseReviewedWorkExceptions`，将结果放入 `Resources.reviewedWorkExceptions`；不另写一套记录解析器。
- 坏 JSON、文件缺失、未知字段、无效版本/范围、重复记录等记入已有 `loadErrors`，沿用 `503 DATA_NOT_READY`；不要吞为空数组，不把内部错误码当新 HTTP 码。
- 装载时校验登记正文与 `fingerprintText` 一致，workId/形式/指纹受元数据允许，审批 evidenceId/sourceId/locator 一致，状态与种类正确，来源引用闭合。已登记 `unverified` 不应用、不自动批准。
- 首条现有依据：`ctx:j03b2:08`、`src:j03-review-batch2`、`ev:work:huanghelou:j03`，来自 context/works 注册表。复用已有合并证据和来源，不复制一份新签名。
- 最终函数输入比早期草案多必填 `sources`，传 `mergedSources`；`textFingerprint` 用既有 genre 指纹函数重新计算，不传请求 inputHash。
- 响应中的报告与 summary 都使用适用后的 report；保留原 provenance 合并逻辑、冲突检查和输出 Schema 校验。
- 按交接说明把特例资源版本纳入现有报告版本信息。请求 ruleSet、ruleVersion、10 个 ruleId 和 HTTP 字段不变。

## 必须实际验证

| 检查 | 验收条件 |
|---|---|
| 全仓检查 | `pnpm verify` exit 0，记录当前实际测试数；648 是 Codex 分支历史结果，不是集成结果 |
| 真实平水黄鹤楼 | l4c5–7 PPP 保留，TAIL.SANPING=not_applicable/info，resolvedBy=null，依据可查 |
| 其它诊断 | l4c5 的逐位常格对照和其它偏离保留，整首不强制 pass |
| 普通 PPP/变正文/错书/目标字用户选音 | 不继承该特例；未供数输入继续如实返回 503 |
| 坏资源 | 在测试临时目录删文件、损坏记录或来源，明确返回加载错误；不动真实审批原件 |
| 引用与版本 | response Schema、checkReportClosure、规则/证据/来源均闭合，报告有资源版本 |
| 九组合 | 复用 `scripts/probe-d3-matrix.ts`，逐行记录三首×三库真实结果，不另写长期平行探针 |
| 正式页面 | 使用 `/` 与真实 API；记录 URL、SHA、模式与结果，不以 presentation-preview 替代 |

当前全库批准未完成时 `/readyz` 保持如实状态；不得为展示改成 ready。已有 dev 服务先识别所属进程，若需加载新代码可受控重启自己管理的服务；记录实际版本，不假定文件合入后旧进程已自动更新。

## 其余批次与交接

D 示例、A+B 供数、Claude 展示仍按原 D3 任务书并行接入。更新 `docs/handoffs/d3-glm-integration.md`，分别记录代码检查、真实 HTTP、浏览器、批准范围与剩余阻塞。

```text
集成分支 / base / head：
Codex 与 C 合入提交：
装载/调用/版本改动：
pnpm verify 实际结果：
黄鹤楼目标 Finding 结果：
九组合报告路径：
正式入口与进程版本：
未完成项 / 下一责任人：
```

本批不需要重新审批第 13 号第 8 条。若实现与既有裁定不一致，保留原件，向 Codex 提供精确响应和失败断言。
