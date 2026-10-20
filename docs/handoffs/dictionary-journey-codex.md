# 藏韵阁：横向移步换景与风物字签

用户授权继续修正居中、实现连续横向切页并丰富藏韵阁。本轮 Codex 继续接管 Workspace、DictionaryView、dictionary.css 及对应浏览器测试。契约、后端和数据审核语义保持。

- 查字输入和按钮文字居中。
- 使用原生 View Transition 同时移动旧、新视口，含固定背景和书案；导航独立保留。同步恢复目标页滚动位置，处理快速反向、hash 导航及减弱动态效果。无 API 时直接切换。
- 水月、山林、风雨三组风物字签连接既有查字接口；韵笺书签随收藏变为朱色。

生产截图已确认双画面横向衔接；动画按 clientWidth 移动，避免将滚动条空白卷入画面。持续可见的导航快照通过边界命中处理支持真实鼠标快速反向。CSS 使用 animation 长属性，避免生产压缩将无名称的时长简写折叠为 none。

验证：pnpm verify 通过（60 文件 / 798 测试）；最终修改再次通过 typecheck、build 和相关 lint。新增 dictionary-journey 浏览器检查 6/6，通过实际鼠标检验快速反向，包含双快照位移、滚动恢复、风物字签真实查字、收藏书签、320/375/768 布局、减弱动态及无 API 回退。dictionary 原有功能回归 18/18，keyboard-journey 4/4。功能测试等待导航动画完成后操作页面内容；快速反向单列验证。重载测试等待新的 performance.timeOrigin，避免误读旧文档。

基线 987640f + 未提交修改，Edge 155 / 本机真实 API；不代表数据审核通过。原始记录和截图在本次会话 work/dictionary-journey，展示图在 outputs/dictionary-journey。
