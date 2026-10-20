# D4 开发基线发布记录

日期：2026-10-20（Asia/Shanghai）。分支：`integrate/d4`，PR 目标：`main`，保持草稿。此记录发布团队开发起点，不宣告 D4 完成或全库发布。

## 集成范围

- 完整本地成果 `a6f3942`，包含 D3 集成修复、Claude 展示及后续复核修复、D4 全套任务书。
- 合入远端 `main@05e1acb2c3c8b44e1540b10f0bc142b343c63313`，保留双方历史；无冲突、文件树无变化，没有重复 cherry-pick。
- 实测实现 SHA：`fca70d642b28927debaf2248fcfe05e4588eb36e`，执行时工作树干净。随后提交只添加本记录、证据和入口文档；远端最终文档 SHA 以 PR/head 为准。
- Codex 接管基线分支、根入口文档和本次验收归档；E 继续单写 D4 的 08 台账，请据此更新 G00。原任务包和 MANIFEST 保留为编制时快照，包内“待发布”已由本记录接续。

## 本次实际验证

Windows，Node `24.19.0`，pnpm `11.25.0`；独立工作树安装依赖，未使用旧 node_modules。

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm verify` | exit 0；53 文件、733 项测试通过；lint/类型/构建/8 个生成文件一致性通过 |
| `pnpm test:acceptance --out artifacts/acceptance/d4-baseline-api.json` | 3 通过、6 阻断、0 判错、0 未运行；runner exit 2，pnpm 包装进程 exit 1 |
| `pnpm test:e2e --out artifacts/acceptance/d4-baseline-browser` | exit 0；18 通过、0 阻断、0 失败；正式 `/` 路由、真实 API，含明确标识的受控网络故障场景 |

证据：[本次归档目录](../../tests/integration/e2e/evidence/d4-baseline/)。API JSON 为原始字节；浏览器 JSON 和工程日志仅将本地工作区路径、个人目录替换为占位符，详见归档 provenance.json 的原始/归档哈希，不冒充原始字节。截图保存到磁盘，未做本轮人工视觉审查。历史 UI 附加脚本本次未重复运行，不计入上述 18 项。

## 数据状态与保留阻断

| 资源 | 实际版本 |
| --- | --- |
| 平水 | `pingshui-cwr-ff0e9c1-d3-full-sanj-jiang-review4` |
| 词林 | `cilin-cwr-ff0e9c1-d3-full-clean1` |
| 新韵 | `xinyun-rebuild-d2-full` |
| 规则 | `teaching-v1+reviewed-works-v1` |
| 语境 / 作品 | `context-rules:11` / `works:3` |

平水三首返回 200：登鹳雀楼 `pass`、静夜思 `not_applicable`、黄鹤楼 `fail`（已审三平尾特例保留，其他偏离仍可导致整诗 fail）。

词林/新韵六格仍为 503 `LOOKUP_EVIDENCE_UNVERIFIED`，各诗首个阻断字分别为“白 / 床 / 昔”；这不是完整缺口清单。`/readyz` 为 503，mode=real，携带版本。没有改变审批状态、竞争候选或现有门槛；数据补审和语境补齐继续由 A/B 在 D4 推进。

当前验证覆盖开发基线，不替代全量验收、全库审批、干净远端 clone、跨系统启动或性能测试。新“月下江山”UI/指针/背景动效仅保留计划，本次未实施。

## 成员开始工作

已有未提交工作先保留在自己的分支或单独工作树，禁止 reset/discard。干净工作树执行（以 A 为例，其他人替换角色字母）：

```sh
git fetch origin
git switch -c feat/a-d4-closeout origin/integrate/d4
pnpm install --frozen-lockfile
pnpm verify
```

分支名已存在时先核对其工作，不强制覆盖。A–E 分别阅读 [D4 任务包](../team/D4_执行任务书_2026-10-20/00_组长先看_总控与历史迁移.md) 的 02–06 号，Codex 执行 07 号。所有交接记录实际起点 SHA；公共契约仍冻结，分支发布不授权成员更改审批原文。

现有用户预览仍来自原工作树；本次验收使用独立随机端口并已自行清理。不要把临时端口当团队部署地址。
