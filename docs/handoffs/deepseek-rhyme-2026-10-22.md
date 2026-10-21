# DeepSeek与荐字修复

基于47a8707接管：Codex单写模型契约、apps/api/src/model-config.ts、reading-assistant.ts、poetry-studio.ts、orchestrator.ts，及相应测试；Web的PoetryDesk、ReadingAssistantContainer、EvidencePanel、荐字辅助函数与样式；.env.example和功能文档。本轮由Codex验收，原写入方暂停上述路径并在验收后按原所有权归还。无韵书与审核记录修改。

复现：现有GLM真实荐字HTTP200，80候选、约10.4秒；不能把用户问题归为整个API不可用。页面中采纳修改后usable=false使荐字按钮禁用；翻页effect先setRhymeWords(null)导致整块卸载，页面高度跳动。另无合适结果时无明确反馈。

DeepSeek使用官方API，密钥只读取服务端环境；未取得用户新Key前不声称真实DeepSeek联通。2026-10-22查阅https://api-docs.deepseek.com/和/api/create-chat-completion，当前默认模型名deepseek-flash（旧deepseek-v4-flash为兼容别名），JSON模式要求JSON指令并保留输出/候选归属校验。

## 实现与验收

- provider由公共ModelProviderSchema统一为zhipu/deepseek，OpenAPI按脚本生成。显式选择优先，自动选择有DeepSeek Key时用DeepSeek，否则GLM；禁止跨供应商借用Key。全部文学任务共用服务端模型配置。
- 改稿保留原报告span，按已验证修改映射当前韵脚ID；句末字变化重新查字；模型请求使用当前稿。上次成功推荐单独保存并标明，迟到响应不能绑定新稿。涉及notebook.ts、usePoetryTask.ts及配套测试。
- 同韵翻页保留DOM，按书/读音/页缓存，加载时禁用旧页操作；最后一页补不可交互占位，保留推荐与分页高度。空推荐显示反馈。推荐仍只覆盖当前页最多120读音候选。
- pnpm verify：exit 0，77文件/953测试；lint、类型、构建和生成物一致性通过。构建仍有既存大于500kB分块提示，不影响本次验收。
- tests/e2e/poetry-studio.mjs：exit 0，10场景通过，0浏览器异常。真实API/韵书、受控DeepSeek上游；验证连续长度变化改稿后l1c5韵脚、再荐字不增analyze、试用撤销、650ms延迟翻页不卸载DOM、末页等高、缓存往返不查云模型，1440/375截图及320适配通过。
- 浏览器执行基线47a8707，dirty=true，证据位于工作区外outputs/DeepSeek荐字修复_2026-10-22/browser，不能称为干净提交SHA运行。DeepSeek真实调用因Key尚未填写明确未运行；GLM先前真实荐字HTTP200仅验证连通，不代表荐字准确率。
- 私有.env.local已被Git忽略，不归档、不记录内容；配置文件可填写DEEPSEEK_API_KEY，重启预览后生效。各接口及报告保留真实provider/model标识。
