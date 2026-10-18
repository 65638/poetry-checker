/**
 * 对 data/normalized/ 下**已落盘**的快照做只读检查：结构 + 引用完整性 + 门槛判定。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/data/check-normalized.ts
 *
 * 设计要点：
 * - 直接读 JSON，**不重新生成**；不联网、不改写任何文件。
 * - 引用完整性由 deserializeSnapshot → defineSnapshot → assertSnapshotIntegrity 保证；
 *   这里捕获 LexiconError 并逐条打印 details，而不是让脚本崩掉。
 * - 结构门槛（checkCompleteness）与内容审核（reviewStatus / evidence approved）分开汇报：
 *   releaseGatePassed=false 是数据事实，不代表检查器故障。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  checkCompleteness,
  deserializeSnapshot,
  gateFor,
  isLexiconError,
} from "../../packages/lexicon/src/index.js";
import type { LexiconSnapshot } from "../../packages/lexicon/src/snapshot.js";

import {
  ROOT,
  check,
  fail,
  finish,
  printSnapshotReport,
  section,
} from "./snapshot-report.js";

const NORMALIZED = path.join(ROOT, "data", "normalized");

/** 本批应存在的 4 份落盘快照及其结构预期（按 dataVersion 匹配）。 */
const EXPECTED: Readonly<
  Record<string, { groupCount: number; missingGroups: readonly string[] }>
> = {
  "pingshui-cwr-ff0e9c1-d2-full": { groupCount: 105, missingGroups: ["三讲"] },
  "pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft": {
    groupCount: 106,
    missingGroups: [],
  },
  "cilin-cwr-ff0e9c1-d2-full": { groupCount: 33, missingGroups: [] },
  "xinyun-rebuild-d2-full": { groupCount: 56, missingGroups: [] },
};

const SANJ_JIANG_GROUP_ID = "group:pingshui:上:三讲";
const YI_DONG_GROUP_ID = "group:pingshui:上:一董";
const PRE_EXISTING_CHARACTER = "玤";

function loadSnapshot(file: string): LexiconSnapshot | null {
  const relative = path.relative(ROOT, file).split(path.sep).join("/");
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return deserializeSnapshot(parsed);
  } catch (error) {
    if (isLexiconError(error)) {
      check(false, `${relative} 结构或引用不完整：${error.code}`);
      for (const detail of error.details) console.error(`      · ${detail}`);
      return null;
    }
    if (error instanceof SyntaxError) {
      check(false, `${relative} 不是合法 JSON：${error.message}`);
      return null;
    }
    check(false, `${relative} 读取或反序列化抛出未预期错误：${String(error)}`);
    return null;
  }
}

function main(): void {
  section("扫描 data/normalized");
  if (!existsSync(NORMALIZED)) {
    fail("data/normalized 目录不存在");
    finish("（无可用快照）");
    return;
  }
  const allJson = readdirSync(NORMALIZED)
    .filter((name) => name.endsWith(".json"))
    .sort();

  /**
   * 只把「快照」纳入检查。data/normalized 下还有覆盖报告类 JSON
   * （如 works-coverage-d2.json），它们不是快照，反序列化会误报 LEXICON_INVALID_INPUT。
   * 跳过的文件必须显式列出，不得静默忽略。
   */
  const isSnapshotFile = (name: string): boolean => {
    try {
      const parsed = JSON.parse(
        readFileSync(path.join(NORMALIZED, name), "utf8"),
      ) as Record<string, unknown>;
      return (
        typeof parsed.dataVersion === "string" &&
        typeof parsed.book === "string" &&
        Array.isArray(parsed.candidates) &&
        Array.isArray(parsed.groups)
      );
    } catch {
      return false;
    }
  };

  const files = allJson.filter((name) => isSnapshotFile(name));
  const skipped = allJson.filter((name) => !isSnapshotFile(name));
  console.log(
    `发现 ${allJson.length} 个 JSON：${allJson.join(", ") || "（无）"}`,
  );
  if (skipped.length > 0) {
    console.log(
      `非快照 JSON（不参与快照检查，仅列出）：${skipped.join(", ")}`,
    );
  }
  if (files.length === 0) {
    fail("data/normalized 下没有可检查的快照");
    finish("（无可用快照）");
    return;
  }

  const seenVersions = new Set<string>();
  const summary: string[] = [];

  for (const name of files) {
    const snapshot = loadSnapshot(path.join(NORMALIZED, name));
    if (snapshot === null) continue;

    const relative = `data/normalized/${name}`;
    const gate = gateFor(snapshot.book);
    if (gate === undefined) {
      check(false, `${relative} 的 book ${snapshot.book} 没有对应门槛`);
      continue;
    }
    const report = checkCompleteness(snapshot, gate);
    printSnapshotReport("落盘快照", relative, snapshot, report);

    // 通用检查
    check(
      !seenVersions.has(snapshot.dataVersion),
      `${relative} 的 dataVersion 唯一：${snapshot.dataVersion}`,
    );
    seenVersions.add(snapshot.dataVersion);
    check(
      snapshot.reviewStatus !== "fixture",
      `${relative} 的 reviewStatus 不是 fixture（实际 ${snapshot.reviewStatus}）`,
    );
    check(
      snapshot.candidates.length > 0 &&
        snapshot.groups.length > 0 &&
        snapshot.evidence.length > 0 &&
        snapshot.sources.length > 0,
      `${relative} 四类记录都非空（候选 ${snapshot.candidates.length} / 韵部 ${snapshot.groups.length} / 证据 ${snapshot.evidence.length} / 来源 ${snapshot.sources.length}）`,
    );
    if (snapshot.reviewStatus !== "approved") {
      check(
        report.releaseGatePassed === false,
        `${relative} 未 approved 时 releaseGatePassed 必须为 false`,
      );
    }

    // 按 dataVersion 的结构预期
    const expected = EXPECTED[snapshot.dataVersion];
    if (expected === undefined) {
      console.log(
        `  （${snapshot.dataVersion} 不在本批预期清单内，只报告不判门槛）`,
      );
    } else {
      check(
        report.groupCount === expected.groupCount,
        `${relative} 韵部数 ${expected.groupCount}（实际 ${report.groupCount}）`,
      );
      check(
        report.missingGroups.join(",") === expected.missingGroups.join(","),
        `${relative} missingGroups 为 [${expected.missingGroups.join(",")}]（实际 [${report.missingGroups.join(",")}]）`,
      );
      check(
        report.emptyGroups.length === 0,
        `${relative} emptyGroups 为空（实际 [${report.emptyGroups.join(",")}]）`,
      );
      check(
        report.unexpectedGroups.length === 0,
        `${relative} unexpectedGroups 为空（实际 [${report.unexpectedGroups.join(",")}]）`,
      );
    }

    // 三讲补丁快照的专项复核：一字多部必须双向成立
    if (snapshot.dataVersion === "pingshui-cwr-ff0e9c1-d2-full-sanj-jiang-draft") {
      const fenGroups = snapshot.candidates
        .filter((candidate) => candidate.character === PRE_EXISTING_CHARACTER)
        .flatMap((candidate) => candidate.groupIds);
      check(
        fenGroups.includes(YI_DONG_GROUP_ID),
        `「${PRE_EXISTING_CHARACTER}」仍保留上声一董归属`,
      );
      check(
        fenGroups.includes(SANJ_JIANG_GROUP_ID),
        `「${PRE_EXISTING_CHARACTER}」另有上声三讲归属`,
      );
      const members = snapshot.candidates.filter((candidate) =>
        candidate.groupIds.includes(SANJ_JIANG_GROUP_ID),
      ).length;
      check(members === 9, `三讲成员 9 条（实际 ${members}）`);
    }

    summary.push(
      `${relative} | ${snapshot.dataVersion} | ${snapshot.book} | ${snapshot.reviewStatus} | 韵部 ${report.groupCount}/${report.expectedGroupCount} | 候选 ${snapshot.candidates.length} | 门槛 ${report.releaseGatePassed ? "通过" : "未通过"}`,
    );
  }

  section("汇总");
  for (const line of summary) console.log(line);

  const missingVersions = Object.keys(EXPECTED).filter(
    (version) => !seenVersions.has(version),
  );
  check(
    missingVersions.length === 0,
    `本批 4 份快照均已落盘（缺失：${missingVersions.join(",") || "无"}）`,
  );
  if (missingVersions.length > 0) {
    console.error(
      "  提示：先用 build-pingshui.ts / build-cilin.ts / build-xinyun.ts 生成再复查。",
    );
  }

  finish(
    "全部落盘快照通过结构与门槛检查；注意：结构通过不等于内容审核通过，" +
      "除三讲 1 条证据已人审签外，其余 evidence 均未审核；快照级 reviewStatus 仍为 unverified，" +
      "releaseGatePassed 仍为 false。",
  );
}

main();
