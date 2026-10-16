# apps/api

负责人：组长 / 本地 GLM。当前状态：D1 开发 mock 已实现（见根 HANDOFF），真实编排待各模块接入。

## 当前行为（D1 mock）

- `GET /healthz` → `{status:"ok"}`。
- `GET /readyz` → `{status:"ready", versions}`（版本为 fixture-only）。
- `GET /api/v1/rhyme-books` → 三本韵书清单；`dataVersion=fixture-only`，`groupCount=0`，待 A 接入真实字表后替换。
- `POST /api/v1/analyze` → 请求经 `AnalyzeRequestSchema` 校验（422 统一错误对象、超限 413），响应从 `fixtures/contracts/` 五类合成报告中确定性选取：正文精确匹配某 fixture 原文时返回该状态，否则返回 `needs_review`；请求韵书写入 `policy` 与 `poem.book`，`inputHash` 按请求正文重算。**不执行任何真实格律判断。**
- `GET /api/v1/characters|rules|sources/...` → 503 `DATA_NOT_READY`（真实数据分别来自 A、C/Codex、A/B/E）。

## 运行

```sh
pnpm install --frozen-lockfile
pnpm dev:api          # 等价于 pnpm --filter @poetry/api dev，默认 127.0.0.1:3000，PORT 可改
pnpm --filter @poetry/api test
```

## 接入真实模块（后续）

按公共契约第 4 节顺序编排 parseText → lookup → resolveReadings → matchTemplates → classifyGenre → evaluateProsody；替换 mock 选 fixture 逻辑；`readyz` 反映真实数据装载状态。错误码、确定性、证据可解析要求见契约第 5 节与组长任务书 L01–L12。
