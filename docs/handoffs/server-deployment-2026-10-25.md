# 2026年10月25日服务器部署

用户授权部署自己的诗词网站至分配的6767端口。Codex本次接管部署入口及公网HTTP兼容修复，现有展示布局和其他服务不变。新增生产入口直接通过Fastify提供构建后的页面与API，不暴露源码目录或Vite开发服务器。

部署采用独立目录、版本目录和systemd服务；模型配置单独保存，禁止提交凭据。现有数据审核记录保持原值。公网HTTP不提供Web Crypto的subtle/randomUUID及现代剪贴板接口，需要沿用已有SHA256实现、使用getRandomValues生成UUID、用户点击时兼容复制。

## 实际部署

- 网站入口：http://81.71.14.93:6767/ 。只有6767用于本项目，不修改其他站点或防火墙。
- 目录：`/home/guji/poetry-checker-6767/`；版本：`releases/20261025-6767`；`current`软链接指向该版本。
- 运行时：独立Node 24.19.0，官方SHA256校验通过；pnpm 11.25.0按锁文件安装。前端及workspace包在本机完成构建后上传。
- 模型配置：`shared/model.env`，权限600；通过SSH传输，不包含在源码包、Git或公开静态目录中。当前DeepSeek Flash已配置。
- systemd：`poetry-checker-6767.service`，已启用开机启动、失败重启；以guji普通用户运行，内存上限768MB、CPU上限一个核心。生产入口运行真实数据，拒绝mock模式。
- 本机56106展示版和浏览器数据没有迁移或覆盖。新公网地址是独立浏览器存储来源；需要旧收藏时从本机站点导出完整备份，再到公网站点导入。

## 维护

服务器上查看与重启本网站：

```sh
sudo systemctl status poetry-checker-6767 --no-pager
sudo systemctl restart poetry-checker-6767
sudo journalctl -u poetry-checker-6767 -n 50 --no-pager
```

更新时将新版本部署到独立release目录，保留shared/model.env；验证后切换current并只重启本服务。回退时将current指回上一版本再重启。首次部署没有旧公网版本；停止本服务不会影响其他端口的站点。

生产入口复用已有API，静态目录只允许公开文件类型，拒绝隐藏文件、越界路径、外部符号链接、源码及不存在的API路径；页面不长缓存，hash资源可长缓存。跨站Origin的POST拒绝；这不是用户身份认证或费用配额控制。目前使用公网HTTP，尚未配置域名与HTTPS。

## 验证

- 本机`pnpm verify`：105文件、1172测试通过，包含HTTP环境SHA256/UUID及静态服务越界拒绝回归。
- 公网浏览器：真实非安全上下文，诗库加载、点击复制、稿匣保存、刷新保留、390px无横向溢出，5项通过且无JS异常。
- 外网healthz、readyz、AI配置接口正常，诗库返回2022条；404检查未暴露配置或源码。
- 真实DeepSeek《鹿柴》意象问答：HTTP200、6.283秒，响应结构与输入摘要有效；真实分析：HTTP200、8.904秒，AI应用8个字位。结论仍按实际证据保留needs_review，不伪造确定结论；单次调用不代表P95或文学准确率。
- 已确认systemd enabled、运行中、意外重启0次；模型调用后内存约306MiB。未重启整台共享服务器。
- 本机证据：`artifacts/acceptance/public-deployment/`；完整验证日志：`artifacts/continuous-improvement/server-deploy-verify.log`。
- 两份上传包在服务器与本机SHA256一致：源码`7c8d0d2feb1f26f1a63d2a64ac73eed0c4f2ec62934d878098a3c8e1fb032379`；构建`d9eef72ea6adb344d8fa8b03078f2cea75c5c0fe54d1f9e87ee4625f6ba8a9e4`。部署基线为020b454及本次公网适配补丁，随此文提交后记录最终Git版本。
