# tests/e2e

负责人：E 维护验收场景、D 配合选择器，Codex 代 GLM 落地首批运行基础设施。

采用 Chrome/Edge + Node 内置 WebSocket/CDP；没有另加 Playwright。Node 24、仓库依赖及已安装 Chromium 浏览器即可。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:e2e
# 非默认安装位置：
node tests/e2e/d3-browser.mjs --browser "/path/to/chrome" --out artifacts/acceptance/browser
```

也可设置 CHROME_BIN。脚本自动找 Windows Chrome/Edge、macOS Chrome 和 PATH 中的 Linux Chromium；找不到即失败，不伪报通过。临时 API/Vite/浏览器 profile 均隔离，只清理自身进程，不占 3000/5173，不访问用户正在使用的浏览器。

已覆盖：正式首页手动输入三首→真实 HTTP→逐字报告→点字候选/来源→Esc 返回焦点；375/768/1440 尺寸、触控宽度、标点串字回归；减弱动效；编辑 stale；切词林的真实 503 可见。

示例按钮仍为空时单列 blocked；不会以手动输入冒充示例点击。E05 人工覆盖/竞态全矩阵、E06 复制导出内容、E07 合成五态/故障、E08 全键盘矩阵、E09 干净 clone 尚待 E/D 扩展。JSON 中逐项保留 notRun。

结果默认位于 `artifacts/acceptance/browser/result.json`，三个宽度的视口截图同目录。exit 0=本 runner 覆盖范围全过、1=失败/执行错误、2=有阻断；退出0也不代表未列入脚本的 E04–E08 已完成。某些 pnpm 包装环境折叠非零码，结果 JSON 保留原始 exitCode。

CI 的 push/PR 仍仅自动执行 `pnpm verify`；独立验收在手动工作流 `D3 独立验收` 执行并上传证据，未审核数据/未交付入口仍使相应步骤非零。
