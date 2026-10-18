# 给 Codex：D3 已审作品特例、算法复核与接管

请直接继续 https://github.com/65638/poetry-checker，采用包含`f42172f`的最新main，在独立checkout/分支 `codex/d3-reviewed-exceptions` 实现。组长决定把上轮所有遗留转D3；本书是实施授权，不只是评审建议。先做最小可运行批次，配合C独立验收，GLM负责主工作区集成。

## 已知事实与本轮目标

上一轮你交的3/3真实API测试漏了第13号第8条特例断言。当前黄鹤楼l4c5–7“空悠悠”=PPP，返回TAIL.SANPING fail/error；已归档裁定明确将其作为该诗古风式律诗特征，不作error。最新三张规则卡放行改了依据状态，并未改变实现。不得继续用“测试绿”覆盖这个矛盾。

保留一般近体三平尾的error规则，只实现已批准作品/字位/音系的精确适用处理；不为了合律改读音、不改判古体、不把整首诗强制pass。已批准J03、第14号及千里不重新提请审批。

## 路径授权与分工

- 你写：`packages/prosody/src/core/`（仅必要修复）、**新增 `packages/prosody/src/reviewed-exceptions/`**、对应core测试、`rules/exceptions/`，自身HANDOFF。
- C单写：`packages/prosody/src/index.ts` 公共导出、acceptance独立测试、规则卡/规则证据；你提供签名和复现，不重写C的期望。
- GLM单写：API资源装载/编排、根配置、版本与集成；E写作品元数据/金标准；A/B写数据/语境。
- 本轮默认不改contract-v1、10个ruleId或CheckerViewProps。新结构限内部例外登记，不能复制整套公共模型。

## 明确实现方案

把已审作品例外作为**通用核心之后、summary之前的纯函数适用层**。core继续报告一般格律事实；适用层仅对严格匹配的已审范围调整规则适用性并补解释。不得在API硬编码诗名，也不得前端隐藏诊断。

建议入口 `applyReviewedWorkExceptions`；下列字段是内部函数草案，T+0.5h内定稿给C/GLM：

```ts
import type { AnnotatedPoem, GenreDecision, ProsodyReport, Evidence, WorkMetadata } from '@poetry/contracts';

// ReviewedWorkException 是本模块的内部记录类型/校验器；不新增HTTP字段。
applyReviewedWorkExceptions(input: {
  poem: AnnotatedPoem;
  textFingerprint: string;
  genre: GenreDecision;
  report: ProsodyReport;
  works: readonly WorkMetadata[];
  exceptions: readonly ReviewedWorkException[];
  evidence: readonly Evidence[];
}): ProsodyReport;
```

函数纯、确定、不修改输入、不读网络/文件/时间，不创建prosody→genre依赖。GLM用既有作品指纹函数计算并传入，不能拿包含标点的请求inputHash冒充指纹；记录字段带书、作品指纹、规则/字位、条件、审批证据和明确范围。

首条记录只覆盖已审平水版黄鹤楼的l4c5–7、TAIL.SANPING、实际有效tone为PPP；要求元数据与裁定依据approved、作品指纹精确匹配、位置文本一致且结构受支持。不能凭题名、标签、templateId、看起来像黄鹤楼来免责。未批准的词林/新韵范围不继承。

命中时保持字位、PPP观察、原常格期望和可读解释；用既有 `status=not_applicable`、`severity=info` 表示“本项在该已审作品范围按特征解释”，不伪写pass。`resolvedBy=null`，因为这不是三类拗救；沿用TAIL.SANPING，不造新ruleId。记录相应审批证据，保证provenance能解析。

检查l4c5是否同时出现逐位常格偏离：本轮批准的直接豁免范围是TAIL.SANPING，不能顺手消除所有METER.POSITION；保留对照时要清楚说明它是常格差异，不能用同一尾式给出互相矛盾的作品裁定。任何扩展到其他规则/字位的变更必须有原裁定范围支撑，在HANDOFF列明，不暗中全局降级。其他明确偏离继续独立判断，全诗summary由最终报告正常推导。

## 首个两小时

1. 读13号裁定、当前evaluation、deriveSummary、规则卡和closure工具；给出最小失败响应与遗漏断言。
2. 定内部记录Schema/函数签名与证据ID，交C/GLM。记录校验归你定义、文件装载及来源闭合归GLM，避免双实现。
3. 完成一条真实已审例外和普通PPP反例；同时覆盖缺证据、错书、换字、伪标签、tone歧义。交可独立运行最小批次，不等前端/全库。
4. C独立用例运行后处理失败，GLM接入后跑真实黄鹤楼；E把该裁定写进金标准。不能只把你自己的测试调绿。

## 验收与后续接管

- 固定诗命中特例且仍显示PPP；普通五/七言PPP仍error；变诗/错书/缺审核不免责；同诗其余偏离保留；输入不可变、结果稳定。
- checkReportClosure、Schema和provenance完整；rule/evidence/source可查；引用已审裁定，不假称新文献证明所有近体例外。
- 先相关测试，再`pnpm verify`；由GLM/E执行九格API与正式页面，不把合成反例当真实语文学验收。
- 核心最小批次交付后，复核A/B的首批来源/映射/语境异常，重点防同字跨书假等价、机器匹配误作逐字人审、删竞争候选、证据范围扩张。
- Claude如30分钟接入失败，可在GLM记录展示路径移交且Claude停止写入后接管08号同一范围；不要同时写第二套前端。GPT/Claude只能轮流使用时先交算法，再切视觉，GLM维持集成。

交 `docs/handoffs/d3-codex-exceptions.md`：分支SHA、目录接管、精确适用条件、输入输出、C独立用例结果、真实API差异、未完成范围、GLM接线步骤。完成即推送可评审PR，不擅自覆盖主工作区。

## 单份任务书的开工约定

环境固定 Node 24.19.0 / pnpm 11.25.0。先检查 git status，保护现有改动，再 git fetch origin；使用包含 f42172f 的最新 main 建本书指定的独立分支。不要在别人正在使用的主工作区切分支、reset 或覆盖文件。

新克隆时运行：

```sh
pnpm install --frozen-lockfile
pnpm verify
```

已有依赖时先做本模块相关检查，交付前跑全仓 verify，记录实际 exit 和测试数。根依赖/lockfile/CI改动交GLM，不能自行升级框架。阻塞30分钟交最小复现，超过60分钟请求GLM重新编排，同时继续不依赖该阻塞的工作。

每2小时交一次可运行增量。HANDOFF包含：base/head SHA、变更路径、实际行为、测试命令与结果、依据/版本影响、未完成及下一责任人。开PR后交组长转发摘要；任务书本身不代表已执行，也不授权向成员直接发送消息。
