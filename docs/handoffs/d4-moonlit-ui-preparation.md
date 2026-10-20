# D4 月下江山 UI 开工准备

2026-10-20，组长要求优化 Claude 提示词和 UI 方案，准备开始前端；补充鼠标静止时也应有适当背景动效。本次 Codex 只准备文档与隔离工作区，没有执行 UI 实现、启动服务或更改审批。

- 应用基线：`origin/integrate/d4@898b1a0a26a5f6e8e79a0b2cb31848b24537a185`。
- 工作区：`C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/work/ui-moonlit`。
- 分支：`feat/claude-moonlit-poetry-ui`；从 D4 建立，已取消对 integrate/d4 的默认 upstream，避免误推集成分支。
- 执行入口：[英文启动指令](../design/CLAUDE-MOONLIT-START-EN.md)、[英文任务书](../design/CLAUDE-MOONLIT-UI-BRIEF-EN.md)、[中文 V2 方案](../design/MOONLIT-LANDSCAPE-PLAN.md)。

## 单写与授权范围

本次需求接续 D4 任务包编制之后，对本轮展示层解除 UI 暂停。原任务包与 MANIFEST 不改写，保留编制时状态。本记录不是 D4 数据批准、业务范围变更或基线合并。

准备阶段 Codex 写设计文档；用户切换到 Claude 并启动任务后，Claude 单写 `apps/web/src/presentation/**`、`apps/web/public/design/**`、`docs/design/**`。Codex/D 同期暂停在这些路径主动开发；D 继续业务层，E 继续共享验收，Codex 继续数据/API/集成。新 UI 专项脚本放 docs/design/moonlit-ui，复用共享 helper 但不修改。

Claude 首版与证据提交后交 Codex 复核；发现跨目录修复先给最小复现和建议，由对应负责人落地。最多两轮审美精修，不限制必要的功能回归修复。本准备未派发其他会话消息。

## 本轮改进

固定月下江山方向，去除旧三方案探索与旧指针禁令冲突；明确独立工作树、长页目录/编辑器身份、同文重查、抽屉卸载/焦点、输入法、连续动画调度与静态回退。静止时雾/水光持续，鼠标响应独立叠加，关闭/隐藏时暂停。允许明显的动效幅度，避免等待动画才能操作。

本次仅文档校验，不复跑应用测试；733/18 属 D4 基线历史结果。Claude 必须按新实现 SHA 实跑并留证；纯文本通道不返回图片，视觉审核等待实际查看截图。

补充：已将组长提供的 t2i 接入规则融合进英文完整任务书、英文启动指令和中文方案。默认模型 gpt-image-2.5；绝对输出路径；路径文本返回；概念位图只作内部参考，实际交付保持代码原生 SVG/CSS。本次未调用生成工具，工具可用性未独立验证。
