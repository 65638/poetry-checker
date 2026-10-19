# tests/e2e/artifacts

浏览器验收证据目录。**三类记录分开存放，不混算**：

| 目录 | 内容 | 谁产出 |
| --- | --- | --- |
| `d3-real-api/` | 真实 API（review3，非 fixture）成功路径的截图与 `results.json` | D（D3 批次） |
| `d3-faults/` | 故障注入（503 / 离线 / 超时）、视口、键盘、reduced-motion 的截图与 `results.json` | D（D3 批次） |
| 合成五状态 | 不在本目录；由 `apps/web/tests/dev-scenarios.test.ts` 与 DEV 壳承担 | D |

约定（待 E 正式接管后固化）：

1. 每个批次一个子目录，目录内附 `*-results.json`，逐条含 `id / ok / detail`。
2. 截图命名与验收 ID 对应（如 `d02-dengguanquelou.png`、`d08-375.png`）。
3. 真实成功与模拟故障**不得放在同一目录**，也不得合并成同一个通过率。
4. 驱动脚本：`../d3-real-flow.mjs`（D01–D06）、`../d3-faults-a11y.mjs`（D07–D09）。
   `../d3-*-probe.mjs` 三个是定位用的一次性脚本，可删。
5. 这些脚本只依赖本机 Chrome 与 Node ≥22（内置 WebSocket），不引入新依赖；
   脚本自行拉起 API(3000) 与 Vite(5180)，结束后全部关闭。

> `tests/e2e` 由 E 管理，D 配合选择器与操作。若 E 确定正式命名/布局，
> 本目录与脚本按 E 的约定迁移，本文件随之更新。
