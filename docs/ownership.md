# 写入所有权与交接

协作分工 v1.3；HTTP 契约 v1.0 不变。组长组织人工审核；每个智能体在本地检出/短分支工作，同一路径同一时刻一名写入方。

| 责任方 | 独占写入路径 |
|---|---|
| Codex | packages/contracts/src、tests；scripts/generate-contracts.ts；artifacts/openapi.json；fixtures/contracts；packages/prosody/src/core、tests/core；rules/templates、rules/exceptions |
| 组长/GLM | 根配置与 lockfile；各包 package.json/编译配置；apps/api；.github/workflows；集成脚本与冻结记录 |
| A | packages/lexicon；data/raw、normalized、patches、sources、releases；scripts/data |
| B | packages/readings；data/context |
| C | packages/prosody/src/index.ts、adapters、report；packages/prosody/tests/acceptance；rules/cards；规则文档 |
| Claude（接入后）；Codex 候补 | apps/web/src/presentation；apps/web/public/design；docs/design |
| D | apps/web/src/view-contract.ts、src/app、src/api、src/features、src/hooks、src/main.tsx；前端业务测试；fixtures/mocks；docs/ui.md；前端 README/HANDOFF |
| E | packages/genre；data/works；tests/golden、integration；系统报告、限制和演示脚本 |
| E + D | tests/e2e 按文件分工，由 E 管理场景，D 配合页面选择器 |

当前设计状态：**Claude 已接入（2026-10-17）**——经聊天入口交付文件，由组长/GLM 落盘到仓库并验证；写入方记录为 Claude，落盘分支 feat/claude-presentation。Codex 保留候补责任（交付持续不可用或超时未出可检查切片时切换）。D 不在容器里自行覆盖全局样式；展示方不发 API 请求或重判格律。

D 在 D1 首小时落地并冻结 CheckerViewProps；设计/业务分支共同导入它。试接入约 1 小时不可用，或约 2 工作小时无可检查展示切片时，组长记录候补切换，D 继续独立业务工作。视觉基线见 docs/team/03_前端设计与协作约定.md；英文 Claude 任务书中的类型同源生成。

根文件由 Codex 首次生成后交 GLM；prosody 公共入口交 C。跨路径接管在 docs/handoffs/ 记录任务、当前分支/提交、路径、现状/失败命令、接管方、原方暂停写入、验收方和归还条件。已明确分配的目录内任务直接推进；有冲突先做不依赖它的工作。

公共契约由 Codex 实现、组长冻结。变更同时更新 Schema、生成类型/OpenAPI、fixture 和测试。协作文档/中英文附录由组长统一同步；不能各自维护不同协议。
