import {
  BookIdSchema,
  EvidenceSchema,
  FormIdSchema,
  WorkMetadataSchema,
  type BookId,
  type FormId,
} from "@poetry/contracts";

/** 内部适用记录，不新增 HTTP 字段；第一批仅支持三平尾的已审作品解释。 */
export interface ReviewedWorkException {
  id: string;
  version: "1";
  reviewStatus: "approved" | "unverified";
  workId: string;
  textFingerprint: string;
  approvedLines: string[];
  book: BookId;
  formId: FormId;
  ruleId: "TAIL.SANPING";
  ruleVersion: "1";
  target: { line: number; columns: [number, number, number]; text: string };
  approval: { evidenceId: string; sourceId: string; locator: string };
  message: string;
}

export class ReviewedWorkExceptionError extends Error {
  readonly code = "REVIEWED_EXCEPTIONS_INVALID";

  constructor(detail: string) {
    super(`已审作品特例配置无效：${detail}`);
    this.name = "ReviewedWorkExceptionError";
  }
}

function requireCondition(value: unknown, detail: string): asserts value {
  if (!value) throw new ReviewedWorkExceptionError(detail);
}

function object(
  value: unknown,
  keys: string[],
  path: string,
): Record<string, unknown> {
  requireCondition(
    value !== null && typeof value === "object" && !Array.isArray(value),
    path,
  );
  const record = value as Record<string, unknown>;
  requireCondition(
    Object.keys(record).length === keys.length &&
      keys.every((key) => Object.hasOwn(record, key)),
    `${path} 字段缺失或有未知字段`,
  );
  return record;
}

function text(value: unknown, path: string): string {
  requireCondition(typeof value === "string" && value.trim().length > 0, path);
  return value;
}

const SHAPES: Record<FormId, { count: number; width: number }> = {
  wujue: { count: 4, width: 5 },
  qijue: { count: 4, width: 7 },
  wulv: { count: 8, width: 5 },
  qilv: { count: 8, width: 7 },
};

/** 严格校验整个 JSON 数组；坏配置抛错，不能吞成空表。文件读取与来源闭合归 API。 */
export function parseReviewedWorkExceptions(
  value: unknown,
): ReviewedWorkException[] {
  requireCondition(Array.isArray(value), "根必须是 JSON 数组");
  const ids = new Set<string>();
  const scopes = new Set<string>();
  return value.map((item, index) => {
    const path = `exceptions[${index}]`;
    const entry = object(
      item,
      [
        "id",
        "version",
        "reviewStatus",
        "workId",
        "textFingerprint",
        "approvedLines",
        "book",
        "formId",
        "ruleId",
        "ruleVersion",
        "target",
        "approval",
        "message",
      ],
      path,
    );
    const id = text(entry.id, `${path}.id`);
    requireCondition(!ids.has(id), `${path}.id 重复：${id}`);
    ids.add(id);
    requireCondition(
      entry.version === "1" && entry.ruleVersion === "1",
      `${path} 不支持的版本`,
    );
    requireCondition(
      entry.ruleId === "TAIL.SANPING",
      `${path}.ruleId 仅支持 TAIL.SANPING`,
    );
    const book = BookIdSchema.safeParse(entry.book);
    const form = FormIdSchema.safeParse(entry.formId);
    const review = EvidenceSchema.shape.reviewStatus.safeParse(
      entry.reviewStatus,
    );
    const fingerprint =
      WorkMetadataSchema.shape.approvedTextFingerprints.element.safeParse(
        entry.textFingerprint,
      );
    requireCondition(
      book.success && form.success && review.success && fingerprint.success,
      `${path} 韵书/形式/审核状态/指纹无效`,
    );
    const shape = SHAPES[form.data];
    requireCondition(
      Array.isArray(entry.approvedLines) &&
        entry.approvedLines.length === shape.count,
      `${path}.approvedLines 句数不符`,
    );
    const approvedLines = entry.approvedLines.map((line: unknown) => {
      const result = text(line, `${path}.approvedLines`);
      requireCondition(
        /^\p{Script=Han}+$/u.test(result) && [...result].length === shape.width,
        `${path}.approvedLines 必须是对应字数的汉字正文`,
      );
      return result;
    });
    const target = object(
      entry.target,
      ["line", "columns", "text"],
      `${path}.target`,
    );
    requireCondition(
      typeof target.line === "number" &&
        Number.isInteger(target.line) &&
        target.line >= 1 &&
        target.line <= shape.count,
      `${path}.target.line`,
    );
    const columns: [number, number, number] = [
      shape.width - 2,
      shape.width - 1,
      shape.width,
    ];
    const suppliedColumns = target.columns;
    requireCondition(
      Array.isArray(suppliedColumns) &&
        suppliedColumns.length === 3 &&
        columns.every((column, i) => suppliedColumns[i] === column),
      `${path}.target.columns 必须是末三字`,
    );
    const tailText = text(target.text, `${path}.target.text`);
    requireCondition(
      [...approvedLines[target.line - 1]!].slice(-3).join("") === tailText,
      `${path}.target.text 与正文不符`,
    );
    const approval = object(
      entry.approval,
      ["evidenceId", "sourceId", "locator"],
      `${path}.approval`,
    );
    const workId = text(entry.workId, `${path}.workId`);
    const scope = [
      fingerprint.data,
      book.data,
      form.data,
      entry.ruleId,
      target.line,
    ].join(":");
    requireCondition(!scopes.has(scope), `${path} 存在重复适用范围`);
    scopes.add(scope);
    return {
      id,
      version: "1",
      reviewStatus: review.data,
      workId,
      textFingerprint: fingerprint.data,
      approvedLines,
      book: book.data,
      formId: form.data,
      ruleId: "TAIL.SANPING",
      ruleVersion: "1",
      target: { line: target.line, columns, text: tailText },
      approval: {
        evidenceId: text(approval.evidenceId, `${path}.approval.evidenceId`),
        sourceId: text(approval.sourceId, `${path}.approval.sourceId`),
        locator: text(approval.locator, `${path}.approval.locator`),
      },
      message: text(entry.message, `${path}.message`),
    };
  });
}
