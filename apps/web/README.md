# apps/web

前端业务工程（队员 D）。展示层在 `src/presentation/`，由设计方负责；本目录业务侧
只做状态、请求、校验、导出与测试，不改视觉。

**当前状态（2026-10-23）**：校诗台、藏韵阁、典籍馆与推敲台已集成；支持 DeepSeek/GLM 自动辨音、文学助手与本机阅读/改稿记录。当前功能见 [使用指南](../../docs/features/reading-and-revision.md)，旧 D4 验收记录保留为历史。

---

## 1. 运行环境

| 项 | 版本 |
| --- | --- |
| Node.js | **24.19.0**（`.node-version`） |
| pnpm | **11.25.0**（`packageManager`） |

版本不符时可能装出与锁文件不同的依赖树。请用上述版本。

## 2. 安装

在**仓库根目录**执行：

```sh
pnpm install --frozen-lockfile
```

- `--frozen-lockfile` 不会改 `pnpm-lock.yaml`；依赖变更由集成方统一处理。
- 若本机报 `ERR_PNPM_EPERM [symlinkAllModules]`（Windows 符号链接权限受限），
  可改用 hoisted 布局：

  ```sh
  pnpm install --frozen-lockfile --config.node-linker=hoisted
  ```

  并在后续 `pnpm` 命令前带上同一参数或设置 `PNPM_CONFIG_NODE_LINKER=hoisted`。
  这是本机环境问题，不影响仓库内容。

### Windows 没有符号链接权限时（G05 干净 clone 实测）

在**未开开发者模式、也非管理员**的 Windows 上，只加 `--config.node-linker=hoisted`
**不够**。实测依次失败在两处符号链接：

1. 项目注册链到全局 store：
   `EPERM: symlink '<repo>' -> 'D:\pnpm-store\v11\projects\…'`
   → 追加 `--config.store-dir=.pnpm-store`（store 落到仓库内，随仓库删除）。
2. 工作区包链接：
   `EPERM: symlink '<repo>\packages\prosody' -> '<repo>\node_modules\@poetry\prosody'`
   → **pnpm 无法绕过**。开 Windows 开发者模式 / 用管理员终端，或手工建 junction：

   ```bat
   mkdir node_modules\@poetry 2>nul
   for %p in (contracts genre lexicon prosody readings) do mklink /J "node_modules\@poetry\%p" "packages\%p"
   ```

   `--config.inject-workspace-packages=true` **不可用**：它会与冻结的 `pnpm-lock.yaml`
   冲突（`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`），而锁文件不在个人改动范围内。

另外 `pnpm verify` 默认先做依赖状态检查、会触发一次 `pnpm install`（再撞上述链接）。
需要这些命令都跑通时，再加：

```sh
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm verify
```

> 以上**只适用于权限受限的 Windows 本机**。能正常 `pnpm install` 的机器按上一节即可，
> 不要照搬。G05 实测：干净 clone 按这套步骤后 `pnpm verify` 为 **763 项 / 56 文件，exit 0**。

## 3. 启动

一条命令同时起 API 与 Web：

```sh
pnpm dev
```

- API：`http://127.0.0.1:3000`
- Web：**`http://127.0.0.1:5173`**（默认端口）

统一启动器将前后端绑定在 IPv4 回环 `127.0.0.1`。旧文档中只允许 `localhost` 的说明已不适用。

也可以分两个终端：`pnpm dev:api` 与 `pnpm dev:web`。

**端口以实际输出为准。** `pnpm dev` 遇到占用会明确退出，可设置 `PORT` / `WEB_PORT` 另选端口；单独运行 Vite 时允许自动换端口。Windows 已构建页面可用 `scripts/desktop-start.ps1`，它会复用自己已启动的服务或选择空闲端口。

如果 `pnpm dev` 报 `ENOENT: spawn C:\WINDOWS\system32\cmd.exe`（受限沙箱里常见的
`node → cmd.exe` 被拦），用上面的两个分启命令代替即可，功能等价。

Web 通过 Vite 代理把 `/api`、`/healthz`、`/readyz` 转到 `127.0.0.1:3000`，
所以浏览器只需访问 Web 的地址。

## 4. 正式页面与合成预览的区别

| 入口 | 地址 | 数据来源 | 用途 |
| --- | --- | --- | --- |
| 正式页面 | `/`（`index.html` → `src/main.tsx`） | **真实 API**，请求失败不回退 mock | 实际使用与验收 |
| 合成预览 | `/presentation-preview.html` | 内置合成报告 | 仅看展示组件外观 |

合成预览**不发起真实分析，也不能代表格律结论**。判断功能是否可用一律看正式页面。
生产构建里不包含开发场景与合成数据。

## 5. 健康与就绪不是一回事

两个端点都在 API 上：

| 端点 | 含义 | 503 说明什么 |
| --- | --- | --- |
| `GET /healthz` | 进程活着、能响应 | 服务没起来 |
| `GET /readyz` | 当前运行资源是否可用 | 资源缺失、损坏或冲突 |

当前采用参考分析，未完成人工审核不会阻断服务，也不改变原始审核记录。资源完整时 `/readyz` 返回200；单首作品能否得到确定结论仍以分析结果为准。

### 遇到 503 怎么办

1. 先看页面错误条里的 `原因：` 一行——它会给出具体缺口
   （例如某韵书快照缺失、损坏或服务连接失败）。
2. 若原因是「数据未就绪」：检查服务日志和运行资源；反复修改诗文不能修复数据加载问题。
3. 若原因是「请求未被接受 / 超长」：按提示修改正文长度（上限 2,000 个 Unicode 码点、
   100 行）后重试。
4. 输入内容不会被丢弃；重试成功后错误条自动消失。

## 6. 怎么用

1. **输入正文**：每行一句或整段粘贴都可以，标点可留可去。也可点「示例」直接填入
   已批准的三首固定正文。
2. **选择韵书**：平水韵 / 词林正韵 / 中华新韵。换韵书会作废旧报告与旧选音。
3. **开始分析**：点「分析」或按 `Ctrl + Enter`。
4. **看结果**：结论区给出通过 / 不合律 / 待复核 / 不适用 / 尚不支持之一；
   逐字谱标出平仄与韵脚；诊断区列出违规位置、应为与实际。
5. **查看依据**：点任意字位打开读音与依据面板，可看候选、韵部、释义、现代读音、反切
   （未提供时显示「未提供」，不会编造）。
6. **选音并重查**：在候选下方点「改用此读音」→ 前端携带该字位与候选 ID 重新请求，
   页面标注该读音来自手动选择。同一字位只保留最新一条覆盖；换正文或换韵书会清空。
7. **复制 / 导出**：结论区有「复制摘要」与「下载报告」。导出内容只对应**最近一次成功
   分析**。

### 什么时候导出会被阻止

| 状态 | 行为 |
| --- | --- |
| 报告已不对应当前输入（改过正文/韵书/体裁） | 阻止复制与导出，提示先重新分析 |
| 正在分析中 | 阻止，避免新旧结果混用 |
| 最近一次分析失败（503/网络/超时） | 旧报告仍可查看，但**禁止**复制与导出；重试成功后恢复 |
| 尚无报告 | 无可导出内容 |

## 7. 测试与检查

```sh
# 只跑前端业务测试
pnpm exec vitest run apps/web/tests

# 全仓：lint + 双 tsconfig 类型检查 + 全部测试 + 构建 + 生成物核对
pnpm verify
```

> ⚠️ 裸 `tsc --noEmit` 只跑根 `tsconfig.json`，**不包含 `apps/web`**
> （其 `include` 只有 `packages/**`、`apps/api/**`、`scripts/**`、`vitest.config.ts`）。
> TSX 类型检查请用 `pnpm verify` 或 `pnpm --filter @poetry/web typecheck`。

独立浏览器与验收脚本由验收负责人维护：`pnpm test:e2e`、`pnpm test:acceptance`。
它们会自行拉起服务并使用隔离端口，不需要先手动启动 `pnpm dev`。

## 8. 开发场景（受控合成数据）

`fixtures/mocks/` 由 `node fixtures/mocks/generate.ts` 生成，全部通过
`AnalysisResponseSchema`。合成正文用「平/仄」字面量构造，**不是真实名篇**，
只用于结构、界面与错误路径测试；生产入口不导入它们，请求失败也不回退 mock。

DEV 构建额外提供「开发场景（DEV）」折叠面板，可注入
pass / fail / needs_review / not_applicable / unsupported 五种合成状态。
注入后会显示「合成开发场景，不代表真实结论」，且只存在于开发构建。

## 9. 已知限制

- 三库数据尚未全量审核，但不再因此阻断运行；缺字、读音冲突或不支持的体式仍会如实保留不确定性。
- 黄鹤楼按真实规则输出「不合律」并保留特殊拗律标签——这是如实诊断，不是缺陷。
- 真实触屏手势、全部人工滚动方式未做真机验证；移动视口仿真不等于真机。

## 10. 相关文档

- `docs/ui.md`：业务交互、并发、失效、选音、导出与 D4 状态表。
- `apps/web/HANDOFF.md`、`HANDOFF-D2.md`、`HANDOFF-D3.md`：历史交接。
- `docs/handoffs/d4-d.md`：D4 批次记录（基线、改动、命令与结果）。
