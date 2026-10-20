# 藏韵阁交互与视觉打磨

用户要求新增功能与区域沿用此前山亭听雨风格继续完善。本轮 Codex 接管 DictionaryContainer、DictionaryView、dictionary.css 及必要的共享导航、指针和雨景样式；保持既有接口、数据审核语义、收藏格式与校诗台交互。

## 完成

- 查字书案改为墨青色，右侧保留纸本韵书页；放大声调、韵部与导航序号，三书对照在窄屏纵向排列。正文和出处可选取复制，纸面使用深色指针。
- 藏韵阁复用微雨与水面涟漪；操作区遮蔽水面交互。离开区域、失焦、隐藏、关闭动态效果或减弱动态时停绘。
- 查字保留已完成的结果，成功后同步提交字、书与数据；收藏、复制链接始终使用结果所属韵书。查询失败显示明确失败提示，不再播报旧结果成功。
- 查询、三书对照与逐字速览采用已有的 160ms 延迟 / 320ms 最短可见反馈；重复操作不先清空结果；查询按钮宽度固定且不闪灰。三书对照以高度和透明度渐入。
- 修复 Workspace 通配隐藏样式覆盖原有编辑区收起动画的问题，限制到导航区域本身。
- 输入法测试改为验证组合期间没有查字请求、旧页保持不变，确认后仅发一个请求；不再把旧页保留误判为输入法提交。

## 实测

基于 237ced6 的未提交工作树，Windows / Edge 155，真实本机 API；延迟、快速响应和断网场景在浏览器内可控注入，快速响应使用真实 API 返回内容，没有改动业务数据。

- `pnpm verify`：lint、typecheck、60 个文件 / 798 个测试、构建与契约生成检查通过。
- `node tests/e2e/dictionary.mjs artifacts/dictionary-polish/functional`：18/18；无页面异常，覆盖字笺导入导出、超时、输入法、复制、手机跳转与并发。
- `node tests/e2e/dictionary-polish.mjs`：8/8；覆盖稳定结果、反馈时间、按钮尺寸与颜色、三书对照、320/375/768 宽度、动效开关及失败恢复。
- `node tests/e2e/keyboard-journey.mjs artifacts/dictionary-polish/keyboard.json`：4/4；实际键盘完成分析、选音、折叠、查字和出处查阅。
- `node docs/design/moonlit-ui/layout-motion-checks.mjs results.json artifacts/dictionary-polish/checker-motion`：13/13；含用户此前反馈的分析闪烁、偶数句颜色、编辑区几何、手机滚动与粘滞布局。
- 已查看桌面与 375px 手机截图。精简结果见 dictionary-polish-evidence.json；原始截图与采样记录保留在本次会话的 work/dictionary-polish，展示截图在 outputs/dictionary-polish。

本轮未修改契约、数据审核状态或发布门槛。测试记录的基线加 dirty 状态保留，不将后续提交冒充运行时 SHA。
