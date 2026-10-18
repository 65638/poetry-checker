# 覆盖报告（带分母，四栏口径）

快照：`data/normalized/pingshui.full-d2-patched.json`
dataVersion：`pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft`

> **快照口径**：本报告使用 `apps/api/src/snapshot-manifest.json` 为 pingshui 声明的当前快照（106 部，含上声三讲补缺）。105 部版 `pingshui.full-d2.json` 缺上声三讲、不在 API 清单内，不与本报告混用；两份快照的 `reviewStatus` 都是 `unverified`，都不代表已审核数据。

| 项目 | 结构完整性 | 机器对照 | 人工核验 | evidence approved |
| --- | --- | --- | --- | --- |
| 现状 | 引用/结构通过（快照 reviewStatus=unverified） | 96/96 字位有候选，缺字 0 | 作品审核 0/3，语境规则 0 条 | **0/106** |

> 结构通过 ≠ 内容审核通过。上表最后一栏才是决定能否出结论的那一栏。

| 作品 | 字位 | 有候选 | 缺字 | 多候选 | 其中平仄取决于消歧 | 无已审核证据 | resolve 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 登鹳雀楼 | 20 | 20 | 0 | 3 | 1 | 20 | 未就绪（LOOKUP_EVIDENCE_UNVERIFIED） |
| 静夜思 | 20 | 20 | 0 | 4 | 3 | 20 | 未就绪（LOOKUP_EVIDENCE_UNVERIFIED） |
| 黄鹤楼 | 56 | 56 | 0 | 15 | 6 | 56 | 未就绪（LOOKUP_EVIDENCE_UNVERIFIED） |

## 平仄取决于消歧的位置（共 10 个）

这些字位的候选同时含平与仄，选错会直接改变格律结论；其余多音字位属于「读音歧义但平仄已定」，不影响格律。

**登鹳雀楼**

- l4c1「更」：2 个候选（平仄 P/Z）
  - `pingshui:更:ping:八庚`
  - `pingshui:更:qu:二十四敬`

**静夜思**

- l3c3「望」：2 个候选（平仄 P/Z）
  - `pingshui:望:ping:七阳`
  - `pingshui:望:qu:二十三漾`
- l4c3「思」：2 个候选（平仄 P/Z）
  - `pingshui:思:ping:四支`
  - `pingshui:思:qu:四寘`
- l4c5「乡」：2 个候选（平仄 P/Z）
  - `pingshui:乡:ping:七阳`
  - `pingshui:乡:qu:二十三漾`

**黄鹤楼**

- l1c4「乘」：2 个候选（平仄 P/Z）
  - `pingshui:乘:ping:十蒸`
  - `pingshui:乘:qu:二十五径`
- l2c3「空」：3 个候选（平仄 P/Z）
  - `pingshui:空:ping:一东`
  - `pingshui:空:qu:一送`
  - `pingshui:空:shang:一董`
- l3c5「不」：2 个候选（平仄 P/Z）
  - `pingshui:不:ping:十一尤`
  - `pingshui:不:ru:入声五物`
- l4c5「空」：3 个候选（平仄 P/Z）
  - `pingshui:空:ping:一东`
  - `pingshui:空:qu:一送`
  - `pingshui:空:shang:一董`
- l5c5「汉」：2 个候选（平仄 P/Z）
  - `pingshui:汉:ping:十四寒`
  - `pingshui:汉:qu:十五翰`
- l7c3「乡」：2 个候选（平仄 P/Z）
  - `pingshui:乡:ping:七阳`
  - `pingshui:乡:qu:二十三漾`

## 读法

- **有候选 / 缺字**：lookup 层事实。当前全量表下三首诗 100% 有候选。
- **无已审核证据**：有候选但证据未审核，`resolveReadings` 按门槛抛 `LOOKUP_EVIDENCE_UNVERIFIED`。
- **仍歧义 / 未知 / 有效语境命中**：本批次全部为 0——没有一条规则通过审核、也没有一个字位拿到已审核证据。
- 因此本报告**不产生**读音准确率或自动覆盖率：任何比例都会是拿未核实数据算出来的。
