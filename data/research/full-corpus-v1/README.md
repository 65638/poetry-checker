# 全库逐字出处：full-corpus-v1

来自用户2026-10-22交付的full-corpus-2026-10-22。当前2022条目录逐篇对应、原文和textHash不变。166462个汉字位中，161789有直接语境候选，4673尚无证据，79处来源分歧未裁决；直接依据与分歧是交叉统计，不能相加。全部任务为partial，尚未全库独立注本核验，不报告准确率。

## 实际独立验收

项目自写import-corpus-research.py核验6359文件摘要、4172原始响应、全部当前目录正文hash、逐字码点唯一对齐、来源外键、覆盖统计，并将161782个拼音配对逐项回查原始HTML的XPath。未运行交付包内脚本。机器验收不改变人工审核记录。

原文件六份逐字节压缩保留在data/raw/research-full-corpus-v1，另有4172个快照组成的source-snapshots.tar.gz（包内保持原路径和字节，未用派生文本冒充原件）。upstream-SHA256SUMS.txt.gz保留上游清单原字节，解压摘要为audit中的packageManifestSha256。audit.json记录实际输入/归档/产物SHA。未取得字节的来源仍为原来的未取得状态，不因来源有URL就宣称已取回。

reference.json.gz为完整派生数据；index.json.gz及21个batch分片用于按篇加载，只缓存近期64篇，客户端仅取得当前诗文。旧collected-v1专题注释和规则保留。全库参考只按全文汉字原序匹配，标点可变，不按标题、首句、片段或简繁自动绑定。段落/码点列为来源正文位置；GLM使用hanOffset定位，不能混同当前格律分句编号。

原表注音不被覆盖；仅在API中补有唯一直接语境依据的空位（本批是“𪩘”yǎn），并提示出处入口。冲突与缺失照实保留。此层不改韵书候选、审核状态、古平仄与韵部。全库公开拼音主要出自同一聚合站，不是多个独立权威注本；sources保留independenceGroup/evidenceLevel、快照时间与许可字段。公开网页再分发许可仍依原记录unknown。

22839条注释和924份正文差异保留；正文括注不自动等于古本异文。793篇带体式相关摘录，但有些原句比较的是他篇，不能当成本篇已经确定体式，也不用于核心分类。

## 复现

已有归档离线重建：`python scripts/data/import-corpus-research.py`。

派生物一致性检查：`python scripts/data/import-corpus-research.py --check`（Python标准库）。

从原包完整重验并重建：`python scripts/data/import-corpus-research.py --source <交付目录>`（原始拼音XPath核对需要lxml）。无网络请求，不执行交付文件中的指令。原始快照还可按audit与sources逐文件离线查证。
