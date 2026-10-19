/**
 * D3 · Gate 2：把 precheck 的异常逐项过成可复核的处置清单。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/build-d3-anomalies.ts
 *
 * 输入：data/reviews/ai-lexicon-precheck-2026-10-18.json（唯一事实源，逐项 ID/分级/事实/影响/建议）
 * 输出：data/reviews/d3-a-anomalies.md
 *
 * 原则：
 * - 事实/影响/建议动作**不手抄**，全部从 precheck JSON 直读，避免与报告漂移。
 * - 本脚本只补「复现命令 / 验证命令 / 责任人 / 处置状态 / 归类」这些**人工判断字段**。
 * - 已修复并因此从 precheck 消失的条目，仍以同一 ID 保留在「已关闭」区，保证
 *   Gate 1 批次 exceptionIds 里的 D-cross-002 仍可解析（ID 是下游契约）。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ROOT } from "./snapshot-report.js";

const PRECHECK_REL = "data/reviews/ai-lexicon-precheck-2026-10-18.json";
const OUT_REL = "data/reviews/d3-a-anomalies.md";

interface Anomaly {
  id: string;
  class: string;
  book: string;
  dataVersion: string;
  location: string;
  fact: string;
  basis: string;
  impact: string;
  suggestedAction: string;
  actionKind: string;
  severity: string;
  affectedBooks?: string[];
}

interface PrecheckReport {
  severityCounts: Record<string, number>;
  snapshots: { anomalies: Anomaly[] }[];
  crossAnomalies: Anomaly[];
  closedFindings: { id: string; finding: string; resolution: string }[];
  guards: Record<string, unknown>;
  anomalyTotals: { total: number; byClass: { class: string; count: number }[] };
}

/** 六大必需分类 + 工具链。顺序即文档章节顺序。 */
const CATEGORIES: readonly {
  key: string;
  title: string;
  note?: string;
}[] = [
  { key: "structure", title: "结构" },
  { key: "nonhan", title: "非汉字导入垃圾" },
  { key: "variant", title: "异体归并" },
  { key: "source", title: "来源 / 许可 / 修订" },
  { key: "tone", title: "古今音与读音承载" },
  {
    key: "crossmap",
    title: "跨库映射",
    note: "本类**没有异常**：跨库的机器比对结果与映射草案是交付物而非缺陷，见下方说明。",
  },
  { key: "toolchain", title: "工具链 / 验收命令" },
];

interface Meta {
  category: string;
  reproduce: string;
  verify: string;
  owner: string;
  status: "待修" | "已修待复验" | "待裁" | "维持现状" | "已关闭";
  decision: string;
}

const UNIFIED_CMD =
  "node node_modules/tsx/dist/cli.mjs scripts/data/precheck-lexicon.ts";

/** 每条的「人工判断字段」。事实/影响/建议一律从 precheck 直读，不在此重复。 */
const META: Readonly<Record<string, Meta>> = {
  "A-pingshui-001": {
    category: "structure",
    reproduce: `${UNIFIED_CMD} 后看 105 部快照段；或 node -e "const s=require('./data/normalized/pingshui.full-d2.json');console.log(s.groups.length)"`,
    verify:
      "106 部快照 `checkCompleteness(=106 部无缺无空)` 通过（`check-normalized.ts`）；105 部快照应**继续**报缺三讲（两条路径并存）",
    owner: "组长（数据事实）／A（重构建）",
    status: "待裁",
    decision:
      "**不是缺陷而是设计**：105 部快照用于复现「缺三讲→门槛失败」，106 部三讲补丁快照用于达到 106。两路径并存，禁止给 105 部补空韵目凑数",
  },
  "B-cilin-001": {
    category: "structure",
    reproduce:
      "node -e \"const s=require('./data/normalized/cilin.full-d2.json');const z=s.candidates.filter(c=>c.toneClass==='ze_unspecified');console.log(z.length)\"",
    verify:
      `${UNIFIED_CMD} 中「没有任何候选被臆补成上声/去声」「ze_unspecified 一律 tone=Z」两行仍为 0 越界`,
    owner: "A（保持）／组长（人审确认来源确实只标仄）",
    status: "维持现状",
    decision:
      "维持 `ze_unspecified`。词林来源只标仄声，不得臆补上/去；此为 P3 提示而非缺陷",
  },
  "D-cross-002": {
    category: "nonhan",
    reproduce:
      "node node_modules/tsx/dist/cli.mjs scripts/data/build-cilin.ts（看 droppedNonHan 8 条逐条输出）",
    verify:
      "build-cilin 断言：非汉字条目=8、字形=4、候选差=8、字形差=4；`node -e` 核 `cilin.full-d2.json` 中 `\\p{Script=Han}` 反例数 = 0",
    owner: "A（已修）",
    status: "已关闭",
    decision:
      "已修（c9be32a）：改在导入层按「单码点 + `\\p{Script=Han}`」过滤 8 条条目 / 4 个字形，`data/raw` 字节未改；候选 5403→5395、字形 5037→5033。**本条已从 precheck 消失**，ID 保留以供 Gate 1 批次 `exceptionIds` 解析",
  },
  "D-cross-007": {
    category: "variant",
    reproduce:
      "node -e \"const v=require('./data/variants/variant-edges-d2.json');console.log(v.summary)\"",
    verify:
      "平水/词林快照中 `樓/餘/講/項` 四个繁体形均不出现（B2 探针）；`effectiveMerges` = 0",
    owner: "组长（逐条签边）／A（登记）",
    status: "待裁",
    decision:
      "未签边不生效：`餘→余`、`馀→余` 2 条仍 pending_review；`樓→楼` 已 approved 但**只作查询召回**，不新增候选、不覆盖原表收录事实。契约无 variant 字段，故异体只能以边表达",
  },
  "F-cross-002": {
    category: "source",
    reproduce:
      "node -e \"const fs=require('fs');for(const p of ['data/raw/chinese_word_rhyme/Cilin_Rhyme.json','data/normalized/cilin.full-d2.json']){const j=JSON.parse(fs.readFileSync(p,'utf8'));const c=j.candidates?j.candidates.map(x=>x.character):Object.values(j).flatMap(t=>Object.values(t).flat());console.log(p,new Set(c).size)}\"",
    verify:
      "`inspect.ts` 报词林 5037（读原表）；`check-normalized.ts` 报词林候选 5395 / 字形 5033（读快照）；两者都对，口径不同",
    owner: "A（文档口径）",
    status: "维持现状",
    decision:
      "**不是数据错误**：原表 5037 / 快照 5033 / inspect 5037 三处口径不同。已在新版事实描述中并列三处，禁止跨口径直接比较（否则会得出「词林少了 4 个字」的错觉）",
  },
  "F-cross-003": {
    category: "source",
    reproduce:
      "node -e \"const m=require('./data/sources/manifest.json');const s=m.sources.find(x=>x.id==='src:wikisource:pingshuiyun');console.log(JSON.stringify(s.license,null,2))\"",
    verify:
      "`license` 含 workLayer / siteLayer / conclusion 三键，且 siteLayer.status = pendingReview",
    owner: "组长（取得站点条款／确认署名方式）",
    status: "待裁",
    decision:
      "保持双层登记，不作单一许可结论：作品层 `{{PD-old}}` 已按字节核实；站点层 CC BY-SA 4.0 条款文本未取得。两层均不构成「可商用」证明",
  },
  "F-cross-004": {
    category: "source",
    reproduce:
      "node -e \"for(const f of ['xinyun.full-d2','pingshui.full-d2-patched','cilin.full-d2']){const s=require('./data/normalized/'+f+'.json');console.log(f,'generatorVersion' in s,'rulesVersion' in s)}\"",
    verify:
      "若能通过 GLM 加外围 descriptor，则上述两项变为 true；在此之前以 notice 文本 + 本报告登记为准",
    owner: "GLM（是否加 descriptor）／A（登记文案）",
    status: "待裁",
    decision:
      "快照 Schema 无 generatorVersion / rulesVersion 字段，机器无法结构化读取；平水/词林同样缺。新韵的规则/生成器版本只存在于 notice 文本。**不改契约字段**，加不加外围 descriptor 由 GLM 定",
  },
  "F-pingshui-001": {
    category: "source",
    reproduce: UNIFIED_CMD,
    verify: "快照 notice 或 descriptor 中出现脚本名与版本；否则本条维持 P2",
    owner: "A（在 notice 中登记）",
    status: "待修",
    decision:
      "106 部快照未登记生成器版本。可在 notice 追加脚本名+版本，**不改快照 Schema**",
  },
  "F-pingshui-002": {
    category: "source",
    reproduce: UNIFIED_CMD,
    verify: "同上；105 部快照",
    owner: "A（在 notice 中登记）",
    status: "待修",
    decision: "105 部快照同 F-pingshui-001",
  },
  "F-cilin-002": {
    category: "source",
    reproduce: UNIFIED_CMD,
    verify: "同上；词林快照",
    owner: "A（在 notice 中登记）",
    status: "待修",
    decision: "词林快照未登记生成器版本；同 F-pingshui-001",
  },
  "H-cross-005": {
    category: "source",
    reproduce:
      "node -e \"const p=require('./data/patches/pingshui-shang-sanj-jiang.draft.json');console.log(p.status,p.reviewStatus,p.review)\"",
    verify:
      "报告 H 类两栏并列：补丁字段值 + 审批实况（ev:pingshui:上:三讲 approved）",
    owner: "A（统一表述）",
    status: "维持现状",
    decision:
      "补丁字段 status/reviewStatus 均为 approved 且 review 非 null，与审批实况一致；但**快照级 reviewStatus 仍 unverified**、releaseGatePassed=false。对外必须两栏并列，禁止只写其一",
  },
  "H-cross-006": {
    category: "source",
    reproduce:
      "node -e \"const p=require('./data/patches/pingshui-shang-sanj-jiang.draft.json');console.log(JSON.stringify(p.diff.addedMemberships.length),JSON.stringify(p.diff.newCharacterCount),JSON.stringify(p.diff.additionalMembershipCount))\"",
    verify:
      "三讲快照中「玤」同时具备 `group:pingshui:上:一董` 与 `group:pingshui:上:三讲`（precheck §5 专项断言）",
    owner: "A（表述）",
    status: "维持现状",
    decision:
      "对外统一表述「8 新字形 + 1 新增归属」；**不得**写成「9 个新字」。玤属一字多部，保留原一董归属",
  },
  "G-cross-008": {
    category: "tone",
    reproduce:
      "node -e \"const r=require('./data/patches/xinyun-rebuild-report.dev.json');console.log(JSON.stringify(r.coverage));console.log(JSON.stringify(Object.fromEntries(Object.entries(r.unmapped).map(([k,v])=>[k,v.count]))))\"",
    verify:
      "重跑 `rebuild-xinyun.ts` 后未映射/轻声/er 数字与报告一致；新韵快照候选 51,608 不变",
    owner: "组长（er→十二齐 口径裁定）／A（重建与报告）",
    status: "待裁",
    decision:
      "未映射 43 条（FINAL_NOT_IN_RULES 9 / UNKNOWN_LETTER 30 / VOWEL_LESS 4）是**明确不收**，不是补齐进度；轻声 241 条本调不明、不默认归平；`er→十二齐` 待核实（影响 104 条）。**不猜补**",
  },
  "E-cross-009": {
    category: "tone",
    reproduce:
      "node -e \"const c=require('./data/patches/xinyun-reading-collisions.dev.json');console.log(c.count,c.items.length)\"",
    verify:
      "下游若需多读音，按本清单取；新韵候选的 `modernReading` 仍只承载一条（缺失 0）",
    owner: "B（消费方）／A（维护清单）",
    status: "维持现状",
    decision:
      "「同归部」≠「同读音」：1,508 组同(字形,子卷)多读音已列明，未合并未丢弃。候选结构只能承载一条 modernReading，其余在此清单",
  },
  "E-cross-010": {
    category: "tone",
    reproduce:
      "node -e \"const y=require('./data/patches/xinyun-yi-conflict.draft.json');console.log(y.target,y.resolution)\"",
    verify:
      "新韵快照中「一」仍保留 3 条候选（yinping/yangping/qu）；断言方向必须是「存在且被单列」",
    owner: "组长（裁决）／B（语境消歧）",
    status: "待裁",
    decision:
      "`resolution=null` 未裁决。**不得**默认采用任一声调，**不得**删除竞争者；断言已改为「存在且被单列」，防止用删数据的方式变绿",
  },
  "C-cross-001": {
    category: "toolchain",
    reproduce:
      "node --conditions=development scripts/data/inspect.ts   # 预期 EXIT=1 ERR_MODULE_NOT_FOUND",
    verify:
      "GLM 加 `data:inspect` 脚本后，任务书原命令可用；在此之前一律用 tsx 入口",
    owner: "GLM（根脚本接线）／A（文档校正）",
    status: "待修",
    decision:
      "任务书验收入口本身不可用（Node 24 不把相对 import 的 .js 改写为 .ts）。**该异常必须保留**，不得因存在 tsx 替代命令就删——它说明验收入口是坏的",
  },
};

/** 已修复并从 precheck 消失的条目（保留 ID 供批次引用解析）。 */
const CLOSED: readonly {
  id: string;
  title: string;
  severity: string;
  fact: string;
  resolution: string;
}[] = [
  {
    id: "D-cross-002",
    title: "词林快照含 4 条非汉字候选",
    severity: "P1",
    fact:
      "词林快照含 4 条**非汉字**候选（`[` U+005B、`]` U+005D、空格 U+0020、`，` U+FF0C），共 8 条条目；单码点校验抓不到（它们都是单码点），但字符本身不是汉字",
    resolution:
      "**已修（c9be32a）**：改在导入层按「单码点 + `\\p{Script=Han}`」双重判定过滤，逐条输出 droppedNonHan（含 codePoint/groupName/sourceLocator），`data/raw` 字节未改。候选 5,403→5,395（−8 = 条目数）、字形 5,037→5,033（−4 = 字形数）、部数/子卷 19/33 不变。已写入 `docs/data-quality.md` §7 与快照 notice",
  },
];

function main(): void {
  const precheckFile = path.join(ROOT, PRECHECK_REL);
  if (!existsSync(precheckFile)) {
    console.error(`缺 ${PRECHECK_REL}，先跑 precheck-lexicon.ts`);
    process.exitCode = 1;
    return;
  }
  const report = JSON.parse(
    readFileSync(precheckFile, "utf8"),
  ) as PrecheckReport;
  const open = [
    ...report.snapshots.flatMap((snapshot) => snapshot.anomalies),
    ...report.crossAnomalies,
  ];

  const lines: string[] = [];
  const push = (text: string): void => {
    lines.push(text);
  };

  push("# D3 · Gate 2 异常处置清单（d3-a-anomalies）");
  push("");
  push(
    "由 `scripts/data/build-d3-anomalies.ts` 从 `" +
      PRECHECK_REL +
      "` 生成：**事实 / 影响 / 建议动作三段直读 precheck JSON，不手抄**；" +
      "本文件只补「复现命令 / 验证命令 / 责任人 / 处置状态 / 归类」。",
  );
  push("");
  push(
    `当前 **${open.length} 条未关闭异常**（P0=${report.severityCounts.P0 ?? 0} / P1=${report.severityCounts.P1 ?? 0} / P2=${report.severityCounts.P2 ?? 0} / P3=${report.severityCounts.P3 ?? 0}）` +
      ` + **${CLOSED.length} 条已关闭**（保留 ID 供 Gate 1 批次 \`exceptionIds\` 解析）。`,
  );
  push("");
  push(
    "> 口径：**异常** = 需人裁定的事实问题；**护栏** = 机器自动红灯（摘要漂移 / fileName↔dataVersion 不符 / 悬空登记），" +
      "进 `failures` 由 exit code 表达，**不在此清单**。护栏当前状态见 precheck 报告的 `guards` 段。",
  );
  push("");

  push("## 导航");
  push("");
  push("| 分类 | 未关闭 | 已关闭 |");
  push("|---|---|---|");
  for (const category of CATEGORIES) {
    const openInCategory = open.filter(
      (anomaly) => META[anomaly.id]?.category === category.key,
    ).length;
    const closedInCategory = CLOSED.filter(
      (entry) => META[entry.id]?.category === category.key,
    ).length;
    push(
      `| ${category.title} | ${openInCategory} | ${closedInCategory} |`,
    );
  }
  push("");

  for (const category of CATEGORIES) {
    push(`## ${category.title}`);
    push("");
    if (category.note !== undefined) {
      push(category.note);
      push("");
    }
    const items = open.filter(
      (anomaly) => META[anomaly.id]?.category === category.key,
    );
    const closedItems = CLOSED.filter(
      (entry) => META[entry.id]?.category === category.key,
    );
    if (items.length === 0 && closedItems.length === 0) {
      if (category.key === "crossmap") {
        push("### 跨库比对与映射的交付现状（非异常）");
        push("");
        push(
          "- **A1 字级交叉**：平水 106 部 × 词林 19 部，只做「平 / 仄 / 入」三层。" +
            "共比 4,946 字，一致 4,468，不一致 **478**。这 478 条属「两库差异（待核实）」，" +
            "**不计入异常**——要判定谁对必须逐字回两部底本，属人审范围。",
        );
        push(
          "- **A2 部级映射草案**：`data/reviews/cilin-pingshui-mapping-draft-2026-10-18.json`，" +
            "19 条，`status: unverified`、`basis: null`。**不得被任何快照或报告当作事实引用**，" +
            "报告只允许引用「草案条数」。",
        );
        push(
          "- 复现：`" +
            UNIFIED_CMD +
            "`，看 `supplement.a1` 与 `supplement.a1Coverage`；" +
            "口径警示：词林 19 部/33 子卷与平水 106 部**不同粒度**，覆盖表只说明「该部的字在词林侧是否被收录」，" +
            "不能读作「词林缺了平水某部」。",
        );
      } else {
        push("（本类无条目）");
      }
      push("");
      continue;
    }

    for (const entry of closedItems) {
      const meta = META[entry.id] as Meta;
      push(`### ${entry.id} · ${entry.title} ✳️ 已关闭`);
      push("");
      push("| 项 | 内容 |");
      push("|---|---|");
      push(`| 原 ID | \`${entry.id}\` |`);
      push(`| 原分级 | ${entry.severity} |`);
      push(`| 事实 | ${entry.fact} |`);
      push(`| 处置 | ${entry.resolution} |`);
      push(`| 复现命令 | \`${meta.reproduce}\` |`);
      push(`| 验证命令 | ${meta.verify} |`);
      push(`| 责任人 | ${meta.owner} |`);
      push(`| 状态 | **已关闭** |`);
      push("");
    }

    for (const anomaly of items) {
      const meta = META[anomaly.id];
      if (meta === undefined) {
        push(`### ${anomaly.id} ⚠️ 缺处置元数据`);
        push("");
        push(
          "本条在 precheck 中出现但 `META` 未登记归类/责任人，**必须先补 META 再交付**。",
        );
        push("");
        continue;
      }
      push(`### ${anomaly.id} · ${anomaly.severity} · 类 ${anomaly.class}`);
      push("");
      push("| 项 | 内容 |");
      push("|---|---|");
      push(
        `| 原 ID | \`${anomaly.id}\`（库：${anomaly.book}${anomaly.affectedBooks === undefined ? "" : `；affected: ${anomaly.affectedBooks.join("、")}`}） |`,
      );
      push(`| 分级 / 动作类型 | ${anomaly.severity} / ${anomaly.actionKind} |`);
      push(`| 位置 | \`${anomaly.location}\` |`);
      push(`| 事实 | ${anomaly.fact} |`);
      push(`| 判定依据 | ${anomaly.basis} |`);
      push(`| 影响范围 | ${anomaly.impact} |`);
      push(`| 修复或待裁 | ${meta.decision} |`);
      push(`| 责任人 | ${meta.owner} |`);
      push(`| 复现命令 | \`${meta.reproduce}\` |`);
      push(`| 验证命令 | ${meta.verify} |`);
      push(`| 状态 | **${meta.status}** |`);
      push("");
    }
  }

  push("## 附：口径与红线（本清单的适用范围）");
  push("");
  push(
    "1. **结构完整 ≠ 语文学正确**：本清单只处置机器可判的问题；韵字归属是否符合韵书原义必须人审。",
  );
  push(
    "2. **不删竞争候选、不改 reviewStatus、不补造来源**：本清单的建议动作里没有一条以「删数据/降门槛」收尾。",
  );
  push(
    "3. **异常 vs 护栏**：摘要漂移等属护栏，由 exit code 表达，不进本清单（见 precheck 的 `guards` 段）。",
  );
  push(
    "4. **已关闭条目保留 ID**：`D-cross-002` 等已修条目仍以同一 ID 出现在「已关闭」区，确保 Gate 1 批次的 `exceptionIds` 可解析。",
  );
  push("");

  writeFileSync(path.join(ROOT, OUT_REL), `${lines.join("\n")}\n`, "utf8");
  console.log(`写出 ${OUT_REL}`);
  console.log(
    `未关闭 ${open.length} 条 + 已关闭 ${CLOSED.length} 条；分类 ${CATEGORIES.length} 个`,
  );
  const missingMeta = open.filter((anomaly) => META[anomaly.id] === undefined);
  if (missingMeta.length > 0) {
    console.error(
      `⚠️ 以下异常缺 META（必须补齐）：${missingMeta.map((item) => item.id).join("、")}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("全部未关闭异常均已登记归类与责任人 ✓");
}

main();
