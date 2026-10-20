# D4-B：有效候选、语境依据与覆盖（交接）

- 分支：`feat/b-d4-closeout`
- base：`origin/integrate/d4 @ 898b1a0a26a5f6e8e79a0b2cb31848b24537a185`（该 ref 由 Codex 发布；本轮未收到广播 SHA，按 `ls-remote` 实际值记录）
- head：`c097a2d832beb772a69e0cc7abca00bf24f8b1c0`
- PR：#23（目标 `integrate/d4`，待转草稿/待审）
- 工作树：开始与结束时均干净；未 reset / clean / 重写他人提交

## 1. 命令与结果（本轮实际输出）

| 命令                                                                                                             | 结果                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                 | exit 0；Already up to date                                                 |
| `pnpm verify`                                                                                                    | exit 0；53 文件 / 733 项测试通过；lint、类型、构建、8 个生成文件一致性通过 |
| `pnpm test`                                                                                                      | 53 passed / 733 passed                                                     |
| `pnpm --filter @poetry/readings test`                                                                            | 7 文件 / 86 用例通过（含新增 D4 守卫 5 条）                                |
| `pnpm exec tsx packages/readings/scripts/d3-effective-candidates.ts --out data/reviews/d4/b --base-sha 898b1a0…` | exit 0；`rows=288 positions=44 tested=11 pending=22 drafts=13`             |

环境：Windows，Node `24.21.0`（仓库锁 `24.19.0`，差补丁版本）、pnpm `11.25.0`。安装使用 hoisted linker（本机 isolated 会栈溢出，见 D2 记录）。

## 2. 改动文件

| 路径                                                   | 说明                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `data/reviews/d4/b/effective-candidates.json`          | D4 逐行接口（288 行），含 baseSha / dataVersions / mode / command     |
| `data/reviews/d4/b/a-diff.md`                          | 给 A 的差集，按 6 类 + 可推导分列                                     |
| `data/reviews/d4/b/context-drafts.json` / `.md`        | 词林/新韵语境草稿 13 条（全部 unverified）                            |
| `data/reviews/d4/b/coverage-60.md`                     | 60 目标位置盘点（已测/来源已定/需待核/缺样本）                        |
| `packages/readings/scripts/d3-effective-candidates.ts` | 新增 `--out` / `--base-sha` 兼容参数；默认行为不变，D3 报告仍写原路径 |
| `packages/readings/tests/d4-artifacts.test.ts`         | D4 产物守卫 5 条                                                      |
| `docs/readings.md`                                     | 新增 D4 小节                                                          |
| 本文件                                                 | 交接                                                                  |

未改：A 的原始/规范化库与审批登记、格律 core、规则卡、API、冻结契约、根配置/CI。

## 3. 输入版本

| 资源 | 版本                                                                                    |
| ---- | --------------------------------------------------------------------------------------- |
| 平水 | `pingshui-cwr-ff0e9c1-d3-full-sanj-jiang-review4`                                       |
| 词林 | `cilin-cwr-ff0e9c1-d3-full-clean1`                                                      |
| 新韵 | `xinyun-rebuild-d2-full`                                                                |
| 语境 | `context-rules:11`（rules 11 / evidence 11 / sources 2）                                |
| 正文 | `tests/golden/cases/{dengguanquelou,jingyesi,huanghelou}.json`（reviewStatus=approved） |

## 4. 核心结论

**平水 96/96 有效候选有已审证据**，三首 `resolveReadings` 全部 `annotated`：85 resolved + 11 ambiguous + 0 blocked。

**词林 / 新韵各 96 字位全部 blocked**（`LOOKUP_EVIDENCE_UNVERIFIED`）：两库快照 `evidence approved = 0`
（词林 0/33、新韵 0/56）。这不是「第一个字阻断」，是整库缺口：

| 韵书     | 候选缺失 | 来源缺失 | ID漂移 | 未审核 | 语境不足 | 多读同调 | 可推导 |
| -------- | -------- | -------- | ------ | ------ | -------- | -------- | ------ |
| pingshui | 0        | 0        | 0      | 0      | 0        | 11       | 85     |
| cilin    | 1        | 0        | 0      | 95     | 0        | 0        | 0      |
| xinyun   | 0        | 0        | 0      | 96     | 0        | 0        | 0      |

「多读同调」11 条是**正常结果**：读音歧义、平仄已定，不写成读音确定。

## 5. 60 目标位置盘点（G09）

三首×三书范围内候选数 ≥2 的**去重位置 44 个**（同一位置跨书只计一次）：

| 分类                                     | 数量 |
| ---------------------------------------- | ---- |
| 已测（已由上下文裁定）                   | 11   |
| 来源已定（多读、无裁定，保持 ambiguous） | 11   |
| 需待核（证据阻断）                       | 22   |
| 缺样本（无候选）                         | 0    |

**未达 60**：距目标仍差 16 个位置。本日不把同一位置重复跑多次充数，缺口如实列在
`data/reviews/d4/b/coverage-60.md`，对应 G09。

## 6. 语境草案（词林/新韵，13 条，未批准）

- 只对「平水已裁定且本书同位置确有多读」的 13 处生成草稿；
- `candidateIds` 取**本书真实快照**，`selectCandidateIds` 留空，`reviewStatus=unverified`，不进入运行选择器；
- 语义依据沿用平水义项描述，但 `transferCondition` 明确要求先证明词义可迁移、且在本书重新取得可定位证据；
- 反例沿用平水规则的 negativeExamples；
- **没有**把平水 candidateId 搬进词林/新韵（守卫用例断言前缀不是 `pingshui:`）。

## 7. 明确未运行 / 未做

- 未运行真实 API 九格（`pnpm test:acceptance`）：归 Codex 在装载后复跑；本轮只做模块级逐字位统计。
- 未新增任何 approved 语境规则；未改审批状态。
- 未做全量重建，也未与 A 并行写快照。
- 未做留出评测，因此不报读音准确率。

## 8. 下一责任人

- **A**：词林 95 字位 / 新韵 96 字位的归部证据审批；黄鹤楼词林缺 1 字；
- **组长**：13 条跨书语境草稿的裁定（每条例词需可定位来源）；
- **Codex**：九格真实 API 复跑与 `integrate/d4` 装载验证；
- **B（下一轮）**：A 新版到达后重跑本脚本核对有效候选与语境引用，旧 ID 必须有迁移依据。
