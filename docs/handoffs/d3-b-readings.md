# D3-B：三库有效候选与语境依据（交接）

- 分支：`feat/b-d3-context-closure`
- base：`main @ f42172f`（含 `4375b35` 之前的 D1 语境规则与 Codex 范围修复）
- 变更路径：`packages/readings/`、`data/context/`、`data/reviews/d3-b-*`、`docs/readings.md`、本文件
- 未改：A 的归部数据与审批表、E 的体裁、API、冻结契约、格律规则

## 1. 九格矩阵（3 作品 × 3 韵书 = 9 组合，288 字位）

产物：`data/reviews/d3-b-effective-candidates.json` / `.md`
生成：`node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d3-effective-candidates.ts`

| 作品     | 韵书 | 字位 | 缺字 | 多候选 | 临界(筛前) | 临界(筛后) | 含未审竞争 | 规则命中 | 全部有效有证据 | resolved | ambiguous | unknown | blocked |
| -------- | ---- | ---- | ---- | ------ | ---------- | ---------- | ---------- | -------- | -------------- | -------- | --------- | ------- | ------- |
| 登鹳雀楼 | 平水 | 20   | 0    | 3      | 1          | 0          | 1          | 2        | 20             | 19       | 1         | 0       | 0       |
| 静夜思   | 平水 | 20   | 0    | 4      | 3          | 0          | 3          | 3        | 20             | 19       | 1         | 0       | 0       |
| 黄鹤楼   | 平水 | 56   | 0    | 15     | 6          | 0          | 6          | 6        | 56             | 47       | 9         | 0       | 0       |
| 登鹳雀楼 | 词林 | 20   | 0    | 1      | 1          | 1          | 20         | 0        | 0              | 0        | 0         | 0       | 20      |
| 静夜思   | 词林 | 20   | 0    | 2      | 2          | 2          | 20         | 0        | 0              | 0        | 0         | 0       | 20      |
| 黄鹤楼   | 词林 | 56   | 1    | 5      | 4          | 4          | 55         | 0        | 1              | 0        | 0         | 1       | 55      |
| 登鹳雀楼 | 新韵 | 20   | 0    | 6      | 3          | 3          | 20         | 0        | 0              | 0        | 0         | 0       | 20      |
| 静夜思   | 新韵 | 20   | 0    | 10     | 5          | 5          | 20         | 0        | 0              | 0        | 0         | 0       | 20      |
| 黄鹤楼   | 新韵 | 56   | 0    | 20     | 13         | 13         | 56         | 0        | 0              | 0        | 0         | 0       | 56      |

**两个分母分开记，不混写：**

- 「含未审竞争」= 语境筛选**前**候选集合里存在未批准证据的字位：平水 1+3+6 = **10**。
- 「全部有效有证据」= 语境筛选**后**进入判定链的候选全部已批准：平水 **96/96**。
- 前者是数据侧待审规模，后者是运行时可判定规模；`blocked` 与 `ambiguous` 也分列，不把多读同调写成读音已确定。

**平水交叉核对**：三首 `resolveReadings` 全部 `annotated`，与逐字位推导不一致 **0 处**（期望来自快照，不来自调用结果）。

## 2. 规则与依据

现有 11 条 `approved` 语境规则（`data/context/rules.json`）：

- 10 条来自 `docs/reviews/13_J03三首核心诗逐字人审_第二批.md`（组长 2026-10-18 裁定）；
- 1 条来自 `docs/reviews/14_D2收口_候选批次与里字异常.md`：固定句「欲穷千里目」之「里」取上声四纸，
  去声四寘候选**保留待核、不删除**。

本批**未新增规则**：三库中词林/新韵没有任何已批语境证据，按「新语境必须三件套」的要求，
未确认项不进入 approved 选择器；跨书也未把平水规则换 `book` 字符串冒充已审核。

三件套来源：`data/context/evidence.json`（11 条 `kind=context`、全部 approved）、
`data/context/sources.json`（`src:j03-review-batch2`、`src:d2-closeout-review`）。

## 3. 实际命令与结果

```text
$ pnpm --filter @poetry/readings test
  ✓ golden-review.test.ts (13)  ✓ resolve.test.ts (35)  ✓ d3-acceptance.test.ts (11)
  ✓ real-pingshui.test.ts (6)   ✓ rules.test.ts (6)     ✓ parse.test.ts (10)
  Test Files 6 passed / Tests 81 passed

$ pnpm exec tsx packages/readings/scripts/d3-effective-candidates.ts
  登鹳雀楼/pingshui: 19R 1A 0U 0B
  静夜思/pingshui:   19R 1A 0U 0B
  黄鹤楼/pingshui:   47R 9A 0U 0B
  （词林/新韵六格全 blocked，仅黄鹤楼词林 1 个缺字）
```

环境：Node 24.21.0 / pnpm 11.25.0（仓库锁 24.19.0，差补丁版本，未观察到差异）。

## 4. 验收用例 B01–B08 落点

| ID  | 用例                                                              | 结果                                                               |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| B01 | 平水三首可不回退标注；里选上声四纸，四寘候选仍在                  | `d3-acceptance.test.ts` ✅                                         |
| B02 | 「千里／里外／欲穷千里山」不被固定句规则选中（门槛接管）          | ✅                                                                 |
| B03 | 同调双读：读音 ambiguous、平仄 resolved                           | 平水 11 个 ambiguous 字位全部 toneStatus=resolved ✅               |
| B04 | 含平含仄且无语境：平仄保持未定                                    | 矩阵「临界(筛后)」平水为 0；合成路径由 `GATE 混合有效候选` 守护 ✅ |
| B05 | 语境证据缺失/错 kind/未审核/候选失效                              | `rules.test.ts` + `resolve.test.ts` 既有用例 ✅                    |
| B06 | 跨书旧 candidateId 覆盖被拒                                       | ✅（`OVERRIDE_READING_UNKNOWN`）                                   |
| B07 | 新韵读旧诗用现代本调：白=P（平水为 Z），一/不保留多候选、不套变调 | ✅                                                                 |
| B08 | 报告计数独立从快照复算                                            | `d3-acceptance.test.ts` B08 组 ✅                                  |

## 5. 剩余异常（需上游）

1. **词林 / 新韵全部 blocked**：两库快照 `evidence approved = 0`（词林 0/33、新韵 0/56），
   因此 6 个组合全部 `LOOKUP_EVIDENCE_UNVERIFIED`——这是数据未就绪，不是模块缺陷。
2. **黄鹤楼在词林缺 1 字**（56 字位中 55 有候选）：候选缺口，需 A 补。
3. **平水仍有 10 个字位存在未审竞争候选**（筛前）：字面已由 11 条规则收窄到全已审，
   但注册表层面这 10 条竞争候选仍未审批，属 A 的审批范围。
4. **11 个 ambiguous 字位必须保持读音歧义**：多读同调，不得为「全绿」强行选音。
5. **`望` 为通说裁定**：若启用「古体优先古读」策略需降置信复核，届时改规则 `reviewStatus`，不是改候选。

## 6. 旧 PR #10 处置

`feat/b-d3-full-coverage`（PR #10，draft）相对分叉点 `513d3f8` 的 12 个文件改动，
**已全部并入 main**（逐项核对：`golden-token-review.*`、`golden-review.test.ts`、
`tone-critical-positions.json`、`d2-coverage-report.*`、`d2-coverage.ts`、`docs/readings.md`、`HANDOFF.md`）。
该分支没有独有内容，建议直接关闭 PR #10，不要把旧分支强推主线。

## 7. 下一责任人

- **A**：词林/新韵候选证据审批；补黄鹤楼词林缺字；平水 10 个未审竞争候选的审批范围。
- **GLM**：确认 `data/context/{rules,evidence,sources}.json` 三件套装载；装载后复跑 9 组合真实 API；
  未批准组合按 `blocked` 记录，不计入验收成功。
- **E**：三首正文/体裁已定版；新韵下《静夜思》体裁是否另立版本，由 E 按流程处理。
