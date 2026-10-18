import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupCharacters, registerSnapshots } from "@poetry/lexicon";
import type { ContextRule, RuleCard, WorkMetadata } from "@poetry/contracts";

/** 启动时只读装载的资源快照；请求内同一版本，不做热更新。 */
export interface Resources {
  lexiconVersions: Record<string, string>;
  /** 未审核版本仅允许显式开发联调，不冒充 release。 */
  unverifiedVersions: string[];
  contextRules: ContextRule[];
  ruleCards: RuleCard[];
  works: WorkMetadata[];
  ready: boolean;
  notReadyReasons: string[];
  /** 已加载快照中出现的来源 ID（明细待证据快照发布）。 */
  knownSourceIds: string[];
}

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("未找到仓库根（pnpm-workspace.yaml）");
}
const ROOT = findRepoRoot();

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

let cached: Resources | undefined;

/** 进程内只装载一次：registerSnapshots 禁止重复注册同版本（A 的设计），
 * 且请求内使用同一版本快照符合冻结约定。 */
export async function lookupCharactersByBook(char: string, book: "pingshui" | "cilin" | "xinyun", dataVersion: string) {
  return lookupCharacters({ characters: [char], rhymeBook: book, dataVersion });
}

export function loadResources(): Resources {
  if (cached !== undefined) return cached;
  cached = loadResourcesOnce();
  return cached;
}

function loadResourcesOnce(): Resources {
  const notReadyReasons: string[] = [];
  const knownSourceIds: string[] = [];
  const unverifiedVersions: string[] = [];
  const lexiconVersions: Record<string, string> = {};

  const normDir = join(ROOT, "data", "normalized");
  const inputs: unknown[] = [];
  if (existsSync(normDir)) {
    for (const f of readdirSync(normDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        inputs.push(JSON.parse(readFileSync(join(normDir, f), "utf8")));
      } catch {
        notReadyReasons.push(`data/normalized/${f} 解析失败`);
      }
    }
  }
  if (inputs.length > 0) {
    // registerSnapshots 自带结构守卫；审核状态由 reviewStatus 携带
    const registered = registerSnapshots(inputs as never[]);
    for (const raw of inputs) {
      const sources = (raw as { sources?: Array<{ id: string }> }).sources;
      if (Array.isArray(sources)) knownSourceIds.push(...sources.map((s) => s.id));
    }
    for (const s of registered) {
      lexiconVersions[s.book] = s.dataVersion;
      if (s.reviewStatus !== "approved") unverifiedVersions.push(s.dataVersion);
    }
  } else {
    notReadyReasons.push("data/normalized 无可用韵书快照（A 未发布）");
  }

  const contextRules = readJsonArray<ContextRule>("data/context/rules.json");
  if (contextRules.length === 0) notReadyReasons.push("无已发布语境规则（B 的 data/context/rules.json）");
  const works = readJsonArray<WorkMetadata>("data/works/metadata.json");
  if (works.length === 0) notReadyReasons.push("无已发布作品元数据（E 的 data/works/metadata.json）");
  const ruleCards = readJsonArray<RuleCard>("rules/cards/teaching-v1.json");
  if (ruleCards.length === 0) notReadyReasons.push("无已发布规则卡（C 的 rules/cards/teaching-v1.json）");

  return {
    lexiconVersions,
    unverifiedVersions,
    contextRules,
    ruleCards,
    works,
    knownSourceIds: [...new Set(knownSourceIds)].sort(),
    ready: Object.keys(lexiconVersions).length > 0 && contextRules.length > 0 && works.length > 0 && ruleCards.length > 0,
    notReadyReasons,
  };
}
