# 0001：启动底座交接

日期：2026-10-16。交出方：Codex。分支：main；尚未首次提交，无提交号。

- 根配置、包清单、lockfile、CI：交组长/GLM，之后依赖和集成配置由该方统一修改。
- packages/prosody/src/index.ts：交 C，后续包装不得改变 core 结论。
- contracts 源/生成器、core、基础模板：Codex 保留写入责任。
- A/B/D/E 的 README 仅用于占位与交接，正式模块由对应成员实现。

验收基线：pnpm verify 最终通过，27 项基础测试；详见基础验证报告。当前没有完整应用可运行。

组长接收后记录首次提交与人工冻结结果。下一批 Codex 实现完整格律判定，C 同步提供独立反例和规则依据；D 可直接使用合成 fixture 开发页面。交付后各路径按 docs/ownership.md 执行，不安排多个写入方同时修改同一文件。
