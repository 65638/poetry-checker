/**
 * data 脚本共用的只读报告工具（不引入新公共类型，不碰 packages/）。
 *
 * 提供：分段标题、断言收集、文件摘要、多归部统计、快照报告打印、manifest 摘要交叉核对。
 * 只做报告；失败通过 failures 收集，由调用方在末尾调用 finish() 决定退出码。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ReadingCandidate } from "@poetry/contracts";

import {
  businessContentDigest,
  canonicalJson,
  sha256Hex,
} from "../../packages/lexicon/src/digest.js";
import type { CompletenessReport } from "../../packages/lexicon/src/index.js";
import type { LexiconSnapshot } from "../../packages/lexicon/src/snapshot.js";

export const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const MANIFEST_FILE = path.join(ROOT, "data", "sources", "manifest.json");

/** 收集到的失败项；任一非空都应使脚本以非零退出码结束。 */
export const failures: string[] = [];

export function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** 断言并打印 OK/FAIL；失败项进入 failures，不抛异常。 */
export function check(condition: boolean, message: string): boolean {
  if (!condition) failures.push(message);
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${message}`);
  return condition;
}

/** 记失败但不打印 OK/FAIL 行（用于已在别处解释过的项）。 */
export function fail(message: string): void {
  failures.push(message);
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** 多归部字形数：同一字形拥有 >1 条候选。 */
export function multiGroupCharacterCount(
  candidates: readonly ReadingCandidate[],
): number {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.character, (counts.get(candidate.character) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

/** 从 manifest 读取某个 data/raw 文件的登记摘要；未登记返回 null。 */
export function manifestDigestFor(relativePath: string): string | null {
  const normalized = relativePath.split(path.sep).join("/");
  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as {
    sources?: {
      files?: { path?: string; snapshotSha256?: string | null }[];
    }[];
  };
  for (const source of manifest.sources ?? []) {
    for (const file of source.files ?? []) {
      if (file.path === normalized && typeof file.snapshotSha256 === "string") {
        return file.snapshotSha256;
      }
    }
  }
  return null;
}

export function printSnapshotReport(
  tag: string,
  sourceLabel: string,
  snapshot: LexiconSnapshot,
  report: CompletenessReport,
): void {
  section(`${tag}：${sourceLabel}`);
  console.log(`dataVersion：${snapshot.dataVersion}`);
  console.log(`book：${snapshot.book}`);
  console.log(`reviewStatus：${snapshot.reviewStatus}`);
  console.log(`门槛：${report.label}`);
  console.log(
    `韵部数：${report.groupCount} / 应有 ${report.expectedGroupCount}`,
  );
  console.log(`bucketCounts：${JSON.stringify(report.bucketCounts)}`);
  console.log(
    `expectedBucketCounts：${JSON.stringify(report.expectedBucketCounts)}`,
  );
  console.log(`missingGroups：${report.missingGroups.join(",") || "（无）"}`);
  console.log(`emptyGroups：${report.emptyGroups.join(",") || "（无）"}`);
  console.log(
    `unexpectedGroups：${report.unexpectedGroups.join(",") || "（无）"}`,
  );
  console.log(`候选数：${snapshot.candidates.length}`);
  console.log(`多归部字形数：${multiGroupCharacterCount(snapshot.candidates)}`);
  console.log(`证据数：${snapshot.evidence.length}`);
  console.log(
    `来源 ID：${snapshot.sources.map((entry) => entry.id).join(", ") || "（无）"}`,
  );
  console.log(`releaseGatePassed：${report.releaseGatePassed ? "是" : "否"}`);
  const codes = [...new Set(report.issues.map((issue) => issue.code))].sort();
  console.log(`issue 代码：${codes.join(",") || "（无）"}`);
  console.log(`业务内容摘要：${businessContentDigest(snapshot)}`);
  console.log(`规范化 JSON 摘要：${sha256Hex(canonicalJson(snapshot))}`);
}

/** 结尾结算：有失败则列出并置非零退出码。 */
export function finish(okMessage: string): void {
  section("结果");
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`\n共 ${failures.length} 项失败。`);
    process.exitCode = 1;
    return;
  }
  console.log(okMessage);
}
