# 产品扩充与完善（2026-10-23）

用户授权扩充原网站、改进功能并优化表达。本轮由 Codex 单写整合，基线为 main@8c98d16 加当前展示版 a0bef50，以及 glm-reading 中已有的格律条件传递和 DeepSeek 完成预算修复。原工作树与未跟踪证据保留，复制有效源文件到 main-closeout 后验证，不以旧 main 覆盖展示版。

接管范围：apps/web 的业务、展示、测试；必要的 API/契约修复；scripts 下桌面启动支持及回归；本文件与功能文档。原职责方在本轮范围内暂停写入，验收后按原所有权归还。无韵书条目或审批修改。

## 交付

- 典籍馆记录最近12篇阅读，刷新后可重新打开原诗；整诗复制和TXT下载保留题名、作者、正文与来源。
- 原诗、对读、待分析诗文和推敲对比支持三档字号；字号和静读背景偏好本机保存。
- 推敲笺可搜索诗句/原因、只看改动，展开完整原稿/此版和逐行增删；支持恢复修改前、复制此版，沿用原有80条上限和导入导出。
- 文学助手显示等待时长、取消状态和重试入口；相同请求再次研读时保留旧结果，换输入不沿用上一首。客户端105秒，比服务端DeepSeek90秒阶段多15秒回退传输余量。取消后的迟到结果不更新页面。
- 分析错误直接提供重新分析按钮，技术代码收进详情；格式区增加平仄、多音字和条件诊断的简明说明。
- 集成已有DeepSeek 16384完成预算修复，以及韵书/声调/体式条件传递、简评条件表达和校验。原交接中的真实调用结果属于上一轮；本轮另做一次真实调用，见下。
- 新增Windows启动脚本，使用已有Node运行时/依赖/构建，避免运行阶段依赖pnpm；复用自己健康的进程、核对构建、遇端口占用选空闲端口。桌面入口已指向main-closeout，旧Start.ps1另存带时间的备份。
- 更新使用指南和过期的启动/readyz说明，澄清本机浏览器记录按网址保存、参考分析不等于全库审核。

## 实测结果

执行基线为 `a0bef50` 加本轮工作区改动，受控浏览器结果记录 `dirty: true`。截图/JSON位于本机 `artifacts/product-refinement/`，该目录包含运行日志与临时下载，未纳入Git。

| 验证 | 本轮结果 |
| --- | --- |
| `pnpm verify` | exit 0，80文件 / 975测试；lint、双TypeScript检查、构建、8个生成物核对通过 |
| `pnpm test:acceptance` | exit 0，真实本地API九格9通过 / 0阻断 / 0执行错误；未把needs_review等结论改为合律 |
| `node --import tsx tests/e2e/product-refinement.mjs` | 7场景通过：历史刷新、真实剪贴板/TXT、字号静读和手机布局、失败重试、取消迟到、新旧诗结果隔离、笺记搜索/逐行差异/恢复 |
| `node --import tsx tests/e2e/poetry-studio.mjs artifacts/product-refinement/studio` | 10场景通过；导入、诗境、对读、改字/撤销/恢复、同韵筛选与翻页；修正测试等待，须等缓存页真正更新才能继续翻页 |
| `node --import tsx tests/e2e/rhyme-scope.mjs artifacts/product-refinement/rhyme-scope` | 2场景通过；新韵/平水原诗、条件提示、AI上下文及换韵书 |
| `node --import tsx tests/e2e/final-frontend.mjs artifacts/product-refinement/frontend` | 6场景通过；诗库失败恢复、检索布局、返回焦点、窄屏注音、出处重试、模型中性界面文案 |
| 桌面启动 | 仅保留Windows PATH仍可启动；重复打开复用相同PID；测试Web/API均占用时选择新端口；停止仅关闭匹配进程与API子进程，测试端口释放 |
| 桌面实际入口 | `PoetryChecker-Start.cmd -NoBrowser -NoPause` 两次exit 0；56106页面200、readyz ready、新构建asset匹配，DeepSeek配置态true |
| 真实DeepSeek冒烟 | 新入口的全诗赏读《登鹳雀楼》，`deepseek-flash`，8986ms，成功返回overview，赏读改字0条；不记录Key或思考正文 |

浏览器共25场景，不代表全站所有路径或真实模型准确率。AI相关浏览器测试使用受控上游，真实韵书/API/浏览器执行；真实DeepSeek仅以上一首一次，非性能P95。已查看1440/375/320截图，大字模式无横向溢出；真机触摸未验证。构建仍提示主JS包超过500kB，属于现有体积提示，未伪称性能优化完成。

交付后本轮单写接管结束，职责按原ownership归还。原glm-reading工作树及其证据完整保留，不重置或清理。
