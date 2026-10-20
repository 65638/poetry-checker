# Claude（新会话）：月下江山 V2 打磨批（两项 + 勘误）

你的前一会话已完整交付月下江山 V2 并合入 main（PR #24，末批 57cd3ce；GLM 独立复验 733/733+e2e 18/18+视觉抽查合格）。会话已结束，本卡给**新会话**执行收尾打磨。开工前读：`docs/design/MOONLIT-LANDSCAPE-PLAN.md`、`docs/design/HANDOFF-LAYOUT-MOTION.md`、`docs/design/visual-spec.md`、`docs/design/README.md`。

## 基线与纪律（不变）

- 分支：`git switch -c feat/claude-moonlit-polish origin/main`（main=c409d20）；PR 目标 main。
- 只写 `apps/web/src/presentation/`、`public/design/`、`docs/design/`；`pnpm verify`（763 基线）+ `pnpm test:e2e` 双绿才推。
- 通道纪律=纯文本：不调图片工具、不注入 base64；截图存 `docs/design/moonlit-ui/` 带元数据，由 Codex/GLM 看图复核，未看图标 pending。
- 动效护栏沿用 MOONLIT-LANDSCAPE-PLAN.md（禁 cursor:none、原生回退、reduced-motion 静态化、rAF 单写）。
- 两轮打磨上限（本卡整批计一轮）。

## 三件事

1. **左栏对比度**：深色底上的灰色小字（韵书标签、统计行）实测对比度不足 AA。在 tokens 层提亮前景或加深底色至 4.5:1，全视口复测（1440/768/375），不破坏月下氛围。
2. **证据编号气泡触控目标**：逐字谱上的违规编号气泡当前约 20px，密集处相邻堆叠（375px 最明显）。方案自选（最小触控区扩到≥44px 热区/间距拉开/375 下改列表式呈现），保持视觉语言；键盘可达不退步。
3. **visual-spec.md 勘误补记**：把上述两项改动+实测数值写入 visual-spec.md（沿用你的诚实验收表格式），未执行项如实标注。

## 交付格式

代码+`docs/design/HANDOFF-MOONLIT-POLISH.md`（原因/实测/未执行项）+校验脚本与结果 JSON 存 moonlit-ui/。聊天只报文件+提交号+verify 结果，不贴文件内容。
