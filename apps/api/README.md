# apps/api

2026-10-21当前策略：[全局GLM自动辨音](../../docs/features/glm-reading-assistant.md)。`POST /analyze`自动调用并应用候选选择，按model记录来源；无Key/上游失败/20秒预算耗尽均回退到本地分析。网页/API使用参考分析，未审核记录可参与推导但保持原reviewStatus。readyz检查资源是否可运行，审核不再阻断；结构损坏、缺失与冲突仍503。页面底部统一参考提示。下文D2/D3发布审核门槛仅为历史。

负责人：组长 / 本地 GLM。本次 Codex 接管与归还记录见 `docs/handoffs/0012-codex-d2-closeout.md`。

默认走真实编排：parseText → lookup → resolveReadings → matchTemplates → classifyGenre → evaluateProsody。仅显式设置 `POETRY_DEV_MOCK=1` 才加载合成 fixture。

## 当前行为（2026-10-18，D2 收口）

- `GET /healthz`：进程存活。
- `GET /readyz`：全库发布就绪状态。目前为 503 `DATA_NOT_READY`，原因是三库全量证据未批准，以及三张规则卡的部分依据范围；不阻止具备有效依据的局部分析。
- `GET /api/v1/rhyme-books`：真实三库快照，主部数 106/19/14；词林和新韵的声类子卷另计。
- `POST /api/v1/analyze`：三首核心诗平水韵模式均为 200。《登鹳雀楼》合律、《静夜思》不适用近体规则、《黄鹤楼》保留七律身份并显示常格偏离；同调多读保留歧义。其他输入若有效候选缺少已批准依据，返回 503；不得保证任意输入均可分析。
- `GET /api/v1/characters/:character`：返回候选与审核状态，查字成功不等于候选已审。
- `GET /api/v1/rules/:ruleId`、`GET /api/v1/sources/:sourceId`：可查运行规则和来源，未知 ID 返回 404；卡片 limitations 如实列出适用边界。

API 同时装载语境规则/证据/来源、作品元数据/证据/来源、运行规则卡。文件损坏、Schema 错误、引用缺失或同 ID 内容冲突记入 loadErrors，分析返回 503，不静默跳过。输入使用冻结 Schema 校验，模块错误码映射分别见 `src/readings-errors.ts`、`src/genre-errors.ts`、`src/lexicon-errors.ts`。

2026-10-20 藏韵阁接入补充：来源接口按冻结的 `SourceResponseSchema` 返回 `{ source, evidence }`，保留原审核状态；已知来源不再固定返回503。未知来源404，资源装载冲突503，开发mock仍不提供真实来源。单字查询可返回未审核候选供查阅，不代表整诗分析或全库发布获准。

## 运行

```sh
pnpm install --frozen-lockfile
pnpm dev:api          # 等价于 pnpm --filter @poetry/api dev，默认 127.0.0.1:3000，PORT 可改
pnpm verify
pnpm exec tsx scripts/probe-d2-api.ts --require-golden
```

默认监听 127.0.0.1:3000，`PORT` 可改。前后端同时启动使用根目录 `pnpm dev`，正式页面入口为 `/`；`presentation-preview.html` 是合成展示页。

本批 API 快照为 `pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-review3`。**集成后重启 API** 以刷新资源缓存。真实 HTTP 注入探针在 `data/reviews/d2-real-api-report.json` 留存实际报告；本地 3/3 通过不替代集成后的浏览器验收，也不批准三库全量发布。

## D3 就绪诊断补充（2026-10-19）

`/readyz` 的 JSON 保持 contract-v1：未全库就绪仍 503/ErrorResponse；不在严格错误体中偷偷添加字段。
200/503 响应均带 `X-Poetry-Mode: real|mock` 和 `X-Poetry-Versions`（`encodeURIComponent(JSON.stringify(versions))`，含每库 dataVersion 及规则/语境/作品版本）。
验收 runner 用 `JSON.parse(decodeURIComponent(header))` 读取；运行模式与审核状态分别记录，real 不等于全库 approved。
