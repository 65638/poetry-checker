# D1 收尾记录（GLM，2026-10-17）

集成分支 `integrate` @16e09bf（= main 0a94212 + 下列全部批次）。**未合入 main**——差 D 的 CheckerView 装配提交（见遗留）。

## 合入清单
- A：feat/a-d1-lexicon@6434d5e（66 测试独立复跑全绿）+ lexicon 接线（exports/build/tsconfig/paths/api 依赖 + 6 码 HTTP 映射：参数类 422、VERSION_NOT_FOUND 503 DATA_NOT_READY、数据损坏 500）
- E：feat/e-d1-genre@204a163 + glm/genre-wiring@492adfd（170 测试，此前已验）
- D：feat/d-d1-web@27a9684（235 测试，efcf85e 此前已验 + D2/D3 增量：五状态开发预览/逐字谱接线/证据抽屉）
- Claude：feat/claude-presentation@b0f9dcc（切片+修饰轮+收尾批，终验已过）
- 冲突处理：HANDOFF 双方记录保留；api 依赖/根 tsconfig paths 取并集；lockfile 重装再生。

## 实际验证
- pnpm verify exit 0：27 文件 387 测试（远超旧 312 基线：+A66 +E29 +D100+ +映射测试）
- 双服务真实启动：API 3000 + Web 5173；正式入口 main.tsx（D 开发容器）完成
  输入→提交→HTTP mock→报告渲染闭环（合成正文 23 码点，报告正常返回）。
- presentation-preview.html 含 CheckerView 五状态（Claude 切片终验已覆盖双视口）。

## 遗留（按负责人）
- D：在含 D+Claude 的基线 16e09bf 上改 main.tsx 完成 CheckerView 装配（接 dev 场景五状态）；
  修 fixtures/mocks/generate.ts 的 tokenId 与 line/column 不一致。GLM 只接收提交。
- Codex：codex/prosody-core-d2@14df990 列 D2 批次交 C 独立验收（未进本批）。
- E：高吻合/选模修复、三首真实 API = D2。A 七字样本未经人工审核，不得绕过 B 的证据门槛。
- 未运行：正式入口的五状态全矩阵人工点检（等 D 装配后由 D/E 走）、CI 云端结果以 Actions 页为准。
