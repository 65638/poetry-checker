# Codex 接管 D2 收口

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
