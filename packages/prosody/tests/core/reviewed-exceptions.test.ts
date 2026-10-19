import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AnalysisResponseSchema,
  type AnalysisResponse,
  type BookId,
  type Finding,
} from "@poetry/contracts";
import { fingerprintText } from "../../../genre/src/fingerprint.js";
import { analyze } from "../../../../apps/api/src/orchestrator.js";
import { loadResources } from "../../../../apps/api/src/resources.js";
import {
  evaluateProsodyCore,
  matchTemplatesCore,
} from "../../src/core/index.js";
import { checkReportClosure } from "../../src/report/closure.js";
import {
  applyReviewedWorkExceptions,
  parseReviewedWorkExceptions,
  ReviewedWorkExceptionError,
  type ApplyReviewedWorkExceptionsInput,
} from "../../src/reviewed-exceptions/index.js";
import { makeCodePoem, overrideToken } from "../acceptance/fixtures.js";

// 正例正文/裁定来自既有第 13 号第 8 条；以下期望手写，不由被测输出生成。
// 真实 API 供数，重新调用通用核心取原报告；API 将来接入本层后本测试仍检验核心→适用层。
const lines = [
  "昔人已乘黄鹤去",
  "此地空余黄鹤楼",
  "黄鹤一去不复返",
  "白云千载空悠悠",
  "晴川历历汉阳树",
  "芳草萋萋鹦鹉洲",
  "日暮乡关何处是",
  "烟波江上使人愁",
];
const body = lines.join("，");
const fingerprint =
  "7b65737ca79258301a2dd35cd880c41020415945c1ea006478eaf816edbf47a2";
const rawRecords: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../../../../rules/exceptions/reviewed-works-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const records = parseReviewedWorkExceptions(rawRecords);
const resources = loadResources();
let real: AnalysisResponse;
let baseline: ApplyReviewedWorkExceptionsInput;

async function realResponse(text: string): Promise<AnalysisResponse> {
  const result = await analyze(
    {
      text,
      rhymeBook: "pingshui",
      genreHint: "auto",
      formHint: "auto",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    },
    resources,
  );
  expect(
    result.kind,
    JSON.stringify(result.kind === "error" ? result.body : {}),
  ).toBe("ok");
  if (result.kind !== "ok") throw new Error("真实平水输入未通过供数门槛");
  return AnalysisResponseSchema.parse(result.response);
}

function inputFrom(
  response: AnalysisResponse,
): ApplyReviewedWorkExceptionsInput {
  return {
    poem: response.poem,
    textFingerprint: fingerprintText(response.poem.originalText),
    genre: response.genre,
    report: evaluateProsodyCore({
      poem: response.poem,
      candidates: response.prosody.candidates,
      selectedTemplateId: response.genre.selectedTemplateId,
      applicability: response.genre.applicability,
      ruleSet: "teaching-v1",
    }),
    works: resources.works,
    exceptions: records,
    evidence: response.provenance.evidence,
    sources: response.provenance.sources,
  };
}

function target(checks: Finding[]): Finding {
  const item = checks.find(
    (check) =>
      check.ruleId === "TAIL.SANPING" && check.locations[0]?.line === 4,
  );
  if (!item) throw new Error("缺少手写期望的 l4 三平尾诊断");
  return item;
}

function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

beforeAll(async () => {
  real = await realResponse(body);
  baseline = inputFrom(real);
});

describe("已审作品适用层：真实平水黄鹤楼", () => {
  it("常规核心保留三平尾事实；适用层只改变已批准字位，PPP 与其它常格差异保留", () => {
    const input = structuredClone(baseline);
    const before = structuredClone(input);
    freeze(input);
    expect(input.textFingerprint).toBe(fingerprint);
    expect(input.poem.inputHash).not.toBe(fingerprint);
    expect(target(input.report.checks)).toMatchObject({
      status: "fail",
      severity: "error",
      observed: ["P", "P", "P"],
    });
    const report = applyReviewedWorkExceptions(input);
    const finding = target(report.checks);
    expect(finding).toMatchObject({
      ruleId: "TAIL.SANPING",
      ruleVersion: "1",
      status: "not_applicable",
      severity: "info",
      observed: ["P", "P", "P"],
      expected: ["避免PPP"],
      resolvedBy: null,
      locations: [
        { tokenId: "l4c5", line: 4, column: 5 },
        { tokenId: "l4c6", line: 4, column: 6 },
        { tokenId: "l4c7", line: 4, column: 7 },
      ],
    });
    expect(finding.id).toBe(target(input.report.checks).id);
    expect(finding.message).toContain("本项不判出律");
    expect(finding.message).toContain("不是拗救");
    expect(finding.evidenceIds).toContain("ctx:j03b2:08");
    expect(report.checks.filter((check) => check.id !== finding.id)).toEqual(
      input.report.checks.filter((check) => check.id !== finding.id),
    );
    // 第四句第五字仍是对照常格的偏离，本批不扩张到 METER.POSITION。
    expect(
      report.checks.find(
        (check) =>
          check.ruleId === "METER.POSITION" &&
          check.locations[0]?.tokenId === "l4c5",
      ),
    ).toMatchObject({ status: "fail", observed: ["P"], expected: ["Z"] });
    expect(report.rhyme).toEqual(input.report.rhyme);
    expect(report.relations).toEqual(input.report.relations);
    expect(input).toEqual(before);
    expect(applyReviewedWorkExceptions(input)).toEqual(report);
    expect(applyReviewedWorkExceptions({ ...input, report })).toBe(report);
    expect(checkReportClosure(report, input.poem)).toEqual({
      ok: true,
      problems: [],
    });
    expect(
      AnalysisResponseSchema.safeParse({ ...real, prosody: report }).success,
    ).toBe(true);
    for (const check of report.checks)
      for (const id of check.evidenceIds) {
        const evidence = input.evidence.find((item) => item.id === id);
        expect(evidence, id).toBeDefined();
        expect(
          input.sources.some((source) => source.id === evidence!.sourceId),
          id,
        ).toBe(true);
      }
  });

  it.each([
    lines.join("\n"),
    lines.map((line, i) => `${line}${i % 2 ? "。" : "，"}`).join("\r\n"),
  ])("标点与换行变化不影响已审字序及定位：%s", async (text) => {
    const input = inputFrom(await realResponse(text));
    expect(input.textFingerprint).toBe(fingerprint);
    expect(target(applyReviewedWorkExceptions(input).checks).status).toBe(
      "not_applicable",
    );
  });

  it("标题/作者/历史标签不是匹配条件，变展示文字不改变已审正文身份", () => {
    const input = structuredClone(baseline);
    const work = input.works.find((item) => item.id === "work:huanghelou")!;
    work.title = "展示别名";
    work.author = null;
    work.historicalTags = [];
    input.genre.historicalTags = [];
    expect(target(applyReviewedWorkExceptions(input).checks).status).toBe(
      "not_applicable",
    );
  });
});

describe("授权范围负例：条件不满足时原报告完整保留", () => {
  const mutations: Array<
    [string, (input: ApplyReviewedWorkExceptionsInput) => void]
  > = [
    [
      "误传请求摘要",
      (i) => {
        i.textFingerprint = i.poem.inputHash;
      },
    ],
    [
      "正文改字且传正确新指纹",
      (i) => {
        i.poem.originalText = body.replace("昔", "古");
        i.textFingerprint = fingerprintText(i.poem.originalText);
      },
    ],
    [
      "正文改字却仍传旧指纹/标签",
      (i) => {
        i.poem.originalText = body.replace("昔", "古");
      },
    ],
    [
      "只传诗名不传正文",
      (i) => {
        i.poem.originalText = "黄鹤楼";
      },
    ],
    [
      "不支持的句子划分",
      (i) => {
        i.poem.lines = i.poem.lines.slice(0, 7);
      },
    ],
    [
      "位置文本不一致",
      (i) => {
        i.poem.tokens.find((t) => t.tokenId === "l4c5")!.text = "仄";
      },
    ],
    [
      "重复字位",
      (i) => {
        i.poem.lines[3]!.tokenIds[4] = "l4c6";
      },
    ],
    [
      "解析待核",
      (i) => {
        i.poem.quality = "needs_review";
      },
    ],
    [
      "仅启发式相似/相同标签",
      (i) => {
        i.genre.basisType = "heuristic";
      },
    ],
    [
      "用户指定体裁",
      (i) => {
        i.genre.basisType = "user";
      },
    ],
    [
      "古体模式",
      (i) => {
        i.genre.applicability = "not_applicable";
      },
    ],
    [
      "模板未定",
      (i) => {
        i.report.selectedTemplateId = null;
      },
    ],
    [
      "形式不同",
      (i) => {
        i.genre.formId = "wulv";
      },
    ],
    [
      "作品未审",
      (i) => {
        i.works.find((w) => w.id === "work:huanghelou")!.reviewStatus =
          "unverified";
      },
    ],
    [
      "同名作品 ID 不同",
      (i) => {
        i.works.find((w) => w.id === "work:huanghelou")!.id = "work:lookalike";
      },
    ],
    [
      "重复指纹作品",
      (i) => {
        i.works = [...i.works, { ...i.works[2]!, id: "work:duplicate" }];
      },
    ],
    [
      "作品依据与体裁不闭合",
      (i) => {
        i.genre.evidenceIds = [];
      },
    ],
    [
      "作品依据未审",
      (i) => {
        i.evidence.find(
          (e) => e.id === "ev:work:huanghelou:j03",
        )!.reviewStatus = "unverified";
      },
    ],
    [
      "例外未审",
      (i) => {
        i.exceptions[0]!.reviewStatus = "unverified";
      },
    ],
    [
      "缺少裁定证据",
      (i) => {
        i.evidence = i.evidence.filter((e) => e.id !== "ctx:j03b2:08");
      },
    ],
    [
      "裁定证据未审",
      (i) => {
        i.evidence.find((e) => e.id === "ctx:j03b2:08")!.reviewStatus =
          "unverified";
      },
    ],
    [
      "普通韵书证据不能代替作品裁定",
      (i) => {
        i.evidence.find((e) => e.id === "ctx:j03b2:08")!.kind = "rhyme_entry";
      },
    ],
    [
      "裁定定位被替换",
      (i) => {
        i.evidence.find((e) => e.id === "ctx:j03b2:08")!.locator = "另一条记录";
      },
    ],
    [
      "裁定来源不匹配",
      (i) => {
        i.evidence.find((e) => e.id === "ctx:j03b2:08")!.sourceId = "missing";
      },
    ],
    [
      "来源缺失",
      (i) => {
        i.sources = i.sources.filter((s) => s.id !== "src:j03-review-batch2");
      },
    ],
    [
      "重复证据 ID",
      (i) => {
        i.evidence = [
          ...i.evidence,
          i.evidence.find((e) => e.id === "ctx:j03b2:08")!,
        ];
      },
    ],
    [
      "用户改音即使仍为平",
      (i) => {
        i.poem.tokens.find((t) => t.tokenId === "l4c5")!.selectionMethod =
          "user";
      },
    ],
    [
      "有效候选存在平仄歧义",
      (i) => {
        i.poem = overrideToken(i.poem, "l4c5", {
          readings: [
            { tone: "P", groupIds: [] },
            { tone: "Z", groupIds: [] },
          ],
        });
      },
    ],
    [
      "无有效读音",
      (i) => {
        i.poem = overrideToken(i.poem, "l4c5", { readings: [] });
      },
    ],
    [
      "有效读音改为仄",
      (i) => {
        i.poem = overrideToken(i.poem, "l4c5", {
          readings: [{ tone: "Z", groupIds: [] }],
        });
      },
    ],
    [
      "不同规则版本",
      (i) => {
        target(i.report.checks).ruleVersion = "2";
      },
    ],
    [
      "尾式观测尚未确定",
      (i) => {
        target(i.report.checks).status = "uncertain";
      },
    ],
    [
      "诊断落在另一个字位",
      (i) => {
        target(i.report.checks).locations[0]!.column = 4;
      },
    ],
    [
      "同字不同位置不能借用第二句的空",
      (i) => {
        target(i.report.checks).locations[0]!.tokenId = "l2c3";
      },
    ],
  ];
  it.each(mutations)("%s", (_name, mutate) => {
    const input = structuredClone(baseline);
    mutate(input);
    const before = structuredClone(input);
    expect(applyReviewedWorkExceptions(input)).toBe(input.report);
    expect(input).toEqual(before);
  });

  it.each<BookId>(["cilin", "xinyun"])(
    "同诗在 %s 下不继承平水裁定（合成边界，不冒充已供数）",
    (book) => {
      const input = structuredClone(baseline);
      input.poem.book = book;
      input.poem.tokens.forEach((t) =>
        t.candidates.forEach((c) => {
          c.book = book;
        }),
      );
      expect(applyReviewedWorkExceptions(input)).toBe(input.report);
      expect(target(input.report.checks).severity).toBe("error");
    },
  );

  it.each([
    {
      name: "五绝",
      lines: ["ZZPPZ", "PPZZP", "PPPZZ", "ZZPPP"],
      template: "wujue-ze-unrhymed",
    },
    {
      name: "七律",
      lines: [
        "PPZZPPZ",
        "ZZPPZZP",
        "ZZPPPZZ",
        "PPZZPPP",
        "PPZZPPZ",
        "ZZPPZZP",
        "ZZPPPZZ",
        "PPZZZPP",
      ],
      template: "qilv-ping-unrhymed",
    },
  ])("普通$name三平尾仍为 fail/error（合成正反例）", (sample) => {
    const input = structuredClone(baseline);
    input.poem = makeCodePoem(sample.lines);
    input.textFingerprint = fingerprintText(input.poem.originalText);
    const candidates = matchTemplatesCore({
      poem: input.poem,
      formHint: "auto",
      ruleSet: "teaching-v1",
    });
    input.report = evaluateProsodyCore({
      poem: input.poem,
      candidates,
      selectedTemplateId: sample.template,
      applicability: "applicable",
      ruleSet: "teaching-v1",
    });
    expect(target(applyReviewedWorkExceptions(input).checks)).toMatchObject({
      status: "fail",
      severity: "error",
    });
  });
});

describe("特例配置严格解析", () => {
  it("既有裁定登记与作品指纹一致，原审稿仍可定位", () => {
    expect(records).toHaveLength(1);
    expect(fingerprintText(records[0]!.approvedLines.join(""))).toBe(
      records[0]!.textFingerprint,
    );
    const review = readFileSync(
      new URL(
        "../../../../docs/reviews/13_J03三首核心诗逐字人审_第二批.md",
        import.meta.url,
      ),
      "utf8",
    );
    expect(review).toContain("三平尾不得据近体正格判为出律");
  });

  it.each(
    [
      null,
      {},
      [null],
      [{ ...records[0], extra: true }],
      [{ ...records[0], book: "unknown" }],
      [{ ...records[0], version: "2" }],
      [{ ...records[0], ruleId: "METER.POSITION" }],
      [{ ...records[0], reviewStatus: "fixture" }],
      [{ ...records[0], approvedLines: ["空悠悠"] }],
      [
        {
          ...records[0],
          target: { line: 4, columns: [3, 4, 5], text: "千载空" },
        },
      ],
      [
        {
          ...records[0],
          target: { line: 4, columns: [5, 6, 7], text: "仄平平" },
        },
      ],
      [{ ...records[0], approval: { evidenceId: "ctx:j03b2:08" } }],
      [records[0], records[0]],
      [records[0], { ...records[0], id: "duplicate-scope" }],
    ].map((value) => [value]),
  )("坏配置抛明确错误，不静默空表：%j", (value) => {
    expect(() => parseReviewedWorkExceptions(value)).toThrow(
      ReviewedWorkExceptionError,
    );
  });
});
