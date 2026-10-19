# 前端设计交接入口

当前状态（2026-10-20）：Claude 已完成墨色展厅重设计及两轮精修，移动端结果定位修复已由 Codex 复核；像素级视觉评审尚未完成。当前规格见 visual-spec.md，技术收口见 [定位修复复核](REVIEW-DISTINCTIVE-UI-REVEAL-FIX-CODEX.md)。下列早期任务书保留为协作历史。

下一轮：[月下江山 V2 方案](MOONLIT-LANDSCAPE-PLAN.md)。组长已选 A 方向并准备启动前端，增加静止时环境动效要求。**实施任务已准备，本次尚未改页面**；新展示层任务取代 D4 编制时的 UI 暂停安排，业务/数据分工不变。

- [Claude 英文启动指令](CLAUDE-MOONLIT-START-EN.md)：切换模型后直接发送。
- [Claude 英文完整任务书](CLAUDE-MOONLIT-UI-BRIEF-EN.md)：工作区、视觉、动效、回归、交付要求。
- 专用工作区：`work/ui-moonlit`；分支：`feat/claude-moonlit-poetry-ui`；应用基线：D4 `898b1a0`。
- 本轮取舍：连续月夜背景 + 长报告录诗台 + 细致操作动画 + 静置/鼠标响应双层动效。正文与证据稳定可读，允许明显而利落的动作。

- [中文设计与协作约定](../team/03_前端设计与协作约定.md)：目录、视图接口、默认排版/配色、响应式与工时。
- [Claude 英文任务书](../team/17_Claude_Frontend_Design_Brief_EN.md)：可单独发送，含英文设计说明、类型和验收。
- [D 业务任务书](../team/14_队员D_前端任务书.md)：容器、API、选音、导出和测试。

- [视觉规格与 UI01–UI08 记录](visual-spec.md)：token 数值、对比度计算与本轮未执行项。

设计方后续在此目录提交实际预览/截图记录和 HANDOFF.md。visual-spec.md 中的对比度为计算值，不计为视觉验收。
