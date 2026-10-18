# 0005 体裁模块 D1 + D2（E，基于 main 0a94212）

日期：2026-10-17。执行者：队员 E / DeepSeek。
分支 `feat/e-d1-genre`；PR [#4](https://github.com/65638/poetry-checker/pull/4)（**draft**，目标 `main`）。
基线：`main` = `0a94212`（已含 B 的解析/选音批次）；`contract-v1` 仍为 `9b27322`，**本轮未改动任何契约**。
环境：Node v24.21.0（任务书要求 24.19.0，`engines >=24 <25` 满足）、pnpm 11.25.0（一致）。

## 一、交付内容

| 文件                                         | 内容                                                                                                                      | 状态               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `packages/genre/src/classify.ts`             | `classifyGenre`：用户显式古体/形式、用户选近体、auto 形制与特征门槛、并列、关键可判率、needs_review、排律、已审核指纹匹配 | 完成               |
| `packages/genre/src/fingerprint.ts`          | `normalizeForFingerprint` / `fingerprintText`（去标点空白、保留字形字序的 SHA-256）                                       | 完成（D2）         |
| `packages/genre/src/errors.ts`               | `GENRE_ERROR_CODES`、`GenreError`（含 `branch` 字段）                                                                     | 完成               |
| `packages/genre/src/golden-case.ts`          | GoldenCase 手写校验器，复用冻结 `AnalyzeRequestSchema`，`approved` 门槛                                                   | 完成               |
| `packages/genre/src/index.ts`                | 公共入口（导出上述 API）                                                                                                  | 完成               |
| `packages/genre/tests/fixtures.ts`           | 合成 AnnotatedPoem / TemplateCandidate / WorkMetadata                                                                     | 完成               |
| `packages/genre/tests/classifyGenre.test.ts` | 20 项（E-D1-01~08、D2 指纹 5 项、边界）                                                                                   | 完成               |
| `packages/genre/tests/golden-case.test.ts`   | 9 项（结构、审核门槛反例、重复 id、空断言）                                                                               | 完成               |
| `tests/golden/cases/*.json`                  | 登鹳雀楼 / 静夜思 / 黄鹤楼，**全部 pending**                                                                              | 完成（待人工审核） |
| `tests/golden/README.md`                     | 用例状态、审核流程、运行方式、禁止事项                                                                                    | 完成               |
| `data/works/README.md`、`review-queue.json`  | 正文候选与待审核清单，**0 条 approved**                                                                                   | 完成               |
| `tests/integration/acceptance-plan.md`       | D2–D5 验收矩阵（12 条场景，**全部未运行**）                                                                               | 完成（起草）       |
| `docs/test-report.md`、`docs/limitations.md` | 运行台账、已知边界                                                                                                        | 完成               |
| `packages/genre/README.md`、`HANDOFF.md`     | 调用入口/分支表/命令、交接记录                                                                                            | 完成               |

## 二、行为规格（验收逐条对照）

| 输入                                             | 输出                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `genreHint=ancient`                              | ancient / not_applicable / basisType=user，不改判他体                                |
| 显式 `formHint=wujue\|qijue\|wulv\|qilv`         | regulated + 该 formId / user；形制不符 → uncertain 并在 reasons 说明，不转古体       |
| `genreHint=regulated` + 形制可推                 | regulated + 推断 formId / user；不可推 → undetermined/uncertain                      |
| auto + 指纹命中 1 条 approved                    | 采用审核的 formFamily/formId/标签，`basisType=reviewed_metadata`，透传 `evidenceIds` |
| auto + 指纹命中多条 approved                     | undetermined/uncertain，列出命中 id，交人工裁定（不按顺序取第一条）                  |
| auto + 候选缺 relationFit/rhymeFit               | undetermined/uncertain，`selectedTemplateId=null`，保留候选                          |
| auto + 关键可判率 <0.8 或 `quality=needs_review` | undetermined/uncertain                                                               |
| auto + 并列（分差 <0.05）或低吻合（<0.75）       | undetermined/uncertain，保留全部候选 ID                                              |
| auto + 高吻合（≥0.90）                           | **抛 `GENRE_BRANCH_PENDING`**（branch=`auto-high-confidence`），未实现不冒充         |
| auto + 形制超四类（含排律/长律）                 | unsupported / applicability=unsupported                                              |
| 任何输入                                         | 不改 poem/candidates/metadata；不改判体；不伪造 evidenceIds                          |

## 三、实际验证（本分支真实执行）

| 命令                                        | 退出码 | 结果                           |
| ------------------------------------------- | ------ | ------------------------------ |
| `pnpm install --frozen-lockfile`            | 0      | 271 条锁定项，供应链策略通过   |
| `pnpm verify`（改动前基线）                 | 0      | 12 文件 **135 项**             |
| `pnpm exec vitest run packages/genre/tests` | 0      | 2 文件 **29 项**               |
| `pnpm verify`（改动后）                     | 0      | 12 文件 **164 项**（135 + 29） |
| `pnpm typecheck`                            | 0      | 根 + web 双项目                |
| `pnpm exec eslint packages/genre`           | 0      | 无告警                         |
| `pnpm exec prettier --check`                | 0      | 通过                           |

口径说明：任务书提到的 **36 项**是 GLM 接入初期数字；main 前进后基线为 **135**；本轮后 **164**。以最新提交实际结果为准。

## 四、明确未做 / 未运行（请勿视为已完成）

1. **真实作品：3 首 pending、已人工审核 0/3、真实分析 0/3 未运行**。结构校验 3/3 只代表字段与门槛，不是语言学通过。
2. auto **高吻合自动判定**未实现（抛错），等核心补齐 relationFit/rhymeFit 与样本校准。
3. **API 接线**与错误码映射、**genre 包配置**（exports/build/test/deps/tsconfig.build）：属 GLM。
4. 真实韵书字表、读音、完整格律判定：属 A/B/Codex；前端展示与 E2E：属 D/Claude。
5. 异文规则、指纹版本管理、真实语料校准：未做。

## 五、需组长决策的 4 项

1. **阈值是否作为本批工程设定**：S≥0.90 / 0.75≤S<0.90 / 并列 <0.05 / 关键可判率 ≥0.8（待样本校准，我在代码里集中为 `GENRE_THRESHOLDS`）。
2. **指纹规范化口径**：只保留汉字（去标点/空白/其他字符），**不做简繁转换、不归并异文**；异文各立版本。若组长要求含数字/拉丁字符，需要改口径并重算。
3. **genre 包配置**由 GLM 本批补齐，还是等本 PR 合入后再单独开 PR？
4. **GoldenCase 是否改用 zod**：当前手写校验（不依赖传递依赖）。若要求 zod，需 GLM 加依赖，我再改。

## 六、给 GLM 的具体请求

1. `packages/genre/package.json` 补 `exports`（types/development/import）、`build`、`test`、`dependencies: { "@poetry/contracts": "workspace:*" }`；补 `tsconfig.build.json`（对齐 prosody/readings）。当前该包**不能按包名被其它包导入**，只能靠根 workspace 链接 + tsconfig paths。
2. `GENRE_BRANCH_PENDING` → 建议 **503 `DATA_NOT_READY`**（与 readings 的 503 族一致），或 501 语义化错误；**不得捕获为成功、不得降级为 uncertain**。`GENRE_REQUEST_INVALID` → 422。
3. 若采纳 zod：为 genre 显式声明 `zod` 依赖。

## 七、给 C 的对齐请求

- 确认 `TemplateCandidate` 的 `features` 空值语义（`null` = 未实现/不适用？）与 `score` 的生产方（必须由核心按固定权重给出，E **不重算**）。
- 确认边界：**C 不做体裁，E 不重算格律**；E 只消费候选特征，输出体裁结论与理由。

## 八、复现与验收步骤

```sh
git fetch origin feat/e-d1-genre && git switch feat/e-d1-genre
pnpm install --frozen-lockfile
pnpm verify                              # 预期 exit 0、164 项
pnpm exec vitest run packages/genre/tests # 预期 2 文件 29 项
```

建议抽查：`classifyGenre.test.ts` 的 E-D1-02/04/05/07 与 D2 指纹 5 项；`docs/limitations.md` 是否与实际行为一致。

## 九、风险与回滚

- 变更面：`packages/genre`（E 独占）+ `tests/golden`、`data/works`、`tests/integration`、`docs`；**未触碰** contracts / apps/api / prosody / readings / 根配置 / lockfile。
- 回滚：`git revert 6e079c0 ad2790e`，或直接关闭 PR #4（不影响 main）。
- 风险点：`GENRE_BRANCH_PENDING` 未接入 API，若 GLM 以“捕获所有异常”处理，会把“未实现”显示成正常结果——需在接 API 时显式放行。

## 十、下一步建议（D3）

1. 与 C 对齐后，由 GLM 接 API（体裁 + `/analyze` 出站校验）。
2. 真实语料（A 的韵书）就绪后跑三首 pending → 人工审核 → 转 approved，再验证 `basisType=reviewed_metadata` 的真实路径。
3. 阈值校准：以至少 12 首作品级样本回归，记录版本与前后差异。
