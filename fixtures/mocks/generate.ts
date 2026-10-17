// 生成 fixtures/mocks 的五状态开发场景。
// 所有报告都用 AnalysisResponseSchema 校验后才写盘，保证一定通过公共契约。
// 合成数据只用于开发预览与业务测试，不进入真实分析路径，也不挂真实名篇的名字。
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  AnalysisResponseSchema,
  type AnalysisResponse,
  type AnnotatedToken,
  type CheckStatus,
  type SummaryStatus,
  type Tone,
} from "@poetry/contracts";

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ID = "fixture:source";
const VERSIONS = {
  data: "fixture-only",
  rules: "teaching-v1",
  context: "fixture-only",
  works: "fixture-only",
};

const PING = "平";
const PING_GROUP = "fixture:group:ping";
const ZE_GROUP = "fixture:group:ze";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

interface TokenSpec {
  line: number;
  column: number;
  start: number;
  end: number;
  effectiveTones: Tone[];
}

/** 按码点切分正文，生成字位与候选；有效候选决定平仄状态。 */
function buildTokens(
  text: string,
  tonesPerToken: Tone[][],
): AnnotatedToken[] {
  const tokens: AnnotatedToken[] = [];

  let line = 1;
  let column = 0;
  // 码点下标用于取声调；UTF-16 偏移用于切片，两者必须分开推进。
  let codePointIndex = 0;
  let utf16Offset = 0;
  for (const char of text) {
    const start = utf16Offset;
    if (char === "\n") {
      line += 1;
      column = 0;
      codePointIndex += 1;
      utf16Offset += char.length;
      continue;
    }
    column += 1;
    const end = start + char.length;
    const tones: Tone[] = tonesPerToken[codePointIndex] ?? ["P"];
    const tokenId = `l${line}c${column}`;
    const candidates: AnnotatedToken["candidates"] = tones.map((tone: Tone) => {
      const isPing = tone === "P";
      const toneClass: AnnotatedToken["candidates"][number]["toneClass"] = isPing
        ? "ping"
        : "ze_unspecified";
      return {
        id: `fixture:reading:${char}:${isPing ? "P" : "Z"}`,
        character: char,
        book: "pingshui",
        toneClass,
        tone,
        groupIds: [isPing ? PING_GROUP : ZE_GROUP],
        gloss: "合成开发场景，非韵书条目",
        modernReading: null,
        fanqie: null,
        evidenceIds: [`fixture:evidence:${isPing ? "ping" : "ze"}`],
      };
    });
    const uniqueTones: Tone[] = [...new Set(tones)].sort();
    const toneStatus: AnnotatedToken["toneStatus"] =
      uniqueTones.length === 1 ? "resolved" : "ambiguous";
    const firstCandidate = candidates[0];
    const evidenceKey = uniqueTones.includes("P") ? "ping" : "ze";
    tokens.push({
      tokenId,
      text: char,
      line,
      column,
      startUtf16: start,
      endUtf16: end,
      candidates,
      effectiveCandidateIds: candidates.map((candidate) => candidate.id),
      readingStatus: toneStatus,
      selectedReadingId:
        toneStatus === "resolved" && firstCandidate !== undefined
          ? firstCandidate.id
          : null,
      selectionMethod: toneStatus === "resolved" ? "unique" : "unresolved",
      possibleTones: uniqueTones,
      toneStatus,
      tone: toneStatus === "resolved" ? uniqueTones[0] ?? null : null,
      reason: "合成开发场景",
      evidenceIds: [`fixture:evidence:${evidenceKey}`],
    });
    codePointIndex += 1;
    utf16Offset += char.length;
  }
  return tokens;
}

function buildLines(text: string, tokenSpecs: TokenSpec[]) {
  const lines: Array<{ line: number; text: string; tokenIds: string[] }> = [];
  for (const spec of tokenSpecs) {
    let bucket = lines.find((item) => item.line === spec.line);
    if (bucket === undefined) {
      bucket = { line: spec.line, text: "", tokenIds: [] };
      lines.push(bucket);
    }
    const tokenText = text.slice(spec.start, spec.end);
    bucket.text += tokenText;
    bucket.tokenIds.push(`l${spec.line}c${spec.column}`);
  }
  return lines;
}

interface ScenarioInput {
  text: string;
  /** 每个字位的有效候选声调集合。 */
  tones: Tone[][];
  summaryStatus: SummaryStatus;
  checkStatus: CheckStatus;
  genreFamily: "regulated" | "ancient" | "undetermined" | "unsupported";
  applicability: "applicable" | "not_applicable" | "uncertain" | "unsupported";
  rhymeTokenIds: string[];
  message: string;
  /** 诊断定位的字位；必须存在，找不到时生成器直接失败。 */
  checkTokenId?: string;
  /** 诊断的期望平仄；缺省时由字样与状态推导，保证不与 observed 自相矛盾。 */
  expectedTones?: Tone[];
  /** 只用于 mismatch 场景：绕开行文本与字位的自洽校验。 */
  corruptLineOffset?: number;
}

/**
 * 构造诊断。坐标一律取自实际 token，不允许硬编码行号/列号。
 * 若引用的字位不存在，抛错而不是回退到某个默认位置。
 */
function buildCheck(
  input: ScenarioInput,
  tokens: AnnotatedToken[],
): AnalysisResponse["prosody"]["checks"][number] {
  const targetTokenId = input.checkTokenId ?? input.rhymeTokenIds[0];
  if (targetTokenId === undefined) {
    throw new Error("合成场景未指定诊断定位字位（checkTokenId / rhymeTokenIds 均为空）");
  }
  const token = tokens.find((item) => item.tokenId === targetTokenId);
  if (token === undefined) {
    throw new Error(
      `合成场景的诊断引用了不存在的字位：${targetTokenId}（已有 ${tokens.length} 个字位）`,
    );
  }

  // observed 取该字位实际的平仄，保证与报告本身不矛盾。
  const observed: Tone[] = token.tone === null ? [] : [token.tone];
  // expected 缺省时：fail 场景取相反平仄，其余场景与 observed 一致（不是「通过」）。
  const expected: Tone[] =
    input.expectedTones ??
    (input.checkStatus === "fail"
      ? observed.map((tone) => (tone === "P" ? "Z" : "P"))
      : observed);

  return {
    id: "fixture:check",
    ruleId: "METER.POSITION",
    ruleVersion: "1",
    status: input.checkStatus,
    severity: input.checkStatus === "fail" ? "error" : "info",
    // 坐标必须与 token 自身一致，否则前端定位会错位。
    locations: [{ tokenId: token.tokenId, line: token.line, column: token.column }],
    expected,
    observed,
    message: input.message,
    templateId: null,
    evidenceIds: [],
    resolvedBy: null,
    relatedFindingIds: [],
  };
}

function buildScenario(input: ScenarioInput): AnalysisResponse {
  const specs: TokenSpec[] = [];
  let line = 1;
  let column = 0;
  let codePointIndex = 0;
  let utf16Offset = 0;
  for (const char of input.text) {
    if (char === "\n") {
      line += 1;
      column = 0;
      codePointIndex += 1;
      utf16Offset += char.length;
      continue;
    }
    column += 1;
    const start = utf16Offset;
    specs.push({
      line,
      column,
      start,
      end: start + char.length,
      effectiveTones: input.tones[codePointIndex] ?? ["P"],
    });
    codePointIndex += 1;
    utf16Offset += char.length;
  }
  const tokens = buildTokens(input.text, input.tones);
  const inputHash = sha256(input.text);
  const report: AnalysisResponse = {
    schemaVersion: "1.0",
    inputHash,
    versions: VERSIONS,
    policy: {
      rhymeBook: "pingshui",
      toneBasis: "historical",
      notice: "合成开发场景，不用于真实格律判断",
    },
    poem: {
      originalText: input.text,
      inputHash,
      lines: buildLines(input.text, specs),
      tokens,
      quality: "ok",
      notices: [],
      book: "pingshui",
    },
    genre: {
      formFamily: input.genreFamily,
      formId: input.genreFamily === "regulated" ? "wujue" : null,
      historicalTags: [],
      applicability: input.applicability,
      basisType: "user",
      candidateTemplateIds: [],
      selectedTemplateId: null,
      reasons: ["合成开发场景，不代表真实体裁判别"],
      evidenceIds: [],
    },
    prosody: {
      candidates: [],
      selectedTemplateId: null,
      checks: [buildCheck(input, tokens)],
      rhyme: {
        status: input.checkStatus === "pass" ? "pass" : input.checkStatus,
        tokenIds: input.rhymeTokenIds,
        commonGroupIds: input.checkStatus === "pass" ? [PING_GROUP] : [],
      },
      relations: [],
    },
    provenance: {
      groups: [
        {
          id: PING_GROUP,
          book: "pingshui",
          name: "合成平部",
          toneClass: "ping",
          evidenceIds: ["fixture:evidence:ping"],
        },
        {
          id: ZE_GROUP,
          book: "pingshui",
          name: "合成仄部",
          toneClass: "ze_unspecified",
          evidenceIds: ["fixture:evidence:ze"],
        },
      ],
      sources: [
        {
          id: SOURCE_ID,
          title: "项目自建合成测试源（非韵书）",
          edition: "fixture-v1",
          url: null,
          license: "仅作项目接口测试",
          snapshotSha256: null,
          revision: null,
          retrievedAt: null,
        },
      ],
      evidence: [
        {
          id: "fixture:evidence:ping",
          sourceId: SOURCE_ID,
          kind: "rhyme_entry",
          locator: "synthetic/ping",
          assertion: "仅证明测试构造内的数据关联，不证明真实韵书归属",
          excerpt: null,
          reviewStatus: "approved",
        },
        {
          id: "fixture:evidence:ze",
          sourceId: SOURCE_ID,
          kind: "rhyme_entry",
          locator: "synthetic/ze",
          assertion: "仅证明测试构造内的数据关联，不证明真实韵书归属",
          excerpt: null,
          reviewStatus: "approved",
        },
      ],
      rules: [
        {
          id: "METER.POSITION",
          version: "1",
          name: "逐位允许集合",
          scope: "合成接口场景",
          statement: "比较有效候选与允许平仄集合",
          limitations: ["此 fixture 不执行真实判定"],
          evidenceIds: [],
        },
      ],
    },
    summary: { status: input.summaryStatus, message: input.message },
  };

  const validated = AnalysisResponseSchema.parse(report);

  // 只在 Schema 校验之后制造语义错位：Schema 本身不校验「行文本与字位一致」，
  // 这正是 D-D1-08 要求前端自己发现的情形。
  if (input.corruptLineOffset !== undefined) {
    const lineToCorrupt = validated.poem.lines[input.corruptLineOffset];
    if (lineToCorrupt !== undefined) {
      lineToCorrupt.text = lineToCorrupt.text.slice(1);
    }
  }

  return validated;
}

function write(name: string, report: AnalysisResponse) {
  writeFileSync(join(OUT_DIR, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`wrote fixtures/mocks/${name}.json  summary=${report.summary.status}`);
}

mkdirSync(OUT_DIR, { recursive: true });

// 五言绝句体式：每句 5 字，正文字数 20（不含换行）。
const L1 = "仄仄平平仄";
const L2 = "平平仄仄平";
const L3 = "平平平仄仄";
const L4 = "仄仄仄平平";

function tonesFor(...lines: string[]): Tone[][] {
  const tones: Tone[][] = [];
  for (const line of lines) {
    for (const char of line) tones.push([char === PING ? "P" : "Z"]);
  }
  return tones;
}

const passText = [L1, L2, L3, L4].join("\n");
write(
  "pass",
  buildScenario({
    text: passText,
    tones: tonesFor(L1, L2, L3, L4),
    summaryStatus: "pass",
    checkStatus: "pass",
    genreFamily: "regulated",
    applicability: "applicable",
    rhymeTokenIds: ["l2c5", "l4c5"],
    message: "合成 pass 场景：必检项通过（仅结构验证）",
  }),
);

const failText = [L1, "平平平平平", L3, L4].join("\n");
const failTones = tonesFor(L1, "平平平平平", L3, L4);
// 第二句末字故意为平，制造押韵/平仄偏离。
write(
  "fail",
  buildScenario({
    text: failText,
    tones: failTones,
    summaryStatus: "fail",
    checkStatus: "fail",
    genreFamily: "regulated",
    applicability: "applicable",
    rhymeTokenIds: ["l2c5", "l4c5"],
    message: "合成 fail 场景：第二句出现明确偏离（仅结构验证）",
  }),
);

// needs_review 使用与 pass 不同的正文（末句改为「平平仄仄平」），
// 避免两个状态共用同一文本——否则按正文选场景会退化成只能命中一种。
const reviewText = [L1, L2, L3, "平平仄仄平"].join("\n");
const reviewTones = tonesFor(L1, L2, L3, "平平仄仄平");
// 末句第 4 字给两个不同平仄的候选，制造待复核。
reviewTones[reviewTones.length - 2] = ["P", "Z"];
write(
  "needs_review",
  buildScenario({
    text: reviewText,
    tones: reviewTones,
    summaryStatus: "needs_review",
    checkStatus: "uncertain",
    genreFamily: "regulated",
    applicability: "uncertain",
    rhymeTokenIds: ["l2c5", "l4c5"],
    message: "合成 needs_review 场景：存在读音未定（仅结构验证）",
  }),
);

const ancientText = [L1, L2, L3, "仄仄平平仄"].join("\n");
write(
  "not_applicable",
  buildScenario({
    text: ancientText,
    tones: tonesFor(L1, L2, L3, "仄仄平平仄"),
    summaryStatus: "not_applicable",
    checkStatus: "not_applicable",
    genreFamily: "ancient",
    applicability: "not_applicable",
    rhymeTokenIds: [],
    // 古体不判押韵，但诊断仍需指向一个真实字位（第 4 句第 2 字）。
    checkTokenId: "l4c2",
    message: "合成 not_applicable 场景：古体不适用近体规则（仅结构验证）",
  }),
);

const unsupportedText = [L1, L2, L3, L4].join("\n");
write(
  "unsupported",
  buildScenario({
    text: unsupportedText + "\n",
    tones: tonesFor(L1, L2, L3, L4),
    summaryStatus: "unsupported",
    checkStatus: "unsupported",
    genreFamily: "unsupported",
    applicability: "unsupported",
    rhymeTokenIds: [],
    // 未支持形式不判押韵，诊断指向第 3 句第 3 字。
    checkTokenId: "l3c3",
    message: "合成 unsupported 场景：当前版本尚未支持该形式（仅结构验证）",
  }),
);

// 用于验证前端必须拒绝「Schema 合法但原文与请求不符」的报告。
write(
  "mismatch",
  buildScenario({
    text: passText,
    tones: tonesFor(L1, L2, L3, L4),
    summaryStatus: "pass",
    checkStatus: "pass",
    genreFamily: "regulated",
    applicability: "applicable",
    rhymeTokenIds: ["l2c5", "l4c5"],
    message: "合成 mismatch 场景：报告内部字位已故意错位",
    corruptLineOffset: 1,
  }),
);

// 含补充平面汉字（BMP 之外）的合法报告。
// 「𠀀」是一个 Unicode 码点、两个 UTF-16 码元；用来回归
// 「字位数按码点计、切片按 UTF-16」这条坐标约定，防止合法报告被误拒。
const supplementaryLine = "\u{20000}仄平平仄";
write(
  "supplementary",
  buildScenario({
    text: [supplementaryLine, L2, L3, L4].join("\n"),
    tones: tonesFor(supplementaryLine, L2, L3, L4),
    summaryStatus: "pass",
    checkStatus: "pass",
    genreFamily: "regulated",
    applicability: "applicable",
    rhymeTokenIds: ["l2c5", "l4c5"],
    message: "合成 supplementary 场景：含补充平面汉字的合法报告",
  }),
);

// ---------------------------------------------------------------------------
// 语义自检：写盘后重新读回，校验坐标与自洽性。
// 不合法就让生成器失败，避免「Schema 通过但坐标错位」的 fixture 流出去。
// ---------------------------------------------------------------------------

interface CheckSemantics {
  /** 行文本是否等于其字位文本拼接（mismatch 场景刻意打破）。 */
  linesMatchTokens: boolean;
  /** 每个 token 的 UTF-16 切片是否等于 token.text。 */
  slicesMatch: boolean;
  /** 所有 finding.locations 是否引用了存在且行列一致的 token。 */
  locationsResolve: boolean;
  /** 失败场景的 expected 与 observed 是否确实不同。 */
  failIsContradictory: boolean;
  /** 通过场景的 expected 与 observed 是否一致（不自我矛盾）。 */
  passIsConsistent: boolean;
}

function checkSemantics(report: AnalysisResponse): CheckSemantics {
  const byId = new Map(report.poem.tokens.map((token) => [token.tokenId, token]));

  let slicesMatch = true;
  for (const token of report.poem.tokens) {
    const slice = report.poem.originalText.slice(token.startUtf16, token.endUtf16);
    if (slice !== token.text) slicesMatch = false;
    if ([...token.text].length !== 1) slicesMatch = false;
  }

  let linesMatchTokens = true;
  for (const line of report.poem.lines) {
    const expected = line.tokenIds
      .map((id) => byId.get(id)?.text ?? "")
      .join("");
    if (expected !== line.text) linesMatchTokens = false;
    if ([...line.text].length !== line.tokenIds.length) linesMatchTokens = false;
  }

  let locationsResolve = true;
  for (const check of report.prosody.checks) {
    for (const location of check.locations) {
      const token = byId.get(location.tokenId);
      if (token === undefined) {
        locationsResolve = false;
        continue;
      }
      if (token.line !== location.line || token.column !== location.column) {
        locationsResolve = false;
      }
    }
  }

  const failCheck = report.prosody.checks.find((check) => check.status === "fail");
  const failIsContradictory =
    failCheck === undefined
      ? true
      : JSON.stringify([...failCheck.expected].sort()) !==
        JSON.stringify([...failCheck.observed].sort());

  const passCheck = report.prosody.checks.find((check) => check.status === "pass");
  const passIsConsistent =
    passCheck === undefined
      ? true
      : JSON.stringify([...passCheck.expected].sort()) ===
        JSON.stringify([...passCheck.observed].sort());

  return {
    linesMatchTokens,
    slicesMatch,
    locationsResolve,
    failIsContradictory,
    passIsConsistent,
  };
}

/** 合法场景（除 mismatch 外）必须全部满足。 */
const LEGAL_SCENARIOS = [
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
  "supplementary",
] as const;
/** 刻意非法的拒绝测试场景。 */
const REJECT_SCENARIOS = ["mismatch"] as const;

const problems: string[] = [];
for (const name of LEGAL_SCENARIOS) {
  const report = AnalysisResponseSchema.parse(
    JSON.parse(readFileSync(join(OUT_DIR, `${name}.json`), "utf8")),
  );
  const semantics = checkSemantics(report);

  if (!semantics.slicesMatch) problems.push(`${name}: 字位 UTF-16 切片与 token.text 不符`);
  if (!semantics.linesMatchTokens) problems.push(`${name}: 行文本与字位组成不符`);
  if (!semantics.locationsResolve) {
    problems.push(`${name}: finding.locations 引用了不存在或行列不一致的 token`);
  }
  if (!semantics.failIsContradictory) {
    problems.push(`${name}: fail 诊断的 expected 与 observed 相同（自相矛盾）`);
  }
  if (!semantics.passIsConsistent) {
    problems.push(`${name}: pass 诊断的 expected 与 observed 不同（自相矛盾）`);
  }

  if (name === "supplementary") {
    const hasSurrogatePair = report.poem.tokens.some(
      (token) => [...token.text].length === 1 && token.text.length === 2,
    );
    if (!hasSurrogatePair) problems.push("supplementary: 未包含补充平面汉字");
  }
}

for (const name of REJECT_SCENARIOS) {
  const report = AnalysisResponseSchema.parse(
    JSON.parse(readFileSync(join(OUT_DIR, `${name}.json`), "utf8")),
  );
  const semantics = checkSemantics(report);
  if (semantics.linesMatchTokens) {
    problems.push(`${name}: 应当保留行文本与字位错位，但它已经自洽了`);
  }
  if (!semantics.slicesMatch) {
    problems.push(`${name}: token 切片本身也坏了，无法只测「行文本错位」`);
  }
}

if (problems.length > 0) {
  console.error("fixture 语义自检失败：");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `fixture 语义自检通过：${LEGAL_SCENARIOS.length} 个合法场景 + ${REJECT_SCENARIOS.length} 个拒绝场景`,
);

writeFileSync(
  join(OUT_DIR, "README.md"),
  [
    "# 开发场景 fixture（D1）",
    "",
    "本目录由 `node fixtures/mocks/generate.ts` 生成，全部通过",
    "`AnalysisResponseSchema` 校验。",
    "",
    "| 文件 | summary.status | 用途 |",
    "| --- | --- | --- |",
    "| pass.json | pass | D-D1-01 合法五状态之一 |",
    "| fail.json | fail | 明确违规场景 |",
    "| needs_review.json | needs_review | 含 `ambiguous` 读音 |",
    "| not_applicable.json | not_applicable | 古体，不适用近体规则 |",
    "| unsupported.json | unsupported | 未支持形式，不得显示通过 |",
    "| mismatch.json | pass | Schema 合法但行文本与字位错位，前端必须拒绝 |",
    "| supplementary.json | pass | 含补充平面汉字（`𠀀`）的合法报告，按码点计字位 |",
    "",
    "所有正文均为 `平/仄` 字面量构造的合成文本，**不是**真实名篇，",
    "不得挂《登鹳雀楼》《静夜思》《黄鹤楼》的名字，也不得进入生产分析路径。",
    "",
    "重新生成：`node fixtures/mocks/generate.ts`（需要 Node 24）。",
    "",
  ].join("\n"),
  "utf8",
);
console.log("wrote fixtures/mocks/README.md");
