# 三库机器初审报告（2026-10-18）

队员 A 的 DeepSeek。产物：`data/reviews/ai-lexicon-precheck-2026-10-18.json`（机器可读）与本文件（人读）。

> **性质**：机器初审。只回答机器可判的事实（结构 / 引用 / 声类 / 字符 / 来源）。不回答「韵字归属是否符合韵书原义」——那必须人审。

## 0. 输入状态（原「输入缺失」已关闭）

旧版报告此处登记「AI初审方案缺失」。该文件已随 `59be7af` 入库，**本节改为已取得清单**。

| 路径 | 状态 | 引入提交 | 说明 |
|---|---|---|---|
| `docs/reviews/AI初审_人工异常复核方案_2026-10-18.md` | 已取得（原报告记为缺失，本次关闭该条） | 59be7af | 已读全文。本报告按其口径执行：§2.1 初审清单（含重复构建一致性、简繁异体是否被无依据合并、新韵生成器/规则/pinyin-data SHA）、§3 十类人工必复核与优先清单、§5 状态规则、§7 执行顺序。 |
| `docs/reviews/12_J03人审记录_第一批.md` | 已取得 | 59be7af | 第一批人审结论表（三讲九字属实、白/一/更/流/雪/物属实、楼↔樓 存疑成立、C 规则卡 9-12 属实）。 |
| `docs/reviews/13_J03三首核心诗逐字人审_第二批.md` | 已取得（空白工作表） | fa1f466 | 人工结论与审核人/时间均为 ____，见 §C4；不得从中读出任何批准。 |
| `docs/team/D2_审核任务书_2026-10-18/01_A_韵书数据与机器初审.md` | 已取得 | 59be7af | 本批任务书本体。 |
| `docs/reviews/D2进度审阅报告_2026-10-18.md` | 已取得 | 59be7af | 进度与分账依据。 |

**仍缺失的输入：无。**

已关闭的旧发现：

| 原编号 | 原发现 | 处置 |
|---|---|---|
| inputMissing（旧报告第 0 节） | AI初审_人工异常复核方案_2026-10-18.md 缺失 | 已关闭：方案随 59be7af 入库，已读全文并按其实施 |
| F-cross-002（v1，已关闭） | 审批依据文档 12_J03人审记录 未归档 | 已关闭：docs/reviews/12_J03人审记录_第一批.md 随 59be7af 入库。继任条目为 F-cross-002b（F-P3，仅提示 approved-evidence.json 的 authorityNote 措辞滞后），编号加 b 以免与本条混淆 |

### 0-B. 计数口径说明（外部口径 8238 / 5036 与实测 8240 / 5033）

**结论：采用实测值。** 组长 2026-10-18 定论：**采用实测值**（平水 8240、词林汉字 5033）。外部口径 8238/5036 无法在本仓库落盘文件中复现，判定为外部实习顾问口径漂移。**绝对不为凑数改动任何统计逻辑或数据**；本报告全部数字以实测为准。

| 项 | 外部顾问口径（已弃用） | 本报告实测（采用） |
|---|---|---|
| 平水 106 部去重字形 | ~~8238~~ | **8240**（raw／NFC／NFKC 三者相同） |
| 词林去重字形 | ~~5036~~ | raw **5037**；剔除非汉字后 **5033** |

已逐一排除的可能成因（均为实跑）：

- raw 去重：平水 106 部 8240、105 部 8232、词林 5037
- NFC 去重：与 raw 完全相同（8240 / 8232 / 5037）
- NFKC 去重：与 raw 完全相同（8240 / 8232 / 5037）→ 排除简繁/兼容字符重键
- 非汉字过滤：平水 0 条、词林 4 条（[ ] 空格 ，）→ 平水仍为 8240，词林 5033
- 多码点检查：四份快照 0 条违规 → 不存在代理对/组合字符分裂
- 繁体探针：講/項/樓/餘 在平水与词林快照中**均未出现** → 「繁体混进字符全集」假设不成立

**无法从落盘文件复现 8238 / 5036**，已由组长定论弃用该外部口径。本报告一律采用实测值，未按 8238/5036 调整任何统计、等式或数据；A1 自证等式按汉字全集成立（见 supplement.a1.universe.identities）。

**词林原表的 4 个非汉字垃圾已登记为 D 类 P1 异常**（见 §6 的 D 条目）：`[`(U+005B)、`]`(U+005D)、空格(U+0020)、`，`(U+FF0C)，分属第二部·仄声、第七部·仄声、第十八部·入声。它们都是单码点，故「单码点校验」抓不到；建议在**适配器导入层过滤**，不改原表字义事实。

**状态口径（方案 §5）**：本报告的 AI 初审结论状态为 `machine_checked`；契约字段 `reviewStatus` **未被改动**，approved 证据仍为审批清单落库的 **8** 条。按方案 §5：AI 初审通过结构/引用检查但未完成人工复核 → 本报告结论状态为 machine_checked。human_reviewed / rejected 等中间状态只写在报告与审核记录里，**不改契约字段 reviewStatus**（契约快照只有 approved / unverified）。四份快照 reviewStatus 一律保持 unverified；approved 只有 approved-evidence.json 落库的 8 条。

**第二批人审（13_）**：`docs/reviews/13_J03三首核心诗逐字人审_第二批.md` 确认为**空白工作表**（九个异常字位与三首关键字的「人工结论 / 采哪个候选 / 说明 / 审核人·时间」均为 ____；仅「AI 备考（非依据）」段有文字）。**新增 approved = 0 条**。第二批**待组长填写**，当前新增 approved = 0 条。禁止把「AI 备考（非依据）」当成结论，也禁止据该表提升任何证据状态。

## 1. 口径表（组长只看这张）

| 库 | dataVersion | 结构完整性 | 引用闭合 | 声类一致性 | 异常数 P0/P1/P2/P3 | 证据 approved | 发布门槛 |
|---|---|---|---|---|---|---|---|
| pingshui | `pingshui-cwr-ff0e9c1-d2-full` | ⚠ 105/106；缺 三讲；空 无；意外 无 | ✅ 四层闭合 | ✅ 三项全过 | 0/1/1/0 | 7/105 | **未通过** |
| pingshui | `pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft` | ✅ 106/106，无缺部无空部 | ✅ 四层闭合 | ✅ 三项全过 | 0/0/1/0 | 8/106 | **未通过** |
| cilin | `cilin-cwr-ff0e9c1-d2-full` | ✅ 33/33，无缺部无空部 | ✅ 四层闭合 | ✅ 三项全过（ze_unspecified 2237） | 0/0/1/1 | 0/33 | **未通过** |
| xinyun | `xinyun-rebuild-d2-full` | ✅ 56/56，无缺部无空部 | ✅ 四层闭合 | ✅ 三项全过 | 0/0/0/0 | 0/56 | **未通过** |

脚注：**中华新韵 = 十四韵规则 + pinyin-data 重建表，非官方原始表**（规则出处 unverified）。平水两行分别是 105 部原始快照与 106 部三讲草案快照，**并存而非覆盖**。

已排除的快照：

- `data/normalized/pingshui.sample-d1.json`：D1 七字真实小样本（8 候选），不属 D2 三库口径；其部级证据状态已由 approved-evidence 清单覆盖，本报告不重复初审。

## 1-B. 已完成项对账（②③④，全部实测）

本节按落盘 JSON 与补丁文件实测，**不引用任何转述数字**；与既定说法不符的项会直接标 FAIL。

| 项 | 既定说法 | 实测 | 一致 |
|---|---|---|---|
| ② 新韵 modernReading 缺失 0（占 51,608 条候选） | 缺失 0 / 51608 | **缺失 0 / 51608** | ✅ |
| ② 同(字,子卷)多读音清单 1,508 组 | 1508 | **1508** | ✅ |
| ③ 三库来源 ID 两两不同（词林不再与平水同 ID） | 互不相交 | **互不相交** | ✅ |
| ④ 平水 106 部快照 evidence approved 8/106 | 8 / 106 | **8 / 106** | ✅ |
| ④ 平水 105 部快照 evidence approved 7/105 | 7 / 105 | **7 / 105** | ✅ |
| ④ 七字样本证据 approved 7/7 | 7 / 7 | **7 / 7** | ✅ |

### ② 新韵 modernReading 回填

- dataVersion：`xinyun-rebuild-d2-full`；候选 **51608**；带 modernReading **51608**；缺失 **0**
- 调值与声类一致性异常 **0** 条；pinyin 含调号字符 **0** 条（应为无调号拼音）
- 同(字形,子卷)多读音清单：`data/patches/xinyun-reading-collisions.dev.json`，count **1508**，items **1508**

| 候选 ID | pinyin | toneNumber |
|---|---|---|
| `xinyun:㐷:shang:一麻·上声` | ma | 3 |
| `xinyun:㒀:shang:一麻·上声` | zha | 3 |
| `xinyun:㒷:shang:一麻·上声` | gua | 3 |
| `xinyun:㗳:shang:一麻·上声` | ta | 3 |
| `xinyun:㞎:shang:一麻·上声` | ba | 3 |
| `xinyun:㞚:shang:一麻·上声` | zha | 3 |

### ③ 来源 ID 跨库拆分

| 库 | dataVersion | 来源 ID |
|---|---|---|
| pingshui | `pingshui-cwr-ff0e9c1-d2-full` | `src:chinese_word_rhyme:pingshui` |
| pingshui | `pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft` | `src:chinese_word_rhyme:pingshui`、`src:wikisource:pingshuiyun` |
| cilin | `cilin-cwr-ff0e9c1-d2-full` | `src:chinese_word_rhyme:cilin` |
| xinyun | `xinyun-rebuild-d2-full` | `src:pinyin-data` |

跨库是否互不相交：**是（两两不同）**

### ④ 证据 approved 落库

| 快照 | dataVersion | approved / total |
|---|---|---|
| `pingshui.full-d2.json` | `pingshui-cwr-ff0e9c1-d2-full` | **7 / 105** |
| `pingshui.full-d2-patched.json` | `pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft` | **8 / 106** |
| `cilin.full-d2.json` | `cilin-cwr-ff0e9c1-d2-full` | **0 / 33** |
| `xinyun.full-d2.json` | `xinyun-rebuild-d2-full` | **0 / 56** |
| `pingshui.sample-d1.json` | `sample-pingshui-cwr-ff0e9c1-d1` | **7 / 7** |

**结论：②③④ 三项已消除 J07「词林 503」的硬阻塞原因** —— ③ 使平水/词林/新韵来源 ID 两两不同，`dedupeById` 不再触发跨库同 ID 不同内容冲突；② 使新韵候选具备可追溯读音；④ 使 8 条部级证据按审批清单落库。但**快照 reviewStatus 仍为 unverified、词林 approved 仍 0/33**，因此词林 503 只会从「来源冲突」性质转为「证据门槛」性质，**不是变成可用**。

## 1-C. A1 字级交叉核对（平水 106 部 × 词林 19 部，只做三分层）

**判定规则（原文，可复算）**：

> A1 声类比对只做三层：① 平水 ping ↔ 词林「平声」子卷；② 平水 shang 与 qu **都** ↔ 词林「仄声」子卷；③ 平水 ru ↔ 词林「入声」子卷（第 15–19 部）。逐字把两侧候选映射成层级集合 {平,仄,入}，集合相等记为一致。**不比对「平水上声 vs 平水去声」等四声细粒度**——词林仄声子卷本身不分上/去，强行细比必然产生假阳性；该差异只登记为口径差异，不进异常清单。

| 平水声类 | 映射层 | 允许的词林子卷声类 |
|---|---|---|
| ping | 平 | ping |
| shang | 仄 | ze_unspecified |
| qu | 仄 | ze_unspecified |
| ru | 入 | ru |

口径差异（**不计为异常**）：口径差异（不计为异常）：平水上声与去声在词林中同属「仄声」子卷，词林不区分上/去。因此「平水上 vs 平水去」的层次差在本比对中**被有意抹平**，只按三层论。同样，词林第 15–19 部只有入声子卷，与平水入声 17 部同属「入」层。

#### 字符全集与自证等式（本节所有计数的分母来源）

| 项 | 平水（106 部） | 词林（19 部） |
|---|---|---|
| 候选去重字符数（raw） | 8240 | 5037 |
| 其中非汉字条目（已剔除） | 0 | 4（空格 [ ] ，） |
| **汉字全集（本节分母）** | **8240** | **5033** |

自证等式：

- shared 4946 + pingshuiOnly 3294 = 8240（应等于平水汉字全集 8240）
- shared 4946 + cilinOnly 87 = 5033（应等于词林汉字全集 5033）

**等式全部成立：是**。口径说明：raw 去重数含非汉字条目（词林侧有 4 条），本节一律以「汉字全集」为分母，非汉字条目另立 D 类异常，不参与 A1 比对。

| 指标 | 实测 |
|---|---|
| 两库共有可比字 | **4946** |
| 三层集合一致 | **4468** |
| 三层集合不一致 | **478** |
| 平水有而词林无 | **3294** |
| 词林有而平水无 | **87** |
| 多归部个数差异（同字两侧韵部个数不等） | **964** |

①「平水多出层次」再按缺层拆分：

| 缺层类型 | 条数 |
|---|---|
| 词林有平水无仄 | 9 |
| 词林有平水无入 | 5 |
| 词林有平水无平 | 3 |
| 词林缺仄+词林缺入 | 1 |
| 词林缺仄 | 277 |
| 词林缺入+词林缺平 | 1 |
| 词林缺入 | 46 |
| 词林缺平 | 136 |

#### ① 平水多出层次（453 条）—— 各缺层类型前 10 例

**词林缺仄**（277 条）

| 字 | 平水层 | 词林层 | 平水部+声类 | 词林子卷+声类 | 两侧证据 ID |
|---|---|---|---|---|---|
| 临 | 仄/平 | 平 | 下平:十二侵(ping)<br>去:二十七沁(qu) | 第十三部·平声(ping) | ev:pingshui:下平:十二侵<br>ev:pingshui:去:二十七沁<br>|<br>ev:cilin:第十三部:第十三部·平声 |
| 乐 | 仄/入 | 入 | 去:十九效(qu)<br>入:入声三觉(ru)<br>入:入声十药(ru) | 第十六部·入声(ru) | ev:pingshui:去:十九效<br>ev:pingshui:入:入声三觉<br>ev:pingshui:入:入声十药<br>|<br>ev:cilin:第十六部:第十六部·入声 |
| 乡 | 仄/平 | 平 | 下平:七阳(ping)<br>去:二十三漾(qu) | 第二部·平声(ping) | ev:pingshui:下平:七阳<br>ev:pingshui:去:二十三漾<br>|<br>ev:cilin:第二部:第二部·平声 |
| 亟 | 仄/入 | 入 | 去:四寘(qu)<br>入:入声十三职(ru) | 第十七部·入声(ru) | ev:pingshui:去:四寘<br>ev:pingshui:入:入声十三职<br>|<br>ev:cilin:第十七部:第十七部·入声 |
| 亲 | 仄/平 | 平 | 上平:十一真(ping)<br>去:十二震(qu) | 第六部·平声(ping) | ev:pingshui:上平:十一真<br>ev:pingshui:去:十二震<br>|<br>ev:cilin:第六部:第六部·平声 |
| 仙 | 仄/平 | 平 | 下平:一先(ping)<br>上:十三阮(shang) | 第七部·平声(ping) | ev:pingshui:下平:一先<br>ev:pingshui:上:十三阮<br>|<br>ev:cilin:第七部:第七部·平声 |
| 伏 | 仄/入 | 入 | 去:二十六宥(qu)<br>入:入声一屋(ru)<br>入:入声十三职(ru) | 第十五部·入声(ru) | ev:pingshui:去:二十六宥<br>ev:pingshui:入:入声一屋<br>ev:pingshui:入:入声十三职<br>|<br>ev:cilin:第十五部:第十五部·入声 |
| 优 | 仄/平 | 平 | 下平:十一尤(ping)<br>上:二十五有(shang) | 第十二部·平声(ping) | ev:pingshui:下平:十一尤<br>ev:pingshui:上:二十五有<br>|<br>ev:cilin:第十二部:第十二部·平声 |
| 佻 | 仄/平 | 平 | 下平:二萧(ping)<br>上:十七筱(shang) | 第八部·平声(ping) | ev:pingshui:下平:二萧<br>ev:pingshui:上:十七筱<br>|<br>ev:cilin:第八部:第八部·平声 |
| 侦 | 仄/平 | 平 | 下平:八庚(ping)<br>去:二十四敬(qu) | 第十一部·平声(ping) | ev:pingshui:下平:八庚<br>ev:pingshui:去:二十四敬<br>|<br>ev:cilin:第十一部:第十一部·平声 |

**词林缺平**（136 条）

| 字 | 平水层 | 词林层 | 平水部+声类 | 词林子卷+声类 | 两侧证据 ID |
|---|---|---|---|---|---|
| 与 | 仄/平 | 仄 | 上平:六鱼(ping)<br>上:六语(shang)<br>去:六御(qu) | 第四部·仄声(ze_unspecified) | ev:pingshui:上平:六鱼<br>ev:pingshui:上:六语<br>ev:pingshui:去:六御<br>|<br>ev:cilin:第四部:第四部·仄声 |
| 且 | 仄/平 | 仄 | 上平:六鱼(ping)<br>上:二十一马(shang) | 第十部·仄声(ze_unspecified) | ev:pingshui:上平:六鱼<br>ev:pingshui:上:二十一马<br>|<br>ev:cilin:第十部:第十部·仄声 |
| 丽 | 仄/平 | 仄 | 上平:四支(ping)<br>去:八霁(qu) | 第三部·仄声(ze_unspecified) | ev:pingshui:上平:四支<br>ev:pingshui:去:八霁<br>|<br>ev:cilin:第三部:第三部·仄声 |
| 仔 | 仄/平 | 仄 | 上平:四支(ping)<br>下平:十一尤(ping)<br>上:四纸(shang) | 第三部·仄声(ze_unspecified) | ev:pingshui:上平:四支<br>ev:pingshui:下平:十一尤<br>ev:pingshui:上:四纸<br>|<br>ev:cilin:第三部:第三部·仄声 |
| 佼 | 仄/平 | 仄 | 下平:三肴(ping)<br>上:十八巧(shang) | 第八部·仄声(ze_unspecified) | ev:pingshui:下平:三肴<br>ev:pingshui:上:十八巧<br>|<br>ev:cilin:第八部:第八部·仄声 |
| 侘 | 仄/平 | 仄 | 下平:六麻(ping)<br>去:二十二祃(qu) | 第十部·仄声(ze_unspecified) | ev:pingshui:下平:六麻<br>ev:pingshui:去:二十二祃<br>|<br>ev:cilin:第十部:第十部·仄声 |
| 共 | 仄/平 | 仄 | 上平:二冬(ping)<br>去:二宋(qu) | 第一部·仄声(ze_unspecified) | ev:pingshui:上平:二冬<br>ev:pingshui:去:二宋<br>|<br>ev:cilin:第一部:第一部·仄声 |
| 冢 | 仄/平 | 仄 | 上平:一东(ping)<br>上:二肿(shang) | 第一部·仄声(ze_unspecified) | ev:pingshui:上平:一东<br>ev:pingshui:上:二肿<br>|<br>ev:cilin:第一部:第一部·仄声 |
| 剂 | 仄/平 | 仄 | 上平:四支(ping)<br>去:八霁(qu) | 第三部·仄声(ze_unspecified) | ev:pingshui:上平:四支<br>ev:pingshui:去:八霁<br>|<br>ev:cilin:第三部:第三部·仄声 |
| 剿 | 仄/平 | 仄 | 下平:三肴(ping)<br>上:十七筱(shang)<br>去:十八啸(qu) | 第八部·仄声(ze_unspecified) | ev:pingshui:下平:三肴<br>ev:pingshui:上:十七筱<br>ev:pingshui:去:十八啸<br>|<br>ev:cilin:第八部:第八部·仄声 |

**词林缺入**（46 条）

| 字 | 平水层 | 词林层 | 平水部+声类 | 词林子卷+声类 | 两侧证据 ID |
|---|---|---|---|---|---|
| 借 | 仄/入 | 仄 | 去:二十二祃(qu)<br>入:入声十一陌(ru) | 第十部·仄声(ze_unspecified) | ev:pingshui:去:二十二祃<br>ev:pingshui:入:入声十一陌<br>|<br>ev:cilin:第十部:第十部·仄声 |
| 假 | 仄/入 | 仄 | 上:二十一马(shang)<br>去:二十二祃(qu)<br>入:入声十一陌(ru) | 第十部·仄声(ze_unspecified) | ev:pingshui:上:二十一马<br>ev:pingshui:去:二十二祃<br>ev:pingshui:入:入声十一陌<br>|<br>ev:cilin:第十部:第十部·仄声 |
| 儿 | 入/平 | 平 | 上平:四支(ping)<br>上平:八齐(ping)<br>入:入声三觉(ru) | 第三部·平声(ping) | ev:pingshui:上平:四支<br>ev:pingshui:上平:八齐<br>ev:pingshui:入:入声三觉<br>|<br>ev:cilin:第三部:第三部·平声 |
| 冒 | 仄/入 | 仄 | 去:二十号(qu)<br>入:入声十三职(ru) | 第八部·仄声(ze_unspecified) | ev:pingshui:去:二十号<br>ev:pingshui:入:入声十三职<br>|<br>ev:cilin:第八部:第八部·仄声 |
| 准 | 仄/入 | 仄 | 上:十一轸(shang)<br>入:入声九屑(ru) | 第六部·仄声(ze_unspecified) | ev:pingshui:上:十一轸<br>ev:pingshui:入:入声九屑<br>|<br>ev:cilin:第六部:第六部·仄声 |
| 吊 | 仄/入 | 仄 | 去:十八啸(qu)<br>入:入声十二锡(ru) | 第八部·仄声(ze_unspecified) | ev:pingshui:去:十八啸<br>ev:pingshui:入:入声十二锡<br>|<br>ev:cilin:第八部:第八部·仄声 |
| 告 | 仄/入 | 仄 | 去:二十号(qu)<br>入:入声二沃(ru) | 第八部·仄声(ze_unspecified) | ev:pingshui:去:二十号<br>ev:pingshui:入:入声二沃<br>|<br>ev:cilin:第八部:第八部·仄声 |
| 囿 | 仄/入 | 仄 | 去:二十六宥(qu)<br>入:入声一屋(ru) | 第十二部·仄声(ze_unspecified) | ev:pingshui:去:二十六宥<br>ev:pingshui:入:入声一屋<br>|<br>ev:cilin:第十二部:第十二部·仄声 |
| 就 | 仄/入 | 仄 | 去:二十六宥(qu)<br>入:入声一屋(ru) | 第十二部·仄声(ze_unspecified) | ev:pingshui:去:二十六宥<br>ev:pingshui:入:入声一屋<br>|<br>ev:cilin:第十二部:第十二部·仄声 |
| 尼 | 入/平 | 平 | 上平:四支(ping)<br>入:入声四质(ru) | 第三部·平声(ping) | ev:pingshui:上平:四支<br>ev:pingshui:入:入声四质<br>|<br>ev:cilin:第三部:第三部·平声 |

**多缺组合**（2 条，前 10 例）

| 字 | 平水层 | 词林层 | 平水部+声类 | 词林子卷+声类 | 两侧证据 ID |
|---|---|---|---|---|---|
| 垒 | 仄/入/平 | 仄 | 上平:十灰(ping)<br>上:四纸(shang)<br>入:入声四质(ru) | 第三部·仄声(ze_unspecified) | ev:pingshui:上平:十灰<br>ev:pingshui:上:四纸<br>ev:pingshui:入:入声四质<br>|<br>ev:cilin:第三部:第三部·仄声 |
| 缪 | 仄/入/平 | 平 | 下平:十一尤(ping)<br>去:二十六宥(qu)<br>入:入声一屋(ru) | 第十二部·平声(ping) | ev:pingshui:下平:十一尤<br>ev:pingshui:去:二十六宥<br>ev:pingshui:入:入声一屋<br>|<br>ev:cilin:第十二部:第十二部·平声 |

#### ② 词林多出层次（17 条）—— 全 17 条中最值得看的 10 例

| 字 | 平水层 | 词林层 | 平水部+声类 | 词林子卷+声类 | 两侧证据 ID |
|---|---|---|---|---|---|
| 乎 | 平 | 入/平 | 上平:七虞(ping) | 第四部·平声(ping)<br>第十八部·入声(ru) | ev:pingshui:上平:七虞<br>|<br>ev:cilin:第四部:第四部·平声<br>ev:cilin:第十八部:第十八部·入声 |
| 凭 | 平 | 仄/平 | 下平:十蒸(ping) | 第十一部·平声(ping)<br>第十一部·仄声(ze_unspecified) | ev:pingshui:下平:十蒸<br>|<br>ev:cilin:第十一部:第十一部·平声<br>ev:cilin:第十一部:第十一部·仄声 |
| 刺 | 仄 | 仄/入 | 去:四寘(qu) | 第三部·仄声(ze_unspecified)<br>第十七部·入声(ru)<br>第十八部·入声(ru) | ev:pingshui:去:四寘<br>|<br>ev:cilin:第三部:第三部·仄声<br>ev:cilin:第十七部:第十七部·入声<br>ev:cilin:第十八部:第十八部·入声 |
| 哉 | 平 | 入/平 | 上平:十灰(ping) | 第五部·平声(ping)<br>第十八部·入声(ru) | ev:pingshui:上平:十灰<br>|<br>ev:cilin:第五部:第五部·平声<br>ev:cilin:第十八部:第十八部·入声 |
| 哪 | 平 | 仄/平 | 下平:五歌(ping) | 第九部·平声(ping)<br>第九部·仄声(ze_unspecified) | ev:pingshui:下平:五歌<br>|<br>ev:cilin:第九部:第九部·平声<br>ev:cilin:第九部:第九部·仄声 |
| 巨 | 仄 | 仄/平 | 上:六语(shang) | 第四部·仄声(ze_unspecified)<br>第十一部·平声(ping) | ev:pingshui:上:六语<br>|<br>ev:cilin:第四部:第四部·仄声<br>ev:cilin:第十一部:第十一部·平声 |
| 帅 | 入 | 仄/入 | 入:入声四质(ru) | 第三部·仄声(ze_unspecified)<br>第十七部·入声(ru) | ev:pingshui:入:入声四质<br>|<br>ev:cilin:第三部:第三部·仄声<br>ev:cilin:第十七部:第十七部·入声 |
| 帕 | 入 | 仄/入 | 入:入声八黠(ru) | 第十部·仄声(ze_unspecified)<br>第十八部·入声(ru) | ev:pingshui:入:入声八黠<br>|<br>ev:cilin:第十部:第十部·仄声<br>ev:cilin:第十八部:第十八部·入声 |
| 怅 | 仄 | 仄/平 | 去:二十三漾(qu) | 第二部·平声(ping)<br>第二部·仄声(ze_unspecified) | ev:pingshui:去:二十三漾<br>|<br>ev:cilin:第二部:第二部·平声<br>ev:cilin:第二部:第二部·仄声 |
| 拖 | 平 | 仄/平 | 下平:五歌(ping) | 第九部·平声(ping)<br>第九部·仄声(ze_unspecified) | ev:pingshui:下平:五歌<br>|<br>ev:cilin:第九部:第九部·平声<br>ev:cilin:第九部:第九部·仄声 |

#### ③ 层次集合不同（8 条）—— **逐条全列**

| 字 | 平水层 | 词林层 | 平水部+声类 | 词林子卷+声类 | 两侧证据 ID |
|---|---|---|---|---|---|
| 先 | 仄 | 平 | 去:十七霰(qu) | 第七部·平声(ping) | ev:pingshui:去:十七霰<br>|<br>ev:cilin:第七部:第七部·平声 |
| 咳 | 平 | 仄 | 上平:十灰(ping) | 第五部·仄声(ze_unspecified) | ev:pingshui:上平:十灰<br>|<br>ev:cilin:第五部:第五部·仄声 |
| 喻 | 平 | 仄 | 上平:七虞(ping) | 第四部·仄声(ze_unspecified) | ev:pingshui:上平:七虞<br>|<br>ev:cilin:第四部:第四部·仄声 |
| 岿 | 仄 | 平 | 上:四纸(shang)<br>去:四寘(qu) | 第三部·平声(ping) | ev:pingshui:上:四纸<br>ev:pingshui:去:四寘<br>|<br>ev:cilin:第三部:第三部·平声 |
| 崭 | 平 | 仄 | 下平:十五咸(ping) | 第十四部·仄声(ze_unspecified) | ev:pingshui:下平:十五咸<br>|<br>ev:cilin:第十四部:第十四部·仄声 |
| 槎 | 仄 | 平 | 上:二十一马(shang) | 第十部·平声(ping) | ev:pingshui:上:二十一马<br>|<br>ev:cilin:第十部:第十部·平声 |
| 琏 | 仄 | 平 | 上:十六铣(shang) | 第七部·平声(ping) | ev:pingshui:上:十六铣<br>|<br>ev:cilin:第七部:第七部·平声 |
| 秸 | 入 | 平 | 入:入声八黠(ru) | 第五部·平声(ping) | ev:pingshui:入:入声八黠<br>|<br>ev:cilin:第五部:第五部·平声 |

**取全量**：JSON 路径 `data/reviews/ai-lexicon-precheck-2026-10-18.json` → 字段 `supplement.a1.inconsistentDetails`（478 条，每条含 `character` / `subtype` / `missingKey` / `pingshuiLayers` / `cilinLayers` / `pingshuiMembers` / `cilinMembers`）；按 `subtype` 过滤即得上表三类。可复算命令：`node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts`。

**口径声明：这 478 条属「两库差异（待核实）」，不计入异常总账**，不塞进 P1/P2。它们说明的是「两张表对同一字的声类分层记录不同」，本身既非数据错误也非缺陷——要判定谁对，必须逐字回到平水/词林各自底本，属人审范围。

#### 派生统计：平水 106 部在词林侧的覆盖（top 15，按未覆盖降序）

方法：按平水 groupId 分组：取该韵部的全部汉字（\p{Script=Han}），统计其中不在词林汉字全集内的数量。词林汉字全集由 cilin.full-d2.json 的候选字符去重、剔除非汉字后得到。

| 平水韵部 | 该部字形数 | 词林已覆盖 | 未覆盖 | 覆盖率 |
|---|---|---|---|---|
| 上平:四支 | 440 | 217 | 223 | 49.3% |
| 下平:十一尤 | 249 | 130 | 119 | 52.2% |
| 上平:七虞 | 283 | 166 | 117 | 58.7% |
| 去:四寘 | 274 | 166 | 108 | 60.6% |
| 上:四纸 | 235 | 132 | 103 | 56.2% |
| 下平:一先 | 239 | 138 | 101 | 57.7% |
| 下平:七阳 | 266 | 177 | 89 | 66.5% |
| 下平:二萧 | 194 | 110 | 84 | 56.7% |
| 去:八霁 | 199 | 118 | 81 | 59.3% |
| 上平:十一真 | 176 | 96 | 80 | 54.5% |
| 入:入声一屋 | 188 | 109 | 79 | 58.0% |
| 上平:一东 | 152 | 76 | 76 | 50.0% |
| 入:入声十药 | 182 | 106 | 76 | 58.2% |
| 入:入声四质 | 147 | 73 | 74 | 49.7% |
| 上:十六铣 | 142 | 72 | 70 | 50.7% |

全 106 行见 JSON 的 `supplement.a1Coverage.rows`。**必读警示**：词林 19 部 / 33 子卷与平水 106 部是**不同粒度**：本表只说明「该平水韵部的字在词林侧是否被收录」，**不能读作「词林缺了平水某部」**，也不能读作词林某部的错漏。**禁令**：本表**不得**与 A2 的 19→106 映射草案交叉使用（该草案 status=unverified、basis=null）。

平水独有字（前 120 个）：`㛀㛤㟥㤭㤽㥪㧑㱩㲿㳡㴋㶉䃅䇲䉤䌷䌹䍁䏝䓖䗖䜣䝙䥽䦆䩄䯄丱丳乂乩亍亳亶亹仂他仚仟仡仳份伋伎伛伣伥伻伽伾佌佖余佰佶佸佹佺佽佾侀侁侅侐侗侜侲侳侹侺俅俙俚俛俣俴俵俶俾倅倓倕倢倥倬偁偆偈偊偌偓偞偯偲偾傃傋傒傕傜傞傥傧傩傺僄僆僇僋僎僖僛僝僩僬僰僸僽僾僿` …

词林独有字（前 120 个）：`亘做勾吒吵咂咛啼嗅嗳噍坞坯垅姮孪嵴徭徴惭戌扫抄拿捅昂曝桔椁槃浜溪灶炉燃獐獾珉癯皙眚睹碗碟礁秤稿篠粳粽糖糠綳绔罱耙肮胭腮舱芪荭葡葱蘖蚋蚍蜺蝴蟋袜袱襇觑迳迹遍钜镟阒颚飚馅鳊鴂𣘼𦶟`

**结论边界**：以上只写「字级三层一致/不一致」统计，**不写「词林某部等于平水某部」**——部对部映射需要词林部次合并关系的权威来源，本仓库未取得。

## 1-D. A2 待核实映射草案（单独成文件，不作结论）

- 文件：`data/reviews/cilin-pingshui-mapping-draft-2026-10-18.json`；**草案条数 19 条**（每条形如「词林第N部 ⊃ 平水{…}」）。
- 每条 `status = "unverified"`、`basis = null`；本文件是「待核实映射草案」：status 一律 unverified、basis 一律 null。所有条目仅由同字共现统计导出，**不得被任何快照或报告当作事实引用**，也不得据此认定词林某部等于平水某部。
- 本报告**只引用草案条数**，不引用草案内容作为任何结论；草案已写入文件头的禁用清单。

## 1-E. 方案 §2.1 补全（B1 / B2 / B3）

### B1 同 dataVersion 重复构建一致性

规则：同 dataVersion 重复构建一致性：读同一落盘文件 → 两次独立 JSON.parse → 各算一次 businessContentDigest → 互比 → 再与 0009 已登记摘要比对。**不重跑构建脚本**（重跑会产出新字节、污染已审文件）。

| 快照 | 两次摘要一致 | 与 0009 已登记摘要 |
|---|---|---|
| `pingshui.full-d2.json` | ✅ | ✅ 一致 |
| `pingshui.full-d2-patched.json` | ✅ | ✅ 一致 |
| `cilin.full-d2.json` | ✅ | （无已登记值可比） |
| `xinyun.full-d2.json` | ✅ | ✅ 一致 |

结论：重复构建摘要全部一致 = **是**；与已登记摘要无冲突 = **是**。

### B2 简繁/异体是否被未经依据合并

边文件 `data/variants/variant-edges-d2.json`：共 5 条，状态分布 {"pending_review":3,"applied_in_patch":2}。

| 状态 | 边 |
|---|---|
| applied_in_patch | `edge-講-讲`：講→讲 |
| applied_in_patch | `edge-項-项`：項→项 |
| pending_review | `edge-樓-楼`：樓→楼 |
| pending_review | `edge-餘-余`：餘→余 |
| pending_review | `edge-馀-余`：馀→余 |

繁体形探测（韵书表出现 = 有人借异体边塞字；新韵出现 = pinyin-data 逐码位重建的预期）：

| 繁体形 | 平水/词林（韵书表） | 新韵（重建表） |
|---|---|---|
| 樓 | **未出现** ✅ | 有（预期：独立码位） |
| 餘 | **未出现** ✅ | 有（预期：独立码位） |
| 講 | **未出现** ✅ | 有（预期：独立码位） |
| 項 | **未出现** ✅ | 有（预期：独立码位） |

**结论：有效合并数 = 0**。未发现任何未经依据的合并：0 条边为 approved（3 条 pending_review 未启用）；韵书表（平水/词林）中「樓/餘/講/項」四个繁体形**均未出现**，说明繁体形没有被塞进韵书表；新韵快照中含其中 4 个繁体形，属 pinyin-data 逐码位重建的预期（简繁各为独立码位，各成候选），**不是合并**。applied_in_patch 的 2 条仅限三讲补丁内的 講→讲、項→项（已人审签），属补丁内转换，且未改动韵书表既有归属。

### B3 新韵生成器版本 / 规则版本 / pinyin-data SHA 可追溯性

| 项 | 值 | 能否机器读取 |
|---|---|---|
| 规则版本 | `xinyun-14-rules-d1` | 仅 notice 文本（命中=true） |
| 生成器版本 | `xinyun-rebuild-gen/0.1.0` | 仅 notice 文本（命中=true） |
| pinyin-data revision | `fa9761fff402f8560196b1ba085c437c52b56d7c` | sources 记录（可读） |
| pinyin.txt SHA-256 | `6170ab4ff7c9740fe765b1d35e6d3ad43554dd02874199388db513c44dcddf9d` | sources 记录；与落盘字节一致=true |
| 结构化版本字段 | 无 | `structuredVersionFields=false` |

新韵三项可追溯但**不结构化**：规则版本与生成器版本只写在快照 notice 文本里（可 grep 到），pinyin-data 的 revision 与 SHA-256 写在 source 记录里且与落盘字节一致；快照 Schema 没有 generatorVersion/rulesVersion 字段，机器无法直接读取。

## 2. 每库实测明细

### data/normalized/pingshui.full-d2.json

- dataVersion：`pingshui-cwr-ff0e9c1-d2-full`；book：pingshui；reviewStatus：**unverified**
- 韵部数 105 / 门槛 106；非空 105；空部 0；重复韵目 0
- bucketCounts 实测 {"上平":15,"下平":15,"上":28,"去":30,"入":17} / 应有 {"上平":15,"下平":15,"上":29,"去":30,"入":17}
- 缺失 三讲；意外 （无）
- 候选 10378；不同字形 8232；多归部字形 1823
- 同字同韵部多候选 0 组；同字同父级(卷/部/韵)多候选 547 组
- 声类三项：toneClass↔部 不符 0；tone↔toneClass 不符 0；ze_unspecified 0 条 / 0 组 / 越界 0
- 单码点校验：检查 10378 条，违规 0 条
- 证据 105 条（approved 7 / unverified 98）；越权 approved 0；审批清单未命中 1 条，均属预期（跨库全局清单 + 105/106 部差异），不计为异常。
- 业务内容摘要：`ecf6c42466771b616cc611cb6ed265208145d73eb01f752ceca0cc2b625d8d1f`
- 规范化 JSON 摘要：`d5fe844691ec2b8a36f211ec4089c8fb5ee7b916050ceee29b8549548bf49bfc`
- 生成器/规则版本：（快照未登记） / （快照未登记）

| 来源 ID | revision | sha256（登记） | 落盘文件 | 与字节一致 |
|---|---|---|---|---|
| `src:chinese_word_rhyme:pingshui` | ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18 | `fd11164ca1b848eb6b777688d5d6628ce772d72d0a25a0efd12d6b58459c6e2e` | data/raw/chinese_word_rhyme/Pingshui_Rhyme.json | ✅ |

### data/normalized/pingshui.full-d2-patched.json

- dataVersion：`pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft`；book：pingshui；reviewStatus：**unverified**
- 韵部数 106 / 门槛 106；非空 106；空部 0；重复韵目 0
- bucketCounts 实测 {"上平":15,"下平":15,"上":29,"去":30,"入":17} / 应有 {"上平":15,"下平":15,"上":29,"去":30,"入":17}
- 缺失 （无）；意外 （无）
- 候选 10387；不同字形 8240；多归部字形 1824
- 同字同韵部多候选 0 组；同字同父级(卷/部/韵)多候选 548 组
- 声类三项：toneClass↔部 不符 0；tone↔toneClass 不符 0；ze_unspecified 0 条 / 0 组 / 越界 0
- 单码点校验：检查 10387 条，违规 0 条
- 证据 106 条（approved 8 / unverified 98）；越权 approved 0；审批清单 ID 在本快照内全部命中。
- 业务内容摘要：`4d75fc46d04ef87cf76f1db5ebf329e0353f0fac7c5d9ed98c7ebd27339d64ea`
- 规范化 JSON 摘要：`79cf631414e126a3145b733e66966abd21a0ad589e4a0c2d2cd2f6b3c6ede95c`
- 生成器/规则版本：（快照未登记） / （快照未登记）

| 来源 ID | revision | sha256（登记） | 落盘文件 | 与字节一致 |
|---|---|---|---|---|
| `src:chinese_word_rhyme:pingshui` | ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18 | `fd11164ca1b848eb6b777688d5d6628ce772d72d0a25a0efd12d6b58459c6e2e` | data/raw/chinese_word_rhyme/Pingshui_Rhyme.json | ✅ |
| `src:wikisource:pingshuiyun` | 8264804 | `f0297bff7b66cde18bcb2644b5d9c6320ac90253f63a8aa178e489170a810ce2` | data/raw/wikisource/PingshuiYun-8264804.wikitext | ✅ |

### data/normalized/cilin.full-d2.json

- dataVersion：`cilin-cwr-ff0e9c1-d2-full`；book：cilin；reviewStatus：**unverified**
- 韵部数 33 / 门槛 33；非空 33；空部 0；重复韵目 0
- bucketCounts 实测 {"第一部":2,"第二部":2,"第三部":2,"第四部":2,"第五部":2,"第六部":2,"第七部":2,"第八部":2,"第九部":2,"第十部":2,"第十一部":2,"第十二部":2,"第十三部":2,"第十四部":2,"第十五部":1,"第十六部":1,"第十七部":1,"第十八部":1,"第十九部":1} / 应有 {"第一部":2,"第二部":2,"第三部":2,"第四部":2,"第五部":2,"第六部":2,"第七部":2,"第八部":2,"第九部":2,"第十部":2,"第十一部":2,"第十二部":2,"第十三部":2,"第十四部":2,"第十五部":1,"第十六部":1,"第十七部":1,"第十八部":1,"第十九部":1}
- 缺失 （无）；意外 （无）
- 候选 5403；不同字形 5037；多归部字形 354
- 同字同韵部多候选 0 组；同字同父级(卷/部/韵)多候选 205 组
- 声类三项：toneClass↔部 不符 0；tone↔toneClass 不符 0；ze_unspecified 2237 条 / 14 组 / 越界 0
- 单码点校验：检查 5403 条，违规 0 条
- 证据 33 条（approved 0 / unverified 33）；越权 approved 0；审批清单未命中 8 条，均属预期（跨库全局清单 + 105/106 部差异），不计为异常。
- 业务内容摘要：`bcbeb62ada9a5b6a72e69dbdee844f10e0466b40fd46939b0b3e4f56f09d38e8`
- 规范化 JSON 摘要：`949ef07b9968d57b5ccbc579a0ee25946c362fb269dcfdcb3a4b6018914f3927`
- 生成器/规则版本：（快照未登记） / （快照未登记）

| 来源 ID | revision | sha256（登记） | 落盘文件 | 与字节一致 |
|---|---|---|---|---|
| `src:chinese_word_rhyme:cilin` | ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18 | `615736bb33a3c8657bf7d6a7d27f9698eaa4e82fbc76d19c425cb0d9e416032f` | data/raw/chinese_word_rhyme/Cilin_Rhyme.json | ✅ |

### data/normalized/xinyun.full-d2.json

- dataVersion：`xinyun-rebuild-d2-full`；book：xinyun；reviewStatus：**unverified**
- 韵部数 56 / 门槛 56；非空 56；空部 0；重复韵目 0
- bucketCounts 实测 {"一麻":4,"七尤":4,"三皆":4,"九文":4,"二波":4,"五微":4,"八寒":4,"六豪":4,"十一庚":4,"十三支":4,"十二齐":4,"十唐":4,"十四姑":4,"四开":4} / 应有 {"一麻":4,"二波":4,"三皆":4,"四开":4,"五微":4,"六豪":4,"七尤":4,"八寒":4,"九文":4,"十唐":4,"十一庚":4,"十二齐":4,"十三支":4,"十四姑":4}
- 缺失 （无）；意外 （无）
- 候选 51608；不同字形 41803；多归部字形 7777
- 同字同韵部多候选 0 组；同字同父级(卷/部/韵)多候选 4472 组
- 声类三项：toneClass↔部 不符 0；tone↔toneClass 不符 0；ze_unspecified 0 条 / 0 组 / 越界 0
- 单码点校验：检查 51608 条，违规 0 条
- 证据 56 条（approved 0 / unverified 56）；越权 approved 0；审批清单未命中 8 条，均属预期（跨库全局清单 + 105/106 部差异），不计为异常。
- 业务内容摘要：`4a68bd5782ec6e2de7e0682edca0a38534307f4dd28702db487875815c690ae5`
- 规范化 JSON 摘要：`e245829ae0eb7a5b72647d62cf379920e000f3e7bf6f61bf1735a1830de79af4`
- 生成器/规则版本：xinyun-rebuild-gen/0.1.0 / xinyun-14-rules-d1

| 来源 ID | revision | sha256（登记） | 落盘文件 | 与字节一致 |
|---|---|---|---|---|
| `src:pinyin-data` | fa9761fff402f8560196b1ba085c437c52b56d7c | `6170ab4ff7c9740fe765b1d35e6d3ad43554dd02874199388db513c44dcddf9d` | data/raw/pinyin-data/pinyin.txt | ✅ |

## 3. 四层引用闭合（悬空明细）

### data/normalized/pingshui.full-d2.json

✅ 候选→韵部→证据→来源 四层全部可解析；四层 ID 均无重复。

### data/normalized/pingshui.full-d2-patched.json

✅ 候选→韵部→证据→来源 四层全部可解析；四层 ID 均无重复。

### data/normalized/cilin.full-d2.json

✅ 候选→韵部→证据→来源 四层全部可解析；四层 ID 均无重复。

### data/normalized/xinyun.full-d2.json

✅ 候选→韵部→证据→来源 四层全部可解析；四层 ID 均无重复。

## 4. 声类一致性（三项独立）

### 4.1 toneClass ↔ 所在部

✅ 四份快照逐条比对，0 条不符。

### 4.2 tone ↔ toneClass

✅ 四份快照按「平/阴阳平=P，上/去/入/仄未分=Z，neutral=null」比对，0 条不符。

### 4.3 ze_unspecified 落点（词林重点）

- cilin：**2237** 条，分布于 14 个仄声子卷，越界 **0** 条

口径：`ze_unspecified` 只允许出现在词林的「第N部·仄声」子卷。它是「来源只标仄声」的如实记录，**不得**臆补成上声或去声，也不得为让平仄更“确定”而降级为单一仄。

## 5. 专项实测：一字多部 / 多音

- `pingshui-cwr-ff0e9c1-d2-full` · 「玤」：1 条候选 `pingshui:玤:shang:一董`；归属 `group:pingshui:上:一董`；双归属判据不适用于本库/本快照
- `pingshui-cwr-ff0e9c1-d2-full` · 「一」：1 条候选 `pingshui:一:ru:入声四质`；归属 `group:pingshui:入:入声四质`；双归属判据不适用于本库/本快照
- `pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft` · 「玤」：2 条候选 `pingshui:玤:shang:一董`、`pingshui:玤:shang:三讲`；归属 `group:pingshui:上:一董`、`group:pingshui:上:三讲`；**一董+三讲双归属成立（红线 3 通过）**
- `pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft` · 「一」：1 条候选 `pingshui:一:ru:入声四质`；归属 `group:pingshui:入:入声四质`；双归属判据不适用于本库/本快照
- `cilin-cwr-ff0e9c1-d2-full` · 「一」：1 条候选 `cilin:一:ru:第十七部·入声`；归属 `group:cilin:第十七部:第十七部·入声`；双归属判据不适用于本库/本快照
- `xinyun-rebuild-d2-full` · 「玤」：1 条候选 `xinyun:玤:qu:十唐·去声`；归属 `group:xinyun:十唐:十唐·去声`；双归属判据不适用于本库/本快照
- `xinyun-rebuild-d2-full` · 「一」：3 条候选 `xinyun:一:qu:十二齐·去声`、`xinyun:一:yangping:十二齐·阳平`、`xinyun:一:yinping:十二齐·阴平`；归属 `group:xinyun:十二齐:十二齐·去声`、`group:xinyun:十二齐:十二齐·阳平`、`group:xinyun:十二齐:十二齐·阴平`；双归属判据不适用于本库/本快照

要求：「玤」必须同时保留一董与三讲归属（红线 3）；「一」的语流变调冲突 resolution=null 未裁决，不得默认采用任一声调、不得删除竞争者。

## 6. 异常清单（分类法 A–H）

分类：A 结构 / B 声类 / C 引用 / D 字符 / E 多音 / F 来源 / G 新韵特有 / H 三讲补丁。P0=会让下游出错；P1=数据缺口或接线缺陷；P2=口径/文档不一致；P3=提示。

合计 **17** 条：P0=0 / P1=4 / P2=7 / P3=6

| 分类 | 条数 |
|---|---|
| A | 1 |
| B | 1 |
| C | 1 |
| D | 2 |
| E | 2 |
| F | 7 |
| G | 1 |
| H | 2 |

### P0（0 条）

（无）

### P1（4 条）

| 异常 ID | 类 | 库 | 位置 | 事实 | 判定依据 | 影响面 | 建议动作 | 动作类型 |
|---|---|---|---|---|---|---|---|---|
| A-pingshui-001 | A | pingshui | `data/normalized/pingshui.full-d2.json · groups` | 缺失韵目 1 个：三讲；连带结果：韵部 105/106，分部 {"上平":15,"下平":15,"上":28,"去":30,"入":17}（应有 {"上平":15,"下平":15,"上":29,"去":30,"入":17}） | checkCompleteness(平水韵（106 部）) 逐步比对核定韵目集合 | 该韵部下的字无法归部，按韵部查询会漏；结构门槛不通过 | 数据缺口，需补来源后重构建；不得新增空韵目凑数 | 数据事实需人审 |
| C-cross-001 | C | cross | `scripts/data/inspect.ts:14（相对 import 使用 .js 扩展名）` | 验收命令 `node --conditions=development scripts/data/inspect.ts` 无法运行：ERR_MODULE_NOT_FOUND packages/lexicon/src/adapters/chinese-word-rhyme.js | Node 24 原生类型剥离不改写相对 import 的 .js→.ts；A 侧本机外部终端实测 EXIT=1；改用 tsx 入口后 EXIT=0 | 任务书第 5 步的验收命令之一本身不可用，易被误判为数据故障 | 把验收命令与文档统一为 `node node_modules/tsx/dist/cli.mjs scripts/data/inspect.ts`（只改脚本与文档） | 接线/脚本可修 |
| D-cross-003 | D | cross<br>affected: `cilin-cwr-ff0e9c1-d2-full` | `cilin.full-d2.json · candidates` | 词林快照含 4 条**非汉字**候选：空格(U+0020)、[(U+5B)、](U+5D)、，(U+FF0C)；示例候选 ID：cilin:[:ze_unspecified:第二部·仄声、cilin:[:ze_unspecified:第七部·仄声、cilin:[:ru:第十八部·入声、cilin:]:ze_unspecified:第二部·仄声 | 以 \p{Script=Han} 判定。这些条目都是**单码点**，所以「单码点校验」抓不到；但字符本身不是汉字，属解析/导入残留 | 污染字形统计（raw 去重 5037 vs 汉字 5033），并使 A1 交叉比对的字符全集虚高；用户永远查不到它们，但统计会被抬高 | 核对 Cilin_Rhyme.json 对应行；若为注文/括号解析残留，应在适配器导入层过滤（不改原表字义事实） | 接线/脚本可修 |
| G-cross-010 | G | cross | `data/patches/xinyun-rebuild-report.dev.json · coverage` | 新韵重建：读音源字形 41923、读音 53457；未映射 43（FINAL_NOT_IN_RULES 9 / UNKNOWN_LETTER 30 / VOWEL_LESS 4）；轻声丢弃 241；er 等待核实规则影响 104 条 | 取自 data/patches/xinyun-rebuild-report.dev.json（rebuild-xinyun.ts 的产物，可能滞后于 build-xinyun.ts） | 这些读音不进表：轻声本调不明未默认归平；未映射项是明确不收，不是补齐进度 | 保持现状（不猜补）；er→十二齐 口径待人审核实；需对齐最新构建可重跑 rebuild-xinyun.ts | 数据事实需人审 |

### P2（7 条）

| 异常 ID | 类 | 库 | 位置 | 事实 | 判定依据 | 影响面 | 建议动作 | 动作类型 |
|---|---|---|---|---|---|---|---|---|
| F-pingshui-002 | F | pingshui | `data/normalized/pingshui.full-d2.json · 快照头` | 快照未登记生成器/规则版本字段 | SnapshotInput 结构无 generatorVersion/rulesVersion；平水与词林由 build-*.ts 直接生成，版本只能从脚本名推断 | 无法仅凭数据包回答「这份数据由哪版脚本产出」 | 在 notice 或独立 descriptor 中登记脚本版本（不改快照 Schema） | 接线/脚本可修 |
| F-pingshui-001 | F | pingshui | `data/normalized/pingshui.full-d2-patched.json · 快照头` | 快照未登记生成器/规则版本字段 | SnapshotInput 结构无 generatorVersion/rulesVersion；平水与词林由 build-*.ts 直接生成，版本只能从脚本名推断 | 无法仅凭数据包回答「这份数据由哪版脚本产出」 | 在 notice 或独立 descriptor 中登记脚本版本（不改快照 Schema） | 接线/脚本可修 |
| F-cilin-002 | F | cilin | `data/normalized/cilin.full-d2.json · 快照头` | 快照未登记生成器/规则版本字段 | SnapshotInput 结构无 generatorVersion/rulesVersion；平水与词林由 build-*.ts 直接生成，版本只能从脚本名推断 | 无法仅凭数据包回答「这份数据由哪版脚本产出」 | 在 notice 或独立 descriptor 中登记脚本版本（不改快照 Schema） | 接线/脚本可修 |
| F-cross-005 | F | cross | `data/sources/manifest.json · src:wikisource:pingshuiyun.license` | 该来源的许可为**两层**：作品层 {{PD-old}}（落盘字节第 655-656 行页脚，已核）；站点层 CC BY-SA 4.0（Wikimedia 站点条款，页面模板里没有，条款文本未取得）。manifest 已改为 workLayer / siteLayer / conclusion 三键分别登记，不作单一许可结论 | 字节实测（页脚模板）+ 组长 2026-10-18 定论：两层不是矛盾也不是笔误；站点层条款文本未取得 → pendingReview | 若只引任一层都会出错：只引 PD-old 会漏掉站点署名义务；只引 CC BY-SA 会与字节不符。两层均不构成「可商用」证明 | 保持双层登记；取得站点条款文本或确认署名方式后，仅更新 siteLayer.status，不改作品层 | 数据事实需人审 |
| F-cross-006 | F | cross<br>affected: `pingshui-cwr-ff0e9c1-d2-full`<br>`pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft`<br>`cilin-cwr-ff0e9c1-d2-full`<br>`xinyun-rebuild-d2-full` | `data/normalized/*.json（快照头）· SnapshotInput 结构` | 新韵的规则版本 xinyun-14-rules-d1 与生成器版本 xinyun-rebuild-gen/0.1.0 只写在快照 notice 文本里（notice 命中：规则=true、生成器=true）；pinyin-data revision=fa9761fff402f8560196b1ba085c437c52b56d7c、SHA-256 与落盘字节一致=true；但快照 Schema **没有** generatorVersion/rulesVersion 字段，机器无法结构化读取；平水/词林同样无该字段 | 读四份快照的 notice 与 sources；SnapshotInput 类型定义无版本字段；pinyin.txt 字节重算比对 | 「同一 dataVersion 对应哪版脚本与规则」只能靠读文案回答，不能机器校验；对方案 §2.1「检查生成器版本、规则版本和 pinyin-data SHA」只能给部分答案 | 由 GLM 决定是否在快照外围加 descriptor（不改契约字段）；在此之前，版本以 notice 文本 + 本报告为准 | 接线/脚本可修 |
| D-cross-009 | D | cross | `data/variants/variant-edges-d2.json` | 简繁/异体候选边共 5 条：pending_review 3 条（樓→楼、餘→余、馀→余）、applied_in_patch 2 条、approved 0 条 | 文件 summary 与 edges[].status 实测 | 未签边不生效：正文若写繁体（如「樓」）仍进 missing；已签边只属查询召回，不等于等价合并 | 按 0008 方案逐条人审签；签前不得让消费方启用 | 数据事实需人审 |
| E-cross-011 | E | cross | `data/patches/xinyun-reading-collisions.dev.json` | 同(字形,子卷)多读音 1508 组（条目数 1508）：候选只承载一条 modernReading，其余在此列明 | 文件 count 与 items.length 实测 | 「同归部」不等于「同读音」：把子卷内多读音并成一条会丢真实读音 | 保留清单；下游需要多读音时按本清单取，不得合并 | 接线/脚本可修 |

### P3（6 条）

| 异常 ID | 类 | 库 | 位置 | 事实 | 判定依据 | 影响面 | 建议动作 | 动作类型 |
|---|---|---|---|---|---|---|---|---|
| B-cilin-001 | B | cilin | `data/normalized/cilin.full-d2.json · candidates` | 词林 ze_unspecified 共 2237 条，分布于 14 个仄声子卷 | 统计 toneClass=ze_unspecified 的候选及其所在子卷 | 这些是「来源只标仄声」的如实记录：不得臆补成上声或去声；本次核出越界 0 条 | 保持现状；人审时只需确认来源确实只标仄 | 数据事实需人审 |
| F-cross-002b | F | cross | `data/reviews/approved-evidence.json · authorityNote` | 该字段仍写着「12_J03人审记录尚未归档进本仓库」，但 docs/reviews/12_J03人审记录_第一批.md 已随 59be7af 入库；旧编号 F-cross-002 的「未归档」异常因此**关闭**，本条仅作措辞滞后提示（编号加 b 以不与已关闭条混淆） | 仓库内 docs/reviews/12_J03人审记录_第一批.md 存在（34 行，含第一批结论表） | 仅文档措辞滞后，不影响 approved 集合；但会让读者以为依据缺失 | 下次动 approved-evidence.json 时把 authorityNote 指向 docs/reviews/12_J03人审记录_第一批.md（本次不改审批清单本身） | 接线/脚本可修 |
| F-cross-004 | F | cross | `docs/data-quality.md / HANDOFF.md（D1 期「字形数」表述）` | D1/handoff 记「平水字形 8,232」，本次实测 105 部快照去重字符 = 8232，**与 D1 一致、无漂移**；但词林 D1/inspect 记 5,037，其中含 4 条非汉字，汉字实为 5033 | raw / NFC / NFKC 三种去重方式结果完全相同（平水 106 部 8240、105 部 8232、词林 5037），可排除归一化重复；再按 \p{Script=Han} 过滤得词林 5033 | 同一「字形数」在不同文档可能指 raw（含非汉字）或汉字全集，跨文档比较会错位。这是口径未写明的漂移，不是数据错误 | 此后所有字形数一律注明口径（raw 含非汉字 / 汉字全集）；D1 的 8232 不需订正，词林 5,037 应补注「含 4 条非汉字」 | 接线/脚本可修 |
| H-cross-007 | H | cross | `data/patches/pingshui-shang-sanj-jiang.draft.json` | 字段值 status=approved、reviewStatus=approved、review=非 null；审批实况：ev:pingshui:上:三讲 = approved（A 同学 2026-10-18 人审签）；快照 reviewStatus = unverified；releaseGatePassed = false | data/reviews/approved-evidence.json 第 10 条 + 三讲快照的 gate 结果；补丁字段与审批清单是两套记录，本报告并列呈现、不改动任一方 | 「三讲已生效」与「三讲仍是草案字段」两种说法都能在仓库里找到凭据，易被引述错 | 对外统一按「字段值 + 审批实况」两栏表述；补丁字段保持原样 | 数据事实需人审 |
| H-cross-008 | H | cross | `data/patches/pingshui-shang-sanj-jiang.draft.json · diff` | 补丁净增新字形 8 个、新增归属 1 条；「玤」为一字多部（一董 + 三讲） | 补丁 diff 字段 + 三讲快照 spotCharacters 实测 | 若表述为「9 个新字」会与实测不符 | 对外统一表述为「8 新字形 + 1 新增归属」 | 接线/脚本可修 |
| E-cross-012 | E | cross | `data/patches/xinyun-yi-conflict.draft.json` | 「一」语流变调冲突：resolution=null（未裁决），target=一 | 冲突登记文件实测；新韵快照中「一」保留全部候选 | 未裁决前不得默认采用任一声调，也不得删除竞争者 | 保持多候选；裁决需人审并记录依据 | 数据事实需人审 |

## 7. 本报告能证明什么 / 不能证明什么

### 能证明（机器可判，已实测）

- 结构与门槛：韵目集合、部数/子卷数、逐部非空（checkCompleteness 逐字比对）
- 四层引用闭合：候选→韵部→证据→来源 全部可解析，悬空 ID 逐条列出
- 声类映射自洽：toneClass 与所在部、tone 与 toneClass 的映射符合声明口径
- 字符层：候选字形均为单码点
- 来源可追溯：来源 ID / revision / sha256 与落盘字节一致性
- 审批边界：approved 证据集合等于审批清单命中集合（无越权审批）
- 多音与多归属的保留情况：一字多部、多候选未被删除

### 不能证明（必须人审）

- 韵字归属是否符合韵书原义（需人审逐条核对原表/底本）
- 反切、义项、今读的正确性（源表不含，均为 null）
- 异体/简繁关系的语言学正确性（候选边仍 pending_review）
- 许可链可商用（上游授权链未核实）
- 新韵十四韵规则文本的权威性（出处 unverified）
- 结构完整 ≠ 语文学正确：106 部无空部不代表任一条归属正确

**结构完整 ≠ 语文学正确**：106 部无空部只说明韵目集合齐全，不说明任何一条韵字归属正确。

## 8. 验收命令实跑结果

| 命令 | 执行方 | EXIT | 真实输出摘要 | 备注 |
|---|---|---|---|---|
| `node --conditions=development scripts/data/inspect.ts` | A 侧在本机外部终端执行 | 1 | ERR_MODULE_NOT_FOUND: packages/lexicon/src/adapters/chinese-word-rhyme.js | Node 24 不把相对 import 的 .js 改写成 .ts；验收命令本身不可用（见 C-cross-001） |
| `node node_modules/tsx/dist/cli.mjs scripts/data/inspect.ts` | A 侧在本机外部终端执行 | 0 | 词林 19 部 / 33 子卷 / 归属 5575 / 字形 5037；新韵候选表 14 韵 / 56 子卷 / 归属 7693 / 字形 6730；平水发布门槛通过：否；新韵「一」冲突：十二齐·阴平 + 十二齐·去声 | 同一脚本改用 tsx 入口即通过 |
| `pnpm exec vitest run packages/lexicon/tests` | A 侧在本机外部终端执行 | 0 | 5 files / 66 tests，931ms | 数字由人在外部终端执行后回传，本报告未改写 |
| `pnpm verify` | A 侧在本机外部终端执行 | 0 | 28 files / 410 tests，7 of 8 projects 构建成功，8 契约/模板无漂移 | 同上 |

上述命令全部**由 A 侧在本机外部终端执行**；本报告的初审脚本在另一环境运行，测试数字照抄人侧输出，未改写。

## 9. 复现方式

```powershell
node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts
```

本脚本只读快照：不写 `data/normalized/`、不写 `data/releases/`、不改任何 `reviewStatus`。

