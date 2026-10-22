# UI 协作者同步入口

请每次开始前查看 main 分支本文件。Codex 在每个功能批次完成后更新这里的基线、接口变化、实测结果和同步命令。

## 最新可用版本

- 功能提交：`4de5102`（四小时迭代批次02：本机备份与合并恢复），包含批次01 `6514af6`。
- main 随本同步记录一起推送；最新CI请查看 [Actions](https://github.com/65638/poetry-checker/actions)。批次01的[CI已通过](https://github.com/65638/poetry-checker/actions/runs/39906047813)。
- 本地验证：996测试、lint/类型/构建/生成物检查通过；备份新增浏览器4场景通过（真实下载/IndexedDB/localStorage、默认合并、草稿恢复后撤销、损坏文件拒绝、320px无溢出）。
- 本机预览：`http://127.0.0.1:56106/`。桌面入口指向 `work/main-closeout`，Codex维护此预览。

## 拉取更新

在你自己的工作树/分支执行，先保留自己的改动：

```powershell
git status --short
# 有未提交改动时，先检查并提交你的源码；不要把密钥、生成物或临时文件放入提交。
git fetch origin
git merge origin/main
pnpm install --frozen-lockfile
pnpm verify
```

只需要更新一个干净的 main 检出时可使用 `git pull --ff-only origin main`。有冲突时逐项保留双方功能，不能用reset/clean或整文件选某一边覆盖。推送时使用自己的分支，附提交号/PR与变更清单，供合并验证。

UI独立预览请选其他端口，例如：

```powershell
$env:PORT='56217'
$env:WEB_PORT='56216'
pnpm dev
```

## 本轮并行边界（至北京时间2026-10-23 09:19）

- UI协作者：展示设计、CSS、动效、布局与美术资源，主要在 `apps/web/src/presentation/`、`apps/web/public/design/`。
- Codex：业务算法、API、保存/检索/恢复、契约、测试和工程运行。新增组件会优先独立文件；每批在本文件注明接入点。
- `Workspace.tsx`、`LibraryContainer.tsx`、`PoetryDesk.tsx` 混合业务和布局，是交叉路径。UI如需改它们，请使用小范围补丁，保留props、事件、aria、已有测试选择器；合并前对照本文件最新一批。
- 56106的生产预览由Codex在验证后更新。UI用自己的预览端口，避免两个进程争抢或打开旧构建。

## 需要保留的行为

连续采纳建议后集中分析；旧报告有过期标识。改稿恢复有记录。失败/取消可重试，相同请求期间保留旧结果、不同诗文不串结果。字位悬停800ms后定位，点击/键盘即时响应。减少动态设置生效。320px布局可用。收藏、阅读记录、草稿、字号和静读偏好按原key保存。

## 批次01接入点（已交付）

- `src/app/library.ts` 的 `searchLibrary` 公共签名不变，普通检索改用缓存的 `librarySearch.ts`；多词同时匹配，支持作者/题名/朝代/正文/标签与减号排除，诗境召回保持原规则。
- `LibraryContainer.tsx` 仅新增 `LibraryQueryHelp` import和筛选框前的折叠说明。UI可调整说明外观，但应保留示例点击后填入查询并聚焦输入框的行为。
- 新组件 `src/app/LibraryQueryHelp.tsx` 使用现有样式，无全局CSS修改。`src/api/library.ts` 增加网关/断网/资料不完整的中文提示，取消仍独立处理。
- 回归入口：`node --import tsx tests/e2e/library-search.mjs`，含320px布局。

## 正在进行的批次

Codex批次03：改进桌面版本发布，让网站使用明确发布的构建快照，开发中的build不直接影响正在使用的页面。主要修改scripts，不涉及UI设计。

## 批次02接入点（已交付）

- `src/app/LocalBackupPanel.tsx` + `localBackup.ts` + `local-backup.css`：独立备份功能。CSS仅使用自身 `.pc-backup-*` 前缀，UI协作者可调整展示。
- `Workspace.tsx` 在阅读工具前接入该组件，并以 `restoredVersion` key重新装载字典、诗库和阅读工具；恢复草稿进入撤销栈，保留现有业务行为。移动入口可调整，但请保留 `getDraft/onRestored/disabled` 与证据弹层打开时的 `inert`。
- 导入先校验SHA-256及白名单结构，再预览和确认；默认保留当前输入。已有笺记、作品或收藏合并去重，冲突/超限拒绝，失败回退本次写入。请保留两个独立的“预览合并/确认合并”步骤与明确的草稿替换选项。
- 浏览器回归：`node --import tsx tests/e2e/local-backup.mjs`。新增功能不改变HTTP契约和韵书数据。
