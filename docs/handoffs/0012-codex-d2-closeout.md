# Codex 接管 D2 收口

## 当前结论（2026-10-18，组长确认后；以本节为准）

组长回复原文：**同意该批次与“千里”裁定**。已将 68 条固定原文可匹配候选按精确 ID 落库，并新增第 11 条语境规则：仅在“欲穷千里目”中选择“里”的上声四纸。去声四寘竞争候选仍存在、仍为 unverified。审核方式为“组长接受机器初审批次并裁定异常”，不称逐字人工核验，不批准整部或全库。

机器记录：`data/reviews/d2-closeout-batch-approval.json`；批准前来源对照及 SHA 冻结在 `data/reviews/d2-closeout-approved-source-batch.json`。测试会校验批次 68 个 ID、原件/来源摘要及候选范围隔离。

实际验收：`pnpm verify` exit 0，**44 文件 / 584 测试**；lint、typecheck、构建、8 个契约/模板生成物检查通过。三首真实 HTTP 探针 `pnpm exec tsx scripts/probe-d2-api.ts --require-golden` exit 0，**3/3**，报告见 `data/reviews/d2-real-api-report.json`。

| 作品（平水韵） | HTTP | 正确行为 |
|---|---|---|
| 登鹳雀楼 | 200 | 五绝，仄起首句不入韵，流/楼同十一尤，summary=pass |
| 静夜思 | 200 | 古体，summary=not_applicable，不强套近体规则，仍展示逐字音韵 |
| 黄鹤楼 | 200 | 七律及特殊拗律标签，押韵通过，常格偏离可定位，summary=fail 符合预期 |

三首 96 字位经已审语境规则筛选后有效候选证据 **96/96**，剩余阻断 0。筛选前仍有 10 字位含未审竞争候选，不能删除这些候选来凑通过；同调多读仍显示读音歧义。

数据版本升至 `pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-review3`（API 使用的 106 部快照）；105 部对应 `pingshui-cwr-ff0e9c1-d2-full-review3`。候选/韵部/来源及既有证据 ID 均不迁移。新增 68 个 `ev:candidate:*:d2-batch`；全量共 83 条候选审批，106 部另有三讲部级 1 条，共 84/189 条证据已审。版本差异、字节摘要见 `data/reviews/d2-review3-version-change.json`。

业务摘要：105 部 `60c416c8d0fe39fee07a82a2975ad0bbe1374b53985abb5a79f9723c04498f7e`；106 部 `6c9057412b85a3c7b4066f260e8d52b60b8be936c814380200f7ed9d7a71d6ef`。

四份全量快照机器初审运行通过、引用闭合，仍登记 16 项异常（P0=0、P1=4、P2=7、P3=5）。运行通过不表示异常关闭。词林/新韵未新增证据批准，三张规则卡的部分依据边界仍保留，`/readyz` **仍返回 503**。本批完成三首真实 API 门槛，不宣告三库全量发布。

### GLM 集成指令

1. 从 PR #12（`codex/d2-closeout`）集成；先保留当前工作区改动，不重置主工作区。该分支基于 main `e1c076c`，包含 B `adfc454` 及 Codex 首批修复。
2. 运行下文复现命令；`--require-golden` 必须 exit 0 / 3/3。集成后重启 API，确保未设置 `POETRY_DEV_MOCK=1`，让进程加载 review3。
3. 用正式入口 `/` 验证三首提交、字位依据、规则详情、选音和导出；旧 `presentation-preview.html` 是合成展示页，不能用于真实链路验收。
4. 归还 A/B/C/E/GLM 对应路径。本轮未改 Web 展示层，未重跑浏览器端到端/视觉验收；D2 全组宣告仍需集成后的正式入口复验。前端改版沿原计划推进。

以下保留首次接管记录，**其中 0/3 与待裁状态已由上文取代**。

## 首次接管记录（历史：8f74397）

用户授权：本会话“目前情况很严峻，可能得你干这些活了”。

起点：main `e1c076c`；独立分支 `codex/d2-closeout`，不切换主工作区。
接管范围：B 最新分支集成、apps/api 资源接线、packages/genre 体裁分支、规则卡运行注册、作品证据、A 的候选审批范围及相关构建/验收。
接管期间以上路径由 Codex 单写；原模块归属不变，交接后归还 A/B/C/E/GLM。

已合入 B `adfc454`（合并 `c77de58`）；唯一冲突为测试注释，采用 B 的独立取预期说明。

审核边界：已有 J03/C/A 裁定按原范围落库，不把单字批准扩成整部，不把平仄批准扩成全部候选归部批准。AI 检查保留机器核对身份。全库发布与三首联调分别验收。

## 本批已完成

1. 合入 B 的 10 条语境规则、对应证据、来源和逐字报告；API 按冻结 Schema 加载，不再静默吞坏文件。检查来源/证据引用与 ID 冲突，加载故障返回 503。
2. genre 的 P0 特征只要求平仄/粘对/押韵，按最高分与 0.05 分差可靠选模；最佳候选关键位率不足、分数缺失、needs_review 时不确定选模。auto 高吻合分支已实现；已审元数据/显式体式可以对低吻合的特殊拗律选模检查，不改判古体。
3. 10 张运行规则卡已注册；3 张救法采用 J03，4 张补 C 已签的文献定位；押韵/两种尾式的限制如实说明，未冒充完整文献批准。原 draft 审批历史保留。
4. 三首作品固定版本原文已真实下载至 data/raw/works，SHA/修订号/时间与来源清单一致。按 J03/C 已有裁定落实作者、正文、体裁、版本，记录源文繁体与采用简体的逐字差异；未改变 fingerprint 算法。金标准的预期已审批，不等于 HTTP 已通过。
5. 修复 A 的候选审批被扩成整部的问题：三讲仍是部级；其余 15 个已裁候选追加独立证据。三库全库仍 unverified，不删竞争候选。更/望/思/乡/乘/空/不/汉十处语境裁定所选候选的归部证据已齐。
6. 新增只读 source review 与真实 API 探针，范围及退出码明确。

## 版本与复现

新增 review2 数据版本，候选/韵部/来源 ID 不变，旧部级 evidence ID 保留；新增 ev:candidate:*:j03。详见 data/reviews/d2-review2-version-change.json。集成后须重启 API 以刷新进程缓存。

```powershell
pnpm install --frozen-lockfile
pnpm verify
pnpm exec tsx scripts/data/check-normalized.ts
pnpm exec tsx scripts/data/precheck-lexicon.ts
pnpm exec tsx packages/readings/scripts/golden-token-review.ts
pnpm exec tsx scripts/data/review-golden-source.ts
pnpm exec tsx scripts/probe-d2-api.ts --require-golden
```

`pnpm verify` 实跑 exit 0：43 文件 / 575 项，含 lint、类型检查、测试、构建、8 个契约/模板生成物检查。core→genre 合成接线探针已通过（仅用于工程接线，不是三首真实验收）。

四份全量快照机器检查引用闭合；API resources.loadErrors 为空。三库主部 106/19/14。真实已审字形输入“白一更流楼雪物”返回 200/unsupported，完整链路无 fixture。

真实三首探针：**0/3 通过**，三首均为 503 DATA_NOT_READY。首阻断为登/l1c2 日、静/l1c1 床、黄/l1c1 昔；完整缺口以 source review 表为准。`--require-golden` 实际 exit 1，不能把代码测试通过当 D2 三首完成。`/readyz` 仍 503：全库未审与规则部分依据。

## 剩余裁定（不重复 J03）

经已审语境约束后 96 字位中 17 位证据已齐、79 位缺；去重 69 候选。机器逐源比对找到 68 条，另 1 条“里/去声四寘”在所核原文只见“裏”，疑似简繁归并与语义问题。机器结果不是人工签名。

提请裁定的具体范围和建议见 `docs/reviews/14_D2收口_候选批次与里字异常.md`。裁定前不改这 69 条的审核状态；三库全量发布仍独立于本次三首范围。

## 归还与后续

- GLM：集成本分支后重启 API，复用本探针；不能宣告 D2 三首通过，直到实跑 3/3。
- A/B：候选审批与语境规则的现有机制保留；收到 14 号范围裁定后由 Codex 同批落库，避免多人同改。
- C/E：运行规则卡与元数据已接线，未完成文献范围保留在 limitations/runtime-review-status；不再重复要求 J03 已批版本/体裁。
- 本轮没有改 Web UI，也未重新进行浏览器视觉验收；前端审美改版仍在其原计划内。

业务摘要（用于机器复现）：105 部 `4fe504dc8bda00b3a5698a8648631b7d2fd69bad953fe0f567abdf04488c07c8`；106 部 review2 `d5ec1a588f165d38feb93752021848ed7943f54c7118cc7933e560477323d501`。
