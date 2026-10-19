# E 的 D3 第二批交付复核

日期：2026-10-19。复核方：Codex（继续接管 GLM 集成职责）。

结论：**按“已有 runner 复跑与 09 表更新”接收；E05–E08 扩展尚未交付，D3 未收口。** 两个非零 exit 不能改成通过。E 的回报与已有基线结果一致，但本批原始 JSON/截图未入仓，不能把他人归档当作 E 的这次执行证明。

## Git 与接收范围

- 正确 PR：[65638/poetry-checker#17](https://github.com/65638/poetry-checker/pull/17)，回报中的 `65538` 是账号拼写错误。
- 原分支 `feat/e-d3-acceptance-e05-e08`，基线 `f6b52ef`；两笔新提交为 `480d3d7`、`31072cd`。
- 已分别 cherry-pick 为 `3677584`、`747a9d0`，保留作者信息和来源提交；纳入 `codex/d3-b-integration`，由 PR #16 进入 `integrate/d3`，不直接合 main。
- 净差异为 3 份文档与 API runner 顶部注释；没有新增浏览器场景或测试断言。故不能因分支/批次名含 E05–E08 就称这些功能验收已经完成。
- `git diff --quiet f6b52ef 31072cd -- tests/integration/e2e/evidence` 为 exit 0；集成后对同一路径检查也为 exit 0，旧归档确实逐字节恢复。

## 本轮修正

1. 删除“当前 API runner 已废弃、改走 tests/acceptance/”的错误说明。实际 `pnpm test:acceptance` 仍执行 `tests/integration/e2e/d3-acceptance-api.mjs`，浏览器还导入其九格断言；不存在另一套 `tests/acceptance/`。
2. 校正 09 表：已有三首手动输入场景会点字、检查候选/来源文本、按 Esc 并断言焦点回原字位；布局检查包含字格宽度≥44px。它们是部分覆盖，不能写成全未运行，也不能冒称完整规则详情/全键盘/触控验收。
3. 区分 HTTP 公开错误码 `DATA_NOT_READY` 与 message 内的模块码 `LOOKUP_EVIDENCE_UNVERIFIED`；后者定位 `/analyze` 的首个失败候选，不能当作 `/readyz` 响应本身或全库缺口清单。
4. 区分 push/PR 的基础 verify 与手动 `workflow_dispatch` 独立验收。手动 workflow 已存在，本批没有运行它。
5. `.prettierignore` 加入 `tests/integration/e2e/evidence/`。已用 `pnpm exec prettier --file-info .../d3-codex-e-review/api.json` 核实 `ignored=true`；没有执行全库 format。

Codex 本轮接管根配置、runner 注释及上述交接纠偏；E 后续继续单写系统验收场景，原 GLM 不并行改同一路径。未改真实数据、审批原件、规则核心、公共契约和前端实现。

## 验证口径

- E 自报在 `f6b52ef` 上：verify 50 文件/684 项；真实 HTTP 3 通过/6 阻断/0 判错；浏览器 9 通过/1 阻断/0 失败。保留这些历史数值，不改成最新集成计数。
- 上轮 C 集成实跑为 50 文件/694 项（`89f1f1f` 所含实现）。本批没有新增测试，684 与 694 的差额是 C 的 10 项补充，不能归到 E 名下。E 精确 head `31072cd` 的 GitHub 两项基础检查均 success。
- 本轮已执行：证据字节比较、Prettier 忽略检查、runner ESLint、`git diff --check`。都是实际执行，不把它们替代浏览器操作。
- E 提及的 `artifacts/acceptance/` 被 `.gitignore` 忽略，PR #17 没有带入其本轮 JSON/截图。E 应将该批原始产物按独立目录归档；若原件已经丢失，应在当前干净提交上重跑，使用新的时间/SHA，不能重写旧数据伪装为旧批次。

## 可直接转发给 E：下一批两小时

```text
第二批按“复跑+09台账”接收。你的旧证据还原已核对，.prettierignore 已由 Codex 补上。正确 PR 地址是 https://github.com/65638/poetry-checker/pull/17。

注意：当前 pnpm test:acceptance 就是 tests/integration/e2e/d3-acceptance-api.mjs，它没有废弃，也没有 tests/acceptance/ 替代入口。该处说明和 09 表漏记的已有覆盖，Codex 已纠正。

下一批必须交场景增量，不要只重复跑同样 9 项。先 git fetch origin，从最新 origin/codex/d3-b-integration 新建自己的分支；继续这一套 tests/e2e/d3-browser.mjs/CDP，不另建框架、不推集成分支。

首个两小时优先完成两个可独立交付的小场景：
1. E06：平水真实报告的复制/导出内容与当前 API 报告一致（版本、正文、summary、字位/依据按实际导出格式核对）；编辑使报告 stale 或请求失败后，不能导出旧结论。遇到实际缺陷记录复现，不改预期放行。
2. E08：纯键盘进入字格/详情、操作实际可用控件、关闭后焦点回触发字；不要把已有鼠标点字+Esc 再计成新覆盖。记录 Tab/Enter/Space/Escape 中实际执行的操作。

之后推进 E05 的已审候选选音→重查、正文/切书后的旧覆盖清理，以及 E07 明确标识的可控故障场景。没有跨书可放行数据不妨碍平水页面和受控网络故障验收；示例按钮单独记阻断，不等待 A/D 才开始剩余场景。

交付必须包含 runner 代码、实际 JSON/截图、09 表增量及 HANDOFF。把本次新产物原样复制到 tests/integration/e2e/evidence/ 下专属批次目录（不要覆盖 Codex 原目录），保留执行时间、干净 SHA、mode 和失败/阻断。上批 E 的原始产物若仍在请补存；已丢失则注明后在当前提交重跑，不能造历史记录。

C 已验收的普通 PPP/跨书/缺证据包测试不是你的新成果；你仍需按系统验收职责补实际入口所需对照，不能自动把 P0 推迟到 D4。数据六格及示例按钮到位后，再复跑对应阻断项。
```
