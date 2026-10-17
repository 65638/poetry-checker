/**
 * GoldenCase：本地测试数据格式与校验器（M5 / 队员 E）。
 *
 * 不新增公共协议：request 部分直接复用冻结的 AnalyzeRequestSchema。
 * 结构有效 ≠ 学术批准；approved 必须有人工审核者与可解析证据。
 * 手写校验而不引入 zod：genre 包未声明 zod 依赖，不依赖偶然可见的传递依赖。
 */
import { AnalyzeRequestSchema } from "@poetry/contracts";

export const GOLDEN_REVIEW_STATUSES = ["pending", "approved"] as const;
export type GoldenReviewStatus = (typeof GOLDEN_REVIEW_STATUSES)[number];

/** 来源候选：区分“可打开的具体条目”与“仅书名/查询线索”。 */
export interface GoldenSourceCandidate {
  kind: "located" | "lead";
  value: string | null;
  note: string;
}

export interface GoldenCaseAssertion {
  path: string;
  equals: string | number | boolean | null;
}

export interface GoldenCase {
  id: string;
  title: string;
  author: string | null;
  text: string;
  sourceCandidates: GoldenSourceCandidate[];
  request: {
    rhymeBook: "pingshui" | "cilin" | "xinyun";
    genreHint: "auto" | "regulated" | "ancient";
    formHint: "auto" | "wujue" | "qijue" | "wulv" | "qilv";
    ruleSet: "teaching-v1";
    readingOverrides: Array<{ tokenId: string; readingId: string }>;
  };
  assertions: GoldenCaseAssertion[];
  reviewStatus: GoldenReviewStatus;
  reviewers: string[];
  evidenceIds: string[];
  notes: string;
}

export interface GoldenCaseIssue {
  path: string;
  message: string;
}

export interface GoldenCaseValidation {
  ok: boolean;
  issues: GoldenCaseIssue[];
  value?: GoldenCase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function validateSourceCandidates(
  raw: unknown,
  issues: GoldenCaseIssue[],
): GoldenSourceCandidate[] {
  if (!Array.isArray(raw)) {
    issues.push({ path: "sourceCandidates", message: "必须是数组" });
    return [];
  }
  const parsed: GoldenSourceCandidate[] = [];
  raw.forEach((item, index) => {
    const path = `sourceCandidates[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path, message: "必须是对象" });
      return;
    }
    const kind = item["kind"];
    if (kind !== "located" && kind !== "lead") {
      issues.push({ path: `${path}.kind`, message: "只能是 located 或 lead" });
      return;
    }
    const value = item["value"];
    if (value !== null && typeof value !== "string") {
      issues.push({ path: `${path}.value`, message: "必须是字符串或 null" });
      return;
    }
    if (kind === "located" && !isNonEmptyString(value)) {
      issues.push({
        path: `${path}.value`,
        message: "located 必须给出可定位的具体条目",
      });
      return;
    }
    const note = item["note"];
    parsed.push({
      kind,
      value: typeof value === "string" ? value : null,
      note: typeof note === "string" ? note : "",
    });
  });
  return parsed;
}

function validateAssertions(
  raw: unknown,
  issues: GoldenCaseIssue[],
): GoldenCaseAssertion[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push({ path: "assertions", message: "至少需要一条断言" });
    return [];
  }
  const parsed: GoldenCaseAssertion[] = [];
  raw.forEach((item, index) => {
    const path = `assertions[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path, message: "必须是对象" });
      return;
    }
    if (!isNonEmptyString(item["path"])) {
      issues.push({ path: `${path}.path`, message: "必须是点分路径" });
      return;
    }
    if (!("equals" in item)) {
      issues.push({ path: `${path}.equals`, message: "缺少预期值" });
      return;
    }
    const expected = item["equals"];
    if (
      expected !== null &&
      typeof expected !== "string" &&
      typeof expected !== "number" &&
      typeof expected !== "boolean"
    ) {
      issues.push({
        path: `${path}.equals`,
        message: "只能是字符串、数字、布尔或 null",
      });
      return;
    }
    parsed.push({ path: item["path"], equals: expected });
  });
  return parsed;
}

/** 校验单个 GoldenCase；approved 必须有人工审核者与证据。 */
export function validateGoldenCase(raw: unknown): GoldenCaseValidation {
  const issues: GoldenCaseIssue[] = [];
  if (!isRecord(raw)) {
    return {
      ok: false,
      issues: [{ path: "", message: "GoldenCase 必须是对象" }],
    };
  }

  for (const key of ["id", "title", "text"] as const) {
    if (!isNonEmptyString(raw[key])) {
      issues.push({ path: key, message: "必须是非空字符串" });
    }
  }

  const author = raw["author"];
  if (author !== null && typeof author !== "string") {
    issues.push({ path: "author", message: "必须是字符串或 null" });
  }

  if (!isNonEmptyString(raw["notes"])) {
    issues.push({ path: "notes", message: "必须写明核对状态与待查项" });
  }

  const reviewStatus = raw["reviewStatus"];
  if (reviewStatus !== "pending" && reviewStatus !== "approved") {
    issues.push({
      path: "reviewStatus",
      message: "只能是 pending 或 approved",
    });
  }

  if (!isStringArray(raw["reviewers"])) {
    issues.push({ path: "reviewers", message: "必须是字符串数组" });
  }
  if (!isStringArray(raw["evidenceIds"])) {
    issues.push({ path: "evidenceIds", message: "必须是字符串数组" });
  }

  const sourceCandidates = validateSourceCandidates(
    raw["sourceCandidates"],
    issues,
  );
  const assertions = validateAssertions(raw["assertions"], issues);

  // request 复用冻结契约：正文与请求字段一起校验。
  const request = raw["request"];
  let parsedRequest: GoldenCase["request"] | null = null;
  if (!isRecord(request)) {
    issues.push({ path: "request", message: "必须是对象" });
  } else {
    const text = typeof raw["text"] === "string" ? raw["text"] : "";
    const result = AnalyzeRequestSchema.safeParse({ text, ...request });
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          path: `request.${issue.path.join(".")}`,
          message: issue.message,
        });
      }
    } else {
      parsedRequest = request as GoldenCase["request"];
    }
  }

  const reviewers = isStringArray(raw["reviewers"]) ? raw["reviewers"] : [];
  const evidenceIds = isStringArray(raw["evidenceIds"])
    ? raw["evidenceIds"]
    : [];

  // 审核门槛：approved 不能空口批准。
  if (reviewStatus === "approved") {
    if (reviewers.filter(isNonEmptyString).length === 0) {
      issues.push({
        path: "reviewers",
        message: "approved 必须至少一名人工审核者",
      });
    }
    if (evidenceIds.length === 0) {
      issues.push({
        path: "evidenceIds",
        message: "approved 必须给可解析的证据 ID",
      });
    }
  }

  if (issues.length > 0 || parsedRequest === null) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    value: {
      id: raw["id"] as string,
      title: raw["title"] as string,
      author: typeof author === "string" ? author : null,
      text: raw["text"] as string,
      sourceCandidates,
      request: parsedRequest,
      assertions,
      reviewStatus: reviewStatus as GoldenReviewStatus,
      reviewers,
      evidenceIds,
      notes: raw["notes"] as string,
    },
  };
}

/** 批量校验：额外检查 id 唯一，防止重复登记掩盖缺失用例。 */
export function validateGoldenCases(raw: unknown): {
  ok: boolean;
  issues: GoldenCaseIssue[];
  values: GoldenCase[];
} {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ path: "", message: "必须是用例数组" }],
      values: [],
    };
  }

  const issues: GoldenCaseIssue[] = [];
  const values: GoldenCase[] = [];
  const seenIds = new Map<string, number>();

  raw.forEach((item, index) => {
    const result = validateGoldenCase(item);
    if (!result.ok || result.value === undefined) {
      for (const issue of result.issues) {
        issues.push({
          path: `[${index}].${issue.path}`,
          message: issue.message,
        });
      }
      return;
    }
    const previous = seenIds.get(result.value.id);
    if (previous !== undefined) {
      issues.push({
        path: `[${index}].id`,
        message: `id 与第 ${previous} 条重复：${result.value.id}`,
      });
    } else {
      seenIds.set(result.value.id, index);
    }
    values.push(result.value);
  });

  return { ok: issues.length === 0, issues, values };
}
