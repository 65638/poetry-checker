# D3 前端业务交接（队员 D）

- **任务书**：D3 示例接入与正式页面业务闭环
- **base**：`f42172f`（main）
- **分支**：`feat/d-d3-live-flow`
- **写入范围**：`apps/web/src/app`、`src/api`、`src/features`、`src/hooks`、`src/main.tsx`、
  业务测试、示例、模块说明、`tests/e2e` 中我方驱动脚本与 artifacts
- **未动**：`apps/web/src/presentation/**`（Claude）、`view-contract.ts`、根配置/lockfile、`apps/api`

详细记录见 [`apps/web/HANDOFF-D3.md`](../../apps/web/HANDOFF-D3.md)。

## 已完成

1. **示例正文接入**：三首改为已批准固定正文（`tests/golden/cases/*.json`，
   `reviewStatus=approved`；仅题名+正文；逐字照抄含标点）。
   指纹与 `data/works/metadata.json` 的 `approvedTextFingerprints` 一致；
   新增 11 项测试钉住「与 golden 逐字一致」「异文不被采用」。
2. **示例操作语义**：沿用 `loadExample` → `setDraft`，保留当前韵书与体裁/体式，
   不强制回平水、不注入 mock；旧报告 stale、旧覆盖失效由既有机制负责。
3. **客户端请求超时**（新修）：默认 30s，超时按可重试失败处理并与用户取消区分；
   新增 7 项测试。
4. **真实页面验收**：D01–D06 用真实 API（review3，非 fixture）+ 真实 Chrome/CDP；
   D07–D09 用故障注入 + 三档视口 + 键盘 + reduced-motion。
   证据分目录存放：`tests/e2e/artifacts/d3-real-api/`、`tests/e2e/artifacts/d3-faults/`。

## 结果

| 类别 | 结果 |
| --- | --- |
| `pnpm verify` | exit 0，592 项测试 / 45 文件 |
| D01–D06（真实 API） | 17/18 通过 |
| D07–D09（故障/视口/无障碍） | 14/14 通过 |

真实 API 实测（非 fixture）：登鹳雀楼 200/pass/20 字位/36 checks；
静夜思 200/not_applicable/20；黄鹤楼 200/**fail**/56 字位/96 checks + `特殊拗律` 标签。

## 阻塞（需 Claude/Codex，组内转发）

### B1 单行正文 → 报告出现竖排重叠文字（严重）

- 复现：任一示例（单行含标点）→ 分析 → 报告区竖排重复诗句压住批注区。
- 根因：`presentation/components/ReportView.tsx` 的 `trailing()` 在「无下一字位且无换行」
  时切到 `original.length`；调用处只在**本句内**找下一字位，故每句末字都取到全文剩余。
- 建议：按**全诗顺序**取下一 token；仅全诗最后一字才切到结尾。
- 影响面：所有直接粘贴整首诗（单行）的用户；D2 未暴露是因为当时提交多行正文。

### B2 `historicalTags` 从未渲染

- `ReportView.tsx` 无该字段引用；黄鹤楼 API 返回 `["七律","特殊拗律","半古半律"]`。
- 任务书要求保留七律特殊性；需在报告口径区展示，且不得改判定等级。

## 待办

1. E 接管 `tests/e2e` 单一 runner 与 artifacts 命名；三个 probe 脚本仅用于定位可删。
2. B1/B2 修复后，从正式入口复验 `d3-real-flow.mjs` 与三档视口截图。
3. Codex 修黄鹤楼异常规则后，复验 D03 的真实诊断展示。

## 复现

```sh
PNPM_CONFIG_NODE_LINKER=hoisted pnpm install --frozen-lockfile --config.node-linker=hoisted
PNPM_CONFIG_NODE_LINKER=hoisted pnpm verify
node tests/e2e/d3-real-flow.mjs
node tests/e2e/d3-faults-a11y.mjs
```
