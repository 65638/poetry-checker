# UI 协作者同步入口

请每次开始前查看 main 分支本文件。Codex 在每个功能批次完成后更新这里的基线、接口变化、实测结果和同步命令。

## 最新可用版本

- 功能提交：`32e6184`（持续迭代批次23：对读分别检索选诗），包含前二十二批。
- main 随本同步记录一起推送；最新CI请查看 [Actions](https://github.com/65638/poetry-checker/actions)。前十九批CI均已成功，最近确认[批次19](https://github.com/65638/poetry-checker/actions/runs/39922384851)。
- 业务基线：1119测试 / 95文件，全量verify通过；推敲/对读/独立检索12浏览器场景通过（受控模型、真实API和浏览器），含320px。批次22跨功能复跑推敲11、收藏5场景均通过。
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

## 本轮并行边界（已延长至系统时间2026-10-23 09:30）

- UI协作者：展示设计、CSS、动效、布局与美术资源，主要在 `apps/web/src/presentation/`、`apps/web/public/design/`。
- Codex：业务算法、API、保存/检索/恢复、契约、测试和工程运行。新增组件会优先独立文件；每批在本文件注明接入点。
- `Workspace.tsx`、`LibraryContainer.tsx`、`PoetryDesk.tsx` 混合业务和布局，是交叉路径。UI如需改它们，请使用小范围补丁，保留props、事件、aria、已有测试选择器；合并前对照本文件最新一批。
- 56106的生产预览由Codex在验证后更新。UI用自己的预览端口，避免两个进程争抢或打开旧构建。

## 需要保留的行为

连续采纳建议后集中分析；旧报告有过期标识。改稿恢复有记录。失败/取消可重试，相同请求期间保留旧结果、不同诗文不串结果。字位悬停800ms后定位，点击/键盘即时响应。减少动态设置生效。320px布局可用。收藏、阅读记录、草稿、字号和静读偏好按原key保存。

## 批次16接入点（已交付）

- `RevisionPreview.tsx` 与独立 `revision-preview.css` 在炼字/同韵建议中提供“试读整句”和“展开整首试稿”；不更改草稿、不额外调用模型。字数改变有明确提示，不把同韵等同合律。
- 预览与实际采纳共用 `revisionPlan.ts`，保留此前已采纳改动，正确映射变长替换、前句偏移、扩展汉字；手改脱离路径或修改重叠时拒绝误套建议。
- `PoetryDesk.tsx` 仅增加插槽和共用采纳函数。可改视觉，请保留原诗快照、当前稿对比及无自动分析行为。
- 验证：1081单元测试；`tests/e2e/poetry-studio.mjs` 10场景。第一次浏览器启动早于构建完成而读到旧版，未计通过；构建结束后全套重跑通过，证据 `artifacts/continuous-improvement/batch16-studio-final/`。

## 批次17运行变更（已交付）

- `apps/api/src/model-queue.ts` 提供每个服务实例共用的有界FIFO队列：仍最多2项并发，额外4项可等待；不再让正常短时第三项任务立即429。等待超过容量仍明确返回繁忙，不无限积压。
- 辨音、评议、对读、荐字共用此入口；原请求超时从进入入口起计，排队/重试都不重置预算。取消时移出队列，不发上游；释放槽位幂等，防止取消/完成竞态超并发。
- 没有前端契约或样式变更。1086测试verify通过，含公平性、排队取消、满队列、排队后剩余期限；原有取消/重试/局部辨音4浏览器场景复跑通过。证据 `artifacts/continuous-improvement/batch17-cancel/`。

## 批次18接入点（已交付）

- `StudyQuestion.tsx` 与独立 `study-question.css`：折叠提问框和赏读/写作各自示例，选示例/输入不请求，仅“就此提问”发送。切换新原诗清空问题，不改变当前草稿、不重复主分析。
- `PoetryDesk.tsx` 接入独立提问表单，结果显示实际已提交的问题，继续编辑输入不改变旧回答的归属；收藏/分享保留问题及原诗，支持按问题检索。
- 共享critique请求增加可选`question`（1–240字符），hash与缓存包含它；旧请求无需此字段。提示要求先回应问题，阅读模式仍不改写，规则与来源约束不变。OpenAPI已更新。
- 1088测试verify通过（首次测试类型缩窄错误已修正），浏览器11场景通过。真实公开诗《鹿柴》“空山与人语是否矛盾”单次请求8544ms返回，回答围绕视觉/听觉的关系；不把该次结果作为文学准确率声明。

## 批次19接入点（已交付）

- 字典长诗AI辨音增加“上一批/继续辨析下一批”，每批24个多候选字位，始终发送完整原诗语境；不再要求用户手动拆段。字位编号保持原文位置，末批明确禁用继续。
- `ReadingAssistantContainer.tsx` 缓存当前原诗已完成批次，回看不发模型请求；失败/取消仍保留当前批，改原诗/韵书后清空。检测到数据版本变化则要求从首批重查。
- `ReadingAssistantView.tsx` 由Codex临时接管增加分页props与控件，完成后归还展示设计；保留`page/onPage`、按钮disabled和批次标签。仅小范围功能改动，没有全局样式改动。
- 请求新增可选`offset`；响应仅在请求提供offset时回显，客户端核对分页归属，旧标签页继续得到原严格字段。OpenAPI已更新。
- 1090测试verify通过，浏览器7场景通过，含50字位分24/24/2、故障后重试、缓存回看及320px。最后按钮文案/禁用条件调整后lint与build通过。证据 `artifacts/continuous-improvement/batch19-reading/`。

## 批次20运行变更（已交付）

- `apps/api/src/model-output.ts` 统一读取完整模型JSON：允许仅包在单一json/无语言代码框中的完整值，保留正文原样；不猜取混合说明、多段输出、不补标点、不恢复截断内容。
- 截断/内容过滤/空消息/非JSON上游响应提供具体中文错误；解码后继续执行原有Schema、字位、候选与出处校验。带代码框的虚构候选仍拒绝。
- 1110测试verify通过，含20项新增格式/服务联调检查。本批没有UI或契约变更，没有额外重试或增加模型调用。

## 批次21接入点（已交付）

- 完整评议中个别改字的位置/原字/替换字符不合法时，隐藏这些改字，保留总评和有效建议。阅读模式隐藏模型越界给出的改写，保持原作。Schema缺项、非法引文/候选仍失败，不猜补内容。
- 新客户端协商`validated-partial-advice`，服务端以可选`revisionNotice`说明隐藏条数和限制；旧标签页维持原拒绝行为与响应字段。模型不能自行填写该说明。OpenAPI已更新。
- `PoetryDesk.tsx` 使用现有notice样式显示说明；收藏/中文分享保留说明，不把校验通过当文学正确。替换字使用与解析器一致的表意汉字判据，排除部首等虚假字位。
- 1113测试verify通过，`tests/e2e/product-refinement.mjs` 11场景通过，含错误改字不提供采纳、原稿不变、收藏带隐藏说明；证据 `artifacts/continuous-improvement/batch21-recovery/`。

## 批次22接入点（已交付）

- `analysisSession.ts` 在sessionStorage暂存本标签页最近一份完整分析（最长2小时），刷新时校验完整契约/原文/hash/韵书/选音覆盖及内容校验和。只在当前草稿和选项完全一致、用户尚未操作时恢复；过大或存储受限则跳过，不影响原稿和正式报告。
- API为readyz和分析响应增加实例标识header；缓存绑定实际分析响应的实例，重启/更新服务即不恢复旧缓存。没有修改正文HTTP契约；旧服务缺header时自然跳过。初步读音/失败请求不当完整分析保存。
- `CheckerStore.restoreCompletedAnalysis` 以原子快照恢复；手动分析照常请求，并清除恢复标志。导出仍使用原请求与已生效覆盖。`main.tsx` 在正式页面接入，开发合成入口不启用。
- `Workspace.tsx` 增加可选`restoredAnalysis`传给PoetryDesk：恢复本身不自动触发新文学评议，明确提示可手动研读；随后主动分析仍自动评议。展示设计可调整提示位置，保留避免重复请求与竞态守卫。
- 1119测试verify通过；浏览器5场景通过：刷新0新增模型请求、主动重算、改稿/损坏缓存拒绝、模拟服务实例变化拒绝、sessionStorage配额失败仍可分析。证据 `artifacts/continuous-improvement/batch22-session/`。这是临时会话缓存，持久收藏/备份继续用原有功能。

## 批次23接入点（已交付）

- `ComparePoemPicker.tsx` 与专用 `compare-picker-search.css` 为左右卷提供各自题名/作者/正文检索（继承多条件检索语法）和只看收藏；键入只筛选，不换诗、不发AI。
- 下拉先列80个匹配项，并保留当前两卷及本侧最近5次选择；总匹配数可见，没有命中也不清空当前诗。减少两千多首双侧同时装入DOM的负担，不删除任何诗库内容。
- `LibraryContainer.tsx` 将旧select插槽换成独立组件，保留左右id、同诗提示、交换、键盘并读及选诗后失效旧AI结果行为。视觉可调整，保留明确的检索/选择步骤。
- 首轮浏览器发现最近所选退出前80后不便切回，加入近期选诗后完整复跑通过。1119测试verify、12浏览器场景及320px截图通过；证据 `artifacts/continuous-improvement/batch23-studio-final/`。

## 批次01接入点（已交付）

- `src/app/library.ts` 的 `searchLibrary` 公共签名不变，普通检索改用缓存的 `librarySearch.ts`；多词同时匹配，支持作者/题名/朝代/正文/标签与减号排除，诗境召回保持原规则。
- `LibraryContainer.tsx` 仅新增 `LibraryQueryHelp` import和筛选框前的折叠说明。UI可调整说明外观，但应保留示例点击后填入查询并聚焦输入框的行为。
- 新组件 `src/app/LibraryQueryHelp.tsx` 使用现有样式，无全局CSS修改。`src/api/library.ts` 增加网关/断网/资料不完整的中文提示，取消仍独立处理。
- 回归入口：`node --import tsx tests/e2e/library-search.mjs`，含320px布局。

## 正在进行的批次

后续继续优先AI使用体验。下一批改善改字体验：采纳前先试读整句与整首，让建议放回原诗语境；预览不改原稿、不发AI请求。UI可调整等待组件外观，不重做业务状态。

## 批次15评议分层（已交付）

- 修复系统把规则说明拼在overview前再截1600字的问题：新客户端保留完整AI总评，服务端格律依据放到可选 `Critique.ruleReview`（summary/reference/checks）。120条检查仍不会挤掉文学正文。
- `RuleReviewNote.tsx` 独立组件：先显示总评，再给简短检查口径；详细字位默认折叠。没有字位的模板待确认项改成完整中文说明，不出现空冒号。起式/首句用韵在上下文中用中文，不输出ping/ze/unrhymed。
- 请求头 `X-Poetry-Features: structured-rule-review` 协商新字段；旧标签页未发送时保持旧严格JSON结构，避免升级后解析失败。模型本身不得填写ruleReview冒充规则引擎依据。
- 分享/研读收藏将格律依据另列一节，保留全部有效说明；旧收藏仍可读。OpenAPI已生成。
- 1077项verify通过；最终无字位文案修正后相关API测试与5个浏览器场景再过，含折叠展开/320px可见截图。证据 `artifacts/continuous-improvement/batch15-study/`。

## 批次14研读收藏（已交付）

- 独立 `studyArchive.ts` / `StudyArchivePanel.tsx` / `StudyResultActions.tsx` / scoped CSS：收藏全诗评议、古文赏读、两诗对读，连同请求时原文保存，查找、离线查看、移除撤销、复制与TXT下载。最多60份；内容摘要去重，同诗不同评议各自保留。
- 分享用中文标题、原诗、评价、建议原因与取舍，不混入hash、字位ID、JSON或内部枚举。已采纳改字后收藏旧评议，仍保存它实际分析的原诗，不能错标成当前新稿。
- `usePoetryTask` 新增对应成功结果的 `resultInput`；PoetryDesk与LibraryContainer只插入小型操作组件。Workspace底部加入可折叠研读收藏，位于备份上方；样式需保留position/z-index以免背景景物遮住内容。
- 新key `poetry-study-archive-v1` 已加入完整备份白名单、校验/去重合并/新增数预览。存储失败不删旧记录、不报成功，可继续复制下载；恢复事件可刷新已挂载收藏区。
- 全量1073项通过；收藏4、推敲/对读10、备份4浏览器场景通过。窄屏首次截图发现背景遮挡，修正层级后重建并复跑收藏4场景，增加elementFromPoint可见性断言并核对截图。证据 `artifacts/continuous-improvement/study-archive/`、`batch14-studio/`、`batch14-backup/`。

## 批次13评议复用（已交付）

- `usePoetryTask.run(input, {reuse:true})` 可取回本会话内成功结果，PoetryDesk仅自动评议启用；完整请求包含原文、韵书、写作/赏读、侧重、正式格律依据，任一不同都不能误复用。
- `poetryResultCache.ts` 仅内存、最多12项、生成后15分钟过期。手动“重新评议”和失败重试绕过缓存；页面明确提示取回旧评议，可主动生成新建议。刷新后清除，不写本机私有数据。
- 1065项verify通过；product-refinement浏览器10场景通过，新增切换侧重即时取回/手动重评仍发请求/慢请求迟到不覆盖取回结果。证据 `artifacts/continuous-improvement/batch13-ai-cache/`。
- UI接入只有PoetryDesk自动调用的reuse选项和一行提示；请保留请求身份、取消和原诗快照逻辑。

## 批次12部分辨音（已交付）

- 模型只漏回部分目标字位时，保留其他逐项校验通过的建议；漏回位置不伪造AI建议，沿用原本地语境与候选，完整报告标partial并说明位置。查无候选的missingTokenIds仍只表示韵书缺录，与漏答分开。
- 零有效目标、目标外字位、冲突、错误候选仍拒绝；读音/拼音一致性校验不变。提示词增加requestedTokenIds核对清单，不额外生成或延长总预算。
- 1061项测试verify通过；浏览器4场景通过；25字位受控测试证明漏回1项仍保留24项、后续批次照常、漏回位置与本地分析完全相同。
- 发布后真实DeepSeek单次观察：本地读音396ms，最终24404ms，applied=3；只是一首真实冒烟，不是P95或文学准确率。证据 `artifacts/continuous-improvement/batch12-real-progressive.json`，浏览器证据 `batch12-partial/`。

## 批次11分阶段等待（已交付）

- 浏览器主分析请求以Accept协商NDJSON，默认JSON接口仍兼容。先返回本地标注readings，再返回result/error；服务端使用同一次查字/同一次AI任务，无重复推理。
- 新增 `PreliminaryReadings.tsx`，通过 `AnalysisWaitPanel` 展示原诗逐字平仄，明确“AI仍在核对，可能调整”。`Workspace`、main与DevShell接入可选 `preliminaryPoem`，不改展示契约或全局CSS。
- store的初步读音与成功report/requestSnapshot严格分开；取消、换诗、失败、完成时清除，禁止导出初步结果。客户端检查UTF-8分块、事件顺序、截断、大小和原文/韵书归属，旧服务返回JSON仍可用。
- 全量1060项通过。`tests/e2e/analysis-cancel.mjs` 增补慢模型期间先看平仄、没有正式报告、停止后清除的验证，3场景通过。证据 `artifacts/continuous-improvement/batch11-progressive/`。
- 真实DeepSeek单次观察：《登鹳雀楼》本地读音 **251ms** 返回，最终 **25401ms** 返回。该次模型字位返回不完整，最终使用本地分析回退，助手状态unavailable；不是AI成功样本或P95。证据 `batch11-real-progressive.json`。页面不再为了这次模型失败空等25秒。

## 批次10模型恢复（已交付）

- `apps/api/src/model-request.ts` 被读音/文学建议共同调用：连接TypeError与HTTP500/502/503/504最多重试一次；429只有明确且不超过2秒的Retry-After才重试，长等待直接交还可重试错误。
- 两次尝试共用原来的AbortSignal和总超时，不把90秒预算翻倍；取消发生在退避或迟到响应时均停止。成功HTTP200的无效内容不自动反复生成，401/403等权限错误不重试。
- 上游5xx文案改为临时故障，不再笼统要求检查余额/权限。外部错误正文与密钥不回显。
- 9个浏览器场景见 `tests/e2e/product-refinement.mjs`；47项首轮模型测试后补边界，最终全量1045通过。该行为适用于GLM与DeepSeek，未改变读音语义规则或候选范围。

## 批次09主分析等待（已交付）

- `AnalysisWaitPanel.tsx` / `analysis-wait.css` 通过Workspace的draftTools接入，延迟160ms展示，简短等待提示、真实计时、可展开的本次原诗、“停止等待”。不使用虚构完成百分比。
- Workspace新增可选 `onCancelAnalysis`（不是HTTP或共享Schema字段），生产入口 `main.tsx` 与开发 `DevShell.tsx` 绑定 `CheckerStore.cancelAnalysis()`。UI合并时务必保留该回调和取消按钮。
- 停止后递增请求身份、取消网络与排队更新，退回已提交选音；保留原文/成功快照，明确本次未更新。迟到成功不显示。现有卸载用abort语义不变。
- 回归：`node --import tsx tests/e2e/analysis-cancel.mjs`。该测试使用受控候选和慢模型，只验证请求取消及报告归属，不用于判断诗律正确性。

## 批次08错误提示（已交付）

- API客户端对“合法JSON但字段不完整”使用共享Schema验证后给出简短中文原因，分别说明研读、注音、查字或目录资料不完整。保留错误cause供调试，不把Zod字段清单显示给读者。
- `responseMessages.ts` 保留服务端具体解释，对对象/超长调试文本/HTML/堆栈使用可重试提示。断网与主动取消继续分开，来源不匹配仍拒绝显示，不降低任何读音候选校验。
- `tests/e2e/product-refinement.mjs` 新增不完整建议保留旧结果并可恢复的场景。懒加载后等待真实诗库载入再点击，避免把初始示例到全库的替换竞态当成点击故障。

## 批次07运行变更（已交付）

- `scripts/preview-assets.mjs` 为桌面preview补充旧版hash资源回退；`desktop-start.ps1` 将已发布的hash JS/CSS/字体/图片保留在StateDirectory/asset-cache。当前版本资源优先由Vite处理，旧页面可继续加载原有模块。
- 缓存不含index、配置、源码或密钥；只接受带hash的公开资源文件名。没有自动清理这些小型旧资源，避免打断仍开着的标签页。UI自己的开发服务器不受影响。
- 5个Node HTTP测试通过，纳入 `.github/workflows/ci.yml`（本批由Codex接管增加该单行检查，完成后归还配置维护）。6个Windows真实启动场景通过，新增旧资源跨发布仍可加载。
- 复现：`node --test tests/desktop/preview-assets.test.mjs` 与 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/desktop/launcher-smoke.ps1`。业务1011测试为上一批完整结果，本批脚本未冒充重复全测。

## 批次06接入点（已交付）

- `Workspace.tsx` 对字典/典籍馆使用独立 `DeferredSection.tsx` 的lazy组件；第一次访问才装载，访问过后保留实例。导航hover/focus仅预载代码，不挂载或发起诗库查询。保留 `visited`、容器key与active语义。
- `section-loading.css` 仅控制加载提示；代码加载失败时有独立重试说明，不清空校诗台。首次打开某分区需要网络；实际失败恢复场景通过。
- 回归：`node --import tsx tests/e2e/section-loading.mjs`；`node tests/e2e/dictionary-journey.mjs`；`node tests/e2e/continuous-garden.mjs`。
- `tests/e2e/cdp.mjs` 仅修正Windows浏览器启动时DevToolsActivePort文件短暂EBUSY/ENOENT重试，仍使用原有等待上限。首次连续场景运行因EBUSY中断，修复后4项均通过，未把第一次中断计为通过。

## 批次05接入点（已交付）

- `DraftCollectionPanel.tsx` / `draftCollection.ts` / 专用 `draft-collection.css`：命名保存当前诗稿，最多50篇；查找、预览、切换、移除/撤销。
- `Workspace.tsx` 的 `draftTools` 插槽增加稿匣。打开另一稿前先把当前尚未存档的非空稿写入稿匣，保存失败则不替换；切换进入推敲笺及撤销栈，不自动发分析或模型请求。相同正文+检查设置不重复存稿。
- 完整备份增加 `poetry-draft-collection-v1` 白名单和新增存稿计数，默认仍不替换当前输入。跨页storage事件刷新稿匣。
- 回归：`node --import tsx tests/e2e/draft-collection.mjs`。实测包括刷新保留、无自动分析、模拟浏览器存储满时不丢稿、320px。存储失败为明确受控测试，其余本机浏览器实际运行。

## 批次04接入点（已交付）

- `src/app/excerpts.ts`、`ExcerptsPanel.tsx`、`src/hooks/useExcerpts.ts` 与专用 `excerpts.css`：保留原段正文/出处，200条上限，重复摘录不覆盖笔记；检索、回原诗、复制、TXT导出、移除/撤销。分享不包含私人笔记，TXT与完整备份包含笔记。
- `LibraryContainer.tsx` 增加“摘句”tab，原有摘句按钮同时收藏与复制；页签切换保留尚未保存的随手记。异版正文/来源不匹配时禁止错误跳回原诗。可调整组件布局，保留保存/撤销和原作定位行为。
- `localBackup.ts` 将 `poetry-excerpts-v1` 纳入白名单，恢复预览增加摘句计数；兼容没有摘句的旧备份。同ID不同笔记拒绝覆盖。
- 回归入口：`node --import tsx tests/e2e/excerpts.mjs`，包含真实本机诗库与320px。模型调用为0；没有宣称文学判断质量。

## 批次03运行变更（已交付）

`scripts/desktop-start.ps1` 发布到 `%LOCALAPPDATA%/PoetryChecker/sites/` 后运行；`scripts/dev.mjs --preview` 支持 `POETRY_PREVIEW_DIST`。UI自己的 `pnpm dev` 用法不变。`pnpm build` 不会直接改变56106；本机验证后由Codex调用桌面脚本发布。后端源码、数据/规则、依赖清单、`.env.local`变更会改变整体指纹并重启API；只记录整体摘要，不复制或输出密钥。

Windows回归：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/desktop/launcher-smoke.ps1`。它使用56226/56227并在结束时停止自己的测试服务，不操作56106。

## 批次02接入点（已交付）

- `src/app/LocalBackupPanel.tsx` + `localBackup.ts` + `local-backup.css`：独立备份功能。CSS仅使用自身 `.pc-backup-*` 前缀，UI协作者可调整展示。
- `Workspace.tsx` 在阅读工具前接入该组件，并以 `restoredVersion` key重新装载字典、诗库和阅读工具；恢复草稿进入撤销栈，保留现有业务行为。移动入口可调整，但请保留 `getDraft/onRestored/disabled` 与证据弹层打开时的 `inert`。
- 导入先校验SHA-256及白名单结构，再预览和确认；默认保留当前输入。已有笺记、作品或收藏合并去重，冲突/超限拒绝，失败回退本次写入。请保留两个独立的“预览合并/确认合并”步骤与明确的草稿替换选项。
- 浏览器回归：`node --import tsx tests/e2e/local-backup.mjs`。新增功能不改变HTTP契约和韵书数据。
