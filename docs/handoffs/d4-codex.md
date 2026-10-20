# D4 Codex 技术接管与集成记录

日期：2026-10-20（Asia/Shanghai）。本文件记录 Codex 对 D4 集成分支的实际接管结果，不是全库批准或最终发布签字。

## 当前基线

| 项 | 实际值 |
| --- | --- |
| 分支 | `integrate/d4` |
| 完整 SHA | `ed84397fa702118d001371302984ace9690339db` |
| 工作树 | `dirty=false` |
| 集成父线 | D4 C/B/D 收口后的 `0b308dddf5ff2634b9884d54022edf6b3ef803ee` + `origin/main@c409d205d52efa9b359f39a81337d19fc12373b6` |
| 远端 ref | `origin/integrate/d4` 已更新到 D4 收口分支；最终发布前仍需按仓库 PR 流程确认 |
| 环境 | Windows；Node.js 24.19.0；pnpm 11.25.0 |

本次把远端 main 的有效 UI 合入现有 D4 C/B/D 收口历史，保留月下江山展示层及其证据；没有重复 cherry-pick，也没有 reset 或丢弃成员提交。A 的三库审批批次和 E 的完整系统矩阵仍未形成可合入分支。

## 实际验证

| 命令 | 原始结果 |
| --- | --- |
| `pnpm verify` | exit 0；56 文件 / 763 项通过；lint、双 tsconfig、构建、生成物一致性通过 |
| `pnpm test:acceptance --out artifacts/acceptance/d4-final-api.json` | runner exit 2，外层 pnpm exit 1；九格 3 通过 / 6 阻断 / 0 判错 / 0 未运行 |
| `pnpm test:e2e --out artifacts/acceptance/d4-e01-browser` | 19 通过 / 0 阻断 / 0 失败；包含 E05 并发提交归属场景 |

API 的 6 个阻断均为词林/新韵候选证据未审核（`LOOKUP_EVIDENCE_UNVERIFIED`），不是代码判错；平水三首分别为 `pass`、`not_applicable`、`fail`，黄鹤楼限定三平尾特例保留且其它偏离仍可导致整诗失败。E 批次 01 新增的唯一场景是受控 Fetch 延迟下 A/B 并发提交归属，最终导出与请求快照均归 B；运行证据归档在 `tests/integration/e2e/evidence/d4-e-01/`。

## 接管范围与归还条件

- Codex 接管根 README、交付/交接记录、根脚本与最终集成复核；D4 C/B/D 已合入的代码和测试保留原责任边界。
- A/B 继续负责三库候选、来源和语境审批；未获得组长具体确认前，不改变 `reviewStatus`、候选竞争关系或全库 readyz 门槛。
- E 继续单写 `tests/e2e`、`tests/integration` 和 08 台账；本记录只引用 E 证据，不代填联合验收账。E 批次 01 明确未运行迟到失败、真实超时恢复、五态浏览器覆盖、完整键盘主任务、干净 clone 与 G09 扩编。
- 新 UI 已由 `origin/main` 合入；本轮不追加视觉实现，后续只修复可复现的业务回归。

归还给组长的条件：A/B 交付可核审批批次，E 补齐缺口矩阵和干净 clone 证据，Codex 在最终合入 SHA 上复跑九格、浏览器和候选包检查。

## 保留限制

`/readyz` 当前仍为 503；有限三首样本不代表全库发布。性能、真触屏、完整超时矩阵、完整键盘矩阵和干净 clone 尚未形成当前 SHA 的独立证据。D5 需要保留至少半天做最终联调和彩排。
