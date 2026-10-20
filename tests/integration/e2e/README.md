# tests/integration/e2e

## D3 当前入口

- `pnpm test:acceptance`：三首 × 三库真实 HTTP，独立随机端口；源码在 `d3-acceptance-api.mjs`。需要先安装依赖并 `pnpm build`。
- `pnpm test:e2e`：正式首页的 Chrome/Edge CDP 基础回归，见 [浏览器说明](../../e2e/README.md)。
- 新结果默认存 `artifacts/acceptance/`，该目录忽略提交；需归档时单独复制指定报告。旧 `d3-acceptance-last.json` 是 E 的历史证据，不会被新命令覆盖。
- runner 退出码：0=本次全部通过，1=判错/执行错误，2=有阻断未完成。某些 pnpm 包装环境会将非零归为 1；以输出 JSON 的 exitCode 为细分依据。
- 外部服务用 `node tests/integration/e2e/d3-acceptance-api.mjs --api-url URL --out FILE`。外部服务的 SHA 无法证明时记 null，不用本地 SHA 冒充。

## D1 历史说明

下方的旧 Python 文件现名为 `d1-mock-api.py`，不用于 D3 真实验收。

负责人：队员 E / DeepSeek。状态：D1 收口期，**未接入任何浏览器自动化**。

## 现有内容

| 文件                    | 作用                                                                                                                             | 是否被 `pnpm test` 收集                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `acceptance-api.py`     | 启动本地 API（`apps/api` 开发 mock）并实测契约：healthz / readyz / rhyme-books / 五种报告状态 / 422 / 413 / 503 / 404 / 引用提示 | **否**（Python，`vitest` 只收 `packages/**`、`apps/**` 的 `.test.ts[x]`） |
| `../acceptance-plan.md` | D2–D5 系统验收矩阵（全部未运行）                                                                                                 | —                                                                         |

## 单独执行命令

```sh
python tests/integration/e2e/acceptance-api.py
```

预期：以 `CASE|...` 逐行输出；任何一行 http 码与预期不符即视为验收失败。
注意：脚本会自行启动并在结束时关闭 API 进程，需要本机可绑定 `127.0.0.1:3000`。

## 未覆盖（需浏览器）

- 浏览器发起真实 HTTP 请求到 API（React 的 fetch 路径）
- 375px 移动端操作
- 前端本地输入拦截 vs 后端 422 的分别记录
- 三仄尾 warning / `not_applicable` / `unsupported` / `needs_review` 在 UI 中不得混成“通过”

结论与证据见 [`docs/handoffs/d1-closeout-e.md`](../../../docs/handoffs/d1-closeout-e.md)。

## 待 GLM

1. 为 `apps/web` 增加 Playwright 与 `tests/e2e` 收集配置（或指定人工验收步骤）。
2. 若要求本目录的验收脚本进 CI，需要把 Python 执行纳入工作流，或改写为 TS 用例。
