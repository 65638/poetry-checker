/**
 * D5 六格独立条件预期：三首 × 词林/新韵。
 *
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d5-six-cell-expectations.ts
 *
 * 期望由**韵书快照候选 + 已批语境规则**推导，不调用 API、不读取 API 输出反写。
 * 每个字位分开记两件事：
 *   currentExpectation     —— 当前证据状态下的预期（证据未齐即 blocked，运行时应 503）
 *   conditionalExpectation —— 该字位候选证据审核齐后的条件预期（未定就写 undetermined）
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BookId, ContextRule, Tone } from "@poetry/contracts";

import { parseText } from "../src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT_DIR = path.join(ROOT, "data", "reviews", "d5", "b");

const BOOKS: Array<{ book: BookId; snapshot: string }> = [
  { book: "cilin", snapshot: "data/normalized/cilin.full-d2.json" },
  { book: "xinyun", snapshot: "data/normalized/xinyun.full-d2.json" },
];
const CASES = ["dengguanquelou", "jingyesi", "huanghelou"];

interface Snapshot {
  dataVersion: string;
  reviewStatus: string;
  candidates: Array<{
    id: string;
    character: string;
    tone: Tone | null;
    evidenceIds: string[];
  }>;
  evidence: Array<{ id: string; reviewStatus: string }>;
  sources: Array<{ id: string }>;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

/** 按行做精确短语匹配，返回 tokenId → 命中规则。 */
function ruleHitsFor(
  text: string,
  rulesForBook: ContextRule[],
): Map<string, ContextRule> {
  const hits = new Map<string, ContextRule>();
  const tokens = parseText({ text }).tokens;
  const byLine = new Map<number, typeof tokens>();
  for (const token of tokens) {
    const bucket = byLine.get(token.line) ?? [];
    bucket.push(token);
    byLine.set(token.line, bucket);
  }
  for (const lineTokens of byLine.values()) {
    const characters = lineTokens.map((token) => token.text);
    for (const rule of rulesForBook) {
      for (const phrase of rule.exactPhrases) {
        const target = [...phrase];
        for (
          let start = 0;
          start + target.length <= characters.length;
          start += 1
        ) {
          if (
            characters.slice(start, start + target.length).join("") !== phrase
          )
            continue;
          const hit = lineTokens[start + rule.targetOffset];
          if (hit === undefined || hit.text !== rule.target) continue;
          hits.set(hit.tokenId, rule);
        }
      }
    }
  }
  return hits;
}

interface TokenExpectation {
  tokenId: string;
  line: number;
  column: number;
  character: string;
  candidateIds: string[];
  possibleTones: Tone[];
  unknownToneCandidates: string[];
  contextRuleIds: string[];
  contextBasis: string | null;
  currentExpectation: "blocked" | "unknown" | "resolved" | "ambiguous";
  currentBlockingReason: string | null;
  conditionalExpectation: "resolved" | "ambiguous" | "unknown";
  conditionalToneStatus: "resolved" | "ambiguous" | "unknown";
  conditionalBasis: string;
  ambiguityNote: string | null;
  undetermined: boolean;
}

function main(): void {
  const rules = readJson<ContextRule[]>("data/context/rules.json");
  const snapshots = new Map<BookId, Snapshot>();
  for (const { book, snapshot } of BOOKS) {
    snapshots.set(book, readJson<Snapshot>(snapshot));
  }
  const works = CASES.map((name) => ({
    caseId: readJson<{ id: string }>(`tests/golden/cases/${name}.json`).id,
    file: `tests/golden/cases/${name}.json`,
    data: readJson<{
      id: string;
      title: string;
      text: string;
      reviewStatus: string;
    }>(`tests/golden/cases/${name}.json`),
  }));

  const cells = [];
  const positionBookStatus = new Map<string, Set<string>>();

  for (const { book } of BOOKS) {
    const snapshot = snapshots.get(book);
    if (snapshot === undefined) continue;
    const approved = new Set(
      snapshot.evidence
        .filter((item) => item.reviewStatus === "approved")
        .map((item) => item.id),
    );
    const byCharacter = new Map<string, Snapshot["candidates"]>();
    for (const candidate of snapshot.candidates) {
      const bucket = byCharacter.get(candidate.character) ?? [];
      bucket.push(candidate);
      byCharacter.set(candidate.character, bucket);
    }
    const rulesForBook = rules.filter((rule) => rule.book === book);

    for (const work of works) {
      const text = work.data.text;
      const poem = parseText({ text });
      const hits = ruleHitsFor(text, rulesForBook);

      const tokens: TokenExpectation[] = [];
      for (const token of poem.tokens) {
        const candidates = byCharacter.get(token.text) ?? [];
        const rule = hits.get(token.tokenId);

        let effective = candidates;
        if (rule !== undefined) {
          const chosen = rule.selectCandidateIds[0];
          const picked = candidates.filter(
            (candidate) => candidate.id === chosen,
          );
          if (picked.length > 0) effective = picked;
        }

        const unbacked = effective
          .filter(
            (candidate) =>
              !candidate.evidenceIds.some((id) => approved.has(id)),
          )
          .map((candidate) => candidate.id);
        const tones = [
          ...new Set(
            effective
              .map((candidate) => candidate.tone)
              .filter((tone): tone is Tone => tone === "P" || tone === "Z"),
          ),
        ].sort();
        const unknownToneCandidates = effective
          .filter((candidate) => candidate.tone === null)
          .map((candidate) => candidate.id);

        // 当前预期：证据未齐即阻断，运行时应 503。
        let currentExpectation: TokenExpectation["currentExpectation"];
        let currentBlockingReason: string | null = null;
        if (candidates.length === 0) {
          currentExpectation = "unknown";
        } else if (unbacked.length > 0) {
          currentExpectation = "blocked";
          currentBlockingReason = "LOOKUP_EVIDENCE_UNVERIFIED";
        } else if (effective.length === 1) {
          currentExpectation = "resolved";
        } else {
          currentExpectation = "ambiguous";
        }

        // 条件预期：假设该字位候选证据审核齐（规则另需规则证据齐）。
        let conditionalExpectation: TokenExpectation["conditionalExpectation"];
        let conditionalToneStatus: TokenExpectation["conditionalToneStatus"];
        let conditionalBasis: string;
        let ambiguityNote: string | null = null;
        let undetermined = false;

        if (candidates.length === 0) {
          conditionalExpectation = "unknown";
          conditionalToneStatus = "unknown";
          conditionalBasis = "该字在本书快照无候选：未收录，不得补造读音";
          undetermined = true;
        } else if (unknownToneCandidates.length > 0) {
          conditionalExpectation = "unknown";
          conditionalToneStatus = "unknown";
          conditionalBasis = "有效候选含声调未知项：证据齐后平仄仍不可定";
          undetermined = true;
        } else if (rule !== undefined && effective.length === 1) {
          conditionalExpectation = "resolved";
          conditionalToneStatus = "resolved";
          conditionalBasis = `语境规则 ${rule.id} 选中 ${effective[0]?.id ?? ""}（需规则证据与候选证据均审核）`;
        } else if (effective.length === 1) {
          conditionalExpectation = "resolved";
          conditionalToneStatus = "resolved";
          conditionalBasis = "单候选：候选证据审核齐后唯一可判";
        } else {
          conditionalExpectation = "ambiguous";
          conditionalToneStatus = tones.length === 1 ? "resolved" : "ambiguous";
          conditionalBasis =
            tones.length === 1
              ? "多读音但同调：读音保持歧义、平仄可定，不强行选一个读音"
              : "多读音且含平含仄：无语境依据时读音与平仄都不得强定";
          ambiguityNote =
            tones.length === 1
              ? "多读同调，reading 应 ambiguous"
              : "多读含平仄，tone 也应保持不确定";
        }

        if (candidates.length > 1) {
          const key = `${work.caseId}|${token.tokenId}`;
          const entry = positionBookStatus.get(key) ?? new Set<string>();
          entry.add(`${book}:${currentExpectation}/${conditionalExpectation}`);
          positionBookStatus.set(key, entry);
        }

        tokens.push({
          tokenId: token.tokenId,
          line: token.line,
          column: token.column,
          character: token.text,
          candidateIds: candidates.map((candidate) => candidate.id),
          possibleTones: tones,
          unknownToneCandidates,
          contextRuleIds: rule === undefined ? [] : [rule.id],
          contextBasis: rule === undefined ? null : rule.sense,
          currentExpectation,
          currentBlockingReason,
          conditionalExpectation,
          conditionalToneStatus,
          conditionalBasis,
          ambiguityNote,
          undetermined,
        });
      }

      cells.push({
        workId: work.data.id,
        title: work.data.title,
        sourceFile: work.file,
        textSha256: createHash("sha256").update(text, "utf8").digest("hex"),
        textReviewStatus: work.data.reviewStatus,
        book,
        dataVersion: snapshot.dataVersion,
        snapshotReviewStatus: snapshot.reviewStatus,
        evidenceApproved: `${approved.size}/${snapshot.evidence.length}`,
        contextRulesForBook: rulesForBook.length,
        summary: {
          tokens: tokens.length,
          missing: tokens.filter((item) => item.candidateIds.length === 0)
            .length,
          multiCandidate: tokens.filter((item) => item.candidateIds.length > 1)
            .length,
          currentBlocked: tokens.filter(
            (item) => item.currentExpectation === "blocked",
          ).length,
          currentUnknown: tokens.filter(
            (item) => item.currentExpectation === "unknown",
          ).length,
          conditionalResolved: tokens.filter(
            (item) => item.conditionalExpectation === "resolved",
          ).length,
          conditionalAmbiguous: tokens.filter(
            (item) => item.conditionalExpectation === "ambiguous",
          ).length,
          conditionalUnknown: tokens.filter(
            (item) => item.conditionalExpectation === "unknown",
          ).length,
          undetermined: tokens.filter((item) => item.undetermined).length,
        },
        tokens,
      });
    }
  }

  const positions = [...positionBookStatus.entries()].map(([key, statuses]) => {
    const [caseId = "", tokenId = ""] = key.split("|");
    return {
      caseId,
      tokenId,
      perBook: [...statuses].sort(),
      resolvedAfterApproval: [...statuses].some((item) =>
        item.endsWith("/resolved"),
      ),
    };
  });

  const allTokens = cells.flatMap((cell) => cell.tokens);
  const singleCandidateTokens = cells.flatMap((cell) =>
    cell.tokens.filter((token) => token.candidateIds.length === 1),
  );

  const report = {
    schemaVersion: "d5-b/six-cell-expectations-1",
    generatedBy: "packages/readings/scripts/d5-six-cell-expectations.ts",
    command:
      "node node_modules/tsx/dist/cli.mjs packages/readings/scripts/d5-six-cell-expectations.ts",
    generatedFrom: {
      baseline:
        "本地 HEAD 274ce7d（PR #23 已并入 main 后的内容）；远端 main 实际 SHA 与 PR #28 数据因网络未取到，未使用",
      snapshots: BOOKS.map(({ book, snapshot }) => ({ book, file: snapshot })),
      rules: "data/context/rules.json",
      works: "tests/golden/cases/*.json",
    },
    method:
      "逐字位期望由韵书快照候选与已批语境规则推导，不调用 resolveReadings、不读取 API 输出；currentExpectation 与 conditionalExpectation 分开记录。",
    cells,
    coverage: {
      note: "多音位置按作品×字位去重、跨书不重复计数；本文件只覆盖词林/新韵六格，D4 的 44 位置包含平水，两个口径不混写。",
      multiReadingPositions: positions.length,
      multiReadingResolvedByRule: positions.filter(
        (item) => item.resolvedAfterApproval,
      ).length,
      multiReadingStaysAmbiguous: positions.filter(
        (item) => !item.resolvedAfterApproval,
      ).length,
      tokens: allTokens.length,
      singleCandidateTokens: singleCandidateTokens.length,
      conditionalResolvedTokens: allTokens.filter(
        (token) => token.conditionalExpectation === "resolved",
      ).length,
      rows: positions,
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "six-cell-expectations.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const lines: string[] = [];
  lines.push("# 三首 × 词林/新韵 六格独立条件预期");
  lines.push("");
  lines.push(
    "期望由韵书快照候选与已批规则推导，不调用 API、不反向抄 API 输出。每个字位分「当前证据未齐」与「候选证据审核齐后」两层。",
  );
  lines.push("");
  lines.push(
    "| 作品 | 韵书 | 字位 | 缺字 | 多候选 | 当前 blocked | 当前 unknown | 条件 resolved | 条件 ambiguous | 条件未定 |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const cell of cells) {
    lines.push(
      `| ${cell.title} | ${cell.book} | ${cell.summary.tokens} | ${cell.summary.missing} | ${cell.summary.multiCandidate} | ${cell.summary.currentBlocked} | ${cell.summary.currentUnknown} | ${cell.summary.conditionalResolved} | ${cell.summary.conditionalAmbiguous} | ${cell.summary.undetermined} |`,
    );
  }
  lines.push("");
  lines.push(
    `六格字位合计 ${report.coverage.tokens} 个；其中单候选 ${report.coverage.singleCandidateTokens} 个、多音位置（去重）${report.coverage.multiReadingPositions} 个。`,
  );
  lines.push("");
  lines.push(
    `条件预期：${report.coverage.conditionalResolvedTokens} 个字位在候选证据审核齐后可判（resolved）；多音位置中 ${report.coverage.multiReadingResolvedByRule} 个可由语境规则定死，${report.coverage.multiReadingStaysAmbiguous} 个仍须保持 ambiguous——不强行选音。`,
  );
  lines.push("");
  writeFileSync(
    path.join(OUT_DIR, "six-cell-expectations.md"),
    `${lines.join("\n").trimEnd()}\n`,
    "utf8",
  );

  console.log(
    cells
      .map(
        (cell) =>
          `${cell.title}/${cell.book}: cur(${cell.summary.currentBlocked}B/${cell.summary.currentUnknown}U) cond(${cell.summary.conditionalResolved}R/${cell.summary.conditionalAmbiguous}A/${cell.summary.conditionalUnknown}U)`,
      )
      .join("\n"),
  );
  console.log(
    `tokens=${report.coverage.tokens} single=${report.coverage.singleCandidateTokens} multiPositions=${report.coverage.multiReadingPositions} conditionalResolved=${report.coverage.conditionalResolvedTokens}`,
  );
}

main();
