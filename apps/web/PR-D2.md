# PR: D2 真实浏览器验收、错误行为与键盘矩阵（前端业务）

分支 `feat/d-d2-real-ui` → `main`。基线 `6375b35`（D1 终验）。

**范围**：只改 `apps/web` 业务层（`app/`、`api/`、`features/`、`hooks/`、`main.tsx`、
业务测试、`fixtures/mocks`、模块文档）。未改 `presentation/`、未改根配置/lockfile、
未新建第二份 view-contract。

---

## 一、本轮在真实浏览器里发现并修复的三个缺陷

前两项是 D1 遗留、`pnpm verify` / `tsc` / `vite build` **全部为绿**却真实存在的缺陷。
只有用 Chrome headless + CDP 真实渲染、真实点击才暴露。

### 1. 页面白屏 `Invalid hook call`（D1 遗留）

**现象**：dev 入口打开后 `#root` 长度 0、整页空白；
console 报 `Invalid hook call` + `TypeError: Cannot read properties of null (reading 'useMemo')`。

**原因**：本机手工 hoisted 安装产生了**三份 React**
（`apps/web/node_modules/react` symlink、根 `node_modules/react`、`.pnpm` 内一份），
Vite 在 dev 下把 symlink 那份与根那份视为两个模块实例。

**性质**：本机安装方式导致，**不是应用代码缺陷**。正常 `pnpm install` 不会出现。
删除两份 symlink 副本 + 清 `.vite` 缓存后恢复：`#root` 2983 字符、`.pc-root` 存在、零 console 错误。

> 建议：GLM 评估在 `pnpm-workspace.yaml` 统一 `nodeLinker`，避免 Windows 上各自处理。

### 2. DEV 场景装载路径少一级（D1 遗留）

**现象**：点开发场景按钮无反应；console 报
`DevScenarioUnavailable: 未找到开发场景：needs_review`。

**原因**：`app/devScenarios.data.ts` 的 `import.meta.glob` 写作
`../../../fixtures/mocks/*.json`，从 `apps/web/src/app/` 出发只到
`apps/fixtures/mocks`（不存在），应为四级 `../../../../fixtures/mocks/*.json`。

**为什么 D1 没发现**：生产构建时 glob 被折叠成空对象 `Object.assign({})`，
所以「生产包不含 fixture」这条断言一直是绿的；`verify`/`tsc`/`build` 都不触达 dev 装载路径。
**只有真实浏览器点一次场景按钮才暴露。**

**修复**：路径改为四级；新增 `dev-scenario-loading.test.ts` 8 项，
在 Vitest（同样走 Vite glob 转换）里真实装载五个场景，钉住这条链路。

**复验**：装载 `needs_review` → 20 字位、「待复核」结论、反馈
「已装载开发合成场景；报告不代表真实格律结论。」全部正确。

### 3. 375px 下 DEV 场景面板遮挡正式控件

**现象**：375px 视口里固定右下的场景面板盖住「平水韵」按钮与「分析」按钮。

**修复**：`DevShell.tsx` 改为 `<details>` **默认收起**的折叠条（标题「开发场景（DEV）」），
展开后 `maxHeight: 50vh` 并滚动。复验 375px：「平水韵」完整可见、分析按钮可点、无横向溢出。

---

## 二、真实浏览器视觉/布局验收（11/11）

Chrome 151 headless + CDP，真实输入、点击、读 DOM、截图。
截图与 JSON 结果在本地验收目录 `browser-shots/`（未入库；CDP 脚本见 `apps/web/HANDOFF-D2.md` 的说明）。

| 项 | 结果 |
| --- | --- |
| 初始渲染 | PASS `#root`=2983、`.pc-root` 存在 |
| 输入诗文（真实换行） | PASS 长度 23 |
| 点击「分析」 | PASS |
| 报告渲染 | PASS 20 个字位节点、结论文案、无错误条 |
| 点字位开证据 | PASS 抽屉打开，候选/韵部/来源可见 |
| Escape 关闭 | PASS 开→关 |
| 键盘可聚焦元素 | PASS 36 个，含 textarea |
| **375px 布局** | PASS `scrollWidth 375 = clientWidth 375`，无横向溢出 |
| **正式 UI 触控目标** | PASS **27 个按钮最小边 44px** |
| 1440px 布局 | PASS 无溢出 |
| console 异常 | PASS **零** |

> DEV 面板内 5 个场景按钮最小边 25px，仅 DEV 构建、不进生产包，不计入正式触控要求；
> 已列入「交 Codex 的展示缺口」。

---

## 三、键盘矩阵（D2-07，真实按键事件，13/13）

用 CDP `Input.dispatchKeyEvent` 发送真实按键，不是模拟 DOM 事件。

| 项 | 结果 |
| --- | --- |
| K1 初始渲染 | PASS |
| K2 **Ctrl+Enter 提交** | PASS 20 字位，textarea 保持焦点 |
| K3 Tab 前进 | PASS `INPUT → 分析 → 登鹳雀楼 → 静夜思` |
| K4 **焦点可见** | PASS `outline: solid 2px` |
| K5 Shift+Tab 回退 | PASS `静夜思 → 登鹳雀楼` |
| K6 聚焦字位 + **Enter** 开抽屉 | PASS 焦点进入面板、`page inert=true` |
| K7 模态语义 | PASS `aria-modal=true`、有可访问名称 |
| K8 **焦点陷阱** | PASS 6 次 Tab 均在面板内 |
| K9 Escape 关闭 | PASS 且解除 `inert` |
| K10 **关闭后焦点返回触发字位** | PASS `l2c4 → l2c4` |
| K11 Enter 激活按钮 | PASS |
| K12 无残留键盘陷阱 | PASS |
| K13 字位按钮 ARIA | PASS `aria-haspopup=dialog`、`aria-expanded`、完整 label |

### 多候选抽屉的键盘可达性

装载 `needs_review`（歧义字位 `l4c1`）后：抽屉内 **3 个可聚焦元素**
（关闭 + 2 个「改用此读音」），Tab 循环 候选1 → 候选2 → 关闭 → 候选1，焦点陷阱正确。

单候选字位抽屉里只有「关闭」是**正确行为**：展示层只在未选中候选上渲染选择按钮。

### 两处自我更正（避免误导）

1. 曾误判「Enter 打不开抽屉」为应用缺陷。实际是 CDP 用法问题：
   只发 `keyDown+keyUp` 不触发原生 click，必须 `rawKeyDown → char(text) → keyUp`。
   已用页面注入的原生 `<button>` 做对照（同序列点击次数 0）证明。
2. 曾误判「抽屉只有 1 个可聚焦元素」为可访问性缺陷。实际是单候选已生效的正确行为。

---

## 四、API 错误行为（D2-05，13 项）

`apps/web/tests/api-errors-d2.test.ts`：

- 503 / 422 / 413 / 404 / 500 各自映射稳定错误码，**文案可执行**
  （「稍后重试」「已保留」「未被接受」「2,000 上限」「不存在」）；
- 413 与 503 错误码与文案**不相同**（不能都显示成同一种失败）；
- 离线（fetch reject）→ `NETWORK_ERROR`，提示无法连接且输入已保留；
- 超时（`AbortSignal.timeout` / 服务端不响应）→ 不无穷加载，`busy` 恢复；
- **首次 503 不塞 fixture 报告**（`report === null`）；
- 有旧报告时新请求失败：旧报告标 `stale`、导出被阻止、正文保留；
- 422 后修正输入可恢复正常；
- 失败不破坏 `report` / `requestSnapshot` / `overrides` 的同源关系。

---

## 五、验证结果（本机实际执行）

```text
$env:PNPM_CONFIG_NODE_LINKER = 'hoisted'   # 本机 pnpm 符号链接限制，详见 HANDOFF-D2.md
pnpm verify                                → exit 0
  $ eslint .                               → 通过
  $ tsc --noEmit && tsc --noEmit -p apps/web/tsconfig.json → 通过
  $ vitest run                             → 431 passed / 30 files
  $ pnpm build && tsx scripts/generate-contracts.ts --check → 通过（8 个生成物一致）
```

生产构建复查：**所有 chunk 中 `fixture:group` / 合成正文零命中**，
无 dev chunk（`DevShell` 用变量化动态 import，打包器无法静态分析）。

431 = 基线 410 + 本轮 21 项（API 错误 13 + 场景装载 8）。

---

## 六、未完成 / 未声称通过

| 编号 | 项 | 状态 |
| --- | --- | --- |
| D2-01 | 真实 API（非 fixture） | **未执行**。`main` 上 API 仍为 fixture mock，真实编排在 `glm/d2-real-api`；等合入后用一首已审核真实诗联调 |
| D2-02 | 快速 A→B 请求、取消 | 单测覆盖；**浏览器端未做双请求时序** |
| D2-03 | 改原文后旧覆盖失效再选新音 | 单测覆盖；**浏览器端未操作真实选音按钮** |
| D2-09 | 复制/JSON 导出 | 单测覆盖；**浏览器端未点按钮验证剪贴板与下载** |
| D2-06 | 点诊断/救法/来源 | 证据抽屉已验证；粘对/救位因 mock `relations` 为空无法验收 |

**DOM 测试依赖**：jsdom / React Testing Library 仍未安装，本批未改根 lockfile。
本轮用 CDP 真实浏览器完成键盘矩阵，比 jsdom 更可信。

---

## 七、交 Codex 的展示缺口（未自行改视觉）

1. **DEV 面板按钮 25px**：`DevScenarioSelector` 内的场景按钮，建议 ≥32px 与正式控件一致。
2. **`:focus-visible` 统一**：已确认字位/按钮有 `outline: solid 2px`，
   但需确认所有可聚焦元素一致。
3. **粘对关系展示形态**：mock `prosody.relations` 为空，真实数据到位后需确认。
4. **示例入口**：`EXAMPLES.text` 仍为空、按钮 disabled，待 E 提供审核正文。

---

## 八、提交

| SHA | 内容 |
| --- | --- |
| `289f96f` | 真实浏览器验收 + 白屏修复 + 375px 遮挡修复 + API 错误行为 13 项 |
| `590138e` | DEV 场景 glob 修复 + 键盘矩阵 13 项 + 装载回归 8 项 |

交接文档：`apps/web/HANDOFF-D2.md`（本轮增量）、`apps/web/HANDOFF.md`（D1 历史）。
