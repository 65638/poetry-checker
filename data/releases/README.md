# data/releases：发布门槛与实际入口

D4（2026-10-20）仍无正式已审数据发布包。运行快照在 `data/normalized/`；主线选择以 `apps/api/src/snapshot-manifest.json` 为准。`integrate/d4` 已退役，成员批次交 main 的 PR。

最新审批增量：用户已接受请求01列举的16个词林候选，接受记录在 `data/reviews/d4/a/acceptance-01.json`，词林运行版本为 `cilin-cwr-ff0e9c1-d4-candidate-review1`。原交换批次保持冻结；当前运行状态见下表。

| 韵书         | 结构完整性                                  | 机器对照                                                                        | 实际人工核验或接受机器批次                        | evidence approved                     |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| 平水韵运行库 | 106 部，三讲已补；另保留缺三讲的 105 部负例 | 结构、引用和来源摘要可校验                                                      | 原有三讲人审与 83 精确候选接受记录；D4 无新增接受 | 84/189（83 候选级＋三讲部级），非整库 |
| 词林正韵     | 19 主部、33 子卷非空                        | D4 三作品全部竞争候选与 cwr 原表对照；另保存固定修订 2123337 做原字同部同声检查 | 用户接受16个候选的机器初审；简繁/异体缺口逐项保留 | 16/49；33部级证据及快照仍unverified   |
| 中华新韵     | 14 主部、56 子卷非空；项目重建表            | pinyin-data 逐读音及现有规则可重建；同字同子卷多读音另存 1,508 组               | 规则权威出处、语境冲突未裁；D4 无新增接受         | 0/56，快照 unverified                 |

新韵是“项目重建表，非官方原始字表”。结构和机器对照通过不等于归部已获认可。全库发布须满足完整结构、快照 approved 与来源使用权条件；候选接受也不自动批准整部、整库。API 当前的局部可分析范围与全库 readyz 门槛分别计算。

使用 Node 24.19.0 / pnpm 11.25.0，在仓库根目录执行：

```powershell
pnpm exec tsx scripts/data/check-normalized.ts
pnpm exec tsx scripts/data/inspect.ts
pnpm exec tsx scripts/data/precheck-lexicon.ts --report-date 2026-10-20 --output-dir data/reviews/d4/a/precheck
pnpm exec tsx scripts/data/build-d4-review-batches.ts --base-sha cea831befa70a8842943d240f91f9816c9c55a94 --input-ref 2047f96 --check
```

`--check` 只比对冻结文件；省略才重建 D4 交换批次。批次 JSON 的 SHA 写旁置 `.sha256`；有修改须重新冻结、重新接受，不能沿用旧 hash 的同意。

已接受后的原始批次只用归档输入复现，不重写成新运行状态。当前状态初审使用独立目录：`pnpm exec tsx scripts/data/precheck-lexicon.ts --report-date 2026-10-20 --output-dir data/reviews/d4/a/approved-01/precheck`。两轮实际生成器复验使用 `node scripts/data/verify-d4-rebuild.mjs --output-dir data/reviews/d4/a/approved-01`。

实际快照生成器如下，必须串行执行，运行前确认独占且 Git 状态可追踪：

```powershell
pnpm exec tsx scripts/data/build-pingshui.ts
pnpm exec tsx scripts/data/build-cilin.ts
pnpm exec tsx scripts/data/build-xinyun.ts
```

这三条会写规范化快照及派生报告，不是只读检查。D4 实际两轮重建记录另见 `data/reviews/d4/a/rebuild-verification.json`；precheck 中的两次 JSON.parse 只证明已存快照摘要稳定，不能替代两轮执行生成器。

根命令 `data:build`、`data:check` 未定义；历史 `node --conditions=development ...ts` 不能解析本仓库相对 `.js` 导入，现行入口使用 tsx。readyz 已接真实快照与审核门槛，503 须按实际缺口解释。

来源许可与归部正确性分别登记：cwr/pinyin-data 的 MIT 仓库声明不覆盖全部上游授权；维基文库作品层与站点整理层分开记录。D4 已保存 Wikimedia 固定条款字节，署名、适用性与转载义务仍待审核，尚不能提供整库可再分发结论。
