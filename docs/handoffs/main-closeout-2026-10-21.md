# 主线整合

用户于2026-10-21明确授权“把目前所有需要的成果都合了”。Codex 在独立工作树 `work/main-closeout`、分支 `codex/main-closeout-20261021`，以实际远端 main `cea831b` 开始整合，接管本次跨模块冲突处理、文档口径更新及验证。其他工作树的修改保持原样。

候选：PR #27工程修复、#28 A数据及文档、#29藏韵阁、#30 E收尾、#31 GLM与典籍馆、#32 C复核、#33 B证据；另核对 `feat/d-g04-closeout` 与 `feat/e-d4-final` 的未开PR有效增量。旧PR #14提交经 `git cherry origin/main origin/feat/c-d3-exception-acceptance` 均显示已等价吸收，不回灌旧实现。

整合原则：保留最新展示与参考分析策略、原始来源和审核记录、旧批次SHA及运行基线。旧证据只代表其记录的版本，不能覆盖当前HTTP与UI行为。冲突按最终功能解决，再运行全仓、真实API及浏览器检查；结果与最终main提交在完成后补记。
