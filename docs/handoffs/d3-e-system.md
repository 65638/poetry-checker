# D3 系统验收交接（E）

日期：2026-10-18。执行者：队员 E / DeepSeek。
基线：`main @ f42172f`（release：三张工程口径规则卡升 approved）。分支：`feat/e-d3-system-acceptance`。
环境：Node **v24.21.0**（任务书要求 24.19.0，`engines >=24 <25` 满足，差异已记录）、pnpm 11.25.0。

## 一、本轮实际结果

| 命令                                                       | 结果                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `node tests/integration/e2e/d3-acceptance-api.mjs --spawn` | 九格：**通过 2 / 阻断 6 / 判错 1**；退出码 1（有真实判错） |
| `pnpm verify`                                              | **exit 0**，45 文件 **591 项**通过                         |
| `eslint tests/integration`                                 | exit 0                                                     |

## 二、九格结果（真实 HTTP，2026-10-18 实跑）

| 作品     | 平水                                | 词林     | 新韵     |
| -------- | ----------------------------------- | -------- | -------- |
| 登鹳雀楼 | 通过 200 / pass / wujue / ev=302    | 阻断 503 | 阻断 503 |
| 静夜思   | 通过 200 / not_applicable / ancient | 阻断 503 | 阻断 503 |
| 黄鹤楼   | **判错** 200 / fail / qilv / ev=302 | 阻断 503 | 阻断 503 |

术语分开记：**阻断 ≠ 判错**。503 `DATA_NOT_READY` 是数据未就绪（A/GLM），不是判定错误；
判错只有一格（黄鹤楼平水三平尾），责任在格律核心。

## 三、金标准新增独立断言（平水《黄鹤楼》）

不只看 `formId`/`summary`，脚本对该格额外断言五项：

| #   | 断言                                          | 结果                  |
| --- | --------------------------------------------- | --------------------- |
| A1  | 七律身份 `regulated` + `qilv`                 | 通过                  |
| A2  | PPP 成立：`l4c5/l4c6/l4c7`（空悠悠）皆平      | 通过                  |
| A3  | `TAIL.SANPING` 在第 4 句不得为 `error`/`fail` | **失败**（现为 fail） |
| A4  | 该特例检查带 `evidenceIds`                    | 通过                  |
| A5  | 其他偏离保留：`summary` 不得 `pass`           | 通过（fail）          |

A3 依据：`docs/reviews/13_J03…` 第 8 条「空取平声；三平尾成立，作古风式律诗特征保留，**不判出律**」。

## 四、runner 执行方法

```sh
node tests/integration/e2e/d3-acceptance-api.mjs --spawn
node tests/integration/e2e/d3-acceptance-api.mjs --api-url http://127.0.0.1:3000 --out /tmp/d3.json
```

- `--spawn`：自起 `apps/api/src/server.ts`，**随机空闲端口**（不占 3000），只杀自己起的进程。
- `--api-url`：连已运行服务；`--timeout-ms` 默认 20000；失败退出码 1。
- 结果 JSON：`tests/integration/e2e/d3-acceptance-last.json`，含时间、API URL 的 SHA、模式、数据版本、Node 版本、逐格 issues。
- **未纳入 `pnpm verify`**（verify 只跑 vitest 套件）；因此九格结果需单独执行。若要进 CI，需 GLM 加 `pnpm test:acceptance`。
- `pnpm test:acceptance` / `pnpm test:e2e` **目前不存在**，GLM 添加前不得宣称可运行。
- 旧 D1 mock 脚本已改名为 `d1-mock-api.py` 并加历史横幅，**不要用它对真实模式做验收**。

## 五、证据状态：浏览器 vs 手工（必须分开）

| 类型             | 状态       | 说明                                                                      |
| ---------------- | ---------- | ------------------------------------------------------------------------- |
| 自动化 API 验收  | **已运行** | 九格 + 五条黄鹤楼断言，结果见上                                           |
| 自动化浏览器验收 | **未运行** | 仓库仅有 `tests/e2e/README.md`，D 的 Chrome/CDP 脚本未入库；无 Playwright |
| 人工浏览器操作   | **未做**   | E04–E08 全部未覆盖                                                        |

**不得**把 API 200 或根 HTML 200 写成「页面闭环通过」。

## 六、失败复现（最小）

```sh
node tests/integration/e2e/d3-acceptance-api.mjs --spawn
# 期望输出：[FAIL] 黄鹤楼 / pingshui … 三平尾被判 fail，但 13 号第 8 条要求不判出律
```

其余六格：

```sh
# 任选古体/近体，切 cilin 或 xinyun
node tests/integration/e2e/d3-acceptance-api.mjs --spawn | grep BLOCKED
# 期望：6 行 BLOCKED，错误码 DATA_NOT_READY
```

## 七、D1 旧结论的三栏对照（保留历史，不当作当前状态）

| D1 项                                               | 现在                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 缺陷 1：五类 fixture 仅 2 种正文 → 三态 HTTP 不可达 | **已替代**：真实 API 下三首可区分 pass / not_applicable / fail；`unsupported` 仍需受控替身（E07） |
| 缺陷 2：404 无统一错误体                            | **仍存在**（本轮未复测，待 GLM）                                                                  |
| 缺陷 3：fixture `basisType` 恒 `user`               | **已替代**：真实 API 返回真实 `basisType`                                                         |
| 浏览器类 9 项未检查                                 | **仍存在**（D3-B4）                                                                               |

## 八、阻断与交接

| ID      | 阻断                                                                        | 责任      | 需要什么                                                                            |
| ------- | --------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| `D3-B1` | 词林/新韵六格 503                                                           | A + GLM   | 数据入库并装载后重跑同一脚本                                                        |
| `D3-B2` | 黄鹤楼平水三平尾被判 fail                                                   | **Codex** | 修 `TAIL.SANPING` 特例；A3 应变绿                                                   |
| `D3-B3` | `/readyz` 无 `versions`                                                     | GLM       | 返回三库 `dataVersion`；否则只能记「模式未声明」                                    |
| `D3-B4` | 无浏览器 runner                                                             | GLM + D   | 0.5h 内定：优先把 D 的 Chrome/CDP 脚本整理成 `tests/e2e/d3-browser.mjs`；避免双框架 |
| `D3-B5` | 「09 号验收表」「作品 review-closure」「三首 canonical 金标准」未在仓库找到 | 组长/GLM  | 给路径或补入库；本轮以 13 号裁定 + `data/works/` + `tests/golden/cases/` 代替       |

## 九、D4 未完项（本批不做）

- E04–E06、E08、E09 的浏览器/人工验收（依赖 D3-B4）。
- E10 的对照用例：需补「普通近体 PPP 仍 error」的合成用例（当前只有特例侧）。
- E02 九格补齐（依赖 D3-B1）；288 字位逐字表（依赖词林/新韵取到 tokens）。
- E07 的受控替身需明确标注为合成，不能混报真实语文学结论。

## 十、变更路径

- 新增 `tests/integration/d3-acceptance.md`（当前矩阵）
- 新增 `tests/integration/e2e/d3-acceptance-api.mjs`（九格 runner）
- 新增 `tests/integration/e2e/d3-acceptance-last.json`（最近一次结果，含 SHA/时间）
- 改名 `tests/integration/e2e/acceptance-api.py` → `d1-mock-api.py`（历史）
- 修改 `tests/integration/acceptance-plan.md`（顶部标历史）
