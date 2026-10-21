# D4 前端业务收口（队员 D）

---

# 第二批：G04 缺口收口 + G05 干净 clone（追加）

## 批次基线

| 项 | 值 |
| --- | --- |
| 任务卡 | `docs/team/D4_收口任务书_2026-10-20/04_给D_五态超时与干净启动配合.md` |
| base | `origin/main` = **`cea831befa70a8842943d240f91f9816c9c55a94`**（含月下江山 V2 UI；任务卡写 `c409d20`，main 已在其后合并 C 的 PR #26，故取最新 main） |
| 分支 | `feat/d-g04-closeout`（从 `origin/main` 切） |
| head | 本文件随该提交入库；精确值用 `git rev-parse HEAD` |
| Node / pnpm | 24.19.0 / 11.25.0 |
| 环境 | Windows 无符号链接权限（joinded 安装，见下 G05） |

## 本批改动（全在允许范围）

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `apps/web/README.md` | 修改 | 修正 Web 访问地址为 `localhost`（实测 Vite 只绑 `::1`）；补「Windows 无符号链接权限」实测配方；补 `pnpm dev` 被拦时的分启回退 |
| `docs/ui.md` | 追加 | G04-1 30 秒超时实测、G04-2 五态矩阵、G04-3 键盘流程与结构缺口、G04-4 未运行 |
| `docs/handoffs/d4-d.md` | 追加 | 本节 |

**未改代码**：三处 G04 缺口经浏览器实测均为**已实现且正确**，未发现需要改 store/api 的缺陷；
唯一真实缺口是页面结构问题（见「交 Codex」），按任务卡不写 `presentation/`。

未改：`apps/web/src/presentation/**`、`public/design/**`、`view-contract.ts`、公共契约、
`apps/api`、根配置/CI/lockfile、`tests/e2e`（E 单写）、金标准与审批原件。

## G04 实测结果（浏览器，真实 API）

### 1. 真实 30 秒超时后的恢复与禁导出 — **闭合**

拦截 `/api/v1/analyze` 挂起，真实等待 30s（非假时钟）：`busy` 退出、
错误条给出「分析超时…请重试…未展示任何旧报告结论」+ `TIMEOUT`、正文保留、
旧报告仍可查看；复制被阻止（剪贴板未变）且下载目录 0 文件；
重试成功后错误清除、复制可用（603 字）、下载 0 → 1。

→ 与 `docs/ui.md` D4-1 状态表一致，**不需要业务改动**。

### 2. needs_review / unsupported 受控状态 — **闭合**

DEV 注入：needs_review →「结论：待复核」；unsupported →「结论：暂不支持」；
两者反馈区均显示「已装载开发合成场景；报告不代表真实格律结论。」且结论区文案含「合成」。
之后重新走真实 API →「结论：通过」，结论区/反馈区均无「合成」，主路径未被污染。

→ 受控 fixture 有显式测试模式标识，**不需要业务改动**。

### 3. 全键盘主流程 — **业务侧通过，结构缺口交 Codex**

通过项：前 18 次 Tab 命中 18 个控件且 18/18 可见、均带焦点环；折叠区不进入 Tab 序列；
聚焦字位 + Enter 打开面板且焦点进入；Escape 关闭并**回焦到触发字位**。

结构缺口（黄鹤楼实测）：56 个字位按钮全在 Tab 序列（越过正文需 56 次 Tab）、
报告区可聚焦元素共 **169 个**、**无跳过链接**、`.pc-grid` 无自身 `aria-label`。

→ 属页面结构，建议 Codex 集中修（跳转链接或 roving tabindex）。**本批未动 presention/。**

## G05 干净 clone 配合 — **仓库可跑，卡在本机权限**

做法：`git clone`（`--depth 1`，main）到独立目录 `g05-clean`，按 `apps/web/README.md` 操作。

| 步骤 | 结果 |
| --- | --- |
| 启动相关文件（apps/scripts/package.json/README）个人绝对路径扫描 | **无** |
| 全仓个人绝对路径 | 仅 `docs/design/CLAUDE-*.md` 历史 brief 含 `C:/Users/21393/…`（文档，不影响运行） |
| `pnpm install --frozen-lockfile --config.node-linker=hoisted` | **失败** `EPERM: symlink '<repo>' -> 'D:\pnpm-store\v11\projects\…'` |
| 追加 `--config.store-dir=.pnpm-store` | 进到第二处失败：`EPERM: symlink '<repo>\packages\prosody' -> '<repo>\node_modules\@poetry\prosody'` |
| `--config.inject-workspace-packages=true` | 不可用：`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`（与冻结锁文件冲突） |
| 手工 junction（5 个 `@poetry/*`）+ `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` | **`pnpm verify` exit 0，763 项 / 56 文件** |
| `pnpm dev` | **失败** `ENOENT spawn C:\WINDOWS\system32\cmd.exe`（受限沙箱拦 `node→cmd.exe`） |
| `pnpm dev:api` + `pnpm dev:web` 分启 | **成功**：API `127.0.0.1:3000` healthz 200 / readyz 503（发布门槛）；Web 监听 `::1:5173` |

关键跨端事实（已写进 `apps/web/README.md`）：
- **Web 必须用 `http://localhost:5173`**；`http://127.0.0.1:5173` 连不上，因为 Vite 只绑
  IPv6 回环 `::1`（实测监听地址 `::1:5173`）。API 相反，绑 `127.0.0.1:3000`。
- 无符号链接权限的 Windows 上，`--config.node-linker=hoisted` **不足以**装成；
  需 `--config.store-dir=.pnpm-store` + 开发者模式/管理员/手工 junction。

## 命令与结果（本机实跑）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `pnpm verify`（base `cea831b`，dirty=false） | 0 | **56 文件 / 763 项**，lint/双 tsconfig/构建/8 生成物通过 |
| `pnpm test:e2e`（base） | 0 | **通过 19 / 阻断 0 / 失败 0**（E 的 runner，当前 main） |
| 干净 clone `pnpm verify`（junction + 关依赖检查） | 0 | **56 文件 / 763 项** |
| G04 浏览器自测（本地 CDP 脚本，未入库） | — | 超时 10/10、五态 5/5、键盘 5/5 通过 + 1 项结构缺口记录 |

计数不重复累加：本批**没有新增单元测试**（三处缺口实测为已实现，硬加用例只会重复既有覆盖）。

## 交 Codex

1. **键盘长区块**（G04-3）：报告区 169 个可聚焦元素、无跳过链接、`.pc-grid` 无 `aria-label`。
   建议加「跳到批注」链接或把逐字谱改为 roving tabindex。
2. **G05 安装门槛**：无符号链接权限的 Windows 需要「store-dir + junction/开发者模式」两处补丁，
   而 `inject-workspace-packages` 与冻结锁文件冲突。建议在根 README 给一条统一口径
   （或 CI 说明），避免每个新人各自踩。
3. **Vite 绑定**：`dev:web` 只监听 `::1`，根 README 已提「用 localhost 访问」；前端 README
   本批已对齐，若根 README 想统一表述可一并改。

## 本批未运行

- 真实触屏/真机手势：无设备，未运行。
- E 的独立浏览器验收：由 E 用自己的 runner 复跑本批场景，本批不代跑、不合并计数。
- `/readyz=200` 路径：三库未全量审核，仍 503。

---

# 第一批：D4 收口（已并入 main）

## 基线与环境

| 项 | 值 |
| --- | --- |
| 任务卡 | D4 前端业务收口，不做视觉新设计 |
| base | `origin/integrate/d4` = **`898b1a0a26a5f6e8e79a0b2cb31848b24537a185`** |
| 分支 | `feat/d-d4-closeout` |
| head | 本文件随该提交入库；精确值用 `git rev-parse HEAD` 查（工作树 dirty=false） |
| Node / pnpm | 24.19.0 / 11.25.0 |
| 本机安装 | `pnpm install --frozen-lockfile --config.node-linker=hoisted`（本机符号链接权限受限，见 apps/web/README.md 第 2 节） |

> 未收到组长广播的 SHA 消息；此处记录的是 `git rev-parse origin/integrate/d4` 的实测值。
> 未使用 `origin/main@05e1acb` 作为基线。

## 改动文件（全部在 D4 允许范围内）

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `apps/web/src/app/store.ts` | 修改 | `abort()` 改为复用 `invalidateInFlight()`：递增请求身份再中止 |
| `apps/web/tests/closeout-d4.test.ts` | 新增 | 15 项：并发导出归属、编辑/换书、超时后导出资格、五类状态透传、取消后迟到成功、**请求体形状**（3 项） |
| `apps/web/README.md` | 重写 | 用户可执行的安装/启动/使用说明（环境、端口识别、`/` 与合成预览的区别、健康与就绪、选音重查导出、503 处置） |
| `docs/ui.md` | 增补 | D4-1 状态表、D4-2 对 D1 表述的更正、D4-3 验收事实与覆盖位置、D4-4 未运行项 |

未改：`apps/web/src/presentation/**`、`public/design/**`、`view-contract.ts`、
公共契约、`apps/api`、根配置/CI/lockfile、`tests/e2e`（E 单写）、金标准与审批原件。

## 本轮修复的产品缺陷

### `abort()` 只中止信号，不递增请求身份

- **现象**：调用 `store.abort()`（取消/卸载/切场景）后，若底层传输已经收到响应而忽略
  abort（缓冲、代理、已排队的响应），那次**迟到的成功**仍会通过身份守卫落地成当前报告，
  等于「取消无效」。编辑/换书走 `setDraft` 不受影响，因为它们本来就递增身份。
- **复现**：`unabortableTransport` 挂起 → `store.abort()` → 放行成功 → 旧实现 `report !== null`。
- **修复**：`abort()` 复用 `invalidateInFlight()`，与编辑失效同一语义：身份递增、信号中止、
  `busy` 立即结束、失败路径不产生错误。
- **验证**：新增用例「abort() 之后即使底层忽略信号，迟到成功也不得成为当前报告」通过；
  `timeout.test.ts`（取消与超时区分）、`concurrency.test.ts`、`store.test.ts` 全部仍通过。

其余五个验收事实在既有实现中已成立，本轮用测试**复核而非复述**，未发现新问题。

## 输入版本与依赖

- 判据版本来自真实 API：`data = pingshui-…-review3`、`rules = teaching-v1`、
  `context = context-rules:11`、`works = works:3`（基线自带，本轮未改数据）。
- 本轮不含新增依赖；`package.json` / `pnpm-lock.yaml` 未改。
- 合成 fixture 仅用于业务单测，主路径仍走真实 API。

## 命令与实测结果

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile --config.node-linker=hoisted` | 0 | 8 个 workspace 工程 |
| `pnpm verify`（基线 `898b1a0`，dirty=false） | 0 | lint / 双 tsconfig / 测试 / 构建 / 8 个生成物全部通过；**53 文件 / 733 项** |
| `pnpm exec vitest run apps/web/tests`（改动后） | 0 | 业务测试全绿 |
| `pnpm verify`（改动后，dirty=false） | 0 | 同上；**54 文件 / 748 项**（+15） |
| `pnpm test:acceptance`（改动后，独立实跑） | 2 | **九格：通过 3 / 阻断 6 / 判错 0 / 未运行 0**；产物 `artifacts/acceptance/d3-api.json` |

计数口径：748 = 基线 733 + 本批 15，不重复计算既有用例。

验收 runner 的 exit 2 表示「有阻断项」，不是判错。6 个阻断全部是词林/新韵的
`LOOKUP_EVIDENCE_UNVERIFIED`（这两个库的候选尚未通过人工审核），与前端无关；
平水三首均 200（pass / not_applicable / fail）。本轮未把浏览器 18 通过说成九格全通过。

### 请求体断言（供 E 的浏览器用例对齐）

浏览器验收不能用「页面看起来对」代替请求体检查。状态层已钉住三个固定场景的
实际 POST 形状（`closeout-d4.test.ts` 末段）：

| 场景 | 钉住的请求事实 |
| --- | --- |
| 慢 A 后快 B | 两次 POST 的 `text`/`inputHash` 分别对应旧/新正文，且两 hash 不同；最终报告属于 B、`stale=false` |
| 30s 超时 | **只发 1 次** POST，无自动重试；`inputHash` 对应当时正文；错误码 `TIMEOUT` |
| 选音后换书 | 选音 POST 的 `readingOverrides=[{tokenId, readingId}]`、`inputHash=sha256(正文)`；换书后 `overrides=[]`，再提交时 `rhymeBook=cilin`、`readingOverrides=[]`、hash 不变 |

## 给 E 的三个确定场景（可直接做成浏览器用例）

### 场景 1：慢 A 后快 B

- **输入**：进入正式 `/`，正文填《登鹳雀楼》已批正文，平水韵。
- **触发**：点「分析」（请求 A）→ 在 A 返回前修改正文一次并再次点「分析」（请求 B）；
  用受控拦截把 A 延迟 3s、B 立即放行。
- **应观察的请求**：两次 `POST /api/v1/analyze`；A 的 `inputHash` 对应旧正文，
  B 的对应新正文；A 的响应即使后到也必须被丢弃。
- **最终状态**：`busy=false`；页面结论、复制摘要、下载 JSON 全部对应 **B**；
  A 迟到成功不改变结论，A 迟到失败不产生错误条；`stale=false`。

### 场景 2：真实 30 秒客户端超时

- **输入**：正式 `/`，任意已批正文，平水韵。
- **触发**：点「分析」，同时用拦截让该请求**永不返回**；等待约 30s。
- **应观察的请求**：1 次 `POST`，无第二次自动重试。
- **最终状态**：约 30s 后 `busy=false`，错误条含「分析超时」与「未展示任何旧报告结论」；
  正文保留；若此前已有成功报告，它仍可查看但复制/导出被阻止；重试成功后可恢复导出。

### 场景 3：候选选音后换书清覆盖

- **输入**：填《登鹳雀楼》（含「更」字，平水韵有两个候选），分析成功。
- **触发**：点「更」字 → 抽屉内点「改用此读音」→ 等重查成功 → 切到「词林正韵」。
- **应观察的请求**：选音那次 `POST` 的 `readingOverrides` 含
  `{tokenId, readingId}` 且 `inputHash` 等于当时正文的 SHA-256；换书后**不产生**新请求。
- **最终状态**：换书后旧报告 `stale`、`overrides` 清空、候选选中标记消失；
  再点「分析」发出的 `POST` 中 `readingOverrides` 为 `[]`、`rhymeBook=cilin`。

## 未运行项（不声称通过）

- 浏览器端并发/键盘/移动端验收：由 E 用 `pnpm test:e2e` 单写，本批不代跑。
- 真实触屏手势：无真机，未运行；移动视口仿真不等于真机。
- 真实三库全量审核后的 `/readyz=200` 路径：数据未完成全量审核，仍 503。
- 本批未新增截图；无视觉改动。

## 发现但不属于本批范围（交 Codex）

### 根 `README.md` 与当前实际的三处具体差异（附证据）

本批未改根文件，按任务卡「以具体差异交 Codex」。

| 位置 | 现文 | 实际 | 建议 |
| --- | --- | --- | --- |
| `README.md:44` | 「已知问题：黄鹤楼 l4c5"空悠悠"三平尾**现报 fail/error**……D3 批次一（Codex 特例适用层）待接入后修正」 | 已修正。真实 API 实测：`TAIL.SANPING` = **not_applicable / info**，命中特例 `exception:j03b2:huanghelou:l4:sanping:pingshui@1`；仍存的 `fail` 是 **`METER.POSITION` l4c5**（同文件第 42 行已归类为「其余偏离保持原判、整诗仍如实 fail」）。该行与第 42 行自相矛盾 | 删除该「已知问题」，或改写为「三平尾已转 not_applicable/info；l4c5 的 METER.POSITION 属其余偏离，保持原判」 |
| `README.md:71` | 「`tests/integration/` ……**Playwright spec 用独立 runner**」 | 仓库**没有** Playwright：`package.json` devDependencies 无该依赖，无 `playwright.config.*`。现役浏览器 runner 是 Node 内置 WebSocket + Chrome/Edge 的 CDP 脚本（`tests/e2e/d3-browser.mjs`，`pnpm test:e2e`） | 改成 CDP runner 表述，避免新人去找不存在的 Playwright 配置 |
| `README.md:78-87` 命令清单 | 列出 `test` / `typecheck` / `lint` / `build` / `generate:contracts` / `check:generated` / 两个 `--filter` | 根 `package.json` 还提供 **`test:e2e`**（浏览器验收）与 **`test:acceptance`**（九格真实 API 验收），清单未列 | 补两行，否则按 README 无法发现验收入口 |

补充（非错误，建议）：
- `README.md:24` 写 dev:web 是 5173「用 localhost 访问」。Vite 未设 `strictPort`，
  5173 被占用时会**自动换端口**；建议补一句「以终端打印的 Local 地址为准」，
  否则按固定端口打不开会被误判成服务没起来。

### 其它

- `/readyz` 503 与「可分析」的区分目前只在文档层面成立；若要在 UI 显示就绪状态，
  需要契约新增字段，属公共契约变更，本批不做。
