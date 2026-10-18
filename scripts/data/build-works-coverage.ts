/**
 * 三首名篇的逐字覆盖（A2-08）→ data/normalized/works-coverage-d2.json
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/build-works-coverage.ts
 *
 * 正文来源：data/works/review-queue.json（reviewStatus=pending 的**候选登记**，非 approved 元数据）。
 * 本脚本不造正文、不造读音、不选读音：
 * - 只通过 @poetry/lexicon 的 lookupCharacters 取全部候选；
 * - 每个字的全部候选 ID、平仄可能值、证据审核状态原样列出；
 * - 多候选与跨库缺字只登记，不做取舍（取舍属 B 的消歧职责）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BookId, LookupResult } from "@poetry/contracts";

import {
  createLexicon,
  deserializeSnapshot,
  isLexiconError,
  type Lexicon,
  type LookupRequest,
} from "../../packages/lexicon/src/index.js";
import type { SnapshotInput } from "../../packages/lexicon/src/snapshot.js";

import { ROOT, check, failures, finish, section } from "./snapshot-report.js";

const QUEUE_REL = "data/works/review-queue.json";
const OUT_REL = "data/normalized/works-coverage-d2.json";

/** 使用的落盘快照：平水取 106 部补丁草案（超集），并逐字标注是否为草案独有覆盖。 */
const SNAPSHOTS: readonly { book: BookId; file: string }[] = [
  { book: "pingshui", file: "pingshui.full-d2-patched.json" },
  { book: "cilin", file: "cilin.full-d2.json" },
  { book: "xinyun", file: "xinyun.full-d2.json" },
];

const SANJ_JIANG_GROUP_ID = "group:pingshui:上:三讲";
const HAN = /\p{Script=Han}/u;

interface QueueItem {
  caseId: string;
  title: string;
  author: string | null;
  text: string;
  reviewStatus: string;
}

interface QueueFile {
  schemaVersion?: string;
  note?: string;
  items?: QueueItem[];
}

interface CharacterDetail {
  character: string;
  candidateCount: number;
  candidateIds: string[];
  toneClasses: string[];
  possibleTones: string[];
  groupIds: string[];
  evidenceReviewStatuses: string[];
  draftOnly: boolean;
}

interface BookCoverage {
  book: BookId;
  dataVersion: string;
  reviewStatus: string;
  totalCharacters: number;
  distinctCharacters: number;
  found: number;
  missing: string[];
  missingCount: number;
  multiCandidateCharacters: {
    character: string;
    candidateCount: number;
    candidateIds: string[];
    toneClasses: string[];
  }[];
  draftOnlyCharacters: string[];
  evidenceReviewStatusCounts: { unverified: number; approved: number };
  characterDetails: CharacterDetail[];
}

interface PoemCoverage {
  caseId: string;
  title: string;
  author: string | null;
  textReviewStatus: string;
  textSource: string;
  totalCharacters: number;
  distinctCharacters: number;
  crossBookMissing: string[];
  perBook: BookCoverage[];
}

function hanCharacters(text: string): string[] {
  const result: string[] = [];
  for (const character of text) {
    if (HAN.test(character)) result.push(character);
  }
  return result;
}

/** 查询失败只记失败并返回 null，不中断其余库的覆盖统计。 */
async function lookupOrReport(
  lexicon: Lexicon,
  request: LookupRequest,
  label: string,
): Promise<LookupResult | null> {
  try {
    return await lexicon.lookupCharacters(request);
  } catch (error) {
    check(false, `${label} 查询失败：${String(error)}`);
    return null;
  }
}

async function main(): Promise<void> {
  section("读取正文队列");
  const queueFile = path.join(ROOT, QUEUE_REL);
  check(existsSync(queueFile), `正文队列存在：${QUEUE_REL}`);
  if (!existsSync(queueFile)) {
    console.error(
      "\n缺口：data/works/ 下没有 review-queue.json。按纪律不自行造正文，本步停在缺项上报。",
    );
    finish("（缺正文，未生成覆盖报告）");
    return;
  }
  const queue = JSON.parse(readFileSync(queueFile, "utf8")) as QueueFile;
  const items = queue.items ?? [];
  check(items.length > 0, `队列含正文条目 ${items.length} 条`);
  for (const item of items) {
    console.log(
      `  ${item.caseId} · ${item.title}（${item.author ?? "佚名"}）· reviewStatus=${item.reviewStatus}`,
    );
  }
  if (items.length === 0) {
    finish("（队列为空，未生成覆盖报告）");
    return;
  }

  section("装载落盘快照");
  const inputs: SnapshotInput[] = [];
  const books: { book: BookId; dataVersion: string; reviewStatus: string }[] =
    [];
  for (const entry of SNAPSHOTS) {
    const relative = `data/normalized/${entry.file}`;
    const file = path.join(ROOT, "data", "normalized", entry.file);
    if (!existsSync(file)) {
      check(false, `缺少快照 ${relative}（先跑对应 build-*.ts）`);
      continue;
    }
    try {
      const snapshot = deserializeSnapshot(
        JSON.parse(readFileSync(file, "utf8")),
      );
      inputs.push(snapshot);
      books.push({
        book: snapshot.book,
        dataVersion: snapshot.dataVersion,
        reviewStatus: snapshot.reviewStatus,
      });
      console.log(
        `  ${entry.book}：${snapshot.dataVersion}（reviewStatus=${snapshot.reviewStatus}，候选 ${snapshot.candidates.length}）`,
      );
    } catch (error) {
      if (isLexiconError(error)) {
        check(false, `${relative} 装载失败：${error.code}`);
        for (const detail of error.details) console.error(`      · ${detail}`);
      } else {
        check(false, `${relative} 装载抛出未预期错误：${String(error)}`);
      }
    }
  }
  check(
    books.length === SNAPSHOTS.length,
    `三库快照齐备（实际 ${books.length} 库）`,
  );

  const lexicon = createLexicon(inputs);
  const poems: PoemCoverage[] = [];

  for (const item of items) {
    section(`正文覆盖：${item.title}`);
    const characters = hanCharacters(item.text);
    const distinct = [...new Set(characters)];
    console.log(`总字数 ${characters.length}；不同字 ${distinct.length}`);

    const perBook: BookCoverage[] = [];
    const missingByBook = new Map<BookId, Set<string>>();

    for (const entry of books) {
      const result = await lookupOrReport(
        lexicon,
        {
          characters: distinct,
          rhymeBook: entry.book,
          dataVersion: entry.dataVersion,
        },
        `${item.title} / ${entry.book}`,
      );
      if (result === null) continue;

      const evidenceStatus = new Map(
        result.evidence.map(
          (evidence) => [evidence.id, evidence.reviewStatus] as const,
        ),
      );

      const details: CharacterDetail[] = result.entries.map((one) => {
        const candidateIds = one.candidates.map((candidate) => candidate.id);
        const toneClasses = [
          ...new Set(one.candidates.map((candidate) => candidate.toneClass)),
        ].sort();
        const possibleTones = [
          ...new Set(
            one.candidates
              .map((candidate) => candidate.tone)
              .filter((tone): tone is "P" | "Z" => tone !== null),
          ),
        ].sort();
        const reviewStatuses = [
          ...new Set(
            one.candidates.flatMap((candidate) =>
              candidate.evidenceIds.map(
                (evidenceId) => evidenceStatus.get(evidenceId) ?? "unknown",
              ),
            ),
          ),
        ].sort();
        const groupIds = [
          ...new Set(one.candidates.flatMap((candidate) => candidate.groupIds)),
        ].sort();
        return {
          character: one.character,
          candidateCount: one.candidates.length,
          candidateIds,
          toneClasses,
          possibleTones,
          groupIds,
          evidenceReviewStatuses: reviewStatuses,
          draftOnly:
            entry.book === "pingshui" &&
            groupIds.length > 0 &&
            groupIds.every((groupId) => groupId === SANJ_JIANG_GROUP_ID),
        };
      });

      const missing = [...result.missing].sort();
      missingByBook.set(entry.book, new Set(missing));
      const draftOnly = details
        .filter((detail) => detail.draftOnly)
        .map((detail) => detail.character);
      const multi = details.filter((detail) => detail.candidateCount > 1);

      console.log(
        `  ${entry.book}（${entry.dataVersion}）：覆盖 ${distinct.length - missing.length}/${distinct.length}` +
          `；缺字 ${missing.length}；多候选 ${multi.length}；草案独有 ${draftOnly.length}`,
      );
      if (missing.length > 0) console.log(`    缺字：${missing.join("")}`);
      if (draftOnly.length > 0) {
        console.log(`    仅由三讲草案支撑：${draftOnly.join("")}`);
      }

      const found = distinct.length - missing.length;
      check(
        found >= 0 && found <= distinct.length,
        `${item.title} / ${entry.book} 覆盖数在 0..总字数区间内（${found}/${distinct.length}）`,
      );
      const overlap = missing.filter((character) =>
        details.some((detail) => detail.character === character),
      );
      check(
        overlap.length === 0,
        `${item.title} / ${entry.book} missing 与已找到的字不重叠（重叠 ${overlap.length}）`,
      );

      perBook.push({
        book: entry.book,
        dataVersion: entry.dataVersion,
        reviewStatus: entry.reviewStatus,
        totalCharacters: characters.length,
        distinctCharacters: distinct.length,
        found,
        missing,
        missingCount: missing.length,
        multiCandidateCharacters: multi.map((detail) => ({
          character: detail.character,
          candidateCount: detail.candidateCount,
          candidateIds: detail.candidateIds,
          toneClasses: detail.toneClasses,
        })),
        draftOnlyCharacters: draftOnly,
        evidenceReviewStatusCounts: {
          unverified: result.evidence.filter(
            (evidence) => evidence.reviewStatus === "unverified",
          ).length,
          approved: result.evidence.filter(
            (evidence) => evidence.reviewStatus === "approved",
          ).length,
        },
        characterDetails: details,
      });
    }

    const crossBookMissing = distinct.filter((character) =>
      [...missingByBook.values()].every((set) => set.has(character)),
    );
    console.log(
      `  三库全缺字 ${crossBookMissing.length}${crossBookMissing.length > 0 ? `：${crossBookMissing.join("")}` : ""}`,
    );

    poems.push({
      caseId: item.caseId,
      title: item.title,
      author: item.author,
      textReviewStatus: item.reviewStatus,
      textSource: QUEUE_REL,
      totalCharacters: characters.length,
      distinctCharacters: distinct.length,
      crossBookMissing,
      perBook,
    });
  }

  const output = {
    schemaVersion: "d2-draft",
    note:
      "三首名篇逐字覆盖（A2-08）。正文取自 data/works/review-queue.json，其 reviewStatus 为 pending，" +
      "**不是 approved 元数据**；正文版本与出处仍待人工核实。" +
      "本报告只登记全部候选与证据状态，不在数据层选读音（多音多部取舍属 B 的消歧职责）。" +
      "所有 evidence 仍为 unverified，不得据此下发布级结论。",
    generatedFrom: {
      worksQueue: QUEUE_REL,
      books: books.map((entry) => ({
        book: entry.book,
        dataVersion: entry.dataVersion,
        reviewStatus: entry.reviewStatus,
      })),
      pingshuiNote:
        "平水使用 106 部**补丁草案**快照（含上声三讲）；draftOnlyCharacters 标记仅由该草案支撑的字。",
    },
    poems,
  };

  section("断言");
  check(
    poems.length === items.length,
    `每首都生成了覆盖记录（${poems.length}/${items.length}）`,
  );
  check(
    poems.every((poem) => poem.perBook.length > 0),
    "每首至少有一库覆盖记录",
  );
  const approvedEvidence = poems.reduce(
    (sum, poem) =>
      sum +
      poem.perBook.reduce(
        (inner, book) => inner + book.evidenceReviewStatusCounts.approved,
        0,
      ),
    0,
  );
  check(
    approvedEvidence === 0,
    `没有任何未审核证据被写成 approved（实际 ${approvedEvidence} 条）`,
  );
  check(
    OUT_REL.startsWith("data/normalized/"),
    `输出路径不是 data/releases：${OUT_REL}`,
  );

  if (failures.length > 0) {
    finish("（断言未通过，未写出任何文件）");
    return;
  }

  section("写出");
  mkdirSync(path.join(ROOT, "data", "normalized"), { recursive: true });
  writeFileSync(
    path.join(ROOT, OUT_REL),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  console.log(`写出 ${OUT_REL}`);

  finish(
    "三首名篇覆盖已落盘；正文为 pending 候选登记、三库 reviewStatus=unverified、" +
      "evidence approved=0，因此这只是待核查材料，不是发布级结论。",
  );
}

await main();
