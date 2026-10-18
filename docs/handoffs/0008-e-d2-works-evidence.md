# 0008 E：D2 作品元数据补证与异常范围收敛

日期：2026-10-18。执行者：队员 E / DeepSeek。分支 `feat/e-d2-works-metadata`（基线 rebase 到 `main @ fa1f466`）。

## 完成

1. **字位更正（组长指正）**
   - 《静夜思》「举头望明月 → 举头望山月」是**第三句第四字**（举1 头2 望3 明4 月5）；「床前明月光 → 床前看月光」是**首句第三字**。
   - 连带自查出另一处错：《黄鹤楼》首句「乘黄鹤去 → 乘白云去」是**第五、六字**（原写「第六字 黄→白」）。
   - 《登鹳雀楼》「更上一层楼 → 更上一重楼」是**第四句第四字**（原未登记此异文，本轮补登）。
   - 已同步修正：`data/works/versions.md`、`review-queue.json`、`data/works/README.md`、PDF 稿。

2. **《静夜思》由「两版本」更正为「三版本」**（依据 C 的 `docs/rule-sources.md` §7.3，oldid=8747585）
   - 《唐诗三百首》（采用）`9d68fef6…`
   - 李太白全集（宋刊系统）`cc9d8fe1…`
   - 全唐詩（明月光 + 望山月）`f5ec10d4…` ← 本轮新增，此前漏登

3. **补正文与体裁的来源引用**（对接 C 与 J03）
   - 登鹳雀楼 oldid=2648160（C §7.2 已核）、静夜思 oldid=8747585（C §7.3 待确认）、黄鹤楼 oldid=2492584（C §7.4 已核）。
   - 表述统一为「**来源已定位、字节未留存**」：`data/raw/` 无副本、`data/sources/manifest.json` 无记录、无 `ev:` ID，
     因此 `metadata.json` 的 `evidenceIds` 保持为空。**未写「已核对」**。
   - 对接位置：J03 第二批 `docs/reviews/13_J03…` 的「二、三首正文版本与体裁标签」与「四、结论汇总（第 11 项）」。
     注：组长提到「第三部分第9项」，该文件第三部分是「第一批已批待 A 落库」，正文/体裁条目实际在第二、四部分；
     本轮按第二、四部分对接，若指的是别处请示下。
   - 「宋刊」这一版本系统名未核实到具体刊本/卷次，一律标**待验证**。

4. **金标准用例同步**（`tests/golden/cases/jingyesi.json`）
   - `sourceCandidates` 补维基文库 oldid 定位（`kind=located`）与待查线索（`kind=lead`）。
   - 断言补 `genre.formId = null`、`genre.applicability = "not_applicable"`，保留 `formFamily=ancient` 与 `basisType=reviewed_metadata`。
   - `reviewStatus` 仍为 `pending`、`reviewers=[]`、`evidenceIds=[]`；notes 明写「待审预期 ≠ 真实 API 已通过 ≠ 人工审核通过」。

5. **异常清单按「AI 初审 + 人工异常复核」重组**（`data/works/anomalies.md`）
   - 第一节「AI 初审已闭合」7 项（指纹可复算、形制、Schema、异文互异、未写进指纹、unverified 不参与、不简繁转换）→ **不上交组长**。
   - 第二节「需人工复核」6 项，其中组长**只需签 2 项**：`G-102`（版本定版）、`G-107`（乐府标签）。
   - 第三节「依赖核心」2 项（`G-101` 高吻合未实现、`G-105` 特征不全）→ 等核心。
   - 新增 `G-109`：「宋刊」版本名未核实，标待验证。

6. **PDF 改为待确认稿**：页眉/页脚标【待确认稿】，签字栏保留但明确「签字只代表同意版本方案，不升级 approved」。

7. **维护边界写明**：`data/works/metadata.json` **由 E 维护**；GLM 只负责 API 装载，不改条目内容。

## 修改文件

- `data/works/versions.md`（重写：三版本、字位更正、来源引用、四栏统计）
- `data/works/anomalies.md`（重写：AI 闭合 / 人工复核 / 依赖核心 三节）
- `data/works/review-queue.json`（重写：三版本、字位、`sourceRef`、`otherDifferences`）
- `data/works/README.md`（重写：字位、维护边界、来源口径）
- `tests/golden/cases/jingyesi.json`（来源线索 + 两条断言）
- `tests/integration/e2e/print-work-fingerprints.ts`（补算异文指纹）

## 未完成

- **J05 选模修复**：本轮未动代码（组长要求本轮先补证据与异常）。
- **J11 集成测试文件**：任务书压缩包内无 J 编号定义，待清单。
- 三首正文的版次/页码、古绝与特殊拗律的文献依据、乐府标签是否启用。

## 异常清单

`data/works/anomalies.md`：AI 闭合 7 项、需人工 6 项（其中 2 项待签）、依赖核心 2 项。

## 运行命令与真实结果

```powershell
pnpm exec vitest run packages/genre/tests   # 3 文件 38 项通过
pnpm verify                                  # exit 0（见下）
node node_modules/tsx/dist/cli.mjs tests/integration/e2e/print-work-fingerprints.ts
```

## 体裁核心修复进度（另行汇报所需）

- **核心批次已进 main**（`docs/handoffs/0007-codex-core-d2.md`）：评分现为 `toneFit/relationFit/rhymeFit` + `parallelismFit=null`，
  权重 .65/.20/.10/.05 按已有特征归一化；第一名 `wujue-ze-unrhymed`：score=1、keyRate=1、前三特征=1。
- **J05 根因已定位（在 0007 里被点名）**：`packages/genre/src/classify.ts` 的 `featuresComplete` 仍然要求 `parallelismFit !== null`，
  因此在「前三特征齐全、对仗为 null」的真实候选上，E 走不到高吻合分支，只能返回 `uncertain`。
- **J05 修复清单（下一批，待批准后执行）**：
  1. `featuresComplete` 只要求 `toneFit/relationFit/rhymeFit`；
  2. 补 auto 高吻合分支，正常路径不再抛 `GENRE_BRANCH_PENDING`，并迁移 D1 的过渡测试；
  3. 多候选按分数与分差选可靠模板（不只在 `pool.length===1` 时选），显式形式与 reviewed_metadata 同样要有选模通路；
  4. 阈值保持 0.90/0.75、并列 <0.05、关键位可判率 0.80，且**只看被选中候选**的 keyRate；
  5. 保留 needs_review、特征缺失、并列、低吻合的 `uncertain`，低分不自动判 `ancient`。
- **J11**：无定义，等待组长给清单。

## 下一步

1. 组长签 `G-102`/`G-107` → 才能谈 approved。
2. 批准后执行 J05（含 D1 过渡测试迁移）与 `core-genre-probe.mjs --expect-ready` 实跑。
3. 正文落 `data/raw/` + manifest 登记 → 申请 `ev:` ID。

## 需要组长决策

- 正文/体裁条目在 J03 中的位置（第二、四部分 vs「第三部分第9项」）。
- `G-102`、`G-107` 签字。
- J05 是否现在执行（本轮已按指令只补证据）、J11 定义。
