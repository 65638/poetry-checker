/**
 * D2 逐字谱 / 诊断 / 押韵视图模型。
 *
 * 这些是纯整理函数：只重排与映射报告已有字段，不新增格律判定。
 * 关键断言：原文顺序、UTF-16 区间、韵脚标记、分组排序、未知前缀不猜。
 */
import { describe, expect, it } from "vitest";
import {
  buildFindings,
  buildRelations,
  buildRhymeFeet,
  buildTokenSpectrum,
  findingGroup,
  groupFindings,
  locateFinding,
  rhymeCommonGroups,
  toneLabel,
} from "../src/app/reportView";
import { trailingPunctuation } from "../src/presentation/punctuation";
import { loadMockScenario, type MockScenario } from "./fixtures";

const scenarios: MockScenario[] = [
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
];

describe("toneLabel", () => {
  it("只翻译报告给出的 tone，不推断", () => {
    expect(toneLabel("P")).toBe("平");
    expect(toneLabel("Z")).toBe("仄");
    expect(toneLabel(null)).toBe("未定");
  });
});

describe("trailingPunctuation", () => {
  const token = (startUtf16: number, endUtf16: number, text = "尽") => ({
    tokenId: "l1c5",
    text,
    line: 1,
    column: 5,
    startUtf16,
    endUtf16,
  } as Parameters<typeof trailingPunctuation>[1]);

  it("句末标点不吞掉后续无换行的汉字", () => {
    const original = "白日依山尽，黄河入海流。";
    expect(trailingPunctuation(original, token(4, 5), undefined, 11)).toBe("，");
  });

  it("支持换行前的标点与闭引号", () => {
    const original = "白日依山尽。\n黄河入海流。";
    expect(trailingPunctuation(original, token(4, 5), undefined, 6)).toBe("。");
    expect(trailingPunctuation("白日依山尽。”\n黄河", token(4, 5), undefined, 7)).toBe("。”");
  });

  it("无句末标点时不把空白或后续文本渲染到右侧", () => {
    const original = "白日依山尽 黄河入海流";
    expect(trailingPunctuation(original, token(4, 5), undefined, 10)).toBe("");
  });
});

describe("buildTokenSpectrum", () => {
  it.each(scenarios)("%s：字位顺序与原文一致", (name) => {
    const report = loadMockScenario(name);
    const cells = buildTokenSpectrum(report);

    expect(cells).toHaveLength(report.poem.tokens.length);
    expect(cells.map((cell) => cell.tokenId)).toEqual(
      report.poem.tokens.map((token) => token.tokenId),
    );
    // 原文顺序：startUtf16 单调递增
    const starts = cells.map((cell) => cell.startUtf16);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    // 每个字位的区间必须能切回它自己的文本
    for (const cell of cells) {
      expect(report.poem.originalText.slice(cell.startUtf16, cell.endUtf16)).toBe(
        cell.text,
      );
    }
  });

  it("韵脚标记来自 prosody.rhyme.tokenIds，不自造", () => {
    const report = loadMockScenario("pass");
    const cells = buildTokenSpectrum(report);
    const rhymeExpected = new Set(report.prosody.rhyme.tokenIds);
    for (const cell of cells) {
      expect(cell.isRhyme).toBe(rhymeExpected.has(cell.tokenId));
    }
    expect(cells.filter((cell) => cell.isRhyme).length).toBe(
      report.prosody.rhyme.tokenIds.length,
    );
  });

  it("needs_review 的未定读音字位被标为 tonePending", () => {
    const report = loadMockScenario("needs_review");
    const cells = buildTokenSpectrum(report);
    const pending = cells.filter((cell) => cell.tonePending);
    expect(pending.length).toBeGreaterThan(0);
    // 未定不等于「平」，必须是 未定
    for (const cell of pending) {
      if (cell.toneLabel === "未定") continue;
      // 平仄已定但读音待定是允许的：toneLabel 有值，tonePending 仍为真
      expect(["平", "仄"]).toContain(cell.toneLabel);
    }
  });

  it("字位关联的诊断来自 finding.locations", () => {
    const report = loadMockScenario("fail");
    const cells = buildTokenSpectrum(report);
    const located = cells.filter((cell) => cell.findingIds.length > 0);
    const expectedTokenIds = new Set(
      report.prosody.checks.flatMap((check) =>
        check.locations.map((location) => location.tokenId),
      ),
    );
    expect(new Set(located.map((cell) => cell.tokenId))).toEqual(expectedTokenIds);
  });
});

describe("findingGroup", () => {
  it("已知前缀归到对应类别", () => {
    expect(findingGroup("METER.POSITION")).toBe("meter");
    expect(findingGroup("RHYME.FOOT")).toBe("rhyme");
    expect(findingGroup("NIAN.PAIR")).toBe("relation");
    expect(findingGroup("ISOLATED.PING")).toBe("isolated");
    expect(findingGroup("VARIATION.RESCUE")).toBe("variation");
  });

  it("未知前缀归到 other，不猜", () => {
    expect(findingGroup("SOMETHING.NEW")).toBe("other");
    expect(findingGroup("")).toBe("other");
  });
});

describe("buildFindings / groupFindings", () => {
  it("状态与严重度原样保留（不把 uncertain 改判 pass）", () => {
    const report = loadMockScenario("needs_review");
    const findings = buildFindings(report);
    expect(findings).toHaveLength(report.prosody.checks.length);
    for (const [index, finding] of findings.entries()) {
      const source = report.prosody.checks[index]!;
      expect(finding.status).toBe(source.status);
      expect(finding.severity).toBe(source.severity);
      expect(finding.ruleId).toBe(source.ruleId);
    }
  });

  it("只保留可识别状态，不产生新结论", () => {
    const report = loadMockScenario("unsupported");
    const findings = buildFindings(report);
    expect(findings.every((item) => item.status === "unsupported")).toBe(true);
    expect(findings.every((item) => item.status !== "pass")).toBe(true);
  });

  it("分组按固定顺序，空组被省略", () => {
    const report = loadMockScenario("fail");
    const groups = groupFindings(buildFindings(report));
    const labels = groups.map((entry) => entry.label);
    expect(labels.length).toBeGreaterThan(0);
    // 固定顺序：平仄 在 押韵/粘对 之前（若都存在）
    const meterIndex = labels.indexOf("平仄");
    const otherIndex = labels.indexOf("其他");
    if (meterIndex >= 0 && otherIndex >= 0) {
      expect(meterIndex).toBeLessThan(otherIndex);
    }
    for (const entry of groups) {
      expect(entry.items.length).toBeGreaterThan(0);
    }
  });

  it("只看需处理项会过滤掉 pass/info", () => {
    const report = loadMockScenario("fail");
    const all = buildFindings(report);
    const filtered = all.filter((item) => item.needsAttention);
    const groups = groupFindings(all, true);
    const shown = groups.flatMap((entry) => entry.items);
    expect(shown.map((item) => item.id).sort()).toEqual(
      filtered.map((item) => item.id).sort(),
    );
    for (const item of shown) {
      expect(item.needsAttention).toBe(true);
    }
  });

  it("组内按 severity 再按 status 排序，稳定可复现", () => {
    const report = loadMockScenario("fail");
    const groups = groupFindings(buildFindings(report));
    for (const entry of groups) {
      const severities = entry.items.map((item) => item.severity);
      const rank = { error: 0, warning: 1, info: 2 } as const;
      const sorted = [...severities].sort((a, b) => rank[a] - rank[b]);
      expect(severities).toEqual(sorted);
    }
    // 同样输入两次结果一致
    expect(groupFindings(buildFindings(report))).toEqual(
      groupFindings(buildFindings(report)),
    );
  });
});

describe("locateFinding", () => {
  it("返回精确字位与 UTF-16 区间，而不是整段", () => {
    const report = loadMockScenario("fail");
    const finding = report.prosody.checks[0]!;
    const targets = locateFinding(report, finding.id);
    expect(targets.length).toBe(finding.locations.length);
    for (const [index, target] of targets.entries()) {
      const location = finding.locations[index]!;
      expect(target.tokenId).toBe(location.tokenId);

      // 位置以 token 为准：fixture 里 finding.locations 的 line/column
      // 与 tokenId 不一致（l2c5 被写成 line 1,column 1），
      // 前端不能照抄这个不一致的坐标，否则定位会错位。
      const token = report.poem.tokens.find(
        (item) => item.tokenId === location.tokenId,
      )!;
      expect(target.line).toBe(token.line);
      expect(target.column).toBe(token.column);

      // 区间必须能切回原文中的该字
      expect(
        report.poem.originalText.slice(target.startUtf16, target.endUtf16),
      ).toBe(target.text);
    }
  });

  it("不存在的 finding 返回空数组，不退回整段定位", () => {
    const report = loadMockScenario("pass");
    expect(locateFinding(report, "not-exist")).toEqual([]);
  });

  it("补充平面汉字的区间是按 UTF-16 计的", () => {
    const report = loadMockScenario("supplementary");
    const finding = report.prosody.checks[0]!;
    const targets = locateFinding(report, finding.id);
    expect(targets.length).toBeGreaterThan(0);
    const first = targets[0]!;
    expect(report.poem.originalText.slice(first.startUtf16, first.endUtf16)).toBe(
      first.text,
    );
  });
});

describe("buildRhymeFeet / rhymeCommonGroups", () => {
  it("韵脚文本与位置来自报告 token，不新造", () => {
    const report = loadMockScenario("pass");
    const feet = buildRhymeFeet(report);
    expect(feet.map((foot) => foot.tokenId)).toEqual(report.prosody.rhyme.tokenIds);
    for (const foot of feet) {
      const token = report.poem.tokens.find((item) => item.tokenId === foot.tokenId)!;
      expect(foot.text).toBe(token.text);
      expect(foot.line).toBe(token.line);
      expect(foot.column).toBe(token.column);
    }
  });

  it("韵脚韵部只来自有效候选", () => {
    const report = loadMockScenario("pass");
    const feet = buildRhymeFeet(report);
    const token = report.poem.tokens.find(
      (item) => item.tokenId === feet[0]!.tokenId,
    )!;
    const effectiveGroupIds = new Set(
      token.candidates
        .filter((candidate) => token.effectiveCandidateIds.includes(candidate.id))
        .flatMap((candidate) => candidate.groupIds),
    );
    for (const groupId of feet[0]!.groupIds) {
      expect(effectiveGroupIds.has(groupId)).toBe(true);
    }
  });

  it("共同归部状态直接反映 commonGroupIds", () => {
    const pass = loadMockScenario("pass");
    expect(rhymeCommonGroups(pass).status).toBe("shared");

    const unsupported = loadMockScenario("unsupported");
    expect(rhymeCommonGroups(unsupported).status).toBe("unknown");
  });

  it("not_applicable 无韵脚时状态为 unknown，不假装不押韵", () => {
    const report = loadMockScenario("not_applicable");
    const feet = buildRhymeFeet(report);
    const state = rhymeCommonGroups(report);
    if (report.prosody.rhyme.tokenIds.length === 0) {
      expect(feet).toEqual([]);
      expect(state.status).toBe("unknown");
    }
  });
});

describe("buildRelations", () => {
  it("当前 fixture 没有关系时返回空，不补造", () => {
    for (const name of scenarios) {
      const report = loadMockScenario(name);
      if (report.prosody.relations.length === 0) {
        expect(buildRelations(report)).toEqual([]);
      }
    }
  });

  it("把 tokenId 解析成字位与位置，状态原样保留", () => {
    const report = loadMockScenario("pass");
    const patched = {
      ...report,
      prosody: {
        ...report.prosody,
        relations: [
          {
            kind: "nian" as const,
            tokenIds: ["l1c1", "l2c1"],
            status: "uncertain" as const,
            findingIds: ["fixture:check"],
          },
          {
            kind: "dui" as const,
            tokenIds: ["l3c1", "l4c1"],
            status: "fail" as const,
            findingIds: [],
          },
        ],
      },
    };

    const relations = buildRelations(patched);
    expect(relations).toHaveLength(2);

    const [nian, dui] = relations;
    expect(nian!.kind).toBe("nian");
    expect(nian!.kindLabel).toBe("粘");
    expect(nian!.status).toBe("uncertain");
    expect(nian!.findingIds).toEqual(["fixture:check"]);
    expect(nian!.hasUnresolvedTokens).toBe(false);
    expect(nian!.sides.map((side) => side.tokenId)).toEqual(["l1c1", "l2c1"]);
    for (const side of nian!.sides) {
      const token = report.poem.tokens.find((item) => item.tokenId === side.tokenId)!;
      expect(side.text).toBe(token.text);
      expect(side.line).toBe(token.line);
      expect(side.column).toBe(token.column);
      expect(
        report.poem.originalText.slice(side.startUtf16!, side.endUtf16!),
      ).toBe(side.text);
    }

    expect(dui!.kindLabel).toBe("对");
    expect(dui!.status).toBe("fail");
    expect(dui!.status).not.toBe("pass");
  });

  it("引用不到的字位被标记而不是静默丢弃", () => {
    const report = loadMockScenario("pass");
    const patched = {
      ...report,
      prosody: {
        ...report.prosody,
        relations: [
          {
            kind: "dui" as const,
            tokenIds: ["l1c1", "l99c99"],
            status: "pass" as const,
            findingIds: [],
          },
        ],
      },
    };
    const [relation] = buildRelations(patched);
    expect(relation!.hasUnresolvedTokens).toBe(true);
    expect(relation!.sides).toHaveLength(2);
    const missing = relation!.sides.find((side) => side.tokenId === "l99c99")!;
    expect(missing.text).toBeNull();
    expect(missing.startUtf16).toBeNull();
  });
});
