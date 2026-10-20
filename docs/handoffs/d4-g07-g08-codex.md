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

实际 SHA、CI、性能、源码包解包和离线实测结果在执行后追加。
