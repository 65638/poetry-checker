/**
 * 338 条人工抽样审核队列（278 + 60）。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/build-sample-queue.ts
 *
 * 产出：data/reviews/ai-lexicon-sample-queue-2026-10-18.json
 *
 * 纪律：
 * - 只读快照，不写 data/normalized、不写 data/releases、不改任何 reviewStatus。
 * - 选取规则全部确定性、写进 JSON 的 selectionRules，任何人可复算。
 * - 不在数据层选读音：只列出全部候选，问题一律交给人工回答。
 * - 平水主口径用 106 部（含三讲草案）快照；105 部只作对照，不计入 278。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BookId, Evidence, ReadingCandidate } from "@poetry/contracts";

import { ROOT } from "./snapshot-report.js";

const REPORT_DATE = "2026-10-18";
const OUT_REL = `data/reviews/ai-lexicon-sample-queue-${REPORT_DATE}.json`;
const APPROVED_FILE = "data/reviews/approved-evidence.json";

const SNAPSHOTS: readonly { book: BookId; file: string; main: boolean }[] = [
  { book: "pingshui", file: "pingshui.full-d2-patched.json", main: true },
  { book: "cilin", file: "cilin.full-d2.json", main: true },
  { book: "xinyun", file: "xinyun.full-d2.json", main: true },
];
const CONTROL_SNAPSHOT = "pingshui-cwr-ff0e9c1-d2-full";

const SANJ_JIANG_GROUP_ID = "group:pingshui:上:三讲";

const failures: string[] = [];
function check(condition: boolean, message: string): boolean {
  if (!condition) failures.push(message);
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${message}`);
  return condition;
}

interface RawSnapshot {
  dataVersion: string;
  book: BookId;
  reviewStatus: string;
  candidates: ReadingCandidate[];
  groups: { id: string; name: string; toneClass: string | null }[];
  evidence: Evidence[];
}

interface QueueItem {
  queueId: string;
  book: BookId;
  dataVersion: string;
  unit: string;
  unitKind: "平水韵部" | "词林部" | "新韵韵部";
  character: string;
  candidateId: string;
  groupId: string;
  evidenceId: string;
  evidenceReviewStatus: string;
  sourceLocator: string;
  quotaGroup: "每部2条(278)" | "入声20" | "多归部15" | "简繁异体10" | "名篇优先15";
  selectionReason: string;
  humanQuestion: string;
  path?: "sanj-jiang-draft";
  singleCharacterGroup?: boolean;
}

function readJson<T>(relative: string): T | null {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function codepointOrder(left: string, right: string): number {
  const leftCode = left.codePointAt(0) ?? 0;
  const rightCode = right.codePointAt(0) ?? 0;
  return leftCode - rightCode;
}

/** 候选 ID 稳定排序：同字取 ID 最小者，保证可复算。 */
function pickCandidate(
  candidates: readonly ReadingCandidate[],
): ReadingCandidate {
  return [...candidates].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  )[0] as ReadingCandidate;
}

/** 名篇优先清单的具体问题（方案 §3）。 */
const FAMOUS_QUESTIONS: Readonly<Record<string, string>> = {
  更: "《登鹳雀楼》「更上一层楼」的「更」取平声（八庚）还是去声（二十四敬）？依据哪部韵书哪一条？",
  望: "《静夜思》「举头望明月」的「望」取平声（七阳）还是去声（二十三漾）？两读并存时按什么语境分？",
  思: "《静夜思》「低头思故乡」的「思」取平声（四支）还是去声（四寘）？名词义与动词义是否分读？",
  乡: "「乡」在《静夜思》与《黄鹤楼》中是否都取平声（七阳）？平水另记去声二十三漾，是否并存？",
  乘: "《黄鹤楼》「昔人已乘黄鹤去」的「乘」取平声（十蒸）还是去声（二十五径）？",
  空: "《黄鹤楼》「此地空余黄鹤楼」的「空」取平声（一东）还是去声（一送）？",
  不: "《黄鹤楼》「黄鹤一去不复返」的「不」在平水属入声（五物），今读 bù／fǒu 是否影响本调判定？",
  汉: "《黄鹤楼》「晴川历历汉阳树」的「汉」归去声十五翰是否属实？",
};

function buildQuestions(
  character: string,
  quotaGroup: QueueItem["quotaGroup"],
  unit: string,
  candidateIds: string[],
): string {
  const famous = FAMOUS_QUESTIONS[character];
  if (famous !== undefined) return famous;
  if (quotaGroup === "简繁异体10") {
    return `「${character}」与异体/简繁对应形式之间是否应建立候选边？依据哪部韵书或字书的哪一条？若建立，是否仅用于查询召回、不覆盖原有归属？`;
  }
  if (quotaGroup === "入声20") {
    return `「${character}」在${unit}的古入声归属是否属实？今读是否与古入声冲突？该候选证据能否签 approved？`;
  }
  if (quotaGroup === "多归部15") {
    return `「${character}」同时存在 ${candidateIds.length} 条候选（${candidateIds.join("、")}）：两条是否都成立、如何按语境区分？本条是否需要拆成逐候选分别签字？`;
  }
  return `「${character}」在${unit}的归部与声类是否属实（对照韵书原文该部正文）？该条证据能否签 approved？`;
}

function main(): void {
  console.log("=== 装载快照 ===");
  const snapshots = new Map<BookId, RawSnapshot>();
  for (const entry of SNAPSHOTS) {
    const raw = readJson<RawSnapshot>(`data/normalized/${entry.file}`);
    if (raw === null) {
      check(false, `缺少快照 data/normalized/${entry.file}`);
      continue;
    }
    snapshots.set(entry.book, raw);
    console.log(
      `  ${entry.book}：${raw.dataVersion}（候选 ${raw.candidates.length}）`,
    );
  }
  check(snapshots.size === 3, `三库快照齐备（${snapshots.size}/3）`);

  const approvedFile = readJson<{ approvedEvidenceIds?: string[] }>(
    APPROVED_FILE,
  );
  const approvedIds = new Set(approvedFile?.approvedEvidenceIds ?? []);

  const pingshui = snapshots.get("pingshui");
  const cilin = snapshots.get("cilin");
  const xinyun = snapshots.get("xinyun");
  if (pingshui === undefined || cilin === undefined || xinyun === undefined) {
    console.log("\n缺快照，未生成队列。");
    process.exitCode = 1;
    return;
  }

  const evidenceStatusOf = (raw: RawSnapshot, evidenceId: string): string => {
    const hit = raw.evidence.find((evidence) => evidence.id === evidenceId);
    if (hit === undefined) return "missing-evidence";
    return hit.reviewStatus;
  };
  const locatorOf = (raw: RawSnapshot, evidenceId: string): string => {
    const hit = raw.evidence.find((evidence) => evidence.id === evidenceId);
    return hit?.locator ?? "（缺证据定位）";
  };

  /** 单元 → 该单元内的字符（按码位升序）。 */
  const unitsOf = (
    raw: RawSnapshot,
    kind: QueueItem["unitKind"],
  ): Map<string, Map<string, ReadingCandidate[]>> => {
    const units = new Map<string, Map<string, ReadingCandidate[]>>();
    for (const candidate of raw.candidates) {
      for (const groupId of candidate.groupIds) {
        const parts = groupId.split(":");
        const parent = parts[2] ?? "";
        const name = parts.slice(3).join(":");
        const unit =
          kind === "平水韵部"
            ? `${parent}:${name}`
            : kind === "词林部"
              ? parent
              : parent;
        const perUnit = units.get(unit) ?? new Map<string, ReadingCandidate[]>();
        const list = perUnit.get(candidate.character) ?? [];
        list.push(candidate);
        perUnit.set(candidate.character, list);
        units.set(unit, perUnit);
      }
    }
    return units;
  };

  const seq: Record<BookId, number> = { pingshui: 0, cilin: 0, xinyun: 0 };
  const nextId = (book: BookId): string => {
    seq[book] += 1;
    const prefix = book === "pingshui" ? "PS" : book === "cilin" ? "CL" : "XY";
    return `Q-${prefix}-${String(seq[book]).padStart(3, "0")}`;
  };

  const makeItem = (
    raw: RawSnapshot,
    kind: QueueItem["unitKind"],
    unit: string,
    character: string,
    candidates: ReadingCandidate[],
    quotaGroup: QueueItem["quotaGroup"],
    selectionReason: string,
    extra?: { path?: "sanj-jiang-draft"; singleCharacterGroup?: boolean },
  ): QueueItem => {
    const candidate = pickCandidate(candidates);
    const evidenceId = candidate.evidenceIds[0] ?? "";
    return {
      queueId: nextId(raw.book),
      book: raw.book,
      dataVersion: raw.dataVersion,
      unit,
      unitKind: kind,
      character,
      candidateId: candidate.id,
      groupId: candidate.groupIds[0] ?? "",
      evidenceId,
      evidenceReviewStatus: approvedIds.has(evidenceId)
        ? "approved"
        : evidenceStatusOf(raw, evidenceId),
      sourceLocator: locatorOf(raw, evidenceId),
      quotaGroup,
      selectionReason,
      humanQuestion: buildQuestions(
        character,
        quotaGroup,
        unit,
        candidates.map((entry) => entry.id),
      ),
      ...(extra ?? {}),
    };
  };

  // ---------------- 278 条：每单元 2 条 ----------------
  console.log("\n=== 278 条（每单元 2 条）===");
  const part278: QueueItem[] = [];
  const unitCounts = new Map<string, number>();

  const plan: { raw: RawSnapshot; kind: QueueItem["unitKind"]; label: string }[] =
    [
      { raw: pingshui, kind: "平水韵部", label: "平水" },
      { raw: cilin, kind: "词林部", label: "词林" },
      { raw: xinyun, kind: "新韵韵部", label: "新韵" },
    ];

  for (const step of plan) {
    const units = unitsOf(step.raw, step.kind);
    const unitNames = [...units.keys()].sort();
    for (const unit of unitNames) {
      const perUnit = units.get(unit) ?? new Map<string, ReadingCandidate[]>();
      const characters = [...perUnit.keys()].sort(codepointOrder);
      const n = characters.length;
      if (n === 0) continue;
      const midIndex = Math.ceil(n / 2) - 1;
      const picks =
        n === 1
          ? [{ character: characters[0] as string, reason: "n=1，该条计两次（single-character-group）", single: true }]
          : [
              {
                character: characters[0] as string,
                reason: `按码位升序取第 1 条（n=${n}）`,
                single: false,
              },
              {
                character: characters[midIndex] as string,
                reason: `按码位升序取第 ⌈n/2⌉=${Math.ceil(n / 2)} 条（n=${n}）`,
                single: false,
              },
            ];
      for (const pick of picks) {
        const candidates = perUnit.get(pick.character) ?? [];
        if (candidates.length === 0) continue;
        const isSanJiang =
          step.raw.book === "pingshui" &&
          candidates.some((entry) => entry.groupIds.includes(SANJ_JIANG_GROUP_ID));
        const item = makeItem(
          step.raw,
          step.kind,
          unit,
          pick.character,
          candidates,
          "每部2条(278)",
          pick.reason,
          {
            ...(isSanJiang ? { path: "sanj-jiang-draft" as const } : {}),
            ...(pick.single ? { singleCharacterGroup: true } : {}),
          },
        );
        part278.push(item);
        unitCounts.set(`${step.label}:${unit}`, (unitCounts.get(`${step.label}:${unit}`) ?? 0) + 1);
      }
    }
    console.log(
      `  ${step.label}：单元 ${unitNames.length} 个 → ${part278.filter((item) => item.book === step.raw.book).length} 条`,
    );
  }

  // ---------------- 60 条配额 ----------------
  console.log("\n=== 60 条配额 ===");
  const part60: QueueItem[] = [];

  const pingshuiUnits = unitsOf(pingshui, "平水韵部");
  const pingshuiAllChars = new Map<string, ReadingCandidate[]>();
  for (const perUnit of pingshuiUnits.values()) {
    for (const [character, candidates] of perUnit) {
      const list = pingshuiAllChars.get(character) ?? [];
      list.push(...candidates);
      pingshuiAllChars.set(character, list);
    }
  }
  // (a) 入声 20：平水入声 17 部各 ≥1，余量 3 按码位补
  const ruUnits = [...pingshuiUnits.keys()].filter((unit) => unit.startsWith("入:")).sort();
  check(ruUnits.length === 17, `平水入声部 17 个（实际 ${ruUnits.length}）`);
  const ruPicked: QueueItem[] = [];
  for (const unit of ruUnits) {
    const perUnit = pingshuiUnits.get(unit) ?? new Map();
    const characters = [...perUnit.keys()].sort(codepointOrder);
    const character = characters[0];
    if (character === undefined) continue;
    ruPicked.push(
      makeItem(pingshui, "平水韵部", unit, character, perUnit.get(character) ?? [], "入声20", `入声部「${unit}」按码位取第 1 条`),
    );
  }
  const ruUsed = new Set(ruPicked.map((item) => item.character));
  const ruExtras = [...pingshuiUnits.entries()]
    .filter(([unit]) => unit.startsWith("入:"))
    .flatMap(([unit, perUnit]) =>
      [...perUnit.keys()].sort(codepointOrder).map((character) => ({ unit, character, candidates: perUnit.get(character) ?? [] })),
    )
    .filter((entry) => !ruUsed.has(entry.character))
    .sort((left, right) => codepointOrder(left.character, right.character))
    .slice(0, 3);
  for (const extra of ruExtras) {
    ruPicked.push(
      makeItem(pingshui, "平水韵部", extra.unit, extra.character, extra.candidates, "入声20", "入声余量 3 条：按码位补"),
    );
  }
  part60.push(...ruPicked);
  console.log(`  入声：${ruPicked.length} 条（17 部保底 + 余量 ${ruExtras.length}）`);

  // (b) 多归部 15：须含「中」「上」「里」「更」至少 2 个
  const multiChars = [...pingshuiAllChars.entries()]
    .filter(([, candidates]) => candidates.length > 1)
    .map(([character]) => character)
    .sort(codepointOrder);
  const mustInclude = ["中", "上", "里", "更"].filter((character) => multiChars.includes(character));
  const multiPicked: QueueItem[] = [];
  for (const character of mustInclude) {
    const candidates = pingshuiAllChars.get(character) ?? [];
    const unit = (candidates[0]?.groupIds[0] ?? "").split(":").slice(2).join(":");
    multiPicked.push(
      makeItem(pingshui, "平水韵部", unit, character, candidates, "多归部15", `多归部指定必含字（共 ${candidates.length} 条候选）`),
    );
  }
  const multiFill = multiChars
    .filter((character) => !mustInclude.includes(character))
    .slice(0, Math.max(0, 15 - multiPicked.length));
  for (const character of multiFill) {
    const candidates = pingshuiAllChars.get(character) ?? [];
    const unit = (candidates[0]?.groupIds[0] ?? "").split(":").slice(2).join(":");
    multiPicked.push(
      makeItem(pingshui, "平水韵部", unit, character, candidates, "多归部15", "多归部余量：按码位补"),
    );
  }
  part60.push(...multiPicked);
  console.log(`  多归部：${multiPicked.length} 条（必含命中 ${mustInclude.length}/4：${mustInclude.join("")}）`);

  // (c) 简繁异体 10：樓/楼、餘/馀/余、講/讲、項/项 必须全部纳入
  const variantForms = ["樓", "楼", "餘", "馀", "余", "講", "讲", "項", "项"];
  const variantPicked: QueueItem[] = [];
  for (const character of variantForms) {
    // 优先在有该字的库里取（新韵逐码位重建，简繁两形都有）
    const owner =
      (["xinyun", "pingshui", "cilin"] as BookId[]).find((book) => {
        const raw = snapshots.get(book);
        return raw !== undefined && raw.candidates.some((candidate) => candidate.character === character);
      }) ?? null;
    if (owner === null) {
      variantPicked.push({
        queueId: nextId("pingshui"),
        book: "pingshui",
        dataVersion: pingshui.dataVersion,
        unit: "（三库均未收）",
        unitKind: "平水韵部",
        character,
        candidateId: "",
        groupId: "",
        evidenceId: "",
        evidenceReviewStatus: "missing-in-table",
        sourceLocator: "data/variants/variant-edges-d2.json",
        quotaGroup: "简繁异体10",
        selectionReason: "简繁异体必含字，三库均未收录该形",
        humanQuestion: buildQuestions(character, "简繁异体10", "（未收）", []),
      });
      continue;
    }
    const raw = snapshots.get(owner) as RawSnapshot;
    const candidates = raw.candidates.filter((candidate) => candidate.character === character);
    const unit = (candidates[0]?.groupIds[0] ?? "").split(":").slice(2).join(":");
    variantPicked.push(
      makeItem(
        raw,
        owner === "xinyun" ? "新韵韵部" : owner === "cilin" ? "词林部" : "平水韵部",
        unit,
        character,
        candidates,
        "简繁异体10",
        "简繁异体必含字（variant-edges-d2 覆盖范围）",
      ),
    );
  }
  // 补到 10 条：用「楼」在词林的记录补第 10 条
  if (variantPicked.length < 10) {
    const cilinLou = cilin.candidates.filter((candidate) => candidate.character === "楼");
    if (cilinLou.length > 0) {
      variantPicked.push(
        makeItem(
          cilin,
          "词林部",
          (cilinLou[0]?.groupIds[0] ?? "").split(":").slice(2).join(":"),
          "楼",
          cilinLou,
          "简繁异体10",
          "补足 10 条：同一字在词林侧的记录（与平水侧对照）",
        ),
      );
    }
  }
  part60.push(...variantPicked);
  console.log(`  简繁异体：${variantPicked.length} 条（必含 ${variantForms.length} 形）`);

  // (d) 名篇优先 15：8 个关键字 + 三讲 9 字中未被 278 抽中的 7 条
  const famous = ["更", "望", "思", "乡", "乘", "空", "不", "汉"];
  const famousPicked: QueueItem[] = [];
  for (const character of famous) {
    const candidates = pingshuiAllChars.get(character) ?? [];
    if (candidates.length === 0) {
      check(false, `名篇关键字「${character}」在平水 106 部快照中未收录`);
      continue;
    }
    const unit = (candidates[0]?.groupIds[0] ?? "").split(":").slice(2).join(":");
    famousPicked.push(
      makeItem(pingshui, "平水韵部", unit, character, candidates, "名篇优先15", "方案 §3 优先人工清单（名篇关键字）"),
    );
  }
  const sanJiangChars = [...(pingshuiUnits.get("上:三讲") ?? new Map()).keys()].sort(codepointOrder);
  const pickedBy278 = new Set(
    part278
      .filter((item) => item.path === "sanj-jiang-draft")
      .map((item) => item.character),
  );
  const sanJiangRest = sanJiangChars.filter((character) => !pickedBy278.has(character));
  const sanJiangPicked: QueueItem[] = [];
  for (const character of sanJiangRest) {
    const candidates = (pingshuiUnits.get("上:三讲") ?? new Map()).get(character) ?? [];
    sanJiangPicked.push(
      makeItem(
        pingshui,
        "平水韵部",
        "上:三讲",
        character,
        candidates,
        "名篇优先15",
        `三讲 9 字中未被 278 抽中者（278 已抽：${[...pickedBy278].join("")}）`,
        { path: "sanj-jiang-draft" },
      ),
    );
  }
  part60.push(...famousPicked, ...sanJiangPicked);
  console.log(
    `  名篇优先：${famousPicked.length + sanJiangPicked.length} 条（关键字 ${famousPicked.length} + 三讲余 ${sanJiangPicked.length}）`,
  );

  const items2 = [...part278, ...part60];

  // ---------------- 断言 ----------------
  console.log("\n=== 断言 ===");
  const byBook278 = (book: BookId): number =>
    part278.filter((item) => item.book === book).length;

  check(items2.length === 338, `总条数 338（实际 ${items2.length}）`);
  check(byBook278("pingshui") === 212, `278 部分·平水 212（实际 ${byBook278("pingshui")}）`);
  check(byBook278("cilin") === 38, `278 部分·词林 38（实际 ${byBook278("cilin")}）`);
  check(byBook278("xinyun") === 28, `278 部分·新韵 28（实际 ${byBook278("xinyun")}）`);
  check(part278.length === 278, `278 部分合计 278（实际 ${part278.length}）`);
  check(part60.length === 60, `60 配额合计 60（实际 ${part60.length}）`);

  const quotaSums = {
    入声20: part60.filter((item) => item.quotaGroup === "入声20").length,
    多归部15: part60.filter((item) => item.quotaGroup === "多归部15").length,
    简繁异体10: part60.filter((item) => item.quotaGroup === "简繁异体10").length,
    名篇优先15: part60.filter((item) => item.quotaGroup === "名篇优先15").length,
  };
  check(quotaSums["入声20"] === 20, `入声 20（实际 ${quotaSums["入声20"]}）`);
  check(quotaSums["多归部15"] === 15, `多归部 15（实际 ${quotaSums["多归部15"]}）`);
  check(quotaSums["简繁异体10"] === 10, `简繁异体 10（实际 ${quotaSums["简繁异体10"]}）`);
  check(quotaSums["名篇优先15"] === 15, `名篇优先 15（实际 ${quotaSums["名篇优先15"]}）`);

  const underTwo = [...unitCounts.entries()].filter(([, count]) => count < 2);
  check(
    underTwo.length === 0,
    `每单元 ≥2 条：逐部通过 ${unitCounts.size - underTwo.length}/${unitCounts.size}${underTwo.length > 0 ? `（不足：${underTwo.map(([unit]) => unit).join("、")}）` : ""}`,
  );
  check(
    part278.filter((item) => item.path === "sanj-jiang-draft").length === 2,
    `三讲 2 条标 path="sanj-jiang-draft"（实际 ${part278.filter((item) => item.path === "sanj-jiang-draft").length}）`,
  );
  const mustMulti = ["中", "上", "里", "更"].filter((character) =>
    part60.some((item) => item.quotaGroup === "多归部15" && item.character === character),
  );
  check(mustMulti.length >= 2, `多归部必含「中/上/里/更」中至少 2 个（实际 ${mustMulti.length}：${mustMulti.join("")}）`);
  const variantCovered = variantForms.filter((character) =>
    part60.some((item) => item.quotaGroup === "简繁异体10" && item.character === character),
  );
  check(
    variantCovered.length === variantForms.length,
    `简繁异体 10 条覆盖全部必含形 ${variantForms.length} 个（实际 ${variantCovered.length}）`,
  );
  check(
    new Set(items2.map((item) => item.queueId)).size === items2.length,
    "queueId 唯一",
  );
  const noReadingSelected = items2.every(
    (item) => item.candidateId === "" || item.candidateId.includes(":"),
  );
  check(noReadingSelected, "没有出现「已选读音」的字段（只给候选 ID）");

  if (failures.length > 0) {
    console.log("\n=== 断言失败（未写出）===");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  // ---------------- 落盘 ----------------
  const output = {
    queueId: `ai-lexicon-sample-queue-${REPORT_DATE}`,
    generatedAt: REPORT_DATE,
    generatedBy: "scripts/data/build-sample-queue.ts（队员 A 的 DeepSeek）",
    nature:
      "人工抽样审核队列。每条只给候选 ID 与证据状态，**不预选读音、不给平仄结论**；问题由人工回答。",
    counts: {
      total: items2.length,
      part278,
      part60,
      byBook278: { pingshui: 212, cilin: 38, xinyun: 28 },
      quota: quotaSums,
      units: unitCounts.size,
      unitsMeetingAtLeastTwo: unitCounts.size - underTwo.length,
    },
    selectionRules: {
      part278:
        "平水按 106 部（主口径，含三讲草案）每部 2 条；词林按 19 部每部 2 条；新韵按 14 韵每韵 2 条。" +
        "单元内字符按 Unicode 码位升序；取第 1 条与第 ⌈n/2⌉ 条（1-based）。" +
        "n=1 时该字计两次并标 singleCharacterGroup=true。" +
        "同一字多条候选时取候选 ID 字符串最小者（稳定可复算）。" +
        "三讲部的 2 条标 path=\"sanj-jiang-draft\"。",
      part60: {
        "入声20": "平水入声 17 部各取码位最小 1 条；余 3 条在该 17 部剩余字中按码位升序补。",
        "多归部15": "平水 106 部中候选数 >1 的字；先取必含字「中/上/里/更」（存在的全取），余量按码位升序补到 15。",
        "简繁异体10": "必含 樓/楼、餘/馀/余、講/讲、項/项 共 9 个字形；每个取「新韵→平水→词林」顺序中首个收录该形的库；不足 10 条时用「楼」在词林侧的记录补足。",
        "名篇优先15": "方案 §3 优先清单的 8 个关键字（更、望、思、乡、乘、空、不、汉）+ 三讲 9 字中未被 278 抽中的 7 字。",
      },
      controlSnapshot: `${CONTROL_SNAPSHOT}（105 部）作为对照，**不参与 278 计数**；其缺三讲属已知缺口，见初审报告 A 类异常。`,
      reproducibility:
        "node node_modules/tsx/dist/cli.mjs scripts/data/build-sample-queue.ts 可完整复算本队列。",
    },
    items: items2,
  };

  mkdirSync(path.join(ROOT, "data", "reviews"), { recursive: true });
  writeFileSync(path.join(ROOT, OUT_REL), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`\n=== 结果 ===`);
  console.log(`写出 ${OUT_REL}`);
  console.log(
    `338 = 278（平水 212 + 词林 38 + 新韵 28）+ 60（入声 20 + 多归部 15 + 简繁异体 10 + 名篇 15）`,
  );
  console.log(`每单元 ≥2 条：${unitCounts.size}/${unitCounts.size} 部通过`);
}

main();
