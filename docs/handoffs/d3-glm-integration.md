# D3 GLM 总集成交接单（第一日：2026-10-19）

## 基线与分支

- base：`f42172f`（D2 收口+三卡放行后的 main）
- 分支：`integrate/d3`（首建；旧 `integrate` 分支更名 `legacy/integrate-d1` 让出命名空间）
- head：本批提交见下
- 任务包归档：`docs/team/D3_执行任务书_2026-10-18/`（11 份+MANIFEST+support，原样，未改审核原件）

## 本批完成

| 项 | 结果 | 留痕 |
|---|---|---|
| 未提交 d2-real-api-report.json 核对入库 | 与当前版本对齐（三首 200/金标准 3/3/loadErrors 空） | 随 df04566 提交 |
| pnpm verify 基线复验 | exit 0，45 文件/591 测试，与 D2 基线一致 | verify-d3base.log |
| 双服务启动检查 | healthz `{"status":"ok"}`；web `/` 200；Vite 代理回真数据（review3 版本、106 部）；无 POETRY_DEV_MOCK | dev-d3.log |
| G03 前置复现：黄鹤楼三平尾 | **l4c5-c7"空悠悠" TAIL.SANPING=fail/error，summary=fail**——与 13_ 第二批第 8 条裁定不一致，已确认为批次一驱动项 | 本单下文 |
| G02 九组合探针（新正式脚本） | `scripts/probe-d3-matrix.ts`（唯一矩阵探针入口，--json 落盘）；结果见下表 | data/reviews/d3-g02-nine-combos.json |
| 旧 PR 收尾 | **PR #7、#10 已关闭**并留说明评论：#7 被 PR #11 取代；#10 内容经 codex/d2-closeout 整合扩展（main 内为其超集，--diff-filter=A 核对零独有文件） | GitHub PR 页 |
| README 状态段 | 五项分标（代码检查/真实 API/浏览器/数据批准/全库发布） | 本批提交 |

## G02 九组合实跑表（inject，2026-10-19）

| 诗 | 库 | HTTP | summary | Schema | dataVersion |
|---|---|---|---|---|---|
| 登鹳雀楼 | 平水 | 200 | pass | pass | pingshui-…-review3 |
| 登鹳雀楼 | 词林 | 503 | DATA_NOT_READY:LOOKUP_EVIDENCE_UNVERIFIED（l1c1 白） | - | - |
| 登鹳雀楼 | 新韵 | 503 | 同上（l1c1 白） | - | - |
| 静夜思 | 平水 | 200 | **not_applicable**（古绝身份正确生效） | pass | 同上 |
| 静夜思 | 词林 | 503 | 同上（l1c1 床） | - | - |
| 静夜思 | 新韵 | 503 | 同上（l1c1 床） | - | - |
| 黄鹤楼 | 平水 | 200 | **fail**（三平尾 error，见已知问题） | pass | 同上 |
| 黄鹤楼 | 词林 | 503 | 同上（l1c1 昔） | - | - |
| 黄鹤楼 | 新韵 | 503 | 同上（l1c1 昔） | - | - |

词林/新韵六组合的 503 属如实证据门槛（候选证据未审核），修复路径=批次三（A 已确认候选快照 + B 语境三文件 + manifest 更新），不是缺陷。

## readyz 原因（当前唯一门槛）

`快照未审核：pingshui、cilin、xinyun（开发联调可分析，发布门槛不放行）` —— 整库审核为 D3 主线；三库全库未批准前不生成"正式全量发布"包、不改 readyz 绿。

## 已知问题与阻塞

1. **黄鹤楼三平尾 fail/error 与 13_ 第 8 条裁定不一致**（批次一驱动）：修复设计=核心报告不变，Codex 纯特例适用层插在 summary 前把已审范围（黄鹤楼 l4c5 空悠悠）转非 error 且其他偏离仍可见。**等 Codex 导出签名（任务书 T+0.5h 承诺）+ C 公共导出**，GLM 负责装载/校验/传参/版本缓存。
2. **dev.mjs 在 GLM 沙箱内 ENOENT（node→cmd.exe spawn 被沙箱阻断）**：真人环境不受影响（D2 曾实测）；GLM 侧用 `pnpm dev:api`+`pnpm dev:web` 分启绕行。免 shell 加固（spawn 直调 pnpm JS 入口）列入 D3 待办，优先级低于批次一/三。
3. 示例入口为空（D 的批次二）。
4. 浏览器 runner 待与 E 定（倾向 CDP 脚本归档；若 Playwright 由 GLM 一次性加依赖/脚本/CI，E 写用例，配置耗时上限 30 分钟）。

## 实际命令与退出码

- `pnpm verify` → exit 0（591/591）
- `pnpm --filter @poetry/api dev` / `pnpm --filter @poetry/web dev` → 运行中（healthz 200/`/` 200）
- `node node_modules/tsx/dist/cli.mjs scripts/probe-d3-matrix.ts --json data/reviews/d3-g02-nine-combos.json` → exit 0，9 行
- PR 关闭/评论：GitHub API `state=closed`（200）、评论（201）

## D4 接续

批次一（特例适用层接入+G03/G04 验收）→ 批次二（D 示例）→ 批次三（词林/新韵供数+G02 补六组合）→ 批次四（Claude 展示切片）→ G05-G08 与 README 持续更新。每天最后 30 分钟只联调与登记。
