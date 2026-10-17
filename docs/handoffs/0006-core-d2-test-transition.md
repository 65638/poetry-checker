# Codex 核心 D2：旧占位断言迁移

基线：main 0a94212；本地隔离分支 codex/prosody-core-d2。

核心实现由 Codex 写入 packages/prosody/src/core 和 tests/core。
本次另触及 C 的 packages/prosody/tests/acceptance/templates.test.ts：仅将 C-D1-02
“尚未实现 relationFit/rhymeFit，应为 null”的两条过渡断言改为正格合成诗的预期 1，
并更新对应注释。原注释已经明确“实现后按 D2-matrix.md 更新本断言”。

这是新特征实现后的必要迁移，不修改 C 的输入、其他断言、fixture、规则卡或 D2 验收矩阵。
单文件的这三行由 Codex 在隔离分支一次性维护并交回 C；后续独立验收由 C 继续负责。
正式仓库工作树未改动，未代表 C 声称 D2 独立验收完成。合入时保留 C 后续有效改动，
若该文件另有新增提交，按三路 diff 核对，不能整文件覆盖。
