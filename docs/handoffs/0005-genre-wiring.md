# 0005 genre 包接线与 API 错误映射（GLM，基于 E 的 feat/e-d1-genre）

日期：2026-10-17。分支 `glm/genre-wiring`（自 E 的 `6e079c0` 切出）。仅配置接线，E 的 PR 验收另走组长流程。

- packages/genre：exports/build/test 脚本、@poetry/contracts 依赖、tsconfig.build（与 readings 同构）。
- 根 tsconfig paths 增加 @poetry/genre；apps/api 依赖并新增 src/genre-errors.ts：
  GENRE_BRANCH_PENDING → 503（DATA_NOT_READY 错误体，branch 与 genreCode 保留在 fieldErrors）；
  GENRE_REQUEST_INVALID → 422（保留具体码）；未知码前缀回退（GENRE_REQUEST_*→422、其余 GENRE_*→503）。
- 6 项映射测试（真实 GenreError 实例 + 双向穷尽枚举，与 readings 映射同一测试范式）。
- 分支验证：pnpm verify exit 0，13 文件 170 测试全过（main 135 + E 29 + GLM 6）。
