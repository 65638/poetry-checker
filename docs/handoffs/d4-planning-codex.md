# D4任务包编制与历史结转

2026-10-20，组长要求暂时抛开UI，将D3及此前工作统一并入D4。本批仅编制/归档任务，不直接执行新任务。

- 新包：`docs/team/D4_执行任务书_2026-10-20/`，11份Markdown＋API起点证据＋文件摘要清单。
- A/B/C/D/E沿既有模块边界领取独立可投喂任务；Codex接GLM总集成。E单写tests/e2e与integration及08验收台账；D只修业务，C保持独立规则验收。跨路径接管要记录，原写入方暂停，避免Codex同时修多人文件。
- 既有两轮UI、定位与折叠技术验收保留；月下江山计划仍待执行，不给Claude下新视觉任务。
- 本次git fetch成功：origin/main@05e1acb，origin/codex/d3-b-integration@7918281；本地代码与计划基线4d39037。尚未建立/发布integrate/d4；07号首项负责协调Git历史、验证和发布实际基线，成员不能自行用旧main替代。
- 本次在干净4d39037运行 `pnpm test:acceptance --out artifacts/acceptance/d4-planning-api.json`：真实模式，3通过/6数据阻断/0判错/0未运行；runner exitCode=2，当前pnpm外层exit=1。readyz503，版本见原始证据。已将原字节复制到任务包support，未放松任何门槛。
- 工程与浏览器起点沿用最近独立复核ee805cd：733测试/18浏览器，通过的补充脚本10/10与9/9有重叠。本轮文档没有重新跑整仓、没有把API三格通过叫全库发布。
- 原审批、D3包内MANIFEST、原始证据与成员历史HANDOFF未改写。只在根README/HANDOFF和团队发放入口加D4导航。
- 全部未完成项已映射到G00–G09；旧12首/36组/60位置/12场景目标保留待盘点，不默默删除。新UI是显式暂停U01。

归档的任务书状态为待执行；本批没有向成员/外部聊天发送消息，没有推送/合并main，没有接受任何新候选或全库审批。
