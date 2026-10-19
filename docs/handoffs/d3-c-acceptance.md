# D3 · C 交付：已审特例独立验收（2026-10-19）

> C 分支交付状态：**GREEN**（C01–C16 全部有独立断言并通过；C 本机基线为全仓 47 文件 669 项，不能用作最新集成版计数）。
> PR：**#14** https://github.com/65638/poetry-checker/pull/14 （`feat/c-d3-exception-acceptance` → `main`；创建时 head `dbc5a6a`，复核前 `ebd3213`，收尾提交见 PR 当前 head）
> Codex 已接收收尾提交 `8dcec2c`、`803e52a` 至 `codex/d3-b-integration`；跨模块当前事实与独立复验见 [本轮复核](d3-c-closeout-review-codex.md)。下方 C 本机测试记录保留原值。

## 基线与分叉

| 项 | 值 |
|---|---|
| base | `main @ f42172f`（含 f42172f，`merge-base --is-ancestor` 已验证） |
| Codex 实现 | `codex/d3-reviewed-exceptions @ 63de97b`，按单提交 cherry-pick 到本分支（未改实现） |
| branch | `feat/c-d3-exception-acceptance` |
| head | 见本提交（PR #14 创建时为 `dbc5a6a`） |

## 变更路径（均在 C 授权范围）

- `packages/prosody/src/index.ts`：新增 `applyReviewedWorkExceptions` / `parseReviewedWorkExceptions` / `ReviewedWorkExceptionError` 与 `ApplyReviewedWorkExceptionsInput` / `ReviewedWorkException` 的**公共导出**（不编辑实现）。
- `packages/prosody/tests/acceptance/d3-reviewed-exceptions.test.ts`：新增 **C01–C10 共 11 项**独立验收（含 C04a 五绝 / C04b 七律两个反例）；复核收尾再加 **C11–C16 共 6 项**边界反例（见下）。
- `packages/prosody/tests/acceptance/cards.test.ts`：证据命名断言放宽到 `ev:rule:` / `ev:work:` / `ctx:` 并校验 source 可解析；复核收尾再加**发布注册表 × 合并证据/来源注册表的闭合断言 4 项**。
- `rules/cards/teaching-v1.json`：**TAIL.SANPING** 说明改为「一般近体三平尾 error；已审作品字位按登记范围作特征解释（not_applicable/info，非拗救、不豁免其他规则）」，limitations 列明范围与继承限制；`evidenceIds` 追加既有 **`ctx:j03b2:08`**（只追加引用，不复制证据本体）。
- `rules/cards/runtime-review-status.json`：TAIL.SANPING 的 `evidenceIds` 同步追加 `ctx:j03b2:08`，并在 `releaseNote` 说明该 ID 属已审作品语境证据、不在 `rules/evidence` 复制。
- `docs/handoffs/d3-c-acceptance.md`（本文件）。

**未改**：`src/core/`、`src/reviewed-exceptions/`（Codex 单写）、`rules/exceptions/`（Codex 单写）、`apps/api`、根配置、契约、A/B/E 的审批记录与数据。

## 依据

- `docs/reviews/13_J03三首核心诗逐字人审_第二批.md` §五 第 8 条（+ §六 第 2 项）：黄鹤楼 l4c5–7「空悠悠」= PPP，作**古风式律诗特征**保留，不判近体出律、不作 error；「空」取平声（`pingshui:空:ping:一东`）。
- 作品元数据：`data/works/metadata.json` 的 `work:huanghelou`（approved、qilv、指纹 `7b65737c…`、证据 `ev:work:huanghelou:j03`）。
- 例外记录：`rules/exceptions/reviewed-works-v1.json`（Codex）；审批证据 `ctx:j03b2:08` 复用 B 已落库的 `data/context/evidence.json`（同 locator，未在 `rules/evidence` 重复定义，避免资源冲突）。

## 当前实际结果

```text
pnpm exec vitest run packages/prosody/tests/acceptance
  → exit 0；6 文件、104 项通过（原 94 + C11–C16 共 6 项 + 发布卡闭合 4 项）
pnpm verify（全仓；lint / typecheck / test / check:generated）
  → exit 0；47 文件、669 项通过
tsc --noEmit / eslint . / generate-contracts --check  → 均 exit 0
```

| 用例 | 断言要点 | 结果 |
|---|---|---|
| C01 | 固定正文+已审读音：l4c5–7 observed=PPP；应用例外后 `not_applicable/info`、`resolvedBy=null`、locations 仍 l4c5–7、message 含「已审作品特例」、evidenceIds 含 `ctx:j03b2:08`；七律模板身份保留 | ✅ |
| C02 | 仅加标点/换行（汉字序列相同）：仍命中；明确 `inputHash ≠ fingerprint` | ✅ |
| C03 | 正文改一字（末字愁→秋）：不命中，仍 fail/error | ✅ |
| C04a/b | 普通五绝 / 普通七律合成 PPP 尾：仍 fail/error | ✅ |
| C05 | 同一正文换 `cilin`：不套用平水特例 | ✅ |
| C06 | 审批证据 unverified / 作品未批 / 指纹不符：三种都不生效 | ✅ |
| C07 | 用户覆盖（`selectionMethod="user"`）在 l4c5：不命中，读音不被改动 | ✅ |
| C08 | 同诗其他字位硬错保留（硬错数恰好 −1，仅尾式转 info）；METER 判读不被顺手消除 | ✅ |
| C09 | 两次运行一致；对已应用报告再应用一次结果不变（幂等） | ✅ |
| C10 | `checkReportClosure` ok；ruleId ∈ 10 固定 ID；resolvedBy 不伪填 RESCUE | ✅ |
| C11 | 换 `xinyun`：原判仍 `fail`，`interpretedTails`（尾式被判 not_applicable 的条数）恒为 0 | ✅ |
| C12 | 只删审批证据 `ctx:j03b2:08` / 只删作品证据 `ev:work:huanghelou:j03` / 证据表为空：三种都不生效 | ✅ |
| C13 | 来源表为空、审批证据 `sourceId` 指向不存在来源：两种都不生效（不降级成放行） | ✅ |
| C14 | l4c5 读音为 unknown / 平仄歧义（P+Z）/ 变仄（Z）：三种都不命中，`interpretedTails`=0 | ✅ |
| C15 | 诗/报告/证据/作品/例外记录全部 `Object.freeze` 后调用：结果仍生效，原报告仍 `fail`，四份入参 JSON 前后逐字相等 | ✅ |
| C16 | 报告所有 `evidenceIds`（checks + genre + tokens）都能在合并表解析、`sourceId` 可解析；命中项只挂一次 `ctx:j03b2:08`；closure 仍 ok | ✅ |

## 与任务书/07 号的对照

- 07 号要求「通用核心之后、summary 之前的纯函数适用层」：C 的测试按此调用顺序验证（core report → apply → closure），未验证 API 层。
- 07 号要求「命中时保留字位、PPP 观察、原常格期望和可读解释」：C01/C08 断言 observed、locations、message 与其它硬错保留。
- 07 号要求「不凭题名/标签/templateId 免责」：C03/C05/C06 断言改字、换书、缺审批均不命中。
- 07 号要求「不伪写 pass、不造 ruleId」：断言 `status=not_applicable`、`severity=info`、`resolvedBy=null`，10 个 ruleId 不变。

## 复核收尾（2026-10-19，组长 PR #14 复验后）

组长复验结论：`pnpm verify` 全绿（47 文件 / 659 项），公共导出与主要用例可供 GLM 接线。本轮只做三件收尾，**不新增规则、不改实现、不改契约**：

| # | 要求 | 落点 | 结果 |
|---|---|---|---|
| 1 | TAIL.SANPING 发布卡 `evidenceIds` 追加现有 `ctx:j03b2:08`，勿复制证据；补发布卡对合并证据/来源注册表的闭合断言 | `rules/cards/teaching-v1.json`、`rules/cards/runtime-review-status.json`、`cards.test.ts`（+4 项） | ✅ |
| 2 | 补 xinyun、缺审批、来源断链、未知/歧义/变仄、冻结输入、报告 evidence/source 闭合的独立用例 | `d3-reviewed-exceptions.test.ts` C11–C16（+6 项） | ✅ |
| 3 | 更新当前状态：PR #11 已合并，旧 D1/mock 待办标成历史 | 本文件 + 根 `HANDOFF.md` 状态标注 | ✅ |

要点说明：

- **只追加引用**：`ctx:j03b2:08` 仍只存在于 `data/context/evidence.json`（B 单写）；`rules/evidence/teaching-v1.json` 未新增该记录。新增用例断言该 ID 在「rules/evidence + data/context + data/works」三表合并视图里**恰好出现一次**，防止两处副本悄悄漂移。
- **闭合口径与 API 一致**：`cards.test.ts` 的三表合并顺序与 `apps/api/src/resources.ts` 的 `loadSupplementalResources` 相同，因此包内断言与运行时装载口径不会分叉；同时校验每条证据 `reviewStatus=approved` 且 `sourceId` 可在合并来源表解析。
- **断链不降级**：C13 覆盖「来源表为空」与「审批证据 sourceId 指向不存在来源」两种情况——实现里的 `approvedEvidence` 要求来源可解析，两种都保持核心 `fail`，不会因为证据侧缺件而把尾式放行。
- **冻结输入**：C15 把诗、报告、证据、作品与例外记录全部深层 `Object.freeze` 后调用，既验证纯函数不改入参，也验证不会就地改写原报告（原报告仍为 `fail`）。

## 当前状态（2026-10-19，Codex 按集成分支校正）

| 项 | 状态 | 依据 |
|---|---|---|
| PR #11（C 的 D2 异常报告基础批次，head `55e88e1`） | **已合并** | `git merge-base --is-ancestor 55e88e1 origin/main` → exit 0；`origin/main` 当前 `f42172f` |
| PR #14（C 分支） | GitHub PR 仍 open；内容已纳入 D3 集成分支 | 前批 `ebd3213` 已在 D3 基线；本轮仅接收 `8dcec2c`、`803e52a`，不重复搬入核心；main 尚未含 D3 |
| D3 已审特例层（Codex `63de97b`） | 已接入真实 API，并通过 C 的独立验收 | 本文件 C01–C16；API 断言见 `apps/api/tests/reviewed-exceptions-http.test.ts` |
| orchestrator 接线 | **已完成** | `apps/api/src/orchestrator.ts` 调用 `applyReviewedWorkExceptions`，规则版本为 `teaching-v1+reviewed-works-v1`；旧“唯一阻塞”判断仅反映 C 分支当时所见 |
| 三首 golden | **已有断言按限定范围 approved** | `tests/golden/cases/*.json` 与 `data/works/review-closure.json`；不等于全部逐字/三库审核通过 |
| D3 整体 | **未完成** | 词林/新韵六格仍受数据阻断，示例按钮与完整浏览器验收待后续批次 |

**历史待办（不再作为当前任务）**：

1. ~~「API 真实编排：A/B/C/E 模块就绪后接入，替换 mock 选 fixture 逻辑；`readyz` 改为反映真实数据装载」~~ —— D2 已由 GLM 落地真实六步编排，`analyze` 不再是 fixture mock；此项仅保留为 D1 期记录。
2. ~~「D 接入 web 后把 `pnpm dev` 扩展为同时启动 API 与 Web」~~ —— `scripts/dev.mjs` 已提供一条命令双边启动。
3. ~~「组长 D1 决策项：中华新韵底本」~~ —— 已按十四韵规则 + `pinyin-data` 重建并在数据文档标注，属 A 的 D1/D2 数据侧结论。
4. ~~「旧 PR #7 的三次审批提交与当前 main 的逐项对照，留 GLM 处理」~~ —— PR #11 已并入 `main`，该对照的输入侧（C 的异常报告与规则卡批次）已落地；剩余部分属 GLM 的集成台账，不在 C 范围。

（以上四项在根 `HANDOFF.md` 的 GLM 小节按同一口径标为「历史」。）

## 未覆盖 / 后续（非 C 单方可完成）

1. **Codex（接管 GLM 集成）**：接线与真实黄鹤楼 HTTP 验证已完成，保留后续集成回归；C 无需重复实现。C 的包测试仍不能替代完整浏览器验收。
2. **E**：三首 golden 当前已有正文/体裁断言 approved；第 13 号第 8 条的尾式独立断言已在 API 测试与九格 runner 覆盖。若补进 golden JSON，应精确引用既有裁定并由集成复核，不扩大成三库逐字全部批准；继续未执行的系统验收场景。
3. **Codex/C**：`rules/exceptions` 与 `data/context/evidence.json` 引用同一既有裁定；发布卡与运行审核表只登记 `ctx:j03b2:08`，不复制证据。不改原审批原件；未来若需调整定位或引用，先逐项检查依赖，不能静默改证据内容。
4. **发布门槛**：TAIL.SANPING 现在同时引用规则依据与已审作品语境证据；卡已闭合，但三库快照仍为 `unverified`，`/readyz` 的 503 不会因此改变，不能据此宣称数据侧发布通过。

## 依据/版本影响

- 契约不变（contract-v1）、ruleId 不变（10）、模板不变；仅新增内部例外适用层与 TAIL.SANPING 卡说明。
- 例外**只**对 `rules/exceptions/reviewed-works-v1.json` 登记且作品元数据/指纹/审批证据三者 approved 的范围生效；词林/新韵不继承。
