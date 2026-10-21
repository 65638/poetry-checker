# Codex G07/G08 工程收口

基线：`main@f3ef270d344a8a0534a19d4a735e04d66a10a5c0`（含 E 批次 01 与彩排取消令），成员分支 `codex/d4-g07-g08`；GLM 继续负责批次合并，`integrate/d4` 已退役。

## 写入范围

Codex 单写根 README/HANDOFF、scripts/dev.mjs、scripts/g07-*.mjs 与本交接记录。该批接管根启动/性能验证脚本，原 GLM 在本批脚本范围暂停并行写入，合入及检查完成后归还。D 继续前端业务，E 继续 tests/e2e、integration、08 台账和 docs/delivery/d4，本批不覆盖其文件。

## 启动修复

Windows 实际运行旧 `node scripts/dev.mjs` 返回 exit 1，出现 spawn ENOENT。修正 URL 路径解析，改为直接启动 Node API 和进程内 Vite，避免 shell/pnpm 包装进程；只清理自己的 API。统一启动绑定 127.0.0.1，PORT/WEB_PORT 可设置，默认 3000/5173；端口占用明确失败，不自动改端口。独立 `pnpm dev:web` 保留 Vite 原来的自动换端口行为。Web HMR 保留；统一命令下修改 API 源码需重启命令。

可重跑：`node scripts/g07-startup-check.mjs`（隔离端口、真实浏览器、外站请求拦截、协调退出与占用端口）；`node scripts/g07-performance.mjs`（真实 HTTP 成功样本与 503 另账）。Windows 强制结束父进程不等于 Ctrl+C，不在协调退出保证内。

## G08 排期与范围

2026-10-21 上午终验和主线缺陷修复照常；下午优先偿还 A 审批、G04、G05 等欠账。组长已取消彩排，不再安排或将其列作缺陷。E 仍负责今晚脚本/真实 JSON/录屏素材及缺项清单，C 供黄鹤楼说明。

## 许可与离线边界

数据来源清单明确留有上游字表、拼音整理和站点整理层授权待核项，不能将仓库 MIT 声明扩大到这些数据。交付源码包将排除真实 data 目录及历史证据/图像，不声称为含全库的可独立真实运行正式版。源码包解包构建、已有依赖的本机真实离线运行、完全离线安装分别记账；源码包缺少真实数据时不把构建成功说成真实 API 通过。

## 实际结果

代码执行 SHA：`6257e1a3c412eec3f0932b96c9497245cc329b40`，dirty=false，Node 24.19.0 / pnpm 11.25.0。本交接后续提交只增加记录，不改运行代码。

| 检查 | 实测 |
| --- | --- |
| main 实际 CI | main@f3ef270，GitHub Actions run 39449929548，基础检查 completed/success；035bb74 的 run 39449057191 也为 success |
| `pnpm verify` | exit 0，56 文件/763 测试，lint/类型/构建/8 个生成物一致 |
| 真实九格 | runner exit 2 / pnpm 包装 exit 1；3 通过/6 数据阻断/0 判错/0 未运行，readyz503 |
| 浏览器 | exit 0，19/0/0，正式入口+真实数据，受控场景单列 |
| 启动探针 | exit 0，Windows 路径/自定义双端口/真实代理/占用拒绝/协调退出释放自有端口通过 |
| 性能 | 600 个有效 HTTP200、0 失败；并发1：P50 14.58ms / P95 21.05ms；并发4：P50 14.23ms / P95 24.36ms |
| 解包与哈希 | 235 文件（含 SHA256SUMS）；234 个文件逐项核对；独立中文含空格路径解包构建 exit 0 |
| 空缓存完全离线安装 | exit 1，ERR_PNPM_NO_OFFLINE_TARBALL；不提供依赖缓存，不称完全离线安装通过 |
| 新解包+本机完整缓存 | `pnpm install --offline --frozen-lockfile --config.node-linker=hoisted` exit 0、downloaded=0；离线配置下构建 exit 0 |
| 已安装依赖的真实运行 | 浏览器拦截全部非 loopback HTTP 请求，正式 `/` 登鹳雀楼真实 pass；外站探针确认被拦截。不是操作系统全网断开测试 |

性能环境：Windows 10.0.26200、Core Ultra 7 270HX Plus、20 逻辑处理器、约 31.5GiB 内存；20/20/56 字三首，各预热10次，每种并发每首100次，串行测不同作品，保持服务进程。时间为 loopback 端到端 API 响应正文完整读取延迟，Schema 检查在计时后；不是服务端专用埋点，也不外推公网。启动到 health 约803ms；cold 数组只有第一项是新进程首分析，后两首共享已热服务。另有6次503探针，绝未计入成功P95。分作品 P95 最大28.37ms。

源码包 `poetry-checker-source-6257e1a.zip` SHA256：`a374250a69ef9a71c9ab5d1c5fd5d215797e0111d799e9e3b9e3902c1bf79555`。包内含 SOURCE-REF.json（排除清单）、PACKAGE-README.md、SHA256SUMS。因真实 data/ 未获完整转载许可确认而排除，本包是源码构建候选，不是独立真实数据演示包；完整交付仍依赖 A/组长的数据范围/许可闭环与 E 的 G05 独立验收。未把源码构建成功写成全仓数据测试通过。

证据：本目录 [d4-g07-evidence/summary.json](d4-g07-evidence/summary.json)，包含命令/退出码、版本、来源 SHA 与归档哈希；API/performance/startup/CI 原 JSON 留存，browser 个人路径替换为 `<CHECKOUT>`，原始/归档摘要在 provenance 里分别记录。

## G08 实物与欠账

核对 main@f3ef270：当前只有既有 release-status 与三首 golden，未见 E 独立交付的五分钟演示脚本、专用真实报告 JSON、录屏文件或录屏安排清单；历史测试 JSON/截图存在，不把它们自动当作今晚演示素材齐全。请 E 提交素材目录/实际文件，C 补黄鹤楼说明。G08 保持部分完成。

G07 已完成本机工程/性能/源码解包与离线分账，含全库数据的可独立运行包和最终 main 合入后的 CI/受影响复验仍待 GLM/A/E 协作；不得据此宣称全部 P0 或全库发布通过。
