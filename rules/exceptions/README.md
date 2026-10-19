# rules/exceptions

负责人：Codex。D3 第一批为已审作品适用记录，使用通用核心之后的纯函数，不是另一套格律核心。

`reviewed-works-v1.json` 目前只有一条：已审平水版《黄鹤楼》l4c5–7“空悠悠”，依据第 13 号裁定第 8 条及既有证据 `ctx:j03b2:08`。`approved` 表示该范围已有裁定，不是本批重新审核或放行全库。原审批文档没有改写。

记录通过 `parseReviewedWorkExceptions` 严格读取；未知字段、错误版本、重复 ID/适用范围、非末三字位置等抛出 `ReviewedWorkExceptionError`。`approvedLines` 保留获准字序与分句，防止误传旧指纹后仍套用特例。运行时只接收内存数据，不读文件、不查网络、不改变输入。

`applyReviewedWorkExceptions` 同时核对韵书、已审作品/指纹/形式、元数据体裁依据、实际字位、PPP 有效音与审批证据/来源引用。目标字用户选音、未知或平仄歧义不套用。同为平声的多个有效读音可以成立，层本身不选音。

唯一状态转换为目标 `TAIL.SANPING fail/error → not_applicable/info`；保留 PPP、位置、常格期望和 `resolvedBy=null`，追加裁定说明与 evidenceId。其他诊断原样保留，含 l4c5 的 `METER.POSITION` 常格对照。一般三平尾仍为 error；三类拗救继续由 core 实现。

加载器由 GLM 负责：校验登记正文的指纹、作品/证据/来源外键与既有审核状态，配置故障计入资源加载错误，不吞为空表。内部错误码不直接变成 HTTP 新码。C 负责公共导出及独立验收，GLM 负责真实 API 接入；详见 [本批交接](../../docs/handoffs/d3-codex-exceptions.md)。
