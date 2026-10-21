# GLM / DeepSeek 全局自动辨音

2026-10-22：增加 DeepSeek 官方 API，可用于全局辨音、全诗评议、同韵荐字、诗境检索和对读。配置服务端 `DEEPSEEK_API_KEY`，型号 `DEEPSEEK_MODEL` 默认 `deepseek-flash`；有非空 DeepSeek Key 时默认选 DeepSeek，否则沿用 GLM。可用 `POETRY_AI_PROVIDER=deepseek` 或 `zhipu` 明确选择，两个供应商的 Key 不交叉使用。切换后重启 API。Key 只放根目录已忽略的 `.env.local` 或服务端环境，禁止使用 `VITE_` 前缀。

DeepSeek endpoint 为 `https://api.deepseek.com/chat/completions`，使用 JSON 输出和开启的思考模式，推理程度为 low，沿用已有字位、候选与原文校验。官方依据（2026-10-22查阅）：[模型与接口](https://api-docs.deepseek.com/api/create-chat-completion)、[JSON模式](https://api-docs.deepseek.com/guides/json_mode)。配置状态只表示服务端有 Key；真实调用成功才表示账户联通。

同韵荐字在受控采纳改稿后可继续使用当前诗文；长度变化会更新韵脚字位，改了句末字会重新查阅它的韵书候选，无需为此重跑整诗分析。翻页保留字格及上次推荐，加载完成后原位替换，常用页缓存；最后一页保持相同字格占位高度。模型只从当前页所供候选筛选，不代表搜索了全韵部。无合适推荐时明确反馈，不强行推荐。

2026-10-21用户更新：取消审核阻断，以网页可用为主；GLM自动应用，无需逐字确认；暂不考虑调用花费。校诗台每次分析自动辨析全诗多候选字位，24字位一批，后续批继续处理；藏韵阁展开诗句查询后停笔900ms自动辨音。用户仍可手动纠正，优先级高于模型。

首次校诗分析后，影响结果的编辑停顿1500ms自动更新，连续输入重新计时，避免每次改字都要手动重提。界面折叠、阅读定位、切分区不触发校诗请求；更新期间仍可阅读有明确标识的上次报告。云端失败保留旧结果，不自动循环重试。

网页/API采用参考分析，未审状态不阻断，不改写reviewStatus或伪造批准；readyz只表示运行资源可用。底部统一提示“参考分析：韵书数据与AI读音可能有误，未经全面人工核验，不作为权威结论”。真正的资源缺失、损坏、冲突及未知字仍如实处理。

批注与字位悬停800ms后跟随，移开、换报告、卸载取消；点击和键盘操作立即定位。

## 本机配置

服务端环境变量：`ZHIPU_API_KEY` 和 `ZHIPU_MODEL`（默认 `glm-5.3-flash`）。根目录 `.env.local` 由 API 直接启动时读取，且已被 `.gitignore` 排除。`.env.example` 不含密钥。也可在启动终端设置环境变量；既有环境变量优先。不要设置 `VITE_ZHIPU_API_KEY`，Vite前缀会把值带进网页构建。

```powershell
$env:ZHIPU_API_KEY = '<your-key>'
$env:ZHIPU_MODEL = 'glm-5.3-flash'
pnpm dev
```

若Node需要使用Windows系统证书库，在启动Node/pnpm前设置 `$env:NODE_USE_SYSTEM_CA='1'`。不要关闭TLS校验。

配置后重启API并刷新页面；“检查连接”只读取本机API的配置状态，不代表模型权限/余额或真实推理已验证。只有一次真实请求成功后才能记录已联通。密钥不返回网页、不写入请求日志或Git。

官方依据（2026-10-21查阅）：[GLM-5.3-Flash](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)；[HTTP调用](https://docs.bigmodel.cn/cn/guide/develop/http/introduction)。该型号为计费模型；是否使用赠送额度由账户决定，不承诺免费。仅支持开启思考，客户端不发送 `thinking.type=disabled`。

GLM-5.3系列使用官方支持的`reasoning_effort=low`，避免默认max推理占满网页等待预算；仍保持thinking开启。依据：[思考模式与推理程度](https://docs.bigmodel.cn/cn/guide/capabilities/thinking)。其他型号不自动附加此参数。

## API与约束

- `GET /api/v1/reading-suggestions/status`：仅返回configured/provider/model；无密钥时配置态false。
- `POST /api/v1/reading-suggestions`：`text`最多2000码点、`rhymeBook`、可选`targetTokenIds`最多24个。完整定义在公共Schema与生成OpenAPI。
- 独立接口不传字位时取前24个多候选字位，返回truncated与缺字字位；整诗分析自动分批继续处理后续字位。传字位必须属于当前原文，缺字保留未定。
- 服务端从所选快照取得候选，模型返回JSON，经Schema和字位/候选ID归属校验；外书、外字或臆造ID整个请求拒绝，不部分静默采用。
- 完整响应偶有重复字位：最多接收48条原始建议，仅在同字位的候选ID及拼音完全一致时合并（解释可不同），最终仍最多24个字位。冲突、漏项、外来字位继续拒绝，不能用重复行填补缺失字位。
- 平水/词林候选缺少今音字段时，按原字、声类和韵部提供独立广韵参考帮助模型辨义；不补写原候选或审核记录。例如「不能食」的「不」可区分bù/入声与fōu/平声。韵书缺字显示「缺录」，点字可展开独立参考；模型无权创造缺失的韵书候选。
- 普通话拼音是AI参考；若候选已有现代读音，校验模型拼音的声母、韵母和显式本调与其一致，再保留模型拼音（无拼音时使用候选拼音+声调）。不一致的字位回传空候选并说明原因，其他字位继续可用。古入声与韵部仍取韵书候选，不从普通话声调推导古声。
- 新韵使用 `xinyun-rebuild-readings-v2`：同字同部同声调的不同拼音各有候选，例如“余”的 yu2 与 xu2。旧候选 ID 和内容保留，新增读音附加拼音/声调后缀；迁移见 `data/reviews/xinyun-readings-v2.json`，历史快照保持原字节。
- GLM通过校验后直接应用，高于语境规则，低于用户手动纠正。逐字标注selectionMethod=model，理由保留AI解释和普通话参考；readingOverrides仅表达真实用户纠正。响应新增可选readingAssistant（provider/model/state/appliedTokenIds/message），状态applied/partial/unavailable/not_needed，导出保留来源。藏韵阁结果可打开原字条目。
- 超时45秒、上游错误、格式错误、取消和迟到响应均独立处理；前端50秒兜底，改诗/换书/换字位会取消并清除旧建议。重试失败时可保留对应同一输入的上次建议供参考。
- 整诗模型阶段总预算20秒，已完成批保留，其余回退为本地分析，客户端仍30秒。无Key、格式异常、权限或上游故障也返回本地报告。独立字典辨音接口维持服务端45秒/客户端50秒。
- 单API进程最多2个推理并发，已移除每分钟10次的花费限制；每次最多4096输出token，无自动重试、自动付费升级或备用模型。取消发送AbortSignal，云端计算计费由供应商决定。

## 验证入口

```sh
pnpm exec vitest run apps/api/tests/reading-assistant.test.ts apps/web/tests/reading-assistant.test.ts
pnpm verify
node tests/e2e/reading-assistant.mjs artifacts/acceptance/reading-assistant
node --import tsx tests/e2e/automatic-reference.mjs artifacts/acceptance/automatic-reference
pnpm test:acceptance --real-model
```

浏览器测试的GLM响应为受控输入，真实韵书查询与采用后重查走本机API。测试通过不代表GLM真实准确率、古音事实审核或账户联通。没有Key时仍可完成工程/受控验收，真实模型测试明确列未运行。

常规九格/浏览器回归显式禁用模型调用，避免本地Key导致确定性回归混入网络延迟；需要真实模型时使用九格`--real-model`。该参数不会修改应用的默认自动辨音行为。
