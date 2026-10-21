# GLM 读音建议接管

2026-10-21，用户提出接入模型分析读音，并确认使用智谱开放平台 API。基线 `codex/dictionary-garden@e8370913688c764099db2b8bd29062a91dfae0c6`，隔离分支 `codex/glm-reading-assistant`。

Codex 单写本轮新增契约、API reading-assistant 模块及 server 注册、Web reading-assistant 客户端/容器/展示组件、Workspace/DictionaryContainer/CheckerView/EvidencePanel/DictionaryView 的插槽接线、相关测试与文档。GLM/D/E/Claude 在这些具体路径暂停并行写入，本轮交付后归还。原分析契约、CheckerViewProps、核心、真实审核记录保持原有含义。

官方文档核对：https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash 。model=`glm-5.3-flash`；仅支持开启思考，不能发送关闭思考参数；该型号为计费模型，不宣传免费。未拿到Key，不进行真实账号推理或声称已联通。

目标：服务端持有Key，手动请求；从服务端韵书查得候选，验证模型选择归属，未知保持未定；普通话读音为AI参考，非古音拟音或人审依据。不改变reviewStatus，不绕过真实analyze证据门槛。校诗台采用建议必须由用户点击，走已有readingOverrides。

## 实际验证

运行基线 `e8370913688c764099db2b8bd29062a91dfae0c6`，dirty=true（本功能未提交时运行；归档提交不得冒充运行SHA）。

- `pnpm verify` exit 0：62文件、821测试，含23个新增API/客户端测试；lint、类型、构建和8项生成检查通过。
- 新增浏览器场景6/6通过，覆盖未配置不推理、主动请求、真实查字、输入归属与实际迟到响应、失败重试恢复、320/375布局、采用后真实readingOverrides重查。模型响应受控；查字和分析走真实API；未调用真实智谱模型。
- 原浏览器回归首轮18通过/1等待超时；未改业务代码掩盖失败，串行复跑19/19通过。完整键盘主任务4步通过，使用真实按键完成选音、回焦、折叠与字典导航。
- `pnpm test:acceptance`：3通过/6数据阻断/0判错/0未运行；内部runner exit 2，外层pnpm命令返回1。readyz仍503；本分支不携带A的PR #28，不把模型接入当作数据审核修复。
- 工程截图已检查：1440/375/320及单字详情；手机对比度修复后重新运行6场景通过，页面无浏览器错误。

未运行：真实账号权限/余额与模型连通性、真实GLM准确率/延迟/费用评估。没有Key，不能记录为通过。运行产物保存在本机交付目录 `outputs/GLM辨音_交付/`；测试入口与配置说明见 `docs/features/glm-reading-assistant.md`。

集成目标main；依赖藏韵阁PR #29，禁止走已退役的integrate/d4。交付后新增模块归API/Web各目录维护方；真实数据与reviewStatus没有变更。
