# 0003 Web 基础环境交接（GLM → D）

日期：2026-10-17（D1/D2 之间）。执行者：组长本地 GLM。响应 D 的配置需求，全部位于 GLM 所有权路径。

## 交付内容

- `apps/web/package.json`：依赖 react 19.3.1、react-dom 19.3.1、@poetry/contracts（workspace）；devDeps @types/react 19.3.0、@types/react-dom 19.3.0、@vitejs/plugin-react 6.1.2、vite 8.3.4（版本均取自 registry 实查，vite engines `^20.19.0 || >=22.12.0` 兼容 Node 24.19.0）。脚本 dev/build/test/typecheck 齐备。
- `apps/web/vite.config.ts`：React 插件；dev 端口 5173；代理 `/api`、`/healthz`、`/readyz` → `http://127.0.0.1:3000`（后两者是契约根路径，不在 /api 前缀下，需显式代理）。
- `apps/web/index.html`：入口 `/src/main.tsx`。
- **`apps/web/src/main.tsx`：占位入口，即日起移交 D 接管**（可整文件覆盖）。占位原因：根 `pnpm verify` 的 build 链需要可构建入口才能真实覆盖 web 构建。
- `apps/web/tsconfig.json`：浏览器 DOM/JSX + `moduleResolution: Bundler` + `jsx: react-jsx`；paths 指向 contracts src。根 tsconfig 的 NodeNext 项目改为只含 packages/apps-api/scripts，`pnpm typecheck` 现在串联两个项目，TSX 类型检查真实生效。
- 根 ESLint：新增 `**/*.tsx` 块（browser globals + no-undef off），`globals` 17.13.0 入根 devDeps。
- 根 vitest include 增加 `apps/**/tests/**/*.test.tsx`。**jsdom/Testing Library/MSW 未安装**——D 写组件测试时向组长提需求，由 GLM 统一加入；纯逻辑测试（Node 环境）现在就能写。
- 根脚本：新增 `dev:web`；`typecheck` 双项目串联；lockfile 已更新。

## 实际验证结果

- `pnpm verify` exit 0：lint（含 TSX）、双 tsconfig 类型检查、36 项测试、`vite build`（14 modules）全部通过。
- 双服务真实冒烟：`localhost:5173` 返回带 React refresh 的页面；经代理 `GET /healthz` → `{"status":"ok"}`、`GET /readyz` → ready+versions、`POST /api/v1/analyze` → 契约 fixture。注意本机 curl 用 `localhost`（Vite 绑定含 IPv6）。

## D 的接入方式

```sh
git fetch origin && git merge origin/main   # 合入本配置提交后
pnpm install --frozen-lockfile
pnpm dev:web        # 5173；另开终端 pnpm dev:api 起 3000；或两个都由根 dev/dev:web 分别启动
```

`src/main.tsx` 直接覆盖；`view-contract.ts`、`app/`、`api/` 等仍按 D 的任务书与所有权表执行。契约消费：dev 走 development 条件（contracts src），生产构建走 dist，均无需 D 处理。
