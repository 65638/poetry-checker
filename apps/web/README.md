# apps/web

负责人：队员 D / DeepSeek（业务工程）；Claude 接入后负责展示，Codex 候补。
当前状态：**D1 业务基础已实现**，展示组件未交付，使用临时纯文本开发容器。

先阅读根 `README.md`、`HANDOFF.md`、`docs/ownership.md` 与
`docs/team/14_队员D_前端任务书.md`。新增依赖由组长/GLM 统一安装；
不要自建第二套公共契约，不要自由改配色排版。

## 目录

```text
src/view-contract.ts      冻结的 CheckerViewProps（设计方只导入，不改）
src/api/                  API client、错误适配、响应语义核对
src/app/                  业务状态协调器、输入规则、临时开发容器
src/features/             复制摘要与 JSON 导出
src/hooks/                React 绑定（useSyncExternalStore）
src/utils/                SHA-256（原文摘要，与服务端口径一致）
tests/                    业务测试（api-client / store / export）
src/presentation/         设计方独占，D 不写入
```

## 起开发环境

两个终端：

```sh
pnpm dev:api     # 127.0.0.1:3000，D1 开发 mock
pnpm dev:web     # 127.0.0.1:5173，代理 /api、/healthz、/readyz → 3000
```

浏览器打开 `http://localhost:5173`。根 `pnpm dev` 目前只启动 API。

## 测试与检查

```sh
pnpm --filter @poetry/web test        # 业务测试
pnpm --filter @poetry/web typecheck   # TSX 类型检查
pnpm --filter @poetry/web build       # 生产构建
pnpm verify                           # 根：lint + 双 typecheck + 全量测试 + 生成物一致性
```

D1 实测结果（Node 24.19.0 / pnpm 11.25.0）：全量 **101 项测试通过**
（36 基线 + 80 新增）、根与 web 的 `tsc --noEmit` 通过、`eslint .` 通过、
`vite build` 通过；`dev:api` + `dev:web` 真实冒烟通过。

## 开发场景

`fixtures/mocks/` 由 `node fixtures/mocks/generate.ts` 生成，全部通过
`AnalysisResponseSchema`。合成正文用「平/仄」字面量构造，**不是真实名篇**，
不进入生产分析路径。`mismatch.json` 故意让行文本与字位错位，仅用于验证
前端会拒绝错配报告；`supplementary.json` 含补充平面汉字（`𠀀`），
用于回归「字位按码点计、切片按 UTF-16」的坐标约定。

生产入口 `src/main.tsx` 只使用真实 HTTP transport，不导入开发场景，
请求失败时也不回退 mock。

## 交互与失效规则

见 `docs/ui.md`（业务交互、并发、选音、导出、测试结果）。
D1 交接记录见 `HANDOFF.md`。

## 接入设计组件

设计方交付 `presentation/CheckerView.tsx` 后，把 `src/main.tsx` 里的
`<DevContainer {...props} />` 换成 `<CheckerView {...props} />` 即可，
`src/app/store.ts` 的业务逻辑不需要改动。
