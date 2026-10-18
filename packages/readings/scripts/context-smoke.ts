/**
 * 语境规则端到端冒烟：按 API 的注入口径合并证据后跑三首。
 *
 *   node node_modules/tsx/dist/cli.mjs packages/readings/scripts/context-smoke.ts
 *
 * 只做只读统计，不修改任何数据。输出用于回答两个问题：
 * 1) 十条规则能否命中并收敛到裁剪候选；
 * 2) 卡在「规则证据」还是「候选自身的韵书证据」。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ContextRule, Evidence, SourceRecord } from "@poetry/contracts";

import { isReadingsError, parseText, resolveReadings } from "../src/index.js";
import { createLexicon, deserializeSnapshot } from "../../lexicon/src/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const SNAPSHOT = "data/normalized/pingshui.full-d2-patched.json";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

const snapshot = readJson<Record<string, unknown>>(SNAPSHOT);
const rules = readJson<ContextRule[]>("data/context/rules.json");
const contextEvidence = readJson<Evidence[]>("data/context/evidence.json");
const contextSources = readJson<SourceRecord[]>("data/context/sources.json");
const works = readJson<{ items: Array<{ title: string; text: string }> }>(
  "data/works/review-queue.json",
).items;

const dataVersion = String(snapshot.dataVersion);
const lexicon = createLexicon([deserializeSnapshot(snapshot)]);

const approvedEvidence = new Set(
  (snapshot.evidence as Array<{ id: string; reviewStatus: string }>)
    .filter((item) => item.reviewStatus === "approved")
    .map((item) => item.id),
);
const candidatesById = new Map(
  (
    snapshot.candidates as Array<{
      id: string;
      character: string;
      evidenceIds: string[];
    }>
  ).map((candidate) => [candidate.id, candidate]),
);

async function main(): Promise<void> {
  // 规则侧：所选候选自身的韵书证据是否已审核（这是数据阻塞项）
  let backedSelections = 0;
  const unbacked: string[] = [];
  for (const rule of rules) {
    const candidateId = rule.selectCandidateIds[0];
    const candidate =
      candidateId === undefined ? undefined : candidatesById.get(candidateId);
    const backed =
      candidate !== undefined &&
      candidate.evidenceIds.some((id) => approvedEvidence.has(id));
    if (backed) backedSelections += 1;
    else unbacked.push(`${rule.id}→${candidateId ?? "<缺候选>"}`);
  }

  console.log(
    `规则 ${rules.length} 条；所选候选已有韵书证据 ${backedSelections} 条，未审核 ${unbacked.length} 条`,
  );
  for (const item of unbacked) console.log(`  未审: ${item}`);
  console.log("");

  for (const work of works) {
    const poem = parseText({ text: work.text });
    const characters = [...new Set(poem.tokens.map((token) => token.text))];
    const lookup = await lexicon.lookupCharacters({
      characters,
      rhymeBook: "pingshui",
      dataVersion,
    });

    // 与 API 一致：语境证据/来源并入 lookup 后再解析。
    const merged = {
      ...lookup,
      evidence: [...lookup.evidence, ...contextEvidence],
      sources: [...lookup.sources, ...contextSources],
    };

    const hits = rules.filter((rule) =>
      rule.exactPhrases.some((phrase) => work.text.includes(phrase)),
    ).length;

    try {
      const annotated = resolveReadings({
        poem,
        lookup: merged,
        overrides: [],
        contextRules: rules,
      });
      const byMethod = annotated.tokens.reduce<Record<string, number>>(
        (acc, token) => {
          acc[token.selectionMethod] = (acc[token.selectionMethod] ?? 0) + 1;
          return acc;
        },
        {},
      );
      console.log(
        `${work.title}: 已标注；本诗命中 ${hits} 条规则；selectionMethod=${JSON.stringify(byMethod)}`,
      );
    } catch (error) {
      if (isReadingsError(error)) {
        console.log(
          `${work.title}: 门禁拦截 ${error.code}，首个拦截字位 ${String(error.details.tokenId)}「${String(error.details.character)}」；本诗命中 ${hits} 条规则`,
        );
      } else {
        console.log(`${work.title}: 其他错误 ${String(error)}`);
      }
    }
  }
}

await main();
