# 智能体协作约定

1. 先读 README.md、HANDOFF.md、docs/ownership.md 和本角色任务书，检查 Git 状态，再开始编码。
2. 公共 Schema 在 packages/contracts/src，类型从 Schema 推导；不创建第二套共享类型。
3. Codex 写契约和格律核心；C 写公共入口/适配/报告/独立验收；GLM 维护根配置/依赖/API/CI；A/B/E 按目录推进。D 写前端容器/API/选音/导出/测试；Claude 接入后写 presentation 与设计资源，Codex 候补；同一时刻一个写入方。
4. 接管共享路径时记录 docs/handoffs，原写入方暂停该路径写入。一般实现与可逆修复按已分配职责继续，不增加不必要的确认步骤。
5. 不为了合律选音，不因出律判古体，不将 unknown/unsupported 变为 pass。乐府标签与形式分开。
6. 不编造来源、反切、页码、人工审核或测试结果。合成 fixture 不得进入真实分析路径。
7. 修改后运行相关检查并交付实际结果；API/前端尚未完成时不得声称全应用已通过验收。
8. 不提交 node_modules、dist、密钥、真实用户原文日志。交接报告说明已完成、待完成和复现方法。
