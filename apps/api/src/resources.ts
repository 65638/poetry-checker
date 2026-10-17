import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupCharacters, registerSnapshot } from "@poetry/lexicon";
import type {
  BookId,
  ContextRule,
  Evidence,
  RuleCard,
  SourceRecord,
  WorkMetadata,
} from "@poetry/contracts";
import manifestJson from "./snapshot-manifest.json" with { type: "json" };

/** 每库显式选定快照；不扫描目录（报告类 JSON 一律不注册），杜绝"最后读到谁"覆盖。 */
interface ManifestEntry {
  file: string;
  reason: string;
}

const MANIFEST = manifestJson as Record<BookId, ManifestEntry>;

export interface LoadedSnapshotInfo {
  book: BookId;
  dataVersion: string;
  reviewStatus: string;
  file: string;
  /** 对外口径的主部数：平水=韵部数；词林/新韵=主部（声类子卷另计）。 */
  mainGroups: number;
  subGroups: number;
}

export interface Resources {
  snapshots: Record<string, LoadedSnapshotInfo>;
  unverifiedBooks: BookId[];
  evidenceRegistry: Evidence[];
  sourceRegistry: SourceRecord[];
  contextRules: ContextRule[];
  ruleCards: RuleCard[];
  works: WorkMetadata[];
  ready: boolean;
  notReadyReasons: string[];
  loadErrors: string[];
}

const ROOT = (function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("未找到仓库根（pnpm-workspace.yaml）");
})();

function readJsonArray<T>(rel: string): T[] {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return [];
  try {
    const v: unknown = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function dedupeById<T extends { id: string }>(
  items: readonly T[],
  kind: string,
  errors: string[],
): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const prev = map.get(item.id);
    if (prev !== undefined && stableStringify(prev) !== stableStringify(item)) {
      errors.push(`资源冲突：${kind} ID ${item.id} 在不同快照中内容不一致`);
      continue;
    }
    map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function loadResourcesOnce(): Resources {
  const notReadyReasons: string[] = [];
  const loadErrors: string[] = [];
  const snapshots: Record<string, LoadedSnapshotInfo> = {};
  const unverifiedBooks: BookId[] = [];
  const evidence: Evidence[] = [];
  const sources: SourceRecord[] = [];

  for (const book of Object.keys(MANIFEST) as BookId[]) {
    const entry = MANIFEST[book];
    const file = join(ROOT, "data", "normalized", entry.file);
    if (!existsSync(file)) {
      loadErrors.push(`manifest 条目缺失：${book} → ${entry.file}`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      loadErrors.push(`manifest 条目解析失败：${book} → ${entry.file}（${String(e)}）`);
      continue;
    }
    try {
      const snap = registerSnapshot(raw as never);
      const groups = snap.groups;
      const main =
        book === "pingshui"
          ? groups.length
          : new Set(groups.map((g) => g.id.split(":")[2])).size;
      snapshots[book] = {
        book,
        dataVersion: snap.dataVersion,
        reviewStatus: snap.reviewStatus,
        file: entry.file,
        mainGroups: main,
        subGroups: groups.length,
      };
      if (snap.reviewStatus !== "approved") unverifiedBooks.push(book);
      const bundle = raw as { evidence?: Evidence[]; sources?: SourceRecord[] };
      if (Array.isArray(bundle.evidence)) evidence.push(...bundle.evidence);
      if (Array.isArray(bundle.sources)) sources.push(...bundle.sources);
    } catch (e) {
      loadErrors.push(`manifest 条目注册失败：${book} → ${entry.file}（${String(e)}）`);
    }
  }

  if (loadErrors.length > 0) notReadyReasons.push(...loadErrors);
  const missing = (Object.keys(MANIFEST) as BookId[]).filter((b) => snapshots[b] === undefined);
  if (missing.length > 0) notReadyReasons.push(`韵书快照缺失：${missing.join("、")}`);

  const evidenceRegistry = dedupeById(evidence, "evidence", loadErrors);
  const sourceRegistry = dedupeById(sources, "source", loadErrors);

  const contextRules = readJsonArray<ContextRule>("data/context/rules.json");
  if (contextRules.length === 0) notReadyReasons.push("无已发布语境规则（B 的 data/context/rules.json）");
  const works = readJsonArray<WorkMetadata>("data/works/metadata.json");
  if (works.length === 0) notReadyReasons.push("无已发布作品元数据（E 的 data/works/metadata.json）");
  const ruleCards = readJsonArray<RuleCard>("rules/cards/teaching-v1.json");
  if (ruleCards.length === 0) notReadyReasons.push("无已发布规则卡（C 的 rules/cards/teaching-v1.json）");

  const threeBooks = (["pingshui", "cilin", "xinyun"] as BookId[]).every(
    (b) => snapshots[b] !== undefined,
  );
  const allApproved = threeBooks && unverifiedBooks.length === 0;
  const ready =
    threeBooks &&
    allApproved &&
    contextRules.length > 0 &&
    works.length > 0 &&
    ruleCards.length > 0 &&
    loadErrors.length === 0;
  if (threeBooks && !allApproved) {
    notReadyReasons.push(
      `快照未审核：${unverifiedBooks.join("、")}（开发联调可分析，发布门槛不放行）`,
    );
  }

  return {
    snapshots,
    unverifiedBooks,
    evidenceRegistry,
    sourceRegistry,
    contextRules,
    ruleCards,
    works,
    ready,
    notReadyReasons,
    loadErrors,
  };
}

let cached: Resources | undefined;

/** 进程内只装载一次：registerSnapshot 禁止重复注册同版本，且请求内同一版本快照符合冻结约定。 */
export function loadResources(): Resources {
  if (cached === undefined) cached = loadResourcesOnce();
  return cached;
}

export async function lookupCharactersByBook(
  char: string,
  book: BookId,
  dataVersion: string,
) {
  return lookupCharacters({ characters: [char], rhymeBook: book, dataVersion });
}

export function lexiconVersion(book: BookId): string | undefined {
  return loadResources().snapshots[book]?.dataVersion;
}
