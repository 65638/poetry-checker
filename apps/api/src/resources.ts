import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupCharacters, registerSnapshot } from "@poetry/lexicon";
import {
  parseReviewedWorkExceptions,
  type ReviewedWorkException,
} from "@poetry/prosody";
import { fingerprintText } from "@poetry/genre";
import {
  ContextRuleSchema,
  EvidenceSchema,
  RuleCardSchema,
  SourceRecordSchema,
  WorkMetadataSchema,
} from "@poetry/contracts";
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
  /** D3 批次一：已审作品特例（rules/exceptions/reviewed-works-v1.json）。 */
  reviewedWorkExceptions: ReviewedWorkException[];
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

interface Parser<T> {
  parse(value: unknown): T;
}

/** 错误保留文件定位；坏 JSON/形状错误不能被吞成空数组。root 可注入临时目录做加载测试。 */
export function loadSupplementalResources(root: string) {
  const errors: string[] = [];
  const read = (rel: string): unknown => {
    try {
      return JSON.parse(readFileSync(join(root, rel), "utf8")) as unknown;
    } catch (error) {
      errors.push(`资源读取失败：${rel}（${String(error)}）`);
      return undefined;
    }
  };
  const array = <T>(value: unknown, schema: Parser<T>, rel: string): T[] => {
    if (value === undefined) return [];
    try {
      if (!Array.isArray(value)) throw new Error("需要 JSON 数组");
      return value.map((item) => schema.parse(item));
    } catch (error) {
      errors.push(`资源结构无效：${rel}（${String(error)}）`);
      return [];
    }
  };
  const bundle = read("rules/evidence/teaching-v1.json");
  const ruleBundle =
    bundle !== null && typeof bundle === "object" && !Array.isArray(bundle)
      ? (bundle as Record<string, unknown>)
      : {};
  if (
    bundle !== undefined &&
    (ruleBundle.sources === undefined || ruleBundle.evidence === undefined)
  ) {
    errors.push(
      "规则证据包缺少 sources/evidence：rules/evidence/teaching-v1.json",
    );
  }
  const evidence = [
    ...array(
      ruleBundle.evidence,
      EvidenceSchema,
      "rules/evidence/teaching-v1.json#evidence",
    ),
    ...array(
      read("data/context/evidence.json"),
      EvidenceSchema,
      "data/context/evidence.json",
    ),
    ...array(
      read("data/works/evidence.json"),
      EvidenceSchema,
      "data/works/evidence.json",
    ),
  ];
  const sources = [
    ...array(
      ruleBundle.sources,
      SourceRecordSchema,
      "rules/evidence/teaching-v1.json#sources",
    ),
    ...array(
      read("data/context/sources.json"),
      SourceRecordSchema,
      "data/context/sources.json",
    ),
    ...array(
      read("data/works/sources.json"),
      SourceRecordSchema,
      "data/works/sources.json",
    ),
  ];
  return {
    evidence,
    sources,
    errors,
    contextRules: array(
      read("data/context/rules.json"),
      ContextRuleSchema,
      "data/context/rules.json",
    ),
    works: array(
      read("data/works/metadata.json"),
      WorkMetadataSchema,
      "data/works/metadata.json",
    ),
    ruleCards: array(
      read("rules/cards/teaching-v1.json"),
      RuleCardSchema,
      "rules/cards/teaching-v1.json",
    ),
    reviewedWorkExceptions: loadReviewedWorkExceptions(read, errors),
  };
}

/** D3 批次一：rules/exceptions/reviewed-works-v1.json——严格解析；文件缺失/坏 JSON 由 read 记入 errors，坏结构在此记入。 */
function loadReviewedWorkExceptions(
  read: (rel: string) => unknown,
  errors: string[],
): ReviewedWorkException[] {
  const rel = "rules/exceptions/reviewed-works-v1.json";
  const raw = read(rel);
  if (raw === undefined) return []; // read 已记录错误
  try {
    return parseReviewedWorkExceptions(raw);
  } catch (e) {
    errors.push(
      `特例记录解析失败：${rel}（${e instanceof Error ? e.message : String(e)}）`,
    );
    return [];
  }
}

/**
 * D3 批次一装载校验（GLM）：workId 存在、指纹与 approvedLines 一致、
 * 作品允许该指纹且形式相符、审批证据 approved/context 且来源可解析、
 * 作品依据含 approved/work_metadata。unverified 记录不生效也不自动升级。
 */
export function validateReviewedWorkExceptions(
  exceptions: readonly ReviewedWorkException[],
  resources: Pick<Resources, "works" | "evidenceRegistry" | "sourceRegistry">,
): string[] {
  const errors: string[] = [];
  const worksById = new Map(resources.works.map((w) => [w.id, w]));
  const evidence = new Map(
    resources.evidenceRegistry.map((item) => [item.id, item]),
  );
  const sources = new Set(resources.sourceRegistry.map((item) => item.id));
  for (const ex of exceptions) {
    const tag = `特例 ${ex.id}`;
    if (ex.reviewStatus !== "approved") continue; // 不生效、不升级，仅装载
    const work = worksById.get(ex.workId);
    if (work === undefined) {
      errors.push(`${tag} 引用的作品不存在：${ex.workId}`);
      continue;
    }
    const joined = ex.approvedLines.join("");
    if (fingerprintText(joined) !== ex.textFingerprint) {
      errors.push(`${tag} 指纹与 approvedLines 不一致`);
    }
    if (!work.approvedTextFingerprints.includes(ex.textFingerprint)) {
      errors.push(`${tag} 指纹不在作品 ${ex.workId} 的已审指纹内`);
    }
    if (work.formId !== ex.formId) {
      errors.push(
        `${tag} 形式 ${ex.formId} 与作品申报 ${String(work.formId)} 不符`,
      );
    }
    const approval = evidence.get(ex.approval.evidenceId);
    if (approval === undefined) {
      errors.push(`${tag} 缺少审批证据 ${ex.approval.evidenceId}`);
    } else if (
      approval.reviewStatus !== "approved" ||
      approval.kind !== "context"
    ) {
      errors.push(
        `${tag} 审批证据须为 approved/context：${ex.approval.evidenceId}`,
      );
    }
    if (approval !== undefined && approval.sourceId !== ex.approval.sourceId) {
      errors.push(`${tag} 审批来源与证据来源不符：${ex.approval.sourceId}`);
    }
    if (!sources.has(ex.approval.sourceId)) {
      errors.push(`${tag} 缺少审批来源 ${ex.approval.sourceId}`);
    }
    const workEvidenceOk = work.evidenceIds.some((id) => {
      const ev = evidence.get(id);
      return (
        ev !== undefined &&
        ev.reviewStatus === "approved" &&
        ev.kind === "work_metadata"
      );
    });
    if (!workEvidenceOk) {
      errors.push(
        `${tag} 的作品 ${ex.workId} 缺少 approved/work_metadata 依据`,
      );
    }
  }
  return errors;
}

/** 检查引用闭合；已审核语境和作品不能引用未审核/错误类别证据。 */
export function validateResourceReferences(
  resources: Pick<
    Resources,
    | "evidenceRegistry"
    | "sourceRegistry"
    | "contextRules"
    | "works"
    | "ruleCards"
  >,
): string[] {
  const errors: string[] = [];
  const evidence = new Map(
    resources.evidenceRegistry.map((item) => [item.id, item]),
  );
  const sources = new Set(resources.sourceRegistry.map((item) => item.id));
  for (const item of resources.evidenceRegistry) {
    if (!sources.has(item.sourceId))
      errors.push(`证据 ${item.id} 缺少来源 ${item.sourceId}`);
  }
  for (const [items, kind] of [
    [resources.contextRules, "context"],
    [resources.works, "work_metadata"],
  ] as const) {
    for (const item of items) {
      if (item.reviewStatus === "approved" && item.evidenceIds.length === 0)
        errors.push(`${item.id} 已审核但没有证据`);
      for (const id of item.evidenceIds) {
        const ev = evidence.get(id);
        if (ev === undefined) errors.push(`${item.id} 缺少证据 ${id}`);
        else if (item.reviewStatus === "approved" && ev.kind !== kind)
          errors.push(`${item.id} 的已审核 ${kind} 证据无效：${id}`);
      }
    }
  }
  for (const id of unresolvedRuleEvidence(
    resources.ruleCards,
    resources.evidenceRegistry,
  ))
    errors.push(`规则卡缺少证据 ${id}`);
  return errors;
}

/** 规则卡引用的 evidenceIds 中未在证据注册表解析的 ID（排序稳定；空数组=闭合）。 */
export function unresolvedRuleEvidence(
  cards: readonly RuleCard[],
  registry: readonly Evidence[],
): string[] {
  const known = new Set(registry.map((e) => e.id));
  const missing = new Set<string>();
  for (const card of cards) {
    for (const id of card.evidenceIds) {
      if (!known.has(id)) missing.add(id);
    }
  }
  return [...missing].sort();
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
  return [...map.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
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
      loadErrors.push(
        `manifest 条目解析失败：${book} → ${entry.file}（${String(e)}）`,
      );
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
      loadErrors.push(
        `manifest 条目注册失败：${book} → ${entry.file}（${String(e)}）`,
      );
    }
  }

  const missing = (Object.keys(MANIFEST) as BookId[]).filter(
    (b) => snapshots[b] === undefined,
  );
  if (missing.length > 0)
    notReadyReasons.push(`韵书快照缺失：${missing.join("、")}`);

  const supplemental = loadSupplementalResources(ROOT);
  evidence.push(...supplemental.evidence);
  sources.push(...supplemental.sources);
  loadErrors.push(...supplemental.errors);

  const evidenceRegistry = dedupeById(evidence, "evidence", loadErrors);
  const sourceRegistry = dedupeById(sources, "source", loadErrors);

  const { contextRules, works, ruleCards, reviewedWorkExceptions } =
    supplemental;
  if (contextRules.length === 0)
    notReadyReasons.push("无已发布语境规则（B 的 data/context/rules.json）");
  if (works.length === 0)
    notReadyReasons.push("无已发布作品元数据（E 的 data/works/metadata.json）");
  if (ruleCards.length === 0)
    notReadyReasons.push("无已发布规则卡（C 的 rules/cards/teaching-v1.json）");
  loadErrors.push(
    ...validateResourceReferences({
      evidenceRegistry,
      sourceRegistry,
      contextRules,
      works,
      ruleCards,
    }),
  );
  loadErrors.push(
    ...validateReviewedWorkExceptions(reviewedWorkExceptions, {
      works,
      evidenceRegistry,
      sourceRegistry,
    }),
  );
  notReadyReasons.push(...loadErrors);
  const pendingRules = ruleCards.filter(
    (card) =>
      card.evidenceIds.length === 0 ||
      card.evidenceIds.some(
        (id) =>
          evidenceRegistry.find((item) => item.id === id)?.reviewStatus !==
          "approved",
      ),
  );
  if (pendingRules.length > 0)
    notReadyReasons.push(
      `规则卡存在部分依据/待审核范围：${pendingRules.map((card) => card.id).join("、")}`,
    );
  if (!works.some((work) => work.reviewStatus === "approved"))
    notReadyReasons.push("无已审核作品元数据");
  if (!contextRules.some((rule) => rule.reviewStatus === "approved"))
    notReadyReasons.push("无已审核语境规则");

  const threeBooks = (["pingshui", "cilin", "xinyun"] as BookId[]).every(
    (b) => snapshots[b] !== undefined,
  );
  const allApproved = threeBooks && unverifiedBooks.length === 0;
  const ready = threeBooks && ruleCards.length > 0 && loadErrors.length === 0;
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
    reviewedWorkExceptions,
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
