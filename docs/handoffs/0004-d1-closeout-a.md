# 0004 · A / D1 收口：韵书来源、缺部检查与查询入口

日期：2026-10-17。执行：队员 A 的 DeepSeek（数据工程）。本文件是 D1 的收口记录，避免与根 `HANDOFF.md` 多方同改。

## 分支与基线

- 分支：`feat/a-d1-lexicon`
- 当前 HEAD：`1ceeea439f1729b34951a8239dcd6541919f41f4`
- 基线：从 `main` @ `3080a1c` 起（任务书写的 `e549194` 已被 C 的 PR #1 合入推进；未回退新提交）
- `contract-v1` = `9b27322`，**未改动**，未修改任何冻结标签
- 本批 4 个提交：

| commit | 内容 |
|---|---|
| `24e42ce` | feat(lexicon)：D1 交付主体（源码 / 测试 / 脚本 / 数据 / 文档） |
| `6434d5e` | docs：测试结果、未验证项与状态收尾 |
| `391e7da` | docs：人工核验结果与三讲补录状态 |
| `f320ba7` | docs：三讲补缺记录 oldid 并统一第 8 字 |

## 自动检查（实跑）

| 命令 | 结果 | 执行环境 |
|---|---|---|
| `pnpm exec vitest run packages/lexicon/tests` | Test Files 5 passed / Tests 66 passed | 用户本机终端 + 本批执行环境各跑一次 |
| 全仓 `pnpm test` | 12 文件 / 149 项通过，无回归 | 用户本机终端 |
| `pnpm typecheck`（含 `apps/web/tsconfig.json`） | 0 错误 | 用户本机终端 |
| `pnpm lint` | 0 问题 | 用户本机终端 |
| `pnpm check:generated` | 8 个契约/模板核对通过，无漂移 | 用户本机终端 |
| `node scripts/data/fetch-sources.ts --check` | 8/8 与 manifest 摘要一致，0 不一致 | 本批执行环境 |
| `eslint .` / `tsc --noEmit` / `tsc --noEmit -p apps/web` | 0 / 0 / 0 | 本批执行环境单独复跑 |

## 人工核验（A 本人）

- **七字抽检 7/7**（搜韵网人工核对）：白=入声十一陌、一=入声四质、流/楼=下平十一尤、雪=入声九屑、物=入声五物、**更=下平八庚（平）+ 去声二十四敬（去）两读并存**，与系统判定一致。
- 「更」的双候选在代码中互不覆盖：`pingshui:更:ping:八庚` 与 `pingshui:更:qu:二十四敬`，由 A-D1-02 断言（`packages/lexicon/tests/fixture.test.ts:66`）。
- **上声三讲 9 字**已由人工在维基文库网页端肉眼核实并补录（讲/港/棒/蚌/项/缿/玤/傋/耩），**已取得修订号 oldid `8264804`**（`https://zh.wikisource.org/w/index.php?oldid=8264804`）。
- 三讲补丁仍 `status: draft`、`reviewStatus: unverified`，**未生效、未进 `data/releases`**。

## 可用 / 不可用范围

| 能力 | 状态 | 说明 |
|---|---|---|
| `lookupCharacters` 查询 | ✅ 可用 | 去重、码位稳定排序、多候选保留、输入不可变 |
| 缺部检查器 `checkCompleteness` | ✅ 可用 | 对 105 部固定快照正确报缺「三讲」，`releaseGatePassed=false` |
| 引用完整性校验 | ✅ 可用 | 悬空 candidate/group/evidence/source 均被拒（有反例测试） |
| 三库发布级数据 | ❌ 不可用 | 未达门槛，不得进 `data/releases`；API 应保持 503 |
| 正式解析结论 | ❌ 不可用 | 七字样本 `reviewStatus=unverified`，evidence 未审核 |

## 未验证项（不得当成已通过）

1. 词林 / 新韵门槛从未在真实数据上跑过，仅验证过常量形状（19/33、14/56）。
2. 七字仅与搜韵网核对，未与《平水韻》权威文本逐字对照。
3. 三讲 wikitext 快照未落盘到 `data/raw/wikisource/`；许可页脚未转录（`license` 字段仍为「依任务书记录，本次未能亲自复核」）。
4. 平水 106 部门槛未真正校验通过（补丁未生效）。
5. 新韵十四韵规则 `unverified`；上游字表授权链未核实。

## 交接指向

- 给 B 与 GLM：`packages/lexicon/HANDOFF.md`（签名、注册方式、dataVersion、错误码、事实边界、接件清单）。
- 根 `HANDOFF.md` 保留全项目总览与「人工核验」节。

## D2 首批（预计 1 个工作日内）

1. 保存三讲 wikitext 快照 `data/raw/wikisource/PingshuiYun-8264804.wikitext`，摘要登入 `data/sources/manifest.json`。
2. 转录页面许可声明，替换 `license` 占位文本。
3. 生成三讲补丁差异（前后对照 + 逐字证据）→ 供人审 → 重跑 `scripts/data/inspect.ts` 确认 15+15+29+30+17=106 且三讲非空。
4. 推进三库全量导入与索引、十四韵规则依据、冲突清单。

## 尚需他人动作

- **GLM**：补 `packages/lexicon/package.json` 的 dependencies / exports / scripts 与 `tsconfig.build.json`（清单见 `packages/lexicon/HANDOFF.md` §8）。
- **组长**：审阅本 PR；`pending` 合并由 GLM 执行，A 不自行合入 `main`。
