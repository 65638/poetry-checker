# D3 Codex 接管记录

日期：2026-10-19

## 接管原因与基线

GLM 因额度不足暂时停止继续编码，由 Codex 接管 D3 的集成收尾与前端异常修复。当前工作分支为 `codex/d3-b-integration`，基于 `origin/integrate/d3` 的 D3 批次一基线，并已包含 B 的提交 `e0251e0`（来源提交 `816debb`）。

## 本批次交付

1. 修复 `ReportView` 句末标点提取边界。原实现对没有同句下一个 token 的字位取整篇原文末尾，导致“，黄河入海流”之类的后续汉字被放入右侧绝对定位的标点节点。现在按下一句首 token 的 UTF-16 起点截断，并只保留当前句的首个句界标点及紧随闭引号/括号。
2. 新增 `apps/web/src/presentation/punctuation.ts` 纯函数与回归测试，覆盖无换行多句、换行、闭引号、无句末标点等场景。
3. `.pc-punct` 增加 `white-space: nowrap`，避免合法的句末标点在窄面板中再次拆行。
4. 保留 D3 九组合真实 API 探针 `data/reviews/d3-g02-nine-combos-after-b.json`。平水韵三组合返回 200；词林正韵与中华新韵六组合仍按证据门槛返回 503 `DATA_NOT_READY`，没有放宽发布条件。

## 验证

在本分支执行 `pnpm verify`：

- 49 个测试文件、678 项测试通过；
- lint、typecheck、workspace build、generated contract check 全部通过；
- `apps/web/tests/report-view.test.ts` 的标点边界回归用例通过。

## 待集成事项

- 将本分支的前端修复与九组合探针提交合并到 D3 集成分支；
- 词林正韵/中华新韵仍需完成证据审核后才能从 `DATA_NOT_READY` 进入真实分析路径；
- A 的补缺候选继续保持原审核状态，不因本次前端修复变更为 `approved`。
