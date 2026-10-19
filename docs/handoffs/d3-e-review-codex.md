# E D3 首批复核与 GLM 路径接管

日期：2026-10-19。E 原提交：5783795（基线 main@f42172f）。

Codex 按组长“GLM 额度不够了，你补上”的授权，在 `codex/d3-b-integration` 接管本批 apps/api 就绪诊断、根运行命令、验收运行基础设施；E 的场景与独立预期继续保留。原 GLM 对这些路径暂停写入，E 后续基于本批交付追加场景，避免并行维护两份 runner。主工作区和现有 3000/5173 服务不切换、不停止。

## 已复现

E 原脚本在包含 D3 特例接线的分支复跑：3 通过 / 6 阻断 / 0 判错。黄鹤楼的限定 TAIL.SANPING 特例已经生效，summary=fail 来自其他偏离，不应硬改 pass。

## 本批实施

- B3：保持 contract-v1 的 503 ErrorResponse JSON；就绪诊断通过响应头附带实际模式和版本，runner 读取它们。未审核全库仍 503。
- B4：选用 Node 内置 WebSocket + Chrome/Edge CDP，一套仓库内 runner，无个人绝对路径、不新增 Playwright。首批是正式入口基础浏览器回归；E04–E08 未覆盖部分逐项保留，不宣称全部通过。
- runner 加固：真实模式强制关闭 mock；真正验证 AnalysisResponse Schema；记录 Git SHA 而不是 API URL 哈希；异常时清理自起进程；6 格阻断不能导致全量验收 exit 0。

## B5 路径（不是替代件）

- 09 号：`docs/team/D3_执行任务书_2026-10-18/09_联合验收表_由E填写GLM复核.md`
- 作品审批闭环：`data/works/review-closure.json`
- canonical 金标准：`tests/golden/cases/dengguanquelou.json`、`jingyesi.json`、`huanghelou.json`；canonical 是任务书中的用途说明，不是另一个目录。
- 精确特例裁定：`docs/reviews/13_J03三首核心诗逐字人审_第二批.md` 第 8 条；运行登记 `rules/exceptions/reviewed-works-v1.json`。

现有金标准 approved 仅限记录中明确的正文、作者、体裁等断言，不意味着三库全部逐字预期获批。E 的旧报告保留历史，不能继续当作最新集成状态。

## 实际验证与边界

可复现实现提交：`c803952`；下面两份 JSON 在该提交的干净工作树上通过真实独立进程再次生成。证据归档：
`tests/integration/e2e/evidence/d3-codex-e-review/api.json`、`browser.json`，同目录 375/1440 视口截图。报告中的 SHA 指向运行的实现，不指向其后仅存档证据的提交。

- 环境：Node v24.19.0、pnpm 11.25.0。
- `pnpm verify`：exit 0，50 文件 / 684 测试；lint、typecheck、构建与生成契约检查全部通过。
- 九格真实 HTTP：3 通过 / 6 阻断 / 0 判错。runner exit 2，当前 PowerShell/命令包装层报告非零 1，JSON 保留 exitCode=2。平水黄鹤楼特例精确检查 status、severity、字位、PPP、resolvedBy、审批依据，并检查其他偏离仍保留。
- 浏览器：Edge 155 + CDP，正式 `/`，自起临时 API/Vite：9 通过 / 1 阻断 / 0 失败；三首手动输入、真实响应、候选/来源、Esc 返回焦点、375/768/1440、减弱动效、编辑 stale、真实词林 503 提示已运行。阻断是示例按钮全部 disabled，归 D 批次二。
- 右侧汉字异常：新浏览器回归确认句末标点节点不含后续汉字，375px 截图无串字；七言换行仍是已接受的 P0 行为。
- 未运行：人工选音与竞态全矩阵、复制/导出内容、受控五态与网络故障、全键盘矩阵、真人审美、干净 clone；不宣告 E04–E08 全部通过。
- GitHub push/PR 的基础 CI 仍跑 verify。新增手动 workflow_dispatch 独立验收并上传 JSON/截图，本次没有把手动云端执行写成已通过。

## E 下一批直接执行

先 `git fetch origin`，从本批分支 `origin/codex/d3-b-integration` 新建自己的后续分支（避免继续在旧 main 上重复报已修复缺陷）。安装依赖并构建后运行：

```sh
pnpm verify
pnpm test:acceptance
pnpm test:e2e
```

后两个命令当前非零是如实阻断，不要改预期使它们全绿。E 继续用本仓库单一 CDP runner 扩展 E05–E08；D 交付示例后补上三首“点击示例→正文/配置不偷换→真实提交”场景。A/B 交付新审核批次后再复跑词林/新韵六格。09号填实际结果与对应 SHA，不填写未经运行的项目。
