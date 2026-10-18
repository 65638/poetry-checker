# D3 批次一：已审作品特例层（Codex）

日期：2026-10-19。分支：`codex/d3-reviewed-exceptions`。基线：`f42172f10399449093b750b3d03d66b0a9d08be8`。

## 写入范围与交接

依 D3 07 号任务书授权，Codex 新建 `packages/prosody/src/reviewed-exceptions/`，写 `packages/prosody/tests/core/`、`rules/exceptions/` 与本交接文档。C 继续单写公共入口、独立验收与规则卡；GLM 继续单写 API 装载/编排。没有接管这些共享路径，没有切换或停止 `integrate/d3` 的 dev 服务。

## 本批精确范围

仅实现已批准平水版《黄鹤楼》l4c5–7“空悠悠”的 `TAIL.SANPING` 特例。依据原件是 `docs/reviews/13_J03三首核心诗逐字人审_第二批.md` 第 8 条，复用已批准的 `ctx:j03b2:08`，不改原件、不新增人审结论。

命中后为 `not_applicable/info`，保留 PPP、位置、原常格期望和规则 ID，`resolvedBy=null`。其他规则保持原判。词林/新韵、改字、未审作品或证据、用户改音、有效音不确定均不继承。

## 已交付

| 路径 | 用途 |
|---|---|
| `packages/prosody/src/reviewed-exceptions/index.ts` | `applyReviewedWorkExceptions` 纯适用函数及输入类型 |
| `packages/prosody/src/reviewed-exceptions/records.ts` | 内部记录类型、严格数组解析器、加载错误类型 |
| `rules/exceptions/reviewed-works-v1.json` | 已有裁定的第一条机器可读登记 |
| `packages/prosody/tests/core/reviewed-exceptions.test.ts` | 57 项测试，含真实供数正例与明确标识的合成边界例 |

公共 `packages/prosody/src/index.ts` 未修改，等待 C 添加下面的导出；API 尚未调用本层，等待 GLM 接线。没有新增依赖、HTTP 字段或规则 ID。

## 给 C：公共导出与独立验收

合入本批后，在你维护的 `packages/prosody/src/index.ts` 追加：

```ts
export {
  applyReviewedWorkExceptions,
  parseReviewedWorkExceptions,
  ReviewedWorkExceptionError,
} from "./reviewed-exceptions/index.js";
export type {
  ApplyReviewedWorkExceptionsInput,
  ReviewedWorkException,
} from "./reviewed-exceptions/index.js";
```

最终签名在实现中只有一份；公共类型均复用 contracts：

```ts
applyReviewedWorkExceptions(input: {
  poem: AnnotatedPoem;
  textFingerprint: string;
  genre: GenreDecision;
  report: ProsodyReport;
  works: readonly WorkMetadata[];
  exceptions: readonly ReviewedWorkException[];
  evidence: readonly Evidence[];
  sources: readonly SourceRecord[];
}): ProsodyReport;

parseReviewedWorkExceptions(value: unknown): ReviewedWorkException[];
```

相比 07 号草案增加必填 `sources`，用于阻止审批/作品证据引用缺失来源时仍降级；传现成合并来源表即可。无需新增公共 Schema。

独立验收重点：精确平水版命中、一般三平尾仍 error、错书/换字/伪标签/用户改音/平仄歧义/缺审核不得命中；位置与引用闭合、输入不可变。可直接导入新增模块先跑独立用例，再补公共入口。**本批 57 项是 Codex 自测，不是 C 的独立验收结果；C 本轮尚未执行。**

规则卡 `TAIL.SANPING` 请补一般规则与已审作品精确适用范围的区别，引用既有第 13 号第 8 条，不扩到所有“特殊拗律”，不改 10 个 ID。第四句第五字的逐位常格对照仍保留：这与“该尾式按已审作品特征解释”范围不同，界面不得把本项说明改写成整诗通过。

## 给 GLM：加载与调用

1. 在 `integrate/d3` 合入本批，结合 C 的公共导出提交；本批基于 `main@f42172f`，没有搬运或覆盖你的集成分支。
2. `resources.ts` 显式读取 `rules/exceptions/reviewed-works-v1.json`，调用 `parseReviewedWorkExceptions(JSON.parse(...))`，将结果置于 `Resources.reviewedWorkExceptions`。解析器接受 JSON 数组，结构错误抛 `ReviewedWorkExceptionError`，其内部 `code=REVIEWED_EXCEPTIONS_INVALID`。文件不存在、坏 JSON、解析失败均记入现有 `loadErrors`，走已有 `503 DATA_NOT_READY`；不要吞为空数组，不添加新的 HTTP 错误码。
3. 在同一资源装载阶段校验：登记的 `workId` 存在；`fingerprintText(entry.approvedLines.join("")) === entry.textFingerprint`；作品允许该指纹且形式相符；审批 `evidenceId/sourceId/locator` 与现成注册表一致，审批为 `approved/context`，作品依据为 `approved/work_metadata`，证据来源均可解析。保留当前资源冲突检查。记录 `unverified` 不生效，不能自动升级成 approved；坏引用不能静默进入服务。文件装载/引用闭合归 GLM，不另造第二套记录解析器。
4. 在现有 `evaluateProsody` 之后、`deriveSummary` 之前调用，传入合并后的 evidence 和 sources。下面 `annotated`、`genre`、`mergedEvidence`、`mergedSources` 都是当前 orchestrator 已有变量：

```ts
import { fingerprintText } from "@poetry/genre";
import { applyReviewedWorkExceptions } from "@poetry/prosody";

const coreReport = evaluateProsody({
  poem: annotated,
  candidates,
  selectedTemplateId: genre.selectedTemplateId,
  applicability: genre.applicability,
  ruleSet: request.ruleSet,
});
const prosody = applyReviewedWorkExceptions({
  poem: annotated,
  textFingerprint: fingerprintText(annotated.originalText),
  genre,
  report: coreReport,
  works: resources.works,
  exceptions: resources.reviewedWorkExceptions,
  evidence: mergedEvidence,
  sources: mergedSources,
});
// response.prosody 使用 prosody；summary 仍 deriveSummary(prosody, genre, parsed.quality)。
```

5. `ctx:j03b2:08` / `src:j03-review-batch2` 已在 `data/context/evidence.json` / `sources.json`；`ev:work:huanghelou:j03` 已在 works 注册表。本批没有复制或重新签署它们。返回的 provenance 仍使用同一合并注册表，rule/source 详情页需可追溯。
6. 记录版本 `1`、规则版本 `1`，请求 `ruleSet=teaching-v1` 不变。请在现有版本装配处纳入特例资源版本或摘要，例如 `versions.rules=teaching-v1+reviewed-works-v1`；不要把例外记录版本写成新的 ruleId。若项目已有资源摘要命名方式，沿用该方式。
7. 接线后在 HTTP 真链路断言 l4c5–7 为 `not_applicable/info` 且 PPP 不变、普通 PPP 为 error、读音覆盖不套用；跑现有 `scripts/probe-d3-matrix.ts` 九组合入口及 `pnpm verify`。本批没有另建长期矩阵脚本。

附：README 的平水审批范围旧描述需你按实际登记同步；批准范围是三讲 1 部 + 83 条候选，不能写成全量审核通过。此项只提示，不改你的根文件。

## 实际验证与报告差异

环境 Node 24.19.0 / pnpm 11.25.0，2026-10-19 本地执行：

- 首轮相关测试：`pnpm exec vitest run packages/prosody/tests/core/reviewed-exceptions.test.ts`，56/56 通过。随后增加“借用另一句同字 tokenId”反例。
- 最终 `pnpm verify`：exit 0，**46 文件 / 648 测试**（基线 591 + 新增 57）；lint、typecheck、各包/Web 构建、8 个契约/模板生成物检查均通过。
- 真实验证使用 `analyze` 的实际资源/解析/消歧/体裁输出，再在内存中调用新层；不是 HTTP 已接线，也不是合成 fixture 冒充供数。额外本地探针与测试得到同一差异：

| 项 | 通用核心输出 | 适用层输出 |
|---|---|---|
| `TAIL.SANPING:qilv-ping-unrhymed:4.5-4.6-4.7` | `fail/error` | `not_applicable/info` |
| observed / expected | `PPP` / `避免PPP` | 不变 |
| 字位 / ruleId / resolvedBy | l4c5–7 / TAIL.SANPING / null | 不变 |
| 第 4 句第 5 字的 METER.POSITION | `fail/error`，期望 Z、实际 P | 不变，仍为常格对照 |
| 其它诊断 | 原判断 | 全部不变 |

实测仅上述 1 个 Finding 改变，适用后仍有 8 条 `fail/error` 且 `resolvedBy=null` 的诊断；GLM 正常汇总时整诗仍为 fail，不应硬改 pass。审批证据在原诊断中已存在时只去重，不重复追加。测试验证了 report closure、响应 Schema、全部诊断 evidence/source 引用、不可变、确定与幂等。

## 明确边界与下一责任人

- C：公共导出、独立反例、规则卡说明；结果尚待回传。
- GLM：资源装载/校验/版本、真实 API 接线、合入集成分支后复验；本机运行中的两个 dev 服务未动。
- E：把该项裁定纳入独立金标准；整诗仍 fail 的预期与其他规则分开。
- 本批不批准词林/新韵特例、全库发布或一般三平尾规则豁免。目标字用户选音、用户指定体裁绕过 reviewed_metadata、正文异文、解析不可靠等情况保持核心原结果。
- A+B 供数、D 示例与 Claude 展示不在此提交中；本批完成不等于 D3 收口。

代码提交 SHA 以 PR 的 head 为准；本文件随实现一起提交，避免自引用提交哈希。
