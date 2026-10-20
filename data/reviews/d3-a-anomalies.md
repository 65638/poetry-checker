# D3 · Gate 2 异常处置清单（d3-a-anomalies）

由 `scripts/data/build-d3-anomalies.ts` 从 `data/reviews/ai-lexicon-precheck-2026-10-18.json` 生成：**事实 / 影响 / 建议动作三段直读 precheck JSON，不手抄**；本文件只补「复现命令 / 验证命令 / 责任人 / 处置状态 / 归类」。

当前 **12 条未关闭异常**（P0=0 / P1=3 / P2=4 / P3=5） + **4 条已关闭**（保留 ID 供 Gate 1 批次 `exceptionIds` 解析）。

> 口径：**异常** = 需人裁定的事实问题；**护栏** = 机器自动红灯（摘要漂移 / fileName↔dataVersion 不符 / 悬空登记），进 `failures` 由 exit code 表达，**不在此清单**。护栏当前状态见 precheck 报告的 `guards` 段。

> **异常 ID 一经发布不回收。** 缺陷修掉后条目移入「已关闭」区并保留原 ID，以保证既有批次/报告的 `exceptionIds` 引用始终可解析。需要「当前未关闭集合」的消费方，应按本文件的 `status` 过滤，**不得按批次里的引用反推**——批次记的是「当时已知」，批次与本文不一致不等于 bug。

## 导航

| 分类 | 未关闭 | 已关闭 |
|---|---|---|
| 结构 | 2 | 0 |
| 非汉字导入垃圾 | 0 | 1 |
| 异体归并 | 1 | 0 |
| 来源 / 许可 / 修订 | 5 | 3 |
| 古今音与读音承载 | 3 | 0 |
| 跨库映射 | 0 | 0 |
| 工具链 / 验收命令 | 1 | 0 |

> ⚠️ **关于「跨库映射 | 0 | 0」这一行**：本行 0 是「**未发现缺陷**」，不是「无跨库待办」：
> - A1 存在 **478 条两库差异待核实**（异体/归部粒度差，非缺陷）：见 precheck `supplement.a1`；
> - A2 存在 **19 条部级映射草案，全部 `status=unverified`、`basis=null`**，不得当事实引用；
> - 二者都不进异常清单，但都属于**待人格裁定**的存量——不能因本行 0 而认为跨库已收口。

> 同理，其余各行的数字只表示「已登记缺陷数」，不表示该类工作量已清零；「结构达标」也不等于「内容审核通过」（见 AGENTS.md 韵书数据纪律第 1 条）。

## 结构

### A-pingshui-001 · P1 · 类 A

| 项 | 内容 |
|---|---|
| 原 ID | `A-pingshui-001`（库：pingshui） |
| 分级 / 动作类型 | P1 / 数据事实需人审 |
| 位置 | `data/normalized/pingshui.full-d2.json · groups` |
| 事实 | 缺失韵目 1 个：三讲；连带结果：韵部 105/106，分部 {"上平":15,"下平":15,"上":28,"去":30,"入":17}（应有 {"上平":15,"下平":15,"上":29,"去":30,"入":17}） |
| 判定依据 | checkCompleteness(平水韵（106 部）) 逐步比对核定韵目集合 |
| 影响范围 | 该韵部下的字无法归部，按韵部查询会漏；结构门槛不通过 |
| 修复或待裁 | **不是缺陷而是设计**：105 部快照用于复现「缺三讲→门槛失败」，106 部三讲补丁快照用于达到 106。两路径并存，禁止给 105 部补空韵目凑数 |
| 责任人 | 组长（数据事实）／A（重构建） |
| 复现命令 | `node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts 后看 105 部快照段；或 node -e "const s=require('./data/normalized/pingshui.full-d2.json');console.log(s.groups.length)"` |
| 验证命令 | 106 部快照 `checkCompleteness(=106 部无缺无空)` 通过（`check-normalized.ts`）；105 部快照应**继续**报缺三讲（两条路径并存） |
| 状态 | **待裁** |

### B-cilin-001 · P3 · 类 B

| 项 | 内容 |
|---|---|
| 原 ID | `B-cilin-001`（库：cilin） |
| 分级 / 动作类型 | P3 / 数据事实需人审 |
| 位置 | `data/normalized/cilin.full-d2.json · candidates` |
| 事实 | 词林 ze_unspecified 共 2232 条，分布于 14 个仄声子卷 |
| 判定依据 | 统计 toneClass=ze_unspecified 的候选及其所在子卷 |
| 影响范围 | 这些是「来源只标仄声」的如实记录：不得臆补成上声或去声；本次核出越界 0 条 |
| 修复或待裁 | 维持 `ze_unspecified`。词林来源只标仄声，不得臆补上/去；此为 P3 提示而非缺陷 |
| 责任人 | A（保持）／组长（人审确认来源确实只标仄） |
| 复现命令 | `node -e "const s=require('./data/normalized/cilin.full-d2.json');const z=s.candidates.filter(c=>c.toneClass==='ze_unspecified');console.log(z.length)"` |
| 验证命令 | node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts 中「没有任何候选被臆补成上声/去声」「ze_unspecified 一律 tone=Z」两行仍为 0 越界 |
| 状态 | **维持现状** |

## 非汉字导入垃圾

### D-cross-002 · 词林快照含 4 条非汉字候选 ✳️ 已关闭

| 项 | 内容 |
|---|---|
| 原 ID | `D-cross-002` |
| 原分级 | P1 |
| 事实 | 词林快照含 4 条**非汉字**候选（`[` U+005B、`]` U+005D、空格 U+0020、`，` U+FF0C），共 8 条条目；单码点校验抓不到（它们都是单码点），但字符本身不是汉字 |
| 处置 | **已修（c9be32a）**：改在导入层按「单码点 + `\p{Script=Han}`」双重判定过滤，逐条输出 droppedNonHan（含 codePoint/groupName/sourceLocator），`data/raw` 字节未改。候选 5,403→5,395（−8 = 条目数）、字形 5,037→5,033（−4 = 字形数）、部数/子卷 19/33 不变。已写入 `docs/data-quality.md` §7 与快照 notice |
| 复现命令 | `node node_modules/tsx/dist/cli.mjs scripts/data/build-cilin.ts（看 droppedNonHan 8 条逐条输出）` |
| 验证命令 | build-cilin 断言：非汉字条目=8、字形=4、候选差=8、字形差=4；`node -e` 核 `cilin.full-d2.json` 中 `\p{Script=Han}` 反例数 = 0 |
| 责任人 | A（已修） |
| 状态 | **已关闭** |

## 异体归并

### D-cross-007 · P2 · 类 D

| 项 | 内容 |
|---|---|
| 原 ID | `D-cross-007`（库：cross） |
| 分级 / 动作类型 | P2 / 数据事实需人审 |
| 位置 | `data/variants/variant-edges-d2.json` |
| 事实 | 简繁/异体候选边共 5 条：pending_review 2 条（餘→余、馀→余）、applied_in_patch 2 条、approved 1 条（樓→楼，均已登记 approvalBasis） |
| 判定依据 | 文件 summary 与 edges[].status 实测 |
| 影响范围 | 未签边不生效：正文若写繁体（如「樓」）仍进 missing；已签边只属查询召回，不等于等价合并 |
| 修复或待裁 | 未签边不生效：`餘→余`、`馀→余` 2 条仍 pending_review；`樓→楼` 已 approved 但**只作查询召回**，不新增候选、不覆盖原表收录事实。契约无 variant 字段，故异体只能以边表达 |
| 责任人 | 组长（逐条签边）／A（登记） |
| 复现命令 | `node -e "const v=require('./data/variants/variant-edges-d2.json');console.log(v.summary)"` |
| 验证命令 | 平水/词林快照中 `樓/餘/講/項` 四个繁体形均不出现（B2 探针）；`effectiveMerges` = 0 |
| 状态 | **待裁** |

## 来源 / 许可 / 修订

### F-pingshui-001 · 106 部快照未登记生成器版本 ✳️ 已关闭

| 项 | 内容 |
|---|---|
| 原 ID | `F-pingshui-001` |
| 原分级 | P2 |
| 事实 | 平水 106 部快照的 notice 未登记生成器/规则版本；快照 Schema 无 generatorVersion 字段，无法回答「这份数据由哪版脚本产出」 |
| 处置 | **已关闭**：notice 增补戳记「生成器：scripts/data/build-pingshui.ts@d3-1」；precheck 改为以 `生成器：scripts/data/<脚本>@<版本>` 正则识别，命中即视为已登记、不再报 F 类异常。业务内容摘要随之变化并已重登记，changelog 写明「只改 notice 文本」 |
| 复现命令 | `node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts` |
| 验证命令 | node -e "const s=require('./data/normalized/pingshui.full-d2-patched.json');console.log(/生成器[:：]\s*scripts\/data\/[a-z-]+\.ts@[\w.-]+/.exec(s.notice)[1])" |
| 责任人 | A（已修） |
| 状态 | **已关闭** |

### F-pingshui-002 · 105 部快照未登记生成器版本 ✳️ 已关闭

| 项 | 内容 |
|---|---|
| 原 ID | `F-pingshui-002` |
| 原分级 | P2 |
| 事实 | 平水 105 部快照的 notice 未登记生成器/规则版本，同 F-pingshui-001 |
| 处置 | **已关闭**：同 F-pingshui-001，notice 增补同一戳记；摘要已重登记 |
| 复现命令 | `node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts` |
| 验证命令 | 同上；105 部快照的 notice 同样带戳记 |
| 责任人 | A（已修） |
| 状态 | **已关闭** |

### F-cilin-002 · 词林快照未登记生成器版本 ✳️ 已关闭

| 项 | 内容 |
|---|---|
| 原 ID | `F-cilin-002` |
| 原分级 | P2 |
| 事实 | 词林快照的 notice 未登记生成器/规则版本，同 F-pingshui-001 |
| 处置 | **已关闭**：notice 增补戳记「生成器：scripts/data/build-cilin.ts@d3-1」；摘要已重登记（52f98e9c… → 09113995…） |
| 复现命令 | `node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts` |
| 验证命令 | 同上；词林快照的 notice 带「build-cilin.ts@d3-1」戳记 |
| 责任人 | A（已修） |
| 状态 | **已关闭** |

### F-cross-002 · P3 · 类 F

| 项 | 内容 |
|---|---|
| 原 ID | `F-cross-002`（库：cross） |
| 分级 / 动作类型 | P3 / 接线/脚本可修 |
| 位置 | `docs/data-quality.md（字形数口径）· scripts/data/inspect.ts（读原表）` |
| 事实 | 三处「词林字形数」口径不同，容易互相错位比较：① 原表 `Cilin_Rhyme.json` 去重 = **5,037**（含 4 个非汉字字形：`[` `]` 空格 `，`）；② 导入层已按 D3 过滤后，快照 `cilin.full-d2.json` 去重 = **5,033**（汉字全集）；③ `inspect.ts` 读的是原表，故仍报 5,037。平水侧：D1/handoff 记「8,232」，105 部快照实测 8232（106 部 8240），**与 D1 一致、无漂移**，且平水无此杂项 |
| 判定依据 | raw / NFC / NFKC 三种去重结果完全相同（平水 106 部 8240、105 部 8232、词林原表 5037），可排除归一化重复；快照侧按 \p{Script=Han} 过滤后为 5033，与 build-cilin.ts 的 8 条 droppedNonHan 差额吻合 |
| 影响范围 | 同一「字形数」在 原表 / 快照 / inspect 三处数字不同（5037 vs 5033），跨文档直接比较会得出「词林少了 4 个字」的错觉 |
| 修复或待裁 | **不是数据错误**：原表 5037 / 快照 5033 / inspect 5037 三处口径不同。已在新版事实描述中并列三处，禁止跨口径直接比较（否则会得出「词林少了 4 个字」的错觉） |
| 责任人 | A（文档口径） |
| 复现命令 | `node -e "const fs=require('fs');for(const p of ['data/raw/chinese_word_rhyme/Cilin_Rhyme.json','data/normalized/cilin.full-d2.json']){const j=JSON.parse(fs.readFileSync(p,'utf8'));const c=j.candidates?j.candidates.map(x=>x.character):Object.values(j).flatMap(t=>Object.values(t).flat());console.log(p,new Set(c).size)}"` |
| 验证命令 | `inspect.ts` 报词林 5037（读原表）；`check-normalized.ts` 报词林候选 5395 / 字形 5033（读快照）；两者都对，口径不同 |
| 状态 | **维持现状** |

### F-cross-003 · P2 · 类 F

| 项 | 内容 |
|---|---|
| 原 ID | `F-cross-003`（库：cross） |
| 分级 / 动作类型 | P2 / 数据事实需人审 |
| 位置 | `data/sources/manifest.json · src:wikisource:pingshuiyun.license` |
| 事实 | 该来源的许可为**两层**：作品层 {{PD-old}}（落盘字节第 655-656 行页脚，已核）；站点层 CC BY-SA 4.0（Wikimedia 站点条款，页面模板里没有，条款文本未取得）。manifest 已改为 workLayer / siteLayer / conclusion 三键分别登记，不作单一许可结论 |
| 判定依据 | 字节实测（页脚模板）+ 组长 2026-10-18 定论：两层不是矛盾也不是笔误；站点层条款文本未取得 → pendingReview |
| 影响范围 | 若只引任一层都会出错：只引 PD-old 会漏掉站点署名义务；只引 CC BY-SA 会与字节不符。两层均不构成「可商用」证明 |
| 修复或待裁 | 保持双层登记，不作单一许可结论：作品层 `{{PD-old}}` 已按字节核实；站点层 CC BY-SA 4.0 条款文本未取得。两层均不构成「可商用」证明 |
| 责任人 | 组长（取得站点条款／确认署名方式） |
| 复现命令 | `node -e "const m=require('./data/sources/manifest.json');const s=m.sources.find(x=>x.id==='src:wikisource:pingshuiyun');console.log(JSON.stringify(s.license,null,2))"` |
| 验证命令 | `license` 含 workLayer / siteLayer / conclusion 三键，且 siteLayer.status = pendingReview |
| 状态 | **待裁** |

### F-cross-004 · P2 · 类 F

| 项 | 内容 |
|---|---|
| 原 ID | `F-cross-004`（库：cross；affected: pingshui-cwr-ff0e9c1-d2-full、pingshui-cwr-ff0e9c1-d3-full-sanj-jiang-review4、cilin-cwr-ff0e9c1-d3-full-clean1、xinyun-rebuild-d2-full） |
| 分级 / 动作类型 | P2 / 接线/脚本可修 |
| 位置 | `data/normalized/*.json（快照头）· SnapshotInput 结构` |
| 事实 | 新韵的规则版本 xinyun-14-rules-d1 与生成器版本 xinyun-rebuild-gen/0.1.0 只写在快照 notice 文本里（notice 命中：规则=true、生成器=true）；pinyin-data revision=fa9761fff402f8560196b1ba085c437c52b56d7c、SHA-256 与落盘字节一致=true；但快照 Schema **没有** generatorVersion/rulesVersion 字段，机器无法结构化读取。平水两版与词林现已在 notice 增补「生成器：scripts/data/build-*.ts@d3-1」戳记（可 grep），三条 F 类「未登记生成器版本」异常因此关闭；**本条的剩余问题只是「非结构化」**——读者仍须 grep 文案，不能用字段直读 |
| 判定依据 | 读四份快照的 notice 与 sources；SnapshotInput 类型定义无版本字段；pinyin.txt 字节重算比对 |
| 影响范围 | 「同一 dataVersion 对应哪版脚本与规则」只能靠读文案回答，不能机器校验；对方案 §2.1「检查生成器版本、规则版本和 pinyin-data SHA」只能给部分答案 |
| 修复或待裁 | 快照 Schema 无 generatorVersion / rulesVersion 字段，机器无法结构化读取；平水/词林同样缺。新韵的规则/生成器版本只存在于 notice 文本。**不改契约字段**，加不加外围 descriptor 由 GLM 定 |
| 责任人 | GLM（是否加 descriptor）／A（登记文案） |
| 复现命令 | `node -e "for(const f of ['xinyun.full-d2','pingshui.full-d2-patched','cilin.full-d2']){const s=require('./data/normalized/'+f+'.json');console.log(f,'generatorVersion' in s,'rulesVersion' in s)}"` |
| 验证命令 | 若能通过 GLM 加外围 descriptor，则上述两项变为 true；在此之前以 notice 文本 + 本报告登记为准 |
| 状态 | **待裁** |

### H-cross-005 · P3 · 类 H

| 项 | 内容 |
|---|---|
| 原 ID | `H-cross-005`（库：cross） |
| 分级 / 动作类型 | P3 / 数据事实需人审 |
| 位置 | `data/patches/pingshui-shang-sanj-jiang.draft.json` |
| 事实 | 字段值 status=approved、reviewStatus=approved、review=非 null；审批实况：ev:pingshui:上:三讲 = approved（A 同学 2026-10-18 人审签）；快照 reviewStatus = unverified；releaseGatePassed = false |
| 判定依据 | data/reviews/approved-evidence.json 第 10 条 + 三讲快照的 gate 结果；补丁字段与审批清单是两套记录，本报告并列呈现、不改动任一方 |
| 影响范围 | 「三讲已生效」与「三讲仍是草案字段」两种说法都能在仓库里找到凭据，易被引述错 |
| 修复或待裁 | 补丁字段 status/reviewStatus 均为 approved 且 review 非 null，与审批实况一致；但**快照级 reviewStatus 仍 unverified**、releaseGatePassed=false。对外必须两栏并列，禁止只写其一 |
| 责任人 | A（统一表述） |
| 复现命令 | `node -e "const p=require('./data/patches/pingshui-shang-sanj-jiang.draft.json');console.log(p.status,p.reviewStatus,p.review)"` |
| 验证命令 | 报告 H 类两栏并列：补丁字段值 + 审批实况（ev:pingshui:上:三讲 approved） |
| 状态 | **维持现状** |

### H-cross-006 · P3 · 类 H

| 项 | 内容 |
|---|---|
| 原 ID | `H-cross-006`（库：cross） |
| 分级 / 动作类型 | P3 / 接线/脚本可修 |
| 位置 | `data/patches/pingshui-shang-sanj-jiang.draft.json · diff` |
| 事实 | 补丁净增新字形 8 个、新增归属 1 条；「玤」为一字多部（一董 + 三讲） |
| 判定依据 | 补丁 diff 字段 + 三讲快照 spotCharacters 实测 |
| 影响范围 | 若表述为「9 个新字」会与实测不符 |
| 修复或待裁 | 对外统一表述「8 新字形 + 1 新增归属」；**不得**写成「9 个新字」。玤属一字多部，保留原一董归属 |
| 责任人 | A（表述） |
| 复现命令 | `node -e "const p=require('./data/patches/pingshui-shang-sanj-jiang.draft.json');console.log(JSON.stringify(p.diff.addedMemberships.length),JSON.stringify(p.diff.newCharacterCount),JSON.stringify(p.diff.additionalMembershipCount))"` |
| 验证命令 | 三讲快照中「玤」同时具备 `group:pingshui:上:一董` 与 `group:pingshui:上:三讲`（precheck §5 专项断言） |
| 状态 | **维持现状** |

## 古今音与读音承载

### G-cross-008 · P1 · 类 G

| 项 | 内容 |
|---|---|
| 原 ID | `G-cross-008`（库：cross） |
| 分级 / 动作类型 | P1 / 数据事实需人审 |
| 位置 | `data/patches/xinyun-rebuild-report.dev.json · coverage` |
| 事实 | 新韵重建：读音源字形 41923、读音 53457；未映射 43（FINAL_NOT_IN_RULES 9 / UNKNOWN_LETTER 30 / VOWEL_LESS 4）；轻声丢弃 241；er 等待核实规则影响 104 条 |
| 判定依据 | 取自 data/patches/xinyun-rebuild-report.dev.json（rebuild-xinyun.ts 的产物，可能滞后于 build-xinyun.ts） |
| 影响范围 | 这些读音不进表：轻声本调不明未默认归平；未映射项是明确不收，不是补齐进度 |
| 修复或待裁 | 未映射 43 条（FINAL_NOT_IN_RULES 9 / UNKNOWN_LETTER 30 / VOWEL_LESS 4）是**明确不收**，不是补齐进度；轻声 241 条本调不明、不默认归平；`er→十二齐` 待核实（影响 104 条）。**不猜补** |
| 责任人 | 组长（er→十二齐 口径裁定）／A（重建与报告） |
| 复现命令 | `node -e "const r=require('./data/patches/xinyun-rebuild-report.dev.json');console.log(JSON.stringify(r.coverage));console.log(JSON.stringify(Object.fromEntries(Object.entries(r.unmapped).map(([k,v])=>[k,v.count]))))"` |
| 验证命令 | 重跑 `rebuild-xinyun.ts` 后未映射/轻声/er 数字与报告一致；新韵快照候选 51,608 不变 |
| 状态 | **待裁** |

### E-cross-009 · P2 · 类 E

| 项 | 内容 |
|---|---|
| 原 ID | `E-cross-009`（库：cross） |
| 分级 / 动作类型 | P2 / 接线/脚本可修 |
| 位置 | `data/patches/xinyun-reading-collisions.dev.json` |
| 事实 | 同(字形,子卷)多读音 1508 组（条目数 1508）：候选只承载一条 modernReading，其余在此列明 |
| 判定依据 | 文件 count 与 items.length 实测 |
| 影响范围 | 「同归部」不等于「同读音」：把子卷内多读音并成一条会丢真实读音 |
| 修复或待裁 | 「同归部」≠「同读音」：1,508 组同(字形,子卷)多读音已列明，未合并未丢弃。候选结构只能承载一条 modernReading，其余在此清单 |
| 责任人 | B（消费方）／A（维护清单） |
| 复现命令 | `node -e "const c=require('./data/patches/xinyun-reading-collisions.dev.json');console.log(c.count,c.items.length)"` |
| 验证命令 | 下游若需多读音，按本清单取；新韵候选的 `modernReading` 仍只承载一条（缺失 0） |
| 状态 | **维持现状** |

### E-cross-010 · P3 · 类 E

| 项 | 内容 |
|---|---|
| 原 ID | `E-cross-010`（库：cross） |
| 分级 / 动作类型 | P3 / 数据事实需人审 |
| 位置 | `data/patches/xinyun-yi-conflict.draft.json` |
| 事实 | 「一」语流变调冲突：resolution=null（未裁决），target=一 |
| 判定依据 | 冲突登记文件实测；新韵快照中「一」保留全部候选 |
| 影响范围 | 未裁决前不得默认采用任一声调，也不得删除竞争者 |
| 修复或待裁 | `resolution=null` 未裁决。**不得**默认采用任一声调，**不得**删除竞争者；断言已改为「存在且被单列」，防止用删数据的方式变绿 |
| 责任人 | 组长（裁决）／B（语境消歧） |
| 复现命令 | `node -e "const y=require('./data/patches/xinyun-yi-conflict.draft.json');console.log(y.target,y.resolution)"` |
| 验证命令 | 新韵快照中「一」仍保留 3 条候选（yinping/yangping/qu）；断言方向必须是「存在且被单列」 |
| 状态 | **待裁** |

## 跨库映射

本类**没有异常**：跨库的机器比对结果与映射草案是交付物而非缺陷，见下方说明。

### 跨库比对与映射的交付现状（非异常）

- **A1 字级交叉**：平水 106 部 × 词林 19 部，只做「平 / 仄 / 入」三层。共比 4,946 字，一致 4,468，不一致 **478**。这 478 条属「两库差异（待核实）」，**不计入异常**——要判定谁对必须逐字回两部底本，属人审范围。
- **A2 部级映射草案**：`data/reviews/cilin-pingshui-mapping-draft-2026-10-18.json`，19 条，`status: unverified`、`basis: null`。**不得被任何快照或报告当作事实引用**，报告只允许引用「草案条数」。
- 复现：`node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts`，看 `supplement.a1` 与 `supplement.a1Coverage`；口径警示：词林 19 部/33 子卷与平水 106 部**不同粒度**，覆盖表只说明「该部的字在词林侧是否被收录」，不能读作「词林缺了平水某部」。

## 工具链 / 验收命令

### C-cross-001 · P1 · 类 C

| 项 | 内容 |
|---|---|
| 原 ID | `C-cross-001`（库：cross） |
| 分级 / 动作类型 | P1 / 接线/脚本可修 |
| 位置 | `scripts/data/inspect.ts:14（相对 import 使用 .js 扩展名）` |
| 事实 | 验收命令 `node --conditions=development scripts/data/inspect.ts` 无法运行：ERR_MODULE_NOT_FOUND packages/lexicon/src/adapters/chinese-word-rhyme.js |
| 判定依据 | Node 24 原生类型剥离不改写相对 import 的 .js→.ts；A 侧本机外部终端实测 EXIT=1；改用 tsx 入口后 EXIT=0 |
| 影响范围 | 任务书第 5 步的验收命令之一本身不可用，易被误判为数据故障 |
| 修复或待裁 | 任务书验收入口本身不可用（Node 24 不把相对 import 的 .js 改写为 .ts）。**该异常必须保留**，不得因存在 tsx 替代命令就删——它说明验收入口是坏的 |
| 责任人 | GLM（根脚本接线）／A（文档校正） |
| 复现命令 | `node --conditions=development scripts/data/inspect.ts   # 预期 EXIT=1 ERR_MODULE_NOT_FOUND` |
| 验证命令 | GLM 加 `data:inspect` 脚本后，任务书原命令可用；在此之前一律用 tsx 入口 |
| 状态 | **待修** |

## 附：口径与红线（本清单的适用范围）

1. **结构完整 ≠ 语文学正确**：本清单只处置机器可判的问题；韵字归属是否符合韵书原义必须人审。
2. **不删竞争候选、不改 reviewStatus、不补造来源**：本清单的建议动作里没有一条以「删数据/降门槛」收尾。
3. **异常 vs 护栏**：摘要漂移等属护栏，由 exit code 表达，不进本清单（见 precheck 的 `guards` 段）。
4. **已关闭条目保留 ID**：`D-cross-002` 等已修条目仍以同一 ID 出现在「已关闭」区，确保 Gate 1 批次的 `exceptionIds` 可解析。

