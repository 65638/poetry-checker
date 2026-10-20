# Claude 表现型 UI 重设计交接

用户要求使用 `houxin0010/distinctive-ai-design`，目标为高品质诗词界面，并明确“UI 可以浮夸一点”。用户确认采用当前会话切换 Claude 的方式。

## 当前已完成

- Codex 已读取并安装指定 skill，固定上游提交 `92c68366767b98924fe2719c16659e7f1e93c7af`。安装目录在工作区 `tools/claude-skills/distinctive-ai-design`，不依赖 Claude 自动发现；任务书给出绝对路径。
- 新英文任务书：[CLAUDE-DISTINCTIVE-UI-BRIEF-EN.md](../design/CLAUDE-DISTINCTIVE-UI-BRIEF-EN.md)。允许大胆改版、大字、山水构图、强对比和明显动画，覆盖旧任务书仅小幅修饰的限制。
- 实现起点为 `work/d2-closeout` 当前集成分支，代码基线 `7918281`，加本次文档提交。不要从旧 main 开始。
- 没有找到本环境原生 Claude Code 命令；尚未启动 Claude、修改产品 UI 或做新版视觉验收。当前交付是 skill 接入与可执行任务准备。

## 单写与验证

用户切换 Claude 后，本轮展示目录 `apps/web/src/presentation`、`apps/web/public/design`、`docs/design` 交 Claude 单写，Codex 暂停这些目录的实现工作。业务、契约、数据审批保持原责任边界。Claude 完成后交 Codex 复核集成。

保留 733 项单测与 18 项浏览器场景覆盖的既有功能。上轮数字不能当作新版通过证据。正式 `/` 与合成 preview 分开；现有 5173 服务来自另一个 checkout，新版必须提供自己的真实地址。

同会话 Claude 通道曾出现图片协议错误，具体原因未验证。本轮先使用文本工具实现，将截图保存为本地文件；切回 Codex 后可继续看图与最多两轮精修。未看图不得声称视觉验收通过。

## 切换后直接发送

```text
Please implement the assignment in:
C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/work/d2-closeout/docs/design/CLAUDE-DISTINCTIVE-UI-BRIEF-EN.md

Read the pinned distinctive-ai-design SKILL.md and its review reference at the absolute paths in that brief. The user explicitly permits an expressive, theatrical UI. Deliver a substantial working redesign of the initial and report states, with a strong Chinese poetry identity and visible animation. Start implementation after a brief autonomous direction selection; do not stop at a plan. Preserve the verified business interactions. Use text-returning tools in this session; save screenshots to local files for Codex review without returning image content blocks. Report actual test results and the exact URL showing your checkout.
```
