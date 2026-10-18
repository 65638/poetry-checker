# Web D2 交接：真实分析页面、错误行为与浏览器验收

日期：2026-10-18（D2）。执行者：队员 D + DeepSeek。
基线：`main` = `6375b35`（D1 终验，含 mock 坐标修复、CheckerView 正式装配、DEV 壳、
逐字谱/诊断/证据视图模型）。分支 `feat/d-d2-real-ui`。

D1 的实现与验证记录见 `HANDOFF.md`（同目录），本文件只记 D2 增量，避免覆盖历史。

## 一、本轮实测发现并修复的问题

### 0. DEV 场景装载路径少一级（D1 遗留，静态检查抓不到）

**现象**：点开发场景按钮无反应；控制台报

```text
[dev-scenario] 装载失败 DevScenarioUnavailable: 未找到开发场景：needs_review
```

**根因**：`app/devScenarios.data.ts` 的 `import.meta.glob` 写成
`../../../fixtures/mocks/*.json`。从 `apps/web/src/app/` 出发只到
`apps/fixtures/mocks`（不存在），应为 `../../../../fixtures/mocks/*.json`。

**为什么 D1 没发现**：

- `pnpm verify`、`tsc`、`vite build` 全部通过；
- 生产构建时 glob 被折叠成空对象 `Object.assign({})`，所以「生产包不含 fixture」
  这条断言一直是绿的；
- 只有真实浏览器点一次场景按钮才会暴露。

**修复**：路径改为四级，并加 `apps/web/tests/dev-scenario-loading.test.ts` 8 项，
在 Vitest（同样走 Vite 的 glob 转换）里真实装载五个场景，钉住这条链路。

**复验**：装载 needs_review 后 20 个字位、「待复核」结论、反馈文案
「已装载开发合成场景；报告不代表真实格律结论。」均正确。

### 1. 真实浏览器白屏（D1 遗留，此前完全未发现）

**现象**：Chrome headless 打开 dev 入口，`#root` 长度 0，页面全白；
console 报 `Invalid hook call` + `TypeError: Cannot read properties of null (reading 'useMemo')`。

**原因**：本机手工 hoisted 安装产生了**三份 React**：

```text
apps/web/node_modules/react        (SymbolicLink)
node_modules/react                 (目录)
node_modules/.pnpm/react@19.3.1/...
```

Vite 在 dev 下把 symlink 的那份与根目录那份当成两个模块实例，导致 hooks 失效。
**这不是应用代码缺陷**：`pnpm verify`、`vite build`、静态页面检查全部通过，
只有真实浏览器渲染会暴露。

**处理**：删除 `apps/web/node_modules/react` 与 `react-dom` 两份 symlink
（本机安装产物，非仓库内容），清 `.vite` 缓存后页面恢复：#root 2983 字符、
`.pc-root` 存在、无 console 错误。

**给其他成员**：正常 `pnpm install` 不会有这个重复。若在 Windows 上手动做
hoisted 布局，需保证只有一份 React。建议 GLM 评估在 `pnpm-workspace.yaml`
统一 `nodeLinker`，避免各人各自处理。

### 2. 375px 下开发场景面板遮挡正式控件

**现象**：375px 视口里，DEV 场景面板（固定右下）盖住了「平水韵」韵书按钮与「分析」按钮。

**处理**：`app/DevShell.tsx` 把面板改成 `<details>` **默认收起**的折叠条
（标题「开发场景（DEV）」），展开后限制 `maxHeight: 50vh` 并滚动。
复验 375px：「平水韵」完整可见、分析按钮可点、无横向溢出。

## 二、真实浏览器验收（Chrome 151 headless + CDP）

用 `chrome --headless=new --remote-debugging-port` + Node 内置 WebSocket 直连 CDP，
不是只看 HTTP 200：真实输入、真实点击、真实按键、读 DOM、抓截图。

驱动脚本：`C:\Users\lenovo\Documents\deepseek-harness\default-workspace\cdp-d2.mjs`
（不在仓库内，属于本地验收工具；如需入库请告知）。

| 编号 | 操作 | 结果 | 证据 |
| --- | --- | --- | --- |
| 初始渲染 | 打开 `http://127.0.0.1:5180/` | **PASS** `#root`=2983、`.pc-root` 存在、无 JS 异常 | `browser-shots/screenshot.png` |
| 输入诗文 | 向 textarea 注入 4 句（真实换行） | **PASS** 长度 23、含换行 | - |
| 点击分析 | 点「分析」按钮 | **PASS** 发出请求 | - |
| 报告渲染 | 等待响应 | **PASS** 20 个字位节点、结论文案出现、无错误条 | `d2-04-report.png` |
| 点字位 | 点第 1 字 | **PASS** 证据抽屉打开、有候选/韵部文案 | `d2-06-evidence.png` |
| Escape 关闭 | 发 Escape | **PASS** 抽屉由开→关 | - |
| 键盘可聚焦 | 统计可见 focusable | **PASS** 36 个，含 textarea | - |
| 375px 布局 | 视口 375×720 | **PASS** scrollWidth 375 = clientWidth 375，无横向溢出 | `d2-08-375.png` |
| 正式 UI 触控 | 375px 下量可见按钮 | **PASS** 27 个按钮最小边 **44px** | - |
| 1440px 布局 | 视口 1440×900 | **PASS** 无溢出 | `d2-08-1440.png` |

**11/11 通过，0 失败，无 console 异常。**

### 未达 44px 的元素（不在正式 UI）

开发场景面板里的 5 个场景按钮最小边 **25px**（`pass · 必检项通过` 等）。
它们只存在于 DEV 构建，**不进生产包**，因此不计入正式触控要求；
但仍建议收敛到 32–44px，见「交 Codex 的展示缺口」。

### 仍未覆盖的验收项（不声称通过）

| 编号 | 项 | 状态 |
| --- | --- | --- |
| D2-02 | 快速 A→B 请求、取消 | **单测覆盖**（store/concurrency 已有）；浏览器端未做双请求时序 |
| D2-03 | 修改原文后旧覆盖失效再选新音 | **单测覆盖**；浏览器端未操作真实选音按钮 |
| D2-01 | 真实 API（非 fixture） | **未执行**：main 上 API 仍是 fixture mock，真实编排在 `glm/d2-real-api` |
| D2-09 | 复制/JSON 导出浏览器行为 | **单测覆盖**；浏览器端未点按钮验证剪贴板与下载 |

## 二·五、键盘矩阵（D2-07，真实按键事件）

第一版驱动脚本用 `keyDown + keyUp` 派发 Enter，结果字位按钮打不开抽屉。
**用页面注入的原生 `<button>` 做对照后确认这是 CDP 用法问题**：只发
`keyDown+keyUp` 不会触发原生 click，必须 `rawKeyDown → char(text) → keyUp`。
换成正确序列后 Enter 激活恢复正常——**不是应用缺陷，已更正**。

修正后用真实按键事件跑完整矩阵（`cdp-keyboard.mjs`）：

| 编号 | 项 | 结果 |
| --- | --- | --- |
| K1 | 初始渲染 | PASS `#root`=2983 |
| K2 | **Ctrl+Enter 提交** | PASS 20 字位，textarea 保持焦点 |
| K3 | Tab 前进 | PASS `INPUT → 分析 → 登鹳雀楼 → 静夜思` |
| K4 | **焦点可见** | PASS `outline: solid 2px` |
| K5 | Shift+Tab 回退 | PASS `静夜思 → 登鹳雀楼` |
| K6 | 聚焦字位 + **Enter** 开抽屉，焦点进入面板 | PASS `trigger=l2c4`、`focusInside=true`、`page inert=true` |
| K7 | 模态语义 | PASS `aria-modal=true`、有可访问名称、初始焦点在关闭按钮 |
| K8 | **焦点陷阱** | PASS 6 次 Tab 均在面板内 |
| K9 | Escape 关闭 | PASS 抽屉关闭且 `page inert` 解除 |
| K10 | **关闭后焦点返回触发字位** | PASS `l2c4 → l2c4`，`aria-label=第2句第4字「仄」，仄` |
| K11 | Enter 激活分析按钮 | PASS |
| K12 | 无残留键盘陷阱 | PASS |
| K13 | 字位按钮 ARIA | PASS `aria-haspopup=dialog`、`aria-expanded=false`、可访问名称完整 |

**13/13 通过，无运行时错误。** 截图 `kb2-01-submit.png`、`kb2-02-drawer.png`、
`kb2-03-focus-return.png`。

### 多候选抽屉的键盘可达性（用 needs_review 场景复验）

装载 needs_review（歧义字位 `l4c1`，`aria-label` 含「未定，读音待定」）后：

- 抽屉内可聚焦元素 **3 个**：`✕ 关闭` + 2 个「改用此读音」；
- Tab 循环：候选1 → 候选2 → 关闭 → 候选1（**焦点陷阱正确，不是困死**）；
- 无控制台错误。

补充说明：单候选字位（如 `l2c4` 只有唯一生效候选）抽屉里只有「关闭」一个可聚焦
元素，这是**正确行为**——展示层只在「未被选中的候选」上渲染选择按钮，
唯一候选已生效时无需再选。

## 二·六、两处自我更正（避免误导后来者）

### 1. 「Enter 打不开抽屉」是 CDP 用法问题，不是应用缺陷

第一版驱动脚本用 `keyDown + keyUp` 派发 Enter，结果字位按钮不打开抽屉，我一度
判为展示层可访问性缺陷。为了确认，我在页面里注入一个**原生 `<button>`** 做对照，
用同样的事件序列发送 Enter——**原生按钮的点击次数也是 0**。

结论：CDP 里只发 `keyDown`+`keyUp` 不会触发原生 click，必须
`rawKeyDown → char(text) → keyUp`。换成正确序列后 Enter 激活完全正常。
**应用代码没有这个问题**，相应结论已在键盘矩阵中更正为 PASS。

### 2. 「抽屉只有 1 个可聚焦元素」是单候选的正确行为

`l2c4` 只有一个已生效候选，抽屉里只有「✕ 关闭」可聚焦，我一度判为「候选无法键盘选择」。
用 `needs_review` 的歧义字位 `l4c1` 复验后：抽屉内有 3 个可聚焦元素
（关闭 + 2 个「改用此读音」），Tab 循环正常。

原因：`EvidencePanel` 只在「未被选中的候选」上渲染选择按钮
（`{!isSelected && <button>}`），唯一候选已生效时本就不需要再选。
**这是正确行为**，不是缺陷。

> 保留这两条记录，是因为它们说明：**自动化驱动脚本本身也可能产生假阳性**，
> 下结论前要用对照实验区分「应用缺陷」与「工具用法问题」。

## 三、错误行为测试（D2-05）

新增 `apps/web/tests/api-errors-d2.test.ts` 13 项：

- 503 / 422 / 413 / 404 / 500 各自映射到稳定错误码，**文案可执行**
  （「稍后重试」「已保留」「未被接受」「2,000 上限」「不存在」）；
- 413 与 503 的错误码与文案**不相同**（不能都显示成同一种失败）；
- 离线（fetch reject）→ `NETWORK_ERROR`，提示无法连接且输入已保留；
- 超时（`AbortSignal.timeout` / 服务端不响应）→ 不会永远挂着，`busy` 恢复；
- 首次 503 **不塞 fixture 报告**（`report === null`）；
- 有旧报告时新请求失败：旧报告标 `stale`、导出被阻止、正文保留；
- 422 后修正输入可恢复正常；
- 失败不破坏 `report` / `requestSnapshot` / `overrides` 的同源关系。

## 四、执行命令与结果

```text
pnpm verify
  $ eslint .                                        → 通过
  $ tsc --noEmit && tsc --noEmit -p apps/web/...    → 通过
  $ vitest run                                      → 431 passed / 30 files
  $ pnpm build && tsx scripts/generate-contracts.ts --check → 通过（8 个生成物）
```

431 = 基线 410 + 本轮 21 项（API 错误行为 13 + 开发场景装载回归 8）。

浏览器验收：见上表，Chrome 151.0.7922.109 / 视口 1414×800（1440 档）、375×720。

## 五、交 Codex 的展示缺口（不自行改视觉）

1. **开发场景面板按钮 25px**（`DevShell.tsx` 内的 `DevScenarioSelector`，属我方文件，
   但样式可统一由设计 token 决定）→ 建议 ≥32px，与正式控件一致。
2. **`:focus-visible` 统一**：已实测字位按钮有 `outline: solid 2px`，
   但仍需确认所有可聚焦元素一致（本轮只抽样验证）。
3. **粘对关系展示形态**：当前 mock 的 `prosody.relations` 为空，UI 只能显示「未提供」；
   真实数据到位后需确认展示形态。
4. **示例入口**：`EXAMPLES` 的 `text` 仍为空，按钮 disabled；待 E 提供审核正文。

> 原先列为缺口的「抽屉焦点陷阱与焦点返回」已在键盘矩阵中**实测通过**
> （K8 焦点陷阱、K10 焦点返回 `l2c4 → l2c4`），不再是缺口。

## 六、待办

1. **真实 API 联调**：等 `glm/d2-real-api` 合入后，用一首已审核真实诗跑 D2-01；
   届时确认 `versions.data` 不是 `fixture-only`、正文/韵书/版本一致。
2. **浏览器端 D2-02/03/09**：双请求时序、真实选音按钮点击、剪贴板/下载按钮，
   目前只有单测覆盖。
3. **DOM 测试依赖**：jsdom + React Testing Library 仍未安装（**请 GLM 统一安装**，
   我不改根 lockfile）。不过本轮的 CDP 真实浏览器键盘矩阵比 jsdom 更可信，
   后续同类验收优先用浏览器。
4. **E2E**：由 E 管理 `tests/e2e`；我只按约定补选择器/操作，不自建第二套框架。
5. 浏览器验收脚本 `cdp-d2.mjs` / `cdp-keyboard.mjs` 若要长期保留，建议放到
   `scripts/` 或 `tests/browser/`，但这两处不在我本批写入范围，等组长分配。
