# 接入 GitHub

这是标准 pnpm + Git 单仓库。共享仓库为 [65638/poetry-checker](https://github.com/65638/poetry-checker)，已确认是私有仓库，本地 origin 已关联。组长账号为 65638；成员从现有远端克隆，不需要各自再创建仓库。ZIP 不包含 .git，仅作源码备份。

## 1. 已有远端与成员访问

远端创建步骤已完成。组长在 Settings → Collaborators 添加 A–E 的 GitHub 账号，成员接受邀请后可以克隆和提交 PR。课程仓库的公开/私有和代码许可证由团队决定，数据许可单独记录。

## 2. 提交与推送命令参考

在 poetry-checker 根目录打开终端。现有本地仓库无需重新初始化或重复添加 origin。下面保留首次提交命令供恢复/迁移参考；成员日常在自己的分支提交，优先按第 3 节克隆，不用 ZIP 重建平行历史。

检查身份和待提交文件：

```sh
git status --short
git config user.name
git config user.email
pnpm verify
```

若 Git 身份为空，使用你自己的姓名和提交邮箱设置本仓库身份；不要使用文档里的假身份。确认不含密钥、node_modules 或模型配置后首次提交：

```sh
git add .
git commit -m "chore: 初始化诗格律检查器工程底座"
```

只有尚未配置 origin 的恢复副本才需要添加远端；正常克隆已经包含 origin：

```sh
git remote add origin https://github.com/65638/poetry-checker.git
git push -u origin main
```

若 origin 已存在，先用 `git remote -v` 核对，不直接覆盖。登录使用 Git Credential Manager、SSH 或 GitHub CLI；不要将访问令牌写进远端 URL、代码或任务书。

## 3. 成员工作方式

每人克隆同一个仓库，从最新 main 建立短分支，例如 `feat/a-lexicon`、`feat/b-readings`、`feat/c-prosody-adapter`、`feat/d-web`、`feat/e-genre`。Codex 核心使用 `feat/codex-prosody-core`，设计方使用 `feat/frontend-presentation`，D 使用业务分支，GLM 使用集成分支。前端两条分支按 view-contract 与独占路径协作。分支名称只是建议，不预先创建空分支。

```sh
git clone https://github.com/65638/poetry-checker.git
cd poetry-checker
pnpm install --frozen-lockfile
git switch -c feat/a-lexicon
```

成员提交代码、测试与 HANDOFF 后发起 PR；说明具体行为、实际验证和未完成项。组长审查合入 main，核心算法由 C 加做独立反例验收。公共契约不由多人同时修改。

## 4. 自动检查与主干保护

`.github/workflows/ci.yml` 在 push 和 pull_request 时运行基础检查。首次推送后到 Actions 查看真实结果；本地通过不等于云端已运行。团队可将 `基础检查` 设为合并必需检查，并要求一名审核者；分支保护可用性以 GitHub 当前账号/仓库设置为准。

工作流目前只覆盖已有工程底座。API、Web、数据校验、集成与 E2E 落地后，GLM 将它们加入 verify/CI；不能因为当前 CI 绿灯就宣布 P0 全部完成。

## 5. 每日节奏

D1 组长冻结接口并打 contract-v1 标签；每天中段集成一次、结束前跑主线冒烟。成员每天同步 main，减少长分支。D3 冻结 P0 功能，D5 下午保留至少半天联调与彩排。
