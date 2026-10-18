/** 只读真实快照/原文：定位剩余候选的源文字符，不写审批，不按合律选音。 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { ContextRule, ReadingCandidate } from "@poetry/contracts";
import { parseText } from "../../packages/readings/src/index.js";
import { deserializeSnapshot } from "../../packages/lexicon/src/index.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(root, path), "utf8")) as T;
const snapshot = deserializeSnapshot(
  read("data/normalized/pingshui.full-d2-patched.json"),
);
const works = read<{
  items: Array<{ workId: string; title: string; text: string }>;
}>("data/works/review-queue.json").items;
const closure = read<{
  works: Array<{
    workId: string;
    characterDifferences: Array<{ source: string; adopted: string }>;
  }>;
}>("data/works/review-closure.json");
const rules = read<ContextRule[]>("data/context/rules.json");
const rawPath = "data/raw/wikisource/PingshuiYun-8264804.wikitext";
const raw = readFileSync(join(root, rawPath), "utf8");
const lines = raw.split(/\r?\n/u);
const sha = createHash("sha256")
  .update(readFileSync(join(root, rawPath)))
  .digest("hex");
// 只用卷名和该卷内的韵目序数匹配，避免无依据将韵目繁简做全库互转。
const bucket: Record<string, string> = {
  上平: "上平聲",
  下平: "下平聲",
  上: "上聲",
  去: "去聲",
  入: "入聲",
};
interface Section {
  header: string;
  headerLine: number;
  body: Array<{ text: string; line: number; part: string }>;
}
const sections = new Map<string, Section>();
let current: Section | undefined;
for (const [index, line] of lines.entries()) {
  const header =
    /^(上平聲|下平聲|上聲|去聲|入聲)([一二三四五六七八九十]+)\{\{\+\+\|(.+?)\}\}/u.exec(
      line,
    );
  if (header !== null) {
    current = { header: line, headerLine: index + 1, body: [] };
    sections.set(`${header[1]}:${header[2]}`, current);
  } else if (/^==/u.test(line)) current = undefined;
  else if (current !== undefined && line.trim())
    current.body.push({
      text: line,
      line: index + 1,
      part: line.startsWith("【詞】") ? "词增补" : "正文",
    });
}

const approved = new Set(
  snapshot.evidence
    .filter((item) => item.reviewStatus === "approved")
    .map((item) => item.id),
);
const queue = new Map<
  string,
  {
    candidate: ReadingCandidate;
    positions: string[];
    sourceChecks: unknown[];
    machineStatus: string;
    verdict: "unverified";
  }
>();
let reviewedPositions = 0;
let blockedPositions = 0;
for (const work of works) {
  const parsed = parseText({ text: work.text });
  const variants =
    closure.works.find((item) => item.workId === work.workId)
      ?.characterDifferences ?? [];
  for (const token of parsed.tokens) {
    const candidates = snapshot.candidates.filter(
      (item) => item.character === token.text,
    );
    const lineTokens = parsed.tokens.filter((item) => item.line === token.line);
    const line = lineTokens.map((item) => item.text).join("");
    const hits = rules.filter(
      (rule) =>
        rule.reviewStatus === "approved" &&
        rule.book === "pingshui" &&
        rule.target === token.text &&
        rule.exactPhrases.some((phrase) => {
          const chars = [...line];
          const start = token.column - 1 - rule.targetOffset;
          return (
            start >= 0 &&
            chars.slice(start, start + [...phrase].length).join("") === phrase
          );
        }),
    );
    const selected = new Set(hits.flatMap((rule) => rule.selectCandidateIds));
    const effective =
      selected.size === 0
        ? candidates
        : candidates.filter((item) => selected.has(item.id));
    const missing = effective.filter(
      (candidate) => !candidate.evidenceIds.some((id) => approved.has(id)),
    );
    if (missing.length === 0 && effective.length > 0) reviewedPositions += 1;
    else blockedPositions += 1;
    for (const candidate of missing) {
      const entry = queue.get(candidate.id) ?? {
        candidate,
        positions: [],
        sourceChecks: [],
        machineStatus: "machine_checked",
        verdict: "unverified" as const,
      };
      entry.positions.push(`${work.title}/${token.tokenId}`);
      if (queue.has(candidate.id)) continue;
      let allFound = true;
      for (const groupId of candidate.groupIds) {
        const [, , volume, name] = groupId.split(":");
        const ordinal = name
          ?.replace(/^入声/u, "")
          .match(/^[一二三四五六七八九十]+/u)?.[0];
        const section = sections.get(`${bucket[volume ?? ""]}:${ordinal}`);
        const glyphs = [
          ...new Set([
            candidate.character,
            ...variants
              .filter((item) => item.adopted === candidate.character)
              .map((item) => item.source),
          ]),
        ];
        const matches =
          section?.body.flatMap((line) =>
            glyphs
              .filter((glyph) => line.text.includes(glyph))
              .map((glyph) => ({ glyph, line: line.line, part: line.part })),
          ) ?? [];
        if (matches.length === 0) allFound = false;
        entry.sourceChecks.push({
          groupId,
          header: section?.header ?? null,
          headerLine: section?.headerLine ?? null,
          glyphs,
          matches,
        });
      }
      entry.machineStatus = allFound
        ? "source_character_found"
        : "source_discrepancy";
      queue.set(candidate.id, entry);
    }
  }
}
const items = [...queue.values()].sort((a, b) =>
  a.candidate.id.localeCompare(b.candidate.id, "en"),
);
const stats = {
  tokens: reviewedPositions + blockedPositions,
  effectiveCandidatesBackedPositions: reviewedPositions,
  blockedPositions,
  uniquePendingCandidates: items.length,
  sourceMatchedCandidates: items.filter(
    (item) => item.machineStatus === "source_character_found",
  ).length,
  sourceDiscrepancies: items.filter(
    (item) => item.machineStatus === "source_discrepancy",
  ).length,
};
const report = {
  dataVersion: snapshot.dataVersion,
  scope:
    "三首固定正文经已审语境规则约束后的候选；AI 原文字形对照不是人工批准，不更改 evidence.reviewStatus",
  source: { path: rawPath, sha256: sha, revision: "8264804" },
  stats,
  items,
};
const output = "data/reviews/d2-remaining-candidate-review";
writeFileSync(
  join(root, `${output}.json`),
  JSON.stringify(report, null, 2) + "\n",
);
const md = [
  "# D2 剩余候选归部：来源对照与待裁清单",
  "",
  report.scope,
  "",
  `版本：${snapshot.dataVersion}。原文：${rawPath}，oldid=8264804，SHA-256=${sha}。`,
  "",
  `${stats.tokens} 字位中，经现有语境裁定后 ${reviewedPositions} 位证据已齐，${blockedPositions} 位仍缺；去重为 ${items.length} 条候选。源文找到 ${stats.sourceMatchedCandidates} 条，未匹配 ${stats.sourceDiscrepancies} 条。${items.length === 0 ? "当前固定正文的有效候选没有待裁项；不代表所有竞争候选或全库已批准。" : "以下待裁条目当前仍为 unverified。"}`,
  "",
  "同一候选出现在多个位置只列一次。源文字形命中只能证明机器检索结果；简繁差异取自已登记作品对照，不把它扩大成全库字形转换。保留竞争候选，不因押韵或平仄需要选择它。",
  "",
  "| 候选 ID | 受影响位置 | 原文定位（行号从1开始） | 机器结果 | 人工结论 |",
  "|---|---|---|---|---|",
  ...items.map(
    (item) =>
      `| ${item.candidate.id} | ${item.positions.join("、")} | ${JSON.stringify(item.sourceChecks).replaceAll("|", "／")} | ${item.machineStatus} | 待裁 |`,
  ),
  "",
  "处理范围：如批准，按候选 ID 追加 data/reviews/approved-evidence.json 的 candidateApprovals，再重建并重跑真实 API；不批准整部。不确定的竞争候选继续保留。",
  "",
];
writeFileSync(join(root, `${output}.md`), md.join("\n"));
console.log(JSON.stringify(stats));
