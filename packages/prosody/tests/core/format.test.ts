import { describe, expect, it } from "vitest";
import {
  ProsodyReportSchema,
  type AnnotatedPoem,
  type Tone,
} from "@poetry/contracts";
import {
  evaluateProsodyCore,
  matchTemplatesCore,
} from "../../src/core/index.js";
import { checkReportClosure } from "../../src/report/closure.js";
import { makeAnnotatedPoem, overrideToken } from "../acceptance/fixtures.js";

// Independent synthetic spectra, not historical readings or generated template expectations.
const five = ["ZZPPZ", "PPZZP", "PPPZZ", "ZZZPP"];
function poemOf(patterns = five) {
  return makeAnnotatedPoem(
    patterns.map((line) =>
      [...line].map((tone) => ({
        text: tone === "P" ? "平" : "仄",
        tones: [tone as Tone],
      })),
    ),
  );
}
function analyze(poem: AnnotatedPoem) {
  return ProsodyReportSchema.parse(
    evaluateProsodyCore({
      poem,
      candidates: matchTemplatesCore({
        poem,
        formHint: "auto",
        ruleSet: "teaching-v1",
      }),
      selectedTemplateId: null,
      applicability: "uncertain",
      ruleSet: "teaching-v1",
    }),
  );
}
function readings(
  poem: AnnotatedPoem,
  tokenId: string,
  rows: Array<{ tone: Tone | null; groupIds: string[] }>,
) {
  return overrideToken(poem, tokenId, { readings: rows });
}

describe("independent form identification", () => {
  it("uses the second character, reports shape rather than asserting regulated genre", () => {
    const poem = poemOf(["PZPPZ", ...five.slice(1)]);
    const before = structuredClone(poem);
    const report = analyze(poem);
    expect(report.format?.start.value).toBe("ze");
    expect(report.format?.start.tokenId).toBe("l1c2");
    expect(report.format?.shape.description).toContain("形制不等于已确认体裁");
    expect(report.selectedTemplateId).toBeNull();
    expect(poem).toEqual(before);
  });

  it("settles start for multiple effective readings with the same tone", () => {
    const poem = readings(poemOf(), "l1c2", [
      { tone: "P", groupIds: ["one"] },
      { tone: "P", groupIds: ["two"] },
    ]);
    expect(poem.tokens[1]!.readingStatus).toBe("ambiguous");
    expect(analyze(poem).format?.start.value).toBe("ping");
  });

  it("does not settle start with mixed tones or a missing candidate tone", () => {
    for (const tone of ["Z", null] as const) {
      const poem = readings(poemOf(), "l1c2", [
        { tone: "P", groupIds: ["one"] },
        { tone, groupIds: ["two"] },
      ]);
      expect(analyze(poem).format?.start.value).toBeNull();
    }
  });

  it("warns when the body supports the opposite start without replacing the observed tone", () => {
    const poem = poemOf(["ZPPPZ", ...five.slice(1)]);
    const before = structuredClone(poem);
    const report = analyze(poem);
    expect(report.format?.start.value).toBe("ping");
    expect(report.format?.start.alternative).toBe("ze");
    expect(report.format?.start.alternativeReason).toContain("核对首句第二字");
    expect(report.candidates).toHaveLength(4);
    expect(report.conditionalChecks).toHaveLength(4);
    expect(poem).toEqual(before);
  });

  it("does not call a different first rhyme an unrhymed intended format", () => {
    const poem = readings(poemOf(), "l1c5", [
      { tone: "P", groupIds: ["other-rhyme"] },
    ]);
    const rhyme = analyze(poem).format!.firstLineRhyme;
    expect(rhyme.evenLineStatus).toBe("shared");
    expect(rhyme.observed).toBe("different");
    expect(rhyme.value).toBe("uncertain");
    expect(rhyme.reason).toContain("出韵或涉及首句借韵");
  });

  it("distinguishes guaranteed shared rhyme from a merely possible shared rhyme", () => {
    const shared = readings(poemOf(), "l1c5", [
      { tone: "P", groupIds: ["synthetic:group:P"] },
    ]);
    expect(analyze(shared).format?.firstLineRhyme.value).toBe("rhymed");
    const ambiguous = readings(shared, "l1c5", [
      { tone: "P", groupIds: ["synthetic:group:P"] },
      { tone: "P", groupIds: ["other-rhyme"] },
    ]);
    expect(analyze(ambiguous).format?.firstLineRhyme.value).toBe("uncertain");
    expect(analyze(ambiguous).format?.firstLineRhyme.observed).toBe("unknown");
  });

  it("checks even lines first and leaves missing groups or conflicting even feet unresolved", () => {
    const shared = readings(poemOf(), "l1c5", [
      { tone: "P", groupIds: ["synthetic:group:P"] },
    ]);
    const different = readings(shared, "l4c5", [
      { tone: "P", groupIds: ["other-rhyme"] },
    ]);
    expect(analyze(different).format?.firstLineRhyme.evenLineStatus).toBe(
      "different",
    );
    expect(analyze(different).format?.firstLineRhyme.value).toBe("uncertain");
    const missing = readings(shared, "l4c5", [{ tone: "P", groupIds: [] }]);
    expect(analyze(missing).format?.firstLineRhyme.evenLineStatus).toBe(
      "unknown",
    );
    expect(analyze(missing).format?.firstLineRhyme.value).toBe("uncertain");
  });

  it("describes a ze-ending first line as an unrhymed basic-form reference", () => {
    const rhyme = analyze(poemOf()).format!.firstLineRhyme;
    expect(rhyme.value).toBe("unrhymed");
    expect(rhyme.reason).toContain("不据此认定作者意图");
  });

  it("explains resolved ze-ending even feet as a rule-scope limit, not missing readings", () => {
    const report = analyze(poemOf(["PPZZP", "ZPPZZ", "ZZPPP", "PPPPZ"]));
    expect(report.format?.firstLineRhyme.value).toBe("uncertain");
    expect(report.format?.firstLineRhyme.reason).toContain("均为仄声");
    expect(report.format?.firstLineRhyme.reason).not.toContain(
      "读音或共同韵部尚未确定",
    );
  });

  it("keeps template-specific failures separate, with complete rescue and position references", () => {
    const poem = poemOf();
    const report = analyze(poem);
    expect(checkReportClosure(report, poem)).toEqual({
      ok: true,
      problems: [],
    });
    const ze = report.conditionalChecks!.find(
      (block) => block.templateId === "wujue-ze-unrhymed",
    )!;
    const ping = report.conditionalChecks!.find(
      (block) => block.templateId === "wujue-ping-unrhymed",
    )!;
    expect(
      ze.checks.some((c) => c.status === "fail" && c.resolvedBy === null),
    ).toBe(false);
    expect(
      ping.checks.some(
        (c) =>
          ping.conditionalFindingIds.includes(c.id) &&
          c.status === "fail" &&
          c.resolvedBy === null,
      ),
    ).toBe(true);
    expect(report.checks.some((c) => c.id.includes("wujue-ping"))).toBe(false);
    for (const block of report.conditionalChecks!) {
      expect(
        block.conditionalFindingIds.every((id) =>
          block.checks.some((c) => c.id === id),
        ),
      ).toBe(true);
    }
  });
});
