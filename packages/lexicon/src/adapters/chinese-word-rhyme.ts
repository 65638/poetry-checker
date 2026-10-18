/**
 * chinese_word_rhyme 原表 → 快照的导入适配器（纯函数，不做 I/O）。
 *
 * 只做结构与来源映射，不改写原字表顺序、不补字、不补缺部、不生成反切/义项/今读。
 * 缺部（上声三讲）原样保留为“缺”，由检查器报告，不用占位韵目补齐。
 */
import type {
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
} from "@poetry/contracts";

import { makeCandidateId, type SnapshotInput } from "../snapshot.js";

/** 原表结构：{ 上平声部: { 一东: ["东", ...] }, ... } */
export type CwrRhymeTable = Record<string, Record<string, string[]>>;

export interface CwrSourceOptions {
  /** 快照版本号，例如 pingshui-cwr-ff0e9c1-d1。 */
  dataVersion: string;
  /**
   * 来源记录 ID。**按库区分**，避免同一 ID 在不同库指向不同文件内容
   * （平水与词林来自同一上游仓库的不同文件，共用 ID 会触发跨库来源冲突）。
   * 省略时退回 DEFAULT_SOURCE_ID，仅为兼容既有测试。
   */
  sourceId?: string;
  /**
   * 已人审签的证据 ID 列表。命中的 evidence 记为 approved，其余保持 unverified。
   * 由 data/reviews/approved-evidence.json 提供，脚本内不得硬编码审批结果。
   */
  approvedEvidenceIds?: readonly string[];
  /** 固定提交或标签。 */
  revision: string;
  /** 数据文件在仓库中的相对路径，用于生成 locator。 */
  dataPath: string;
  /** 快照 SHA-256。 */
  snapshotSha256: string | null;
  /** 获取时间；只在来源登记中使用，不参与业务内容摘要。 */
  retrievedAt: string | null;
  license: string;
}

interface BucketMapping {
  toneClass: "ping" | "shang" | "qu" | "ru";
  short: string;
}

const BUCKET_MAP: Record<string, BucketMapping> = {
  上平声部: { toneClass: "ping", short: "上平" },
  下平声部: { toneClass: "ping", short: "下平" },
  上声部: { toneClass: "shang", short: "上" },
  去声部: { toneClass: "qu", short: "去" },
  入声部: { toneClass: "ru", short: "入" },
};

const DEFAULT_SOURCE_ID = "src:chinese_word_rhyme";

function toneOf(toneClass: BucketMapping["toneClass"]): "P" | "Z" {
  return toneClass === "ping" ? "P" : "Z";
}

export function pingshuiSnapshotFromCwr(
  table: CwrRhymeTable,
  options: CwrSourceOptions,
): SnapshotInput {
  const sourceId = options.sourceId ?? DEFAULT_SOURCE_ID;
  const source: SourceRecord = {
    id: sourceId,
    title: "chinese_word_rhyme（Pingshui_Rhyme.json）",
    edition: `提交 ${options.revision}`,
    url: `https://raw.githubusercontent.com/charlesix59/chinese_word_rhyme/${options.revision}/${options.dataPath}`,
    license: options.license,
    snapshotSha256: options.snapshotSha256,
    revision: options.revision,
    retrievedAt: options.retrievedAt,
  };

  const groups: RhymeGroup[] = [];
  const evidence: Evidence[] = [];
  const candidates: ReadingCandidate[] = [];
  const seen = new Set<string>();

  for (const [bucketKey, mapping] of Object.entries(BUCKET_MAP)) {
    const bucket = table[bucketKey];
    if (bucket === undefined) continue;
    for (const [name, characters] of Object.entries(bucket)) {
      const groupId = `group:pingshui:${mapping.short}:${name}`;
      const evidenceId = `ev:pingshui:${mapping.short}:${name}`;
      const locator = `${options.dataPath} ${bucketKey}/${name}`;
      const unique = [...new Set(characters)];

      groups.push({
        id: groupId,
        book: "pingshui",
        name,
        toneClass: mapping.toneClass,
        evidenceIds: [evidenceId],
      });
      evidence.push({
        id: evidenceId,
        sourceId,
        kind: "rhyme_entry",
        locator,
        assertion: `${locator} 共收录 ${unique.length} 个字形（原表条目 ${characters.length} 条）`,
        excerpt: null,
        reviewStatus:
          options.approvedEvidenceIds?.includes(evidenceId) === true
            ? "approved"
            : "unverified",
      });

      for (const character of unique) {
        const id = makeCandidateId(
          "pingshui",
          character,
          mapping.toneClass,
          name,
        );
        if (seen.has(id)) continue;
        seen.add(id);
        candidates.push({
          id,
          character,
          book: "pingshui",
          toneClass: mapping.toneClass,
          tone: toneOf(mapping.toneClass),
          groupIds: [groupId],
          gloss: null,
          modernReading: null,
          fanqie: null,
          evidenceIds: [evidenceId],
        });
      }
    }
  }

  return {
    dataVersion: options.dataVersion,
    book: "pingshui",
    reviewStatus: "unverified",
    notice:
      "平水韵：源自 chinese_word_rhyme 固定提交的原表转载，仅登记韵部归属；反切、义项、今读一律为 null。" +
      "该提交上声仅 28 部、缺三讲，未用占位补齐，发布门槛不通过。",
    candidates,
    groups,
    evidence,
    sources: [source],
  };
}

/** 词林正韵原表 → 部/声 计数（D1 只统计，不生成发布候选）。 */
export function cilinBucketCounts(
  table: CwrRhymeTable,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [ordinal, tones] of Object.entries(table)) {
    for (const [tone, characters] of Object.entries(tones)) {
      counts[`${ordinal}·${tone}`] = new Set(characters).size;
    }
  }
  return counts;
}
