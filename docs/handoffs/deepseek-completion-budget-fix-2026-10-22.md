# DeepSeek 推理占满完成额度修复

用户报告“模型未返回完整建议，请重试”。Codex 根据本次故障修复授权接管 apps/api/src/model-config.ts、reading-assistant.ts 及 deepseek.test.ts；保留前一轮格律条件修复和原有未提交数据。

真实调用复现：DeepSeek HTTP 200，但 finish_reason=length，completion_tokens=4096，reasoning_tokens=4096，正文长度0。原代码 max_tokens=4096 同时约束推理与答案，不能留出结构化回答空间。

修复：DeepSeek 完成预算上限为16384，GLM仍为4096；保持 deepseek-flash、thinking enabled、low reasoning、90秒超时与原结构校验。长度截断给出明确错误，即使截断内容碰巧是合法JSON也不采用。没有自动重试或额外隐式模型请求。

验证：相关56项测试、eslint、TypeScript与diff检查通过。使用用户提供的八句诗及新韵格律上下文，真实API重新调用成功：HTTP200，finish_reason=stop，耗时28875毫秒，完成5692 token，其中推理4790，答案正文1312字符。通过应用输出契约与建议字位检查。两次真实调用均为现有DeepSeek账号，未输出或保存密钥、模型思考正文；诊断仅记录统计字段。

前一轮965项测试与19个浏览器场景是先前批次，不将其冒充此次重新执行结果。当前启动仍以a0bef50为基线加本地修复，未提交。
