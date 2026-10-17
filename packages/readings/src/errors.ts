/**
 * readings 模块内部错误码。
 *
 * 模块不返回 HTTP 对象；HTTP 状态由组长/GLM 在 API 层映射。
 * 每个 code 都是稳定的字符串标识，新增时只追加、不改名。
 */
export const READINGS_ERROR_CODES = [
  /** parsed poem 自身不一致：token 区间切不回原文。 */
  "POEM_TOKEN_SLICE_MISMATCH",
  /** parsed poem 自相矛盾：同一个 tokenId 出现两次。 */
  "POEM_TOKEN_DUPLICATE",
  /** lookup.entries 里同一个字出现多条记录，无法判断以哪条为准。 */
  "LOOKUP_ENTRY_DUPLICATE",
  /** 候选的 character 与所属 entry 不一致，或不是单个码点。 */
  "LOOKUP_CANDIDATE_CHARACTER_MISMATCH",
  /** 候选的 book 与本次 lookup 的韵书不一致（跨书候选）。 */
  "LOOKUP_CANDIDATE_BOOK_MISMATCH",
  /** 同一个字下出现重复候选 ID。 */
  "LOOKUP_CANDIDATE_DUPLICATE",
  /** 候选引用了 lookup.evidence 中不存在的证据 ID。 */
  "LOOKUP_EVIDENCE_UNKNOWN",
  /**
   * 参与读音/平仄/归部推导的候选缺已审核证据：契约无法表达“证据待核实”，只能报数据未就绪。
   *
   * 不只是“原始候选全部未审核”这一种情况，还包括：
   * - 用户覆盖选中的候选没有已审核证据；
   * - 已审核语境规则（含规则冲突保留的候选）实际选中的候选没有已审核证据；
   * - 保留歧义时进入 effectiveCandidateIds 的某些候选没有已审核证据。
   *
   * 建议 GLM 映射为 503 DATA_NOT_READY，不得降级成 200，也不得改写成 unknown。
   */
  "LOOKUP_EVIDENCE_UNVERIFIED",
  /** 同一位字被覆盖两次。 */
  "OVERRIDE_DUPLICATE_TOKEN",
  /** 覆盖指向了不属于本篇的字位。 */
  "OVERRIDE_TOKEN_UNKNOWN",
  /** 覆盖的 readingId 不属于该字位、该原字或当前韵书的候选。 */
  "OVERRIDE_READING_UNKNOWN",
  /** ContextRule 结构自相矛盾（无短语、targetOffset 越界、target 与短语不符）。 */
  "CONTEXT_RULE_INVALID",
  /** approved 规则指向的候选 ID 不在当前字实际候选里（规则与数据版本脱节）。 */
  "CONTEXT_RULE_STALE",
  /**
   * 保留码：若后续把语境规则执行整体关闭，遇到可用 approved 规则时不得静默忽略，
   * 必须显式抛出此码。当前实现已执行 approved 规则，因此运行期不会抛出。
   */
  "CONTEXT_RULES_PENDING",
] as const;

export type ReadingsErrorCode = (typeof READINGS_ERROR_CODES)[number];

/**
 * 可在交接与 API 映射中透出的结构化细节。
 * 只放定位信息（tokenId/readingId/ruleId 等），不放用户原文全文。
 */
export type ReadingsErrorDetails = Readonly<Record<string, string>>;

export class ReadingsError extends Error {
  readonly code: ReadingsErrorCode;
  readonly details: ReadingsErrorDetails;

  constructor(
    code: ReadingsErrorCode,
    message: string,
    details: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ReadingsError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function isReadingsError(error: unknown): error is ReadingsError {
  return error instanceof ReadingsError;
}
