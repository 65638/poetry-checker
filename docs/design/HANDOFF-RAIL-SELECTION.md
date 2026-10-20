# 诗句目录点击后回跳高亮修复

2026-10-20，起点 bc63488。用户反馈点击目录第4句后自动回到第1句。

实测旧实现：scrollIntoView 只有 pc-line-4 一次，页面位置正确，但高亮随后变成第2句；点击第2句后高亮变成第1句。原因是 IntersectionObserver 从观察区选最靠上的句子，且缓存的是上次交叉回调时的位置，覆盖了显式点击选择。

ReadingRail 改用按需 rAF 合并页面 scroll/resize，读取实时行位置并选择距离视口中心最近的句子。显式目录选择在平滑滚动期间保持；连续180ms没有滚动后解锁，但不主动覆盖高亮。之后页面滚动恢复跟踪。wheel/touchmove/滚动键和resize可取消定位锁；内部目录滚动不会触发页面跟踪。移除观察器缓存和常驻循环，卸载清理帧、计时器和监听。

验证：
- rail-selection-checks.mjs：修复前7项中6项失败，修复后7/7通过。覆盖短诗第4句、2→3→1→4连续选择、空白点击、键盘焦点、手动滚动、长诗和减少动态。
- 原报告交互9/9通过；lint、typecheck、前端生产构建通过。
- 证据：moonlit-ui/rail-selection-before.json、rail-selection-results.json、rail-selection-report-regression.json。
- 生产预览沿用127.0.0.1:56532，需要刷新加载新构建。
