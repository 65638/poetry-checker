/** Exact candidate review exchanges. Never changes snapshots or approval records.
 * pnpm exec tsx scripts/data/build-d4-review-batches.ts --base-sha <full SHA> [--check]
 * machine_checked proves local source membership only; it is not content approval.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
} from "@poetry/contracts";
import {
  assignYun,
  checkCompleteness,
  deserializeSnapshot,
  gateFor,
  XINYUN_RULES_VERSION,
} from "../../packages/lexicon/src/index.js";
import { parsePinyin } from "../../packages/lexicon/src/xinyun/pinyin.js";
import type { LexiconSnapshot } from "../../packages/lexicon/src/snapshot.js";
import { parseText } from "../../packages/readings/src/index.js";
import { ROOT } from "./snapshot-report.js";

const OUT = "data/reviews/d4/a";
const checkOnly = process.argv.includes("--check");
const pendingOutputs = new Map<string, string>();
const baseIndex = process.argv.indexOf("--base-sha");
const baseSha = baseIndex < 0 ? undefined : process.argv[baseIndex + 1];
assert(
  baseSha && /^[a-f0-9]{40}$/u.test(baseSha),
  "--base-sha requires full Git SHA",
);
execFileSync("git", ["merge-base", "--is-ancestor", baseSha, "HEAD"], {
  cwd: ROOT,
});

function bytes(relative: string): Buffer {
  return readFileSync(path.join(ROOT, relative));
}
function json<T>(relative: string): T {
  return JSON.parse(bytes(relative).toString("utf8")) as T;
}
function digest(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}
function publish(relative: string, content: string): void {
  pendingOutputs.set(relative, content);
}
function publishJson(relative: string, value: unknown): void {
  publish(relative, `${JSON.stringify(value, null, 2)}\n`);
}
function sameIds(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

const manifestPath = "apps/api/src/snapshot-manifest.json";
const manifest = json<Record<string, { file: string }>>(manifestPath);
const sourcesManifestPath = "data/sources/manifest.json";
const sourceManifest = json<{
  sources: { id: string; files: { path: string; snapshotSha256: string }[] }[];
}>(sourcesManifestPath);
const approvedPath = "data/reviews/approved-evidence.json";
const approval = json<{
  approvedEvidenceIds: string[];
  candidateApprovals: { candidateId: string }[];
}>(approvedPath);
assert.equal(approval.candidateApprovals.length, 83);
sameIds(
  approval.approvedEvidenceIds,
  ["ev:pingshui:上:三讲"],
  "historical group scope",
);

const snapshotPaths = Object.fromEntries(
  ["pingshui", "cilin", "xinyun"].map((book) => {
    const entry = manifest[book];
    assert(entry, `missing runtime snapshot ${book}`);
    return [book, `data/normalized/${entry.file}`];
  }),
);
const snapshots: Record<string, LexiconSnapshot> = Object.fromEntries(
  Object.entries(snapshotPaths).map(([book, file]) => [
    book,
    deserializeSnapshot(json(file)),
  ]),
);
const dataVersions = Object.fromEntries(
  Object.entries(snapshots).map(([b, s]) => [b, s.dataVersion]),
);
const snapshotHashes = Object.fromEntries(
  Object.entries(snapshotPaths).map(([b, p]) => [b, digest(bytes(p))]),
);
const rawPaths = {
  cilin: "data/raw/chinese_word_rhyme/Cilin_Rhyme.json",
  xinyun: "data/raw/pinyin-data/pinyin.txt",
} as const;
const rawCilin = json<Record<string, Record<string, string[]>>>(rawPaths.cilin);
const cilinReferencePath = "data/raw/wikisource/CilinZhengyun-2123337.wikitext";
const referenceRows: {
  ordinal: string;
  tone: string;
  line: number;
  body: string;
}[] = [];
let referenceOrdinal = "";
let referenceTone = "";
for (const [index, text] of bytes(cilinReferencePath)
  .toString("utf8")
  .split(/\r?\n/u)
  .entries()) {
  const part = /^==(第.+部)==$/u.exec(text);
  if (part?.[1]) {
    referenceOrdinal = part[1];
    referenceTone = "";
  }
  const tone = /^===(平聲|仄聲|入聲)：/u.exec(text);
  if (tone?.[1]) referenceTone = tone[1].replace("聲", "声");
  // Only entry bodies count: never headings, parenthetic meanings or comments.
  if (!text.startsWith("【") || !referenceOrdinal || !referenceTone) continue;
  const body = text
    .replace(/^【[^】]*】/u, "")
    .replace(/（[^（）]*）|\[[^\[\]]*\]|\{\{.*?\}\}/gu, "");
  referenceRows.push({
    ordinal: referenceOrdinal,
    tone: referenceTone,
    line: index + 1,
    body,
  });
}
assert(
  referenceRows.length > 100,
  "reference entry parser did not find rhyme rows",
);
function independentCilin(character: string, groupName: string) {
  const [ordinal, tone] = groupName.split("·");
  const lines = referenceRows
    .filter(
      (r) =>
        r.ordinal === ordinal && r.tone === tone && r.body.includes(character),
    )
    .map((r) => r.line);
  return {
    sourceId: "src:wikisource:cilinzhengyun",
    sourcePath: cilinReferencePath,
    sourceSha256: digest(bytes(cilinReferencePath)),
    revision: "2123337",
    lines,
    status: lines.length
      ? "exact_character_in_same_part_and_tone"
      : "needs_review",
    scope: "仅核对原字同部同声；未见原字时不做简繁转换，不把注文当韵字。",
  };
}
const pinyinLines = bytes(rawPaths.xinyun).toString("utf8").split(/\r?\n/u);
const pinyinIndex = new Map<
  string,
  { line: number; text: string; readings: string[] }
>();
for (const [index, line] of pinyinLines.entries()) {
  const match = /^U\+([0-9A-Fa-f]+):\s*([^#]+?)\s*(?:#.*)?$/u.exec(line);
  if (!match?.[1] || !match[2]) continue;
  const character = String.fromCodePoint(Number.parseInt(match[1], 16));
  assert(
    !pinyinIndex.has(character),
    `duplicate source character ${character}`,
  );
  pinyinIndex.set(character, {
    line: index + 1,
    text: line,
    readings: match[2].split(",").map((r) => r.trim()),
  });
}

const worksPath = "data/works/review-queue.json";
const works = json<{
  items: { caseId: string; title: string; text: string }[];
}>(worksPath).items;
const effectivePath = "data/reviews/d4/b/effective-candidates.json";
const effective = json<{
  dataVersions: Record<string, string>;
  rows: {
    caseId: string;
    book: string;
    tokenId: string;
    character: string;
    allCandidateIds: string[];
  }[];
}>(effectivePath);
assert.deepEqual(
  effective.dataVersions,
  dataVersions,
  "B report must match runtime versions",
);
const draftsPath = "data/reviews/d4/b/context-drafts.json";
const drafts = json<{
  drafts: {
    id: string;
    book: string;
    target: string;
    candidateIds: string[];
    selectCandidateIds: string[];
  }[];
}>(draftsPath).drafts;
const contextReferences = drafts.map((draft) => {
  const snapshot = snapshots[draft.book];
  assert(snapshot, `draft book ${draft.book}`);
  const missing = draft.candidateIds.filter(
    (id) =>
      !snapshot.candidates.some(
        (c) => c.id === id && c.character === draft.target,
      ),
  );
  assert.equal(missing.length, 0, `dangling draft references ${draft.id}`);
  assert.equal(draft.selectCandidateIds.length, 0, "drafts must not select");
  return {
    draftId: draft.id,
    candidateIds: draft.candidateIds,
    referencesExist: true,
    semanticApproval: null,
  };
});
const variantsPath = "data/variants/variant-edges-d2.json";
const variants = json<{
  edges: { id: string; from: string; to: string; status: string }[];
}>(variantsPath).edges;
const collisionPath = "data/patches/xinyun-reading-collisions.dev.json";
const collisions = json<{
  items: { character: string; groupName: string; readings: string[] }[];
}>(collisionPath).items;
const rulesPath = "packages/lexicon/src/xinyun/rules.ts";
const parserPath = "packages/lexicon/src/xinyun/pinyin.ts";
const batches: {
  batchId: string;
  file: string;
  sha256: string;
  work: string;
  book: string;
  positions: number;
  entries: number;
  gaps: number;
  needsReview: number;
}[] = [];
const allGaps: unknown[] = [];

function rawMembership(
  candidate: ReadingCandidate,
  book: "cilin" | "xinyun",
  groupName: string,
) {
  if (book === "cilin") {
    const [ordinal, toneName] = groupName.split("·");
    assert(ordinal && toneName);
    const list = rawCilin[ordinal]?.[toneName];
    assert(list, `source lacks group ${groupName}`);
    assert(list.includes(candidate.character), `source lacks ${candidate.id}`);
    const expected =
      toneName === "平声"
        ? "ping"
        : toneName === "入声"
          ? "ru"
          : "ze_unspecified";
    assert.equal(candidate.toneClass, expected);
    const indices = list.flatMap((char, i) =>
      char === candidate.character ? [i] : [],
    );
    return {
      locator: indices.map((i) => `/${ordinal}/${toneName}/${i}`).join("; "),
      rawReadings: [],
      sourceLine: null,
      reconstructionMatches: null,
    };
  }
  const row = pinyinIndex.get(candidate.character);
  assert(row && candidate.modernReading, `missing pinyin for ${candidate.id}`);
  const matches = row.readings.filter((raw) => {
    const parsed = parsePinyin(raw);
    if (!parsed.ok) return false;
    const assigned = assignYun(parsed.syllable);
    if (!assigned.ok) return false;
    const value = assigned.assignment;
    const toneNames: Record<string, string> = {
      yinping: "阴平",
      yangping: "阳平",
      shang: "上声",
      qu: "去声",
    };
    return (
      value.toneClass === candidate.toneClass &&
      value.tone === candidate.tone &&
      `${value.yun}·${toneNames[value.toneClass]}` === groupName
    );
  });
  assert(matches.length, `cannot reconstruct ${candidate.id}`);
  const modern = candidate.modernReading;
  const targetParse = parsePinyin(`${modern.pinyin}${modern.toneNumber}`);
  assert(targetParse.ok);
  assert(
    matches.some((r) => {
      const p = parsePinyin(r);
      return (
        p.ok &&
        p.syllable.initial === targetParse.syllable.initial &&
        p.syllable.final === targetParse.syllable.final &&
        p.syllable.toneNumber === targetParse.syllable.toneNumber
      );
    }),
    `modernReading not in source ${candidate.id}`,
  );
  return {
    locator: `${rawPaths.xinyun}:L${row.line}; ${XINYUN_RULES_VERSION} → ${groupName}`,
    rawReadings: row.readings,
    sourceLine: row.text,
    reconstructionMatches: matches,
  };
}

for (const book of ["cilin", "xinyun"] as const) {
  const snapshot = snapshots[book];
  assert(snapshot);
  const sourcePath = rawPaths[book];
  const sourceSha256 = digest(bytes(sourcePath));
  const registered = sourceManifest.sources
    .flatMap((s) => s.files)
    .find((f) => f.path === sourcePath);
  assert.equal(
    registered?.snapshotSha256,
    sourceSha256,
    "manifest bytes must match",
  );
  for (const work of works) {
    const slug = work.caseId.replace(/^golden-/u, "").replace(/-ps-v1$/u, "");
    const batchId = `d4-a-${slug}-${book}-2026-10-20`;
    const tokens = parseText({ text: work.text }).tokens;
    const entries = new Map<
      string,
      {
        book: string;
        candidateId: string;
        character: string;
        positions: string[];
        groupIds: readonly string[];
        evidenceIds: readonly string[];
        sourceId: string;
        sourcePath: string;
        sourceSha256: string;
        locator: string;
        snapshotLocator: string[];
        toneClass: string;
        tone: ReadingCandidate["tone"];
        modernReading: ReadingCandidate["modernReading"];
        machineStatus: string;
        exceptionIds: string[];
        reviewBlockers: string[];
        sourceCheck: ReturnType<typeof rawMembership>;
        otherReadingsInSameGroup: string[];
        independentSource: ReturnType<typeof independentCilin> | null;
      }
    >();
    const gaps: unknown[] = [];
    for (const token of tokens) {
      const position = `${slug}/${token.tokenId}`;
      const candidates: readonly ReadingCandidate[] =
        snapshot.candidates.filter((c) => c.character === token.text);
      const bRow = effective.rows.find(
        (r) =>
          r.book === book &&
          r.caseId === work.caseId &&
          r.tokenId === token.tokenId,
      );
      assert(
        bRow && bRow.character === token.text,
        `B missing position ${book}/${position}`,
      );
      sameIds(
        candidates.map((c) => c.id),
        bRow.allCandidateIds,
        `B competitor set ${book}/${position}`,
      );
      if (!candidates.length) {
        assert(
          book === "cilin" && token.text === "余",
          "new gap needs an explicit investigation",
        );
        const variantsAtSource = ["余", "餘", "馀"].map((character) => ({
          character,
          locations: Object.entries(rawCilin).flatMap(([ordinal, tones]) =>
            Object.entries(tones).flatMap(([tone, list]) =>
              list.includes(character)
                ? [`/${ordinal}/${tone}/${list.indexOf(character)}`]
                : [],
            ),
          ),
          candidateIds: snapshot.candidates
            .filter((c) => c.character === character)
            .map((c) => c.id),
        }));
        gaps.push({
          id: "D4-A-CILIN-YU-MISSING",
          book,
          positions: [position],
          character: token.text,
          status: "needs_review",
          sourcePath,
          sourceSha256,
          variantsAtSource,
          variantEdges: variants.filter(
            (e) => e.to === token.text || e.from === token.text,
          ),
          independentReference: ["余", "餘", "馀"].map((character) => ({
            character,
            ...independentCilin(character, "第四部·平声"),
          })),
          conclusion:
            "cwr 原表不收余、餘；收馀于第四部/平声。馀→余边仍待审核；不能自动迁移候选或覆盖正文。固定词林底本原字核对见 independentReference。",
          nextAction:
            "按固定底本复核馀/余的本句字义及异体关系，提交精确异体边审批；若采用补丁，保留原文与原候选并另升版本。",
        });
      }
      for (const candidate of candidates) {
        const old = entries.get(candidate.id);
        if (old) {
          old.positions.push(position);
          continue;
        }
        const evidence: Evidence[] = candidate.evidenceIds.map((id) => {
          const found = snapshot.evidence.find((e) => e.id === id);
          assert(found, `missing evidence ${id}`);
          return found;
        });
        assert(evidence.length);
        const sourceIds = [...new Set(evidence.map((e) => e.sourceId))];
        assert.equal(sourceIds.length, 1);
        const sourceId = sourceIds[0];
        assert(sourceId);
        const source: SourceRecord | undefined = snapshot.sources.find(
          (s) => s.id === sourceId,
        );
        assert.equal(
          source?.snapshotSha256,
          sourceSha256,
          `source lineage ${candidate.id}`,
        );
        const groups: RhymeGroup[] = candidate.groupIds.map(
          (id): RhymeGroup => {
            const group: RhymeGroup | undefined = snapshot.groups.find(
              (g) => g.id === id,
            );
            assert(group, `missing group ${id}`);
            return group;
          },
        );
        assert.equal(groups.length, 1);
        const groupName = groups[0]?.name;
        assert(groupName);
        const sourceCheck = rawMembership(candidate, book, groupName);
        const independentSource =
          book === "cilin"
            ? independentCilin(candidate.character, groupName)
            : null;
        const sameGroupReadings =
          book === "xinyun"
            ? (collisions.find(
                (c) =>
                  c.character === candidate.character &&
                  c.groupName === groupName,
              )?.readings ?? [])
            : [];
        const exceptionIds = ["D4-A-SOURCE-RIGHTS"];
        const reviewBlockers = ["尚无本批次 hash 对应的真实接受记录"];
        if (book === "xinyun") {
          exceptionIds.push("D4-A-XINYUN-RULE-SOURCE");
          reviewBlockers.push(
            "十四韵权威规则原文未取得；本条只证明现有重建规则与源读音一致",
          );
          if (candidate.character === "一") {
            exceptionIds.push("E-cross-010");
            reviewBlockers.push("一的本调/语流候选争议未裁；全部保留");
          }
          if (sameGroupReadings.length) exceptionIds.push("E-cross-009");
        }
        if (candidate.toneClass === "ze_unspecified")
          exceptionIds.push("B-cilin-001");
        if (independentSource?.status === "needs_review") {
          exceptionIds.push("D4-A-CILIN-REFERENCE-GLYPH");
          reviewBlockers.push(
            "独立繁体底本同部同声未见本候选原字；须逐字取得异体或归部依据，不能自动换字",
          );
        }
        entries.set(candidate.id, {
          book,
          candidateId: candidate.id,
          character: candidate.character,
          positions: [position],
          groupIds: candidate.groupIds,
          evidenceIds: candidate.evidenceIds,
          sourceId,
          sourcePath,
          sourceSha256,
          locator: sourceCheck.locator,
          snapshotLocator: evidence.map((e) => e.locator),
          toneClass: candidate.toneClass,
          tone: candidate.tone,
          modernReading: candidate.modernReading,
          machineStatus:
            book === "xinyun" || independentSource?.status === "needs_review"
              ? "needs_review"
              : "machine_checked",
          exceptionIds,
          reviewBlockers,
          sourceCheck,
          independentSource,
          otherReadingsInSameGroup: sameGroupReadings,
        });
      }
    }
    const values = [...entries.values()];
    const file = `${OUT}/${batchId}.json`;
    const batch = {
      schemaVersion: "d4-review-batch-v1",
      batchId,
      baseSha,
      dataVersions,
      generatedBy: "scripts/data/build-d4-review-batches.ts",
      approvalRecord: null,
      work: { ...work, slug },
      book,
      inputHashes: {
        snapshot: snapshotHashes[book],
        works: digest(bytes(worksPath)),
        bEffective: digest(bytes(effectivePath)),
        sourceManifest: digest(bytes(sourcesManifestPath)),
        approvalRegistry: digest(bytes(approvedPath)),
        cilinIndependentReference:
          book === "cilin" ? digest(bytes(cilinReferencePath)) : null,
      },
      verificationScope:
        "只证明本地固定来源字节、候选引用及重建一致性，不证明语文学正确性、语境取舍或许可完备；证据仍未审核。",
      rules:
        book === "xinyun"
          ? {
              version: XINYUN_RULES_VERSION,
              status: "unverified",
              path: rulesPath,
              sha256: digest(bytes(rulesPath)),
              parserPath,
              parserSha256: digest(bytes(parserPath)),
            }
          : null,
      counts: {
        positions: tokens.length,
        coveredPositions: tokens.length - gaps.length,
        uniqueCandidates: entries.size,
        candidateOccurrences: values.reduce(
          (n, e) => n + e.positions.length,
          0,
        ),
        gaps: gaps.length,
        needsReview: values.filter((e) => e.machineStatus === "needs_review")
          .length,
      },
      entries: values,
      gaps,
      excludedScope: [
        "未列举候选",
        "所属整部",
        "全库发布",
        "语境选音",
        "异体边自动生效",
        "上游转载授权结论",
      ],
    };
    publishJson(file, batch);
    const sha256 = digest(`${JSON.stringify(batch, null, 2)}\n`);
    publish(`${file}.sha256`, `${sha256}  ${batchId}.json\n`);
    publish(
      `${OUT}/${batchId}.md`,
      `# ${work.title} × ${book}\n\n批次：${batchId}\n\nJSON SHA-256：\`${sha256}\`\n\n${tokens.length} 字位，${values.length} 个去重候选，缺候选 ${gaps.length} 字位；所有竞争候选保留。\n\n${batch.verificationScope}\n\napprovalRecord=null；needs_review ${batch.counts.needsReview} 个候选。${book === "xinyun" ? "规则权威出处未取得。" : "独立底本同部同声原字对照不做简繁转换，具体缺口见 independentSource。"}\n\n例外 ID 见 anomalies.json；逐候选位置、JSON 指针／读音源行、原始字节 SHA 见同名 JSON。批准时须明确本批次及 hash；不批准整部。\n`,
    );
    batches.push({
      batchId,
      file,
      sha256,
      work: work.title,
      book,
      positions: tokens.length,
      entries: entries.size,
      gaps: gaps.length,
      needsReview: batch.counts.needsReview,
    });
    allGaps.push(...gaps);
  }
}
const comparison = {
  schemaVersion: "d4-a-review-index-v1",
  baseSha,
  dataVersions,
  approvalRecord: null,
  batches,
  counts: {
    positions: batches.reduce((n, b) => n + b.positions, 0),
    coveredPositions: batches.reduce((n, b) => n + b.positions - b.gaps, 0),
    withinBatchUniqueCandidates: batches.reduce((n, b) => n + b.entries, 0),
    missingPositions: allGaps.length,
  },
  historicalApprovalScope: {
    candidateCount: approval.candidateApprovals.length,
    groupEvidenceIds: approval.approvedEvidenceIds,
    newApprovals: 0,
  },
  gaps: allGaps,
  contextReferences,
  columns: Object.entries(snapshots).map(([book, s]) => {
    const gate = gateFor(s.book);
    assert(gate);
    const structure = checkCompleteness(s, gate);
    return {
      book,
      structure: {
        groups: structure.groupCount,
        missing: structure.missingGroups,
        empty: structure.emptyGroups,
        releaseGatePassed: structure.releaseGatePassed,
      },
      machineComparison:
        book === "pingshui"
          ? "本批只读完整性；原批准不变"
          : "逐字位对照 B 全部候选、逐候选来源字节与定位",
      actualReview: "本批新增接受记录 0",
      approvedEvidence: {
        snapshotStatus: s.reviewStatus,
        count: s.evidence.filter((e) => e.reviewStatus === "approved").length,
      },
    };
  }),
};
publishJson(`${OUT}/index.json`, comparison);
publishJson(`${OUT}/missing-cilin-yu.json`, { baseSha, gaps: allGaps });
publishJson(`${OUT}/context-reference-check.json`, {
  baseSha,
  count: contextReferences.length,
  semanticApproval: null,
  entries: contextReferences,
});
const firstBatch = batches[0];
assert(firstBatch);
const firstBatchBytes = pendingOutputs.get(firstBatch.file);
assert(firstBatchBytes);
const firstEntries = (
  JSON.parse(firstBatchBytes) as {
    entries: {
      candidateId: string;
      machineStatus: string;
      positions: string[];
    }[];
  }
).entries;
const request = {
  requestId: "d4-a-approval-request-01",
  status: "awaiting_exact_acceptance",
  approvalRecord: null,
  sourceBatch: firstBatch.file,
  sourceBatchSha256: firstBatch.sha256,
  candidateIds: firstEntries
    .filter((e) => e.machineStatus === "machine_checked")
    .map((e) => e.candidateId),
  excludedCandidateIds: firstEntries
    .filter((e) => e.machineStatus !== "machine_checked")
    .map((e) => e.candidateId),
  scope:
    "只请求接受明确列举的词林候选归部；更的平仄竞争候选均保留，不裁定语境，不批准整部/整库/许可。其余5候选、新韵及余的缺口不在本请求中。",
};
const requestFile = `${OUT}/approval-request-01.json`;
publishJson(requestFile, request);
publish(
  `${requestFile}.sha256`,
  `${digest(`${JSON.stringify(request, null, 2)}\n`)}  approval-request-01.json\n`,
);
const precheckPath = `${OUT}/precheck/ai-lexicon-precheck-2026-10-20.json`;
const precheck = json<{
  snapshots: {
    anomalies: { id: string; fact: string; basis: string; location: string }[];
  }[];
  crossAnomalies: {
    id: string;
    fact: string;
    basis: string;
    location: string;
  }[];
  supplement: { a1: { inconsistent: number }; a2: { entryCount: number } };
}>(precheckPath);
const dispositions: Record<
  string,
  { category: string; status: string; action: string }
> = {
  "A-pingshui-001": {
    category: "design_retained",
    status: "retained_negative_case",
    action: "105部负例故意保留；API运行106部，不新增空部",
  },
  "B-cilin-001": {
    category: "design_retained",
    status: "retained",
    action: "原表仅标仄，不臆补上/去",
  },
  "C-cross-001": {
    category: "legacy_command_defect",
    status: "documented_workaround",
    action:
      "本批发布说明改tsx入口；历史任务书与根别名由GLM统一，不改写历史结果",
  },
  "F-cross-002": {
    category: "design_retained",
    status: "retained",
    action: "区分原表含杂项5037与汉字快照5033；不删汉字",
  },
  "F-cross-003": {
    category: "source_rights",
    status: "partial_text_retrieved",
    action: "Terms of Use固定字节已取得；署名实施、适用性、上游转载链仍待核",
  },
  "F-cross-004": {
    category: "metadata_limit",
    status: "partial_sidecar_descriptor",
    action:
      "本批build-descriptor.json可机读来源/规则/生成器SHA；不改冻结快照Schema，API是否消费由GLM处理",
  },
  "H-cross-005": {
    category: "design_retained",
    status: "retained",
    action: "三讲补丁approved与快照unverified分层表述",
  },
  "H-cross-006": {
    category: "design_retained",
    status: "retained",
    action: "8新字形+1新增归属；玤保留一董/三讲",
  },
  "D-cross-007": {
    category: "human_decision",
    status: "pending",
    action: "餘/馀→余两边待审；樓→楼原批准不扩散",
  },
  "G-cross-008": {
    category: "source_limit",
    status: "pending",
    action:
      "43未映射、241轻声、104条er影响保留，不猜补；十四韵规则权威出处未取得",
  },
  "E-cross-009": {
    category: "design_retained",
    status: "retained_with_companion",
    action:
      "1,508组同子卷多读音在伴随清单保留；本批逐候选引用，不宣称已逐读音扩展候选ID",
  },
  "E-cross-010": {
    category: "human_decision",
    status: "pending",
    action: "一的本调/语流争议未裁，不删除竞争候选",
  },
};
const currentFindings = [
  ...precheck.snapshots.flatMap((s) => s.anomalies),
  ...precheck.crossAnomalies,
].map((finding) => {
  const disposition = dispositions[finding.id];
  assert(disposition, `unclassified finding ${finding.id}`);
  return { ...finding, ...disposition };
});
const extraFindings = [
  {
    id: "D4-A-SOURCE-RIGHTS",
    category: "source_rights",
    status: "pending",
    fact: "cwr/pinyin-data上游授权链及转载义务未全部核实",
    action: "许可与事实审核分开；不以仓库MIT直接宣称完整数据可再分发",
  },
  {
    id: "D4-A-XINYUN-RULE-SOURCE",
    category: "source_limit",
    status: "pending",
    fact: "现有十四韵规则为项目编码；权威规则文本尚未取得",
    action: "保留源读音、规则版本与代码SHA，未确认项needs_review",
  },
  {
    id: "D4-A-CILIN-REFERENCE-GLYPH",
    category: "human_decision",
    status: "pending",
    fact: "部分cwr候选原字在固定繁体底本同部同声未命中",
    action: "逐字回查，禁止自动简繁转换；具体候选见各批independentSource",
  },
  {
    id: "D4-A-CILIN-YU-MISSING",
    category: "source_character_gap",
    status: "pending",
    fact: "黄鹤楼l2c4余缺词林候选；cwr收馀，固定底本收餘",
    action: "精确异体/义项审批与版本化补丁，不能无依据补字",
  },
];
const historicClosed = [
  "D-cross-002",
  "F-pingshui-001",
  "F-pingshui-002",
  "F-cilin-002",
].map((id) => ({
  id,
  status: "historically_closed",
  action: "本批检查旧修复保持；不计为D4新增成果，保留旧ID",
}));
publishJson(`${OUT}/anomalies.json`, {
  baseSha,
  input: precheckPath,
  inputSha256: digest(bytes(precheckPath)),
  counts: {
    precheckFindings: currentFindings.length,
    designRetained: currentFindings.filter(
      (f) => f.category === "design_retained",
    ).length,
    historicClosed: historicClosed.length,
    newExplicitFindings: extraFindings.length,
  },
  findings: [...currentFindings, ...extraFindings],
  historicClosed,
  separateDebt: {
    crossBookDifferences: precheck.supplement.a1.inconsistent,
    mappingDrafts: precheck.supplement.a2.entryCount,
    mappingStatus: "unverified",
    contextDrafts: contextReferences.length,
    contextApproval: null,
    pendingVariantEdges: variants
      .filter((e) => e.status === "pending_review")
      .map((e) => e.id),
    note: "跨库差异和映射草案仍待核，不因异常缺陷数为0自动关闭",
  },
});
publishJson(`${OUT}/build-descriptor.json`, {
  baseSha,
  scope: "审核侧旁置描述，不改变公开快照Schema，不自动接入API",
  dataVersions,
  snapshots: Object.entries(snapshotPaths).map(([book, snapshotPath]) => {
    const generatorPath = `scripts/data/build-${book}.ts`;
    const snapshot = snapshots[book];
    assert(snapshot);
    return {
      book,
      snapshotPath,
      sha256: digest(bytes(snapshotPath)),
      generatorPath,
      generatorSha256: digest(bytes(generatorPath)),
      sources: snapshot.sources.map((s) => ({
        sourceId: s.id,
        revision: s.revision,
        rawSha256: s.snapshotSha256,
      })),
      rules:
        book === "xinyun"
          ? {
              version: XINYUN_RULES_VERSION,
              path: rulesPath,
              sha256: digest(bytes(rulesPath)),
              provenance: "unverified",
            }
          : null,
    };
  }),
});
// All inputs and references have passed before any output is written.
for (const [relative, content] of pendingOutputs) {
  if (checkOnly)
    assert.equal(
      bytes(relative).toString("utf8"),
      content,
      `stale ${relative}`,
    );
  else {
    mkdirSync(path.dirname(path.join(ROOT, relative)), { recursive: true });
    writeFileSync(path.join(ROOT, relative), content, "utf8");
  }
}
console.log(
  `${checkOnly ? "Checked" : "Wrote"} ${batches.length} exact batches, ${comparison.counts.positions} positions, ${comparison.counts.missingPositions} source gap; no new approvals.`,
);
