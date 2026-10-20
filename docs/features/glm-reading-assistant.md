# 智谱 GLM 读音建议

入口：校诗台分析后点开字位，或藏韵阁展开“带着诗句来查字”。两处都有“AI辨音”。点击才向智谱发送诗句和服务端韵书候选；输入、查字、切页不会自动发起模型推理。

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

## API与约束

- `GET /api/v1/reading-suggestions/status`：仅返回configured/provider/model；无密钥时配置态false。
- `POST /api/v1/reading-suggestions`：`text`最多2000码点、`rhymeBook`、可选`targetTokenIds`最多24个。完整定义在公共Schema与生成OpenAPI。
- 不传字位时只取前24个多候选字位，返回truncated与缺字字位；传字位时必须属于当前原文。缺字保留未定，不请求模型造候选。
- 服务端从所选快照取得候选，模型返回JSON，经Schema和字位/候选ID归属校验；外书、外字或臆造ID整个请求拒绝，不部分静默采用。
- 普通话拼音是AI参考；若候选已有明确现代读音，回传该原值。古入声与韵部仍取韵书候选，不从普通话声调推导古声。
- 不自动覆盖语境规则，不生成approved依据。校诗台“采用此读音并重查”由用户点击，通过原readingOverrides提交，原真实证据门槛继续执行。藏韵阁建议可打开原字条目查看依据。
- 超时45秒、上游错误、格式错误、取消和迟到响应均独立处理；前端50秒兜底，改诗/换书/换字位会取消并清除旧建议。重试失败时可保留对应同一输入的上次建议供参考。
- 单API进程最多2个推理并发、每分钟10个模型调用，每次最多4096输出token，无自动重试、自动付费升级或备用模型。取消发送AbortSignal，但已开始的云端计算是否计费由供应商决定。

## 验证入口

```sh
pnpm exec vitest run apps/api/tests/reading-assistant.test.ts apps/web/tests/reading-assistant.test.ts
pnpm verify
node tests/e2e/reading-assistant.mjs artifacts/acceptance/reading-assistant
```

浏览器测试的GLM响应为受控输入，真实韵书查询与采用后重查走本机API。测试通过不代表GLM真实准确率、古音事实审核或账户联通。没有Key时仍可完成工程/受控验收，真实模型测试明确列未运行。
