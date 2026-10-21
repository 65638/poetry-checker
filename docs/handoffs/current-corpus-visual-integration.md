# 当前诗库与视觉优化整合

2026-10-22，用户报告典籍馆从约 2000 首退回 3 首。根因是 Codex 的视觉优化和预览仍使用 `codex/glm-reading-assistant@f11b816`；该分支未包含 `origin/main@1550bb9` 的语料、注音、辨音、独立格式事实及后续业务修复。不是诗库原始文件被删除。

本次由 Codex 单写整合分支 `codex/restore-current-corpus`，在原视觉工作目录 `ni/work/glm-reading` 合入完整 `origin/main@1550bb9`，保留原视觉提交和主线提交历史。接管合并冲突所在的 web 容器/展示层、相关浏览器回归及本文档；其他工作目录保持原状，未追踪的 `artifacts/automatic-reference/` 保留。验证完成后归还日常路径所有权。

合并处理：

- 保留新版 2022 篇语料、现代注音、广韵参考、去重目录、长诗选段、批量改稿和格式事实/条件检查。
- 保留三景转场、纸纹/配色、对读纸面、静读/阅读进度、摘句、键盘/IME 与异步反馈修复。
- 将摘句接入新版注音组件；批注保留回诗首和新版参考格式切换。
- 清除筛选与目录滚动复位覆盖新版的选集、文类和合编开关；转发新版改稿选项，避免丢失手动分析策略。
- 浏览器回归以 2022 篇真实内置语料为基线；长诗验证更新为新版选段研读，仍验证整篇 AI 对读限制。
- 当前报告重复分析时保留已有诗文，不临时插入第二份等待原稿；首次/已改稿分析仍完整展示当前原文。用 DOM 变更观察器验证连续三次分析无等待原稿闪现。

数据本身和既有审核状态保持主线原值。本次不调用付费模型验收，不修改用户浏览器的收藏/导入/草稿存储。

## 实际验证

- `pnpm verify`：73 文件、930 项测试通过，ESLint、TypeScript、构建及 8 个契约/模板核对通过。
- 浏览器：corpus-reference 8、three-round-polish 10、final-polish 8、poetry-studio 8、pending-poem 4、automatic-refresh 5，共 43 场景通过。覆盖真实语料、注音对齐、长文选段、导入/收藏、对读、改稿撤销、重复分析、快速转场、320–1440px 布局及键盘/IME。
- 旧回归中三首计数、长篇禁用研读、等待时仍显示介绍页、旧「试用并复查」按钮预期已按新版行为更新，没有通过回退功能来满足旧测试。并行浏览器启动曾遇 Windows 临时端口文件 EBUSY，分别重跑通过。
- 实际服务 `http://127.0.0.1:56102/` 保留原端口/存储来源，API 为 56101。实际 HTTP 与独立浏览器均验证 2022 首入藏；默认去重目录显示 2021 首，勾选合编开关可查看全部。实际页面保留纸纹和静读工具，未出现横向溢出。
- 本机结果：`c-l/outputs/corpus-restoration/`，有效终轮分别在 corpus-reference、three-round-polish-integrated、final-polish-final、poetry-studio-final、pending-poem-final、automatic-refresh-integrated。`live-preview.json/png` 为实际预览地址核验，其他回归使用隔离浏览器与本地/受控 API。
- 运行时 Git 记录为合并前 HEAD `f11b816`、dirty=true；本次整合提交在验证后创建。API、packages、data、scripts 与 `origin/main@1550bb9` 完全一致，不篡改历史证据。

今后继续工作须先核对当前远端主线和此整合分支，不能仅按目录名推断功能版本。
