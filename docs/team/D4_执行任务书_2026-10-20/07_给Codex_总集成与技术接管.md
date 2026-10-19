# Codex D4：接管GLM、统一基线与最终技术收口

组长本轮要求：D3及更早全部遗留统一并入D4，暂时抛开UI。你负责执行和集成，GLM不再是关键等待项。此文档是待执行任务，编制文档本身不表示你已完成下面工作。

## 0. 核查与统一基线（第一优先）

当前完整本地checkout：`C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/work/d2-closeout`。代码基线 `4d39037`，其后为本任务包提交。现有用户预览正在该checkout运行，不切它的代码或停止服务。

编制时fetch成功：origin/main=`05e1acb`，origin/codex/d3-b-integration=`7918281`；main相对本地还有一个merge节点，本地又有53个祖先差异提交。不得凭一句“在main上”跳过Git关系。

1. 读AGENTS、ownership、README/HANDOFF及本包；fetch并检查真实最新图、diff、PR和所有工作树。保留现有未提交文件，不能reset。
2. 用独立集成worktree建立 `integrate/d4`，从当前完整本地HEAD继续，纳入最新main的有效内容并处理仅合并历史差异；以实际merge-base和文件差异判断，不重复cherry-pick旧PR。
3. 只处理基线必需冲突，不新增UI设计；保留现有修复。运行verify、真实API起点和浏览器；六格数据阻断应如实保留，不能为了基线绿而降门槛。
4. 按仓库流程发布可拉取的远端分支/草稿PR，并在 `docs/handoffs/d4-baseline.md` 写实际SHA、版本、命令结果。不要自动合main。发布前完成本地具体检查；若工具实际拒绝则说明原因，不伪称已推送。
5. 组长据此广播SHA；A–E从该ref建各自分支。用户要求迁移排期不等于已经执行了上述Git集成。

## 1. 本轮单写责任

- Codex：根package/lock/config/CI、apps/api、scripts/dev.mjs与验收基础设施scripts/acceptance-runtime.mjs、core及已审特例层、共享文档、最终打包。
- A：lexicon/数据/数据生成脚本；B：readings/context；C：独立规则验收/报告适配/规则卡；D：前端业务及其测试；E：tests/e2e、integration、golden、作品/体裁、08台账。
- `presentation`新设计暂停。现有功能回归真有bug时由你接管指定文件修，不能趁机实现月下江山。GLM回来也须由你明确转交文件后再写。
- 每次接管写 `docs/handoffs/d4-codex.md`：范围、原写入方暂停、输入、实际结果、归还条件。不可默认为可以同时替A/B/E改同一路径。

## 2. 关键执行批次

### 批次一：合法数据与API接线

接A候选与组长实际确认，核对版本/源字节/批准范围；接B context三件套并检查候选ID/来源闭合。先一作品一本书集成，再扩展。有效范围仍限定候选，不扩大成整部或全库。新的snapshot-manifest、错误HTTP映射和readyz版本要与实际加载一致。

三书当前版本见本包09。有限候选获批后，三首可能200而readyz仍503；不得将整库reviewStatus改approved来“解决”就绪。审批记录改变后的派生快照由A生成，你独立核验。

### 批次二：系统与核心缺陷

C交正反例后你修core；D/E交业务或HTTP最小复现后按边界接管。保持unknown、歧义、未审证据的语义；整诗fail不能为演示好看改pass。保留既定10个ruleId与解释引用，不增加另一套报告协议。

### 批次三：启动、CI与性能

核查 scripts/dev.mjs 的Windows路径、shell依赖、端口冲突与子进程生命周期：只读源码时已可见 `new URL(...).pathname` 等跨平台风险，必须真实启动验证后修，别宣称所有机器必然故障。让停止父进程能回收它自己的服务，不能杀全局node。新增启动命令需要实现后再写README。

CI以实际ref检查；已有手动acceptance工作流可复用，保留失败/阻断原始JSON及产物上传；不得以continue-on-error把阻断变发布通过。E的runner单写期间，你只改根脚本接线与工作流。

性能：在已批准且HTTP200的20–56字样本上做热身与重复测试，记录硬件、并发、样本数、冷热启动、后端P50/P95、失败/503数量。原目标P95≤500ms需实测；503快速返回不能计入成功性能达标。测量没跑写未运行。

### 批次四：交付和复核

接E干净clone证据；准备锁定版本的候选包、运行说明、API/架构/规则/来源/限制说明、SHA清单与演示备份。回填过时README/HANDOFF顶部状态，保留历史记录与原审批。旧PR只有确实无独有内容且流程允许时再关闭，不能凭旧报告整批关闭。

## 3. 验收门槛

固定Node24.19.0/pnpm11.25.0，实际跑verify、九格真实API、正式首页浏览器，保留原始exit及版本。最近733/18是参考不是最低凑数或当前任务结果。数据变化后必须在最终集成SHA复跑受影响验证。

本次打包应包含README、锁文件、必要原始/规范化数据、审批范围、版本清单和可运行代码；不夹带密钥、node_modules、临时profile、个人路径日志。原始数据的授权边界不明确时明确标识并处理，不编许可证。离线说明要区分“装好依赖后可离线运行”和“完全离线安装”，未准备依赖缓存不能宣称后者。

成员阻塞30分钟收复现，60分钟接管最小目录；不能把所有任务收回自己串行做。D4结束明确已过/失败/阻断/未跑及D5任务，不因截止而标全部完成。

## 4. 输出

`docs/handoffs/d4-baseline.md`、`d4-codex.md`；候选交付说明写 `docs/delivery/d4/release-status.md`。E单写08表，你给独立复核结论。最终main合并/发布按仓库流程与组长既有授权执行，不能把本任务书当已给出最终发布批准。
