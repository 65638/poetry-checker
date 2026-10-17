# 已知边界与限制（D1，队员 E）

本文件记录体裁模块与金标准框架的**已知边界**，避免把“测试绿了”误读成“真实分析已完成”。

## 一、体裁模块（`packages/genre`）

1. **只有最小分支**：用户显式古体、显式近体形式、用户选择近体、auto 的形制判定与门槛判定已实现；
   **auto 高吻合自动判定未实现**，命中该分支时抛 `GENRE_BRANCH_PENDING`（branch=`auto-high-confidence`），
   不用 `uncertain` 占位冒充完成。
2. **正文指纹匹配未实现**：`approved` / `unverified` 元数据**都不参与**判定。未审核元数据不得作为免检依据；
   已审核元数据同样不生效，因为精确指纹与规范化规则属 D2。
3. **不凭标题、作者、首句匹配作品**，也不做简繁转换猜测。
4. **只有 toneFit 的候选一律判 uncertain**：不按单一特征下近体结论（当前底座 relationFit/rhymeFit 为空）。
5. **阈值是工程设定**（S≥0.90 近体候选、0.75≤S<0.90 可能近体、并列分差 <0.05、关键可判率 <0.8），
   待真实样本校准；调整需记录版本、原因与回归。
6. **不改判体**：出律、低吻合、结构不符都不转成 ancient；古体识别与完整体式区分属 D2。
7. **排律/长律按 unsupported 处理**，这是“未支持”，不是“判定为古体”。
8. **不含构建/测试脚本**：`packages/genre/package.json` 无 `build`/`test`/`exports`/`dependencies`，
   跨包导入依赖根 `package.json` 的 workspace 链接与 `tsconfig` paths；正式包配置需 GLM 补（见 README）。

## 二、金标准（`tests/golden`、`data/works`）

1. **0 条 approved**：三首档案全部为 `pending`，无审核人、无证据 ID。
2. **结构有效 ≠ 学术批准**：`validateGoldenCase` 只保证字段与门槛，不构成语言学结论。
3. **来源未核实**：`sourceCandidates` 目前只有 `lead`（待查线索），无可打开的页码/条目。
4. **GoldenCase 是本地格式**，不进公共 API、不影响冻结的 `AnalysisResponse`。

## 三、系统级

1. `analyze` 仍为 fixture mock：五类 fixture 只有两种正文，pass 会先命中，其余场景不能凭文件存在视为已通过。
2. `readyz` 显示 ready 仅为开发 mock 可用，不代表真实数据/规则就绪；韵书 `groupCount` 为 0。
3. 完整格律判定仍为 `PROSODY_EVALUATION_PENDING`（Codex 下一批）。
4. 本模块**没有**接入 API、没有前端展示、没有 E2E；系统验收矩阵见 `tests/integration/acceptance-plan.md`（全部未运行）。
