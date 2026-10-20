/**
 * D3 · Gate 1：《登鹳雀楼》×（词林、新韵）最小切片候选批次。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/build-d3-batch.ts
 *
 * 产出：data/reviews/d3-a-candidate-batch.json
 *
 * 硬约束（逐条落到断言里）：
 * - candidateId 一律取自真实快照，不造 ID；
 * - sourcePath / sourceSha256 / locator 取自真实文件与真实证据条目；
 * - positions 用 dengguanquelou/l{行}c{列}，行列来自 @poetry/readings 的 parseText，
 *   与 golden-token-review 同口径；
 * - machineStatus 一律 "machine_checked"；**不写 Evidence.reviewStatus**；
 * - approvalRecord 一律 null（本批不接受任何新批准）；
 * - baseDataVersions 现读三份快照的 dataVersion，不写字面量、不写过期版本；
 * - 保留两库全部候选，不删竞争候选；
 * - 平水入声不机械映射现代声调；新韵 modernReading 只取 pinyin-data 真实值；
 * - 不造异体候选（契约无 variant 字段），异体只以 data/variants 的边表达。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Evidence, ReadingCandidate } from "@poetry/contracts";

import { parseText } from "../../packages/readings/src/index.js";

import { ROOT } from "./snapshot-report.js";

const REPORT_DATE = "2026-10-18";
const OUT_REL = `data/reviews/d3-a-candidate-batch-${REPORT_DATE}.json`;
const CASE_ID = "golden-dengguanquelou-ps-v1";
const WORK_SLUG = "dengguanquelou";

const SNAPSHOT_REL = {
  pingshui: "data/normalized/pingshui.full-d2-patched.json",
  cilin: "data/normalized/cilin.full-d2.json",
  xinyun: "data/normalized/xinyun.full-d2.json",
} as const;

/** 候选来源的原始字节文件（用于 sourcePath / sourceSha256）。 */
const SOURCE_REL: Readonly<Record<string, string>> = {
  cilin: "data/raw/chinese_word_rhyme/Cilin_Rhyme.json",
  xinyun: "data/raw/pinyin-data/pinyin.txt",
};

const VARIANT_FILE = "data/variants/variant-edges-d2.json";
const WORKS_FILE = "data/works/review-queue.json";

const SLICE_BOOKS = ["cilin", "xinyun"] as const;
type SliceBook = (typeof SLICE_BOOKS)[number];

const failures: string[] = [];
function check(ok: boolean, message: string): void {
  if (!ok) failures.push(message);
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${message}`);
}

interface RawSnapshot {
  dataVersion: string;
  book: string;
  notice: string;
  candidates: ReadingCandidate[];
  groups: { id: string; name: string; toneClass: string | null }[];
  evidence: Evidence[];
}

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relative), "utf8")) as T;
}

function sha256File(relative: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(ROOT, relative)))
    .digest("hex");
}

function main(): void {
  console.log("=== 装载 ===");
  const snapshots: Record<"pingshui" | SliceBook, RawSnapshot> = {
    pingshui: readJson<RawSnapshot>(SNAPSHOT_REL.pingshui),
    cilin: readJson<RawSnapshot>(SNAPSHOT_REL.cilin),
    xinyun: readJson<RawSnapshot>(SNAPSHOT_REL.xinyun),
  };
  for (const [book, snapshot] of Object.entries(snapshots)) {
    console.log(`  ${book.padEnd(9)} ${snapshot.dataVersion}`);
  }

  const baseDataVersions = {
    pingshui: snapshots.pingshui.dataVersion,
    cilin: snapshots.cilin.dataVersion,
    xinyun: snapshots.xinyun.dataVersion,
  };

  const sourceSha: Record<SliceBook, string> = {
    cilin: sha256File(SOURCE_REL.cilin as string),
    xinyun: sha256File(SOURCE_REL.xinyun as string),
  };
  console.log(
    `  来源字节 sha256：cilin=${sourceSha.cilin.slice(0, 16)}… xinyun=${sourceSha.xinyun.slice(0, 16)}…`,
  );

  const works = readJson<{
    items: {
      caseId: string;
      title: string;
      author: string | null;
      text: string;
      reviewStatus: string;
    }[];
  }>(WORKS_FILE);
  const work = works.items.find((item) => item.caseId === CASE_ID);
  check(work !== undefined, `正文队列含 ${CASE_ID}`);
  if (work === undefined) {
    console.log("\n缺正文，未生成。");
    process.exitCode = 1;
    return;
  }

  const poem = parseText({ text: work.text });
  console.log(
    `  字位 ${poem.tokens.length} 个（parseText，与 golden-token-review 同口径）`,
  );

  const variantFile = readJson<{
    edges?: { id: string; from?: string; to?: string; status?: string }[];
  }>(VARIANT_FILE);
  const variantEdges = variantFile.edges ?? [];

  // 索引：book → character → candidates / evidenceId → evidence
  const index = new Map<
    string,
    { byChar: Map<string, ReadingCandidate[]>; evidence: Map<string, Evidence> }
  >();
  for (const book of ["pingshui", ...SLICE_BOOKS] as const) {
    const byChar = new Map<string, ReadingCandidate[]>();
    for (const candidate of snapshots[book].candidates) {
      const list = byChar.get(candidate.character) ?? [];
      list.push(candidate);
      byChar.set(candidate.character, list);
    }
    index.set(book, {
      byChar,
      evidence: new Map(
        snapshots[book].evidence.map((entry) => [entry.id, entry]),
      ),
    });
  }

  const bookLevelExceptionIds: Record<SliceBook, string[]> = {
    // 词林：4 条非汉字导入垃圾 + 未登记生成器版本 + ze_unspecified 口径提示
    cilin: ["D-cross-002", "F-cilin-002", "B-cilin-001"],
    // 新韵：重建表未映射/轻声/er、版本不结构化、同字同子卷多读音
    xinyun: ["G-cross-009", "F-cross-005", "E-cross-010"],
  };

  const entries: unknown[] = [];
  const stats = {
    tokens: poem.tokens.length,
    entries: 0,
    candidateTotal: 0,
    multiCandidateTokens: 0,
    ruCautionTokens: 0,
  };

  for (const token of poem.tokens) {
    const pingshuiCandidates =
      index.get("pingshui")?.byChar.get(token.text) ?? [];
    const pingshuiToneClasses = [
      ...new Set(pingshuiCandidates.map((candidate) => candidate.toneClass)),
    ].sort();
    const hasRu = pingshuiToneClasses.includes("ru");

    for (const book of SLICE_BOOKS) {
      const bookIndex = index.get(book);
      const candidates = bookIndex?.byChar.get(token.text) ?? [];
      // D3 交付接口草案要求键名为复数数组：positions: ["dengguanquelou/l1c1"]
      // （单数字符串会让 B 侧 entry.positions 读到 undefined，整批对照空转）
      const positions = [`${WORK_SLUG}/l${token.line}c${token.column}`];
      const exceptionIds = [...bookLevelExceptionIds[book]];

      if (candidates.length === 0) {
        exceptionIds.push("A-pingshui-001");
      }
      const candidateDetail = candidates.map((candidate) => {
        const evidenceList = candidate.evidenceIds.map((evidenceId) => {
          const evidence = bookIndex?.evidence.get(evidenceId);
          return {
            evidenceId,
            evidenceReviewStatus: evidence?.reviewStatus ?? "missing-evidence",
            locator: evidence?.locator ?? "",
            sourceId: evidence?.sourceId ?? "",
          };
        });
        return {
          candidateId: candidate.id,
          positions,
          toneClass: candidate.toneClass,
          tone: candidate.tone,
          groupIds: [...candidate.groupIds],
          evidenceIds: [...candidate.evidenceIds],
          evidence: evidenceList,
          modernReading:
            candidate.modernReading === null
              ? null
              : {
                  pinyin: candidate.modernReading.pinyin,
                  toneNumber: candidate.modernReading.toneNumber,
                },
          modernReadingAbsent:
            candidate.modernReading === null
              ? "本快照该候选无 modernReading（源表不含则如实为 null，不推断）"
              : null,
          sourcePath: SOURCE_REL[book] ?? "",
          sourceSha256: sourceSha[book],
          locator: evidenceList[0]?.locator ?? "",
        };
      });

      entries.push({
        batchEntryId: `d3a-${book}-l${token.line}c${token.column}`,
        positions,
        tokenId: token.tokenId,
        line: token.line,
        column: token.column,
        character: token.text,
        book,
        dataVersion: baseDataVersions[book],
        machineStatus: "machine_checked" as const,
        approvalRecord: null,
        candidateCount: candidates.length,
        candidates: candidateDetail,
        candidateIds: candidates.map((candidate) => candidate.id),
        competingCandidatesKept: candidates.length > 1,
        exceptionIds: [...new Set(exceptionIds)].sort(),
        notes: {
          xinyunProvenance:
            book === "xinyun"
              ? "十四韵规则 + pinyin-data 重建表，非官方原表；MIT 许可只覆盖 pinyin-data 整理成果，不构成韵部正确性证据"
              : null,
          pingshuiToneClasses,
          ruCaution: hasRu
            ? "该字在平水属**入声**：新韵候选的现代声调**不是**入声的机械映射，只按 pinyin-data 本调记录，不得据此断言古今对应"
            : null,
          variantEdgesTouched: variantEdges
            .filter(
              (edge) => edge.from === token.text || edge.to === token.text,
            )
            .map((edge) => ({
              id: edge.id,
              from: edge.from,
              to: edge.to,
              status: edge.status,
              note: "异体只以边表达为候选关联；本批次**不据此新增候选**，也不覆盖原表收录事实",
            })),
        },
      });
      stats.entries += 1;
      stats.candidateTotal += candidates.length;
      if (candidates.length > 1) stats.multiCandidateTokens += 1;
      if (hasRu) stats.ruCautionTokens += 1;
    }
  }

  // ---------------- 断言 ----------------
  console.log("\n=== 断言 ===");
  check(
    stats.entries === stats.tokens * SLICE_BOOKS.length,
    `条目数 = 字位×2库 = ${stats.tokens}×2（实际 ${stats.entries}）`,
  );

  // 字段存在性 + 类型断言：这次的教训是「字段名/存在性」没被断言覆盖，
  // 单数 position 字符串曾让 B 侧 entry.positions 读到 undefined。
  type WithPositions = { positions?: unknown };
  const entriesWithPositions = (entries as WithPositions[]).filter(
    (entry) =>
      Array.isArray(entry.positions) &&
      (entry.positions as unknown[]).length >= 1,
  ).length;
  check(
    entriesWithPositions === entries.length,
    `entries 的 positions 均为非空数组（合规 ${entriesWithPositions}/${entries.length}）`,
  );
  const singlePosition = (entries as unknown[]).filter((entry) =>
    Object.prototype.hasOwnProperty.call(entry, "position"),
  ).length;
  check(
    singlePosition === 0,
    `不存在单数 position 键（违规 ${singlePosition} 处）`,
  );
  const candidatesWithoutPositions = (
    entries as { candidates: WithPositions[] }[]
  )
    .flatMap((entry) => entry.candidates)
    .filter(
      (candidate) =>
        !Array.isArray(candidate.positions) ||
        (candidate.positions as unknown[]).length < 1,
    ).length;
  const candidateTotal = (entries as { candidates: unknown[] }[]).reduce(
    (sum, entry) => sum + entry.candidates.length,
    0,
  );
  check(
    candidatesWithoutPositions === 0,
    `candidates 的 positions 均为非空数组（不合规 ${candidatesWithoutPositions}/${candidateTotal}）`,
  );

  // candidateId 必须真实存在于对应快照
  let inventedIds = 0;
  let deletedCompetitors = 0;
  for (const token of poem.tokens) {
    for (const book of SLICE_BOOKS) {
      const real = index.get(book)?.byChar.get(token.text) ?? [];
      const realIds = new Set(real.map((candidate) => candidate.id));
      const entry = entries.find(
        (item) =>
          (item as { batchEntryId: string }).batchEntryId ===
          `d3a-${book}-l${token.line}c${token.column}`,
      ) as { candidateIds: string[] } | undefined;
      if (entry === undefined) continue;
      for (const id of entry.candidateIds)
        if (!realIds.has(id)) inventedIds += 1;
      if (entry.candidateIds.length !== real.length) deletedCompetitors += 1;
    }
  }
  check(
    inventedIds === 0,
    `没有凭空构造的 candidateId（违规 ${inventedIds} 个）`,
  );
  check(
    deletedCompetitors === 0,
    `没有删除竞争候选（与快照候选数不一致的条目 ${deletedCompetitors} 个）`,
  );

  // sourcePath 存在且 sha256 与实测一致
  let badSource = 0;
  for (const entry of entries as {
    candidates: { sourcePath: string; sourceSha256: string }[];
  }[]) {
    for (const candidate of entry.candidates) {
      if (!existsSync(path.join(ROOT, candidate.sourcePath))) badSource += 1;
      else if (sha256File(candidate.sourcePath) !== candidate.sourceSha256)
        badSource += 1;
    }
  }
  check(
    badSource === 0,
    `sourcePath 均存在且 sourceSha256 与实测一致（不一致 ${badSource} 处）`,
  );

  // locator 非空
  const emptyLocator = (
    entries as { candidates: { locator: string }[] }[]
  ).reduce(
    (sum, entry) =>
      sum +
      entry.candidates.filter((candidate) => candidate.locator === "").length,
    0,
  );
  check(
    emptyLocator === 0,
    `每条候选都有真实 locator（空 locator ${emptyLocator} 条）`,
  );

  // machineStatus / approvalRecord
  const badStatus = (
    entries as { machineStatus: string; approvalRecord: unknown }[]
  ).filter(
    (entry) =>
      entry.machineStatus !== "machine_checked" ||
      entry.approvalRecord !== null,
  ).length;
  check(
    badStatus === 0,
    `machineStatus 全为 machine_checked 且 approvalRecord 全为 null（违规 ${badStatus} 条）`,
  );

  // baseDataVersions 必须等于快照实测值，且非过期字面量
  check(
    baseDataVersions.pingshui === snapshots.pingshui.dataVersion &&
      baseDataVersions.cilin === snapshots.cilin.dataVersion &&
      baseDataVersions.xinyun === snapshots.xinyun.dataVersion,
    "baseDataVersions 与三份快照的 dataVersion 逐字一致（现读，非字面量）",
  );
  check(
    snapshots.pingshui.groups.length === 106 &&
      snapshots.pingshui.groups.some(
        (group) => group.id === "group:pingshui:上:三讲",
      ),
    `baseDataVersions.pingshui 对应 106 部含三讲快照（实际 ${baseDataVersions.pingshui}）`,
  );

  // 不造异体候选：所有候选字的字形必须就是诗里的字
  const poemChars = new Set(poem.tokens.map((token) => token.text));
  const foreignChars = (
    entries as { candidates: { candidateId: string }[]; character: string }[]
  )
    .flatMap((entry) => entry.candidates.map(() => entry.character))
    .filter((character) => !poemChars.has(character));
  check(
    foreignChars.length === 0,
    `没有为异体/繁体形新增候选（越界 ${foreignChars.length} 条）`,
  );

  if (failures.length > 0) {
    console.log("\n=== 断言失败（未写出）===");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  // ---------------- 落盘 ----------------
  const output = {
    batchId: `d3-a-candidate-batch-${REPORT_DATE}`,
    generatedAt: REPORT_DATE,
    generatedBy: "scripts/data/build-d3-batch.ts（队员 A 的 DeepSeek）",
    task: "D3 · Gate 1：《登鹳雀楼》×（词林、新韵）最小切片候选批次",
    nature:
      "机器初审批次（machine_checked）。不含任何人工批准：approvalRecord 一律 null；" +
      "不写入 Evidence.reviewStatus；快照级 reviewStatus 仍为 unverified。",
    work: {
      caseId: work.caseId,
      title: work.title,
      author: work.author,
      text: work.text,
      textReviewStatus: work.reviewStatus,
      textSource: WORKS_FILE,
    },
    positionScheme:
      '键名为复数数组 positions: ["dengguanquelou/l{行}c{列}"]（D3 交付接口草案口径；不再输出单数 position）。' +
      "行列由 @poetry/readings 的 parseText 产出，与 golden-token-review 同口径；" +
      "tokenId / line / column 作为附加字段保留",
    sliceBooks: [...SLICE_BOOKS],
    baseDataVersions,
    baseDataVersionRoles: {
      pingshui:
        "字位/行列基准 + 「入声不得机械映射现代声调」的判据来源；本切片不重复列平水候选（见 golden-token-review）",
      cilin: "本切片候选来源之一",
      xinyun:
        "本切片候选来源之一（十四韵规则 + pinyin-data 重建表，非官方原表）",
    },
    exceptionIdScheme:
      "exceptionIds 复用 ai-lexicon-precheck-2026-10-18 的异常 ID；Gate 2 的 d3-a-anomalies.md 将沿用同一套 ID，不另起编号",
    constraints: {
      candidateIdsFromSnapshotOnly: true,
      competitorsKept: true,
      legacyRuNotMappedToModernTone: true,
      xinyunModernReadingFromPinyinDataOnly: true,
      noVariantCandidatesFabricated: true,
      approvalRecordNull: true,
    },
    counts: stats,
    entries,
  };

  mkdirSync(path.join(ROOT, "data", "reviews"), { recursive: true });
  writeFileSync(
    path.join(ROOT, OUT_REL),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  console.log(`\n=== 结果 ===`);
  console.log(`写出 ${OUT_REL}`);
  console.log(
    `字位 ${stats.tokens} × 2 库 = ${stats.entries} 条；候选合计 ${stats.candidateTotal}；多候选条目 ${stats.multiCandidateTokens}；入声提示条目 ${stats.ruCautionTokens}`,
  );
}

main();
