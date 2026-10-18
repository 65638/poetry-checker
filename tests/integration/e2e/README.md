# tests/integration/e2e

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
