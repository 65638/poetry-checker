# 0004 readings 包接线与 API 错误映射（GLM，基于 PR #3）

日期：2026-10-17。执行者：组长本地 GLM。分支 `glm/readings-wiring`（自 PR #3 头 `ba8bb72` 切出）。**本分支只做配置接线，不代表 PR #3 已可合并**——B 的证据审核修复仍在进行。

## 交付内容

- `packages/readings/package.json`：按 B 的 HANDOFF 第 6 节申请落地（exports types/development/import、build/test 脚本、@poetry/contracts 依赖）。
- `packages/readings/tsconfig.build.json`：与 prosody 同构（rootDir src、outDir dist）。
- 根 `tsconfig.json` paths 增加 `@poetry/readings` → src。
- `apps/api` 依赖 `@poetry/readings`；新增 `src/readings-errors.ts`：
  - 显式映射 B 源码声明的全部 13 个错误码（OVERRIDE_* → 422；LOOKUP_*、CONTEXT_RULE_INVALID/STALE、保留码 CONTEXT_RULES_PENDING → 503；POEM_TOKEN_* → 500）；
  - 未知码按前缀回退（OVERRIDE_→422、LOOKUP_/CONTEXT_RULE_→503、POEM_TOKEN_→500、其余→500），任何 readings 错误不会映射为 200；
  - `toReadingsErrorResponse` 把 details 透出为统一 ErrorResponse 的 fieldErrors。
- `apps/api/tests/readings-errors.test.ts`：6 项测试——逐一断言源码声明的每个错误码映射正确且非 200；**枚举双向覆盖测试保证 B 将来新增错误码而映射未更新时测试失败**；保留码、前缀回退、details 透出、非 ReadingsError 不处理。

## 验证（分支 glm/readings-wiring 上真实执行）

`pnpm verify` exit 0：lint、双 tsconfig 类型检查、7 个测试文件 73 项测试全过（含 B 的 parse/resolve 31 项）、构建与生成物一致。B 当前已推送代码的测试在本分支上全部通过；证据审核修复由 B 继续在 PR #3 进行。

## 后续合入方式

B 的证据修复推到 PR #3 后，组长将本分支合入 PR #3 分支（或将 B 新提交 rebase 到本分支），再整体走合并验收；也可在 B 完成后由组长做一次三方合并。冲突面预计为零：本分支只动 GLM 所有权路径，与 B 的 src/tests 无交集。
