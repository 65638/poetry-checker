import { afterAll, describe, expect, it } from "vitest";
import { AnalysisResponseSchema } from "@poetry/contracts";
import { buildApp } from "../../apps/api/src/server.js";
import { buildSummaryText } from "../../apps/web/src/features/export.js";
import { buildProsodyContext } from "../../apps/web/src/features/critique.js";

// User-supplied regression input, not reviewed genre metadata or a gold poem.
const text =
  "珠水云山毓秀长，甲工星火启南疆。\n博学慎思穷奥理，明辨笃行铸栋梁。\n红砖绿瓦藏经纬，铁骨钢筋写慨慷。\n三区并峙开新局，工科翘楚耀湾区。";
const app = buildApp({ readingAssistant: { apiKey: "" } });
afterAll(() => app.close());

async function analyze(rhymeBook: "pingshui" | "xinyun", genreHint = "auto") {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/analyze",
    payload: {
      text,
      rhymeBook,
      genreHint,
      formHint: "auto",
      ruleSet: "teaching-v1",
      readingOverrides: [],
    },
  });
  expect(response.statusCode).toBe(200);
  return AnalysisResponseSchema.parse(response.json());
}

describe("rhyme system and applicability survive analysis, export, and AI context", () => {
  it.each([
    ["xinyun", "P", "mandarin_base"],
    ["pingshui", "Z", "historical"],
  ] as const)(
    "%s uses the book's actual tone for 局 and does not invent certainty about genre",
    async (book, tone, basis) => {
      const report = await analyze(book);
      expect(report.policy.toneBasis).toBe(basis);
      expect(
        report.poem.tokens.find((t) => t.tokenId === "l7c7"),
      ).toMatchObject({ text: "局", tone });
      expect(report.genre.applicability).toBe("uncertain");
      expect(report.summary.status).toBe("needs_review");
      const tail = report.prosody.checks.filter(
        (c) =>
          c.ruleId === "TAIL.SANPING" && c.locations.some((l) => l.line === 7),
      );
      expect(tail.some((c) => c.status === "fail")).toBe(book === "xinyun");
      const summary = buildSummaryText({ report, request: {}, overrides: [] });
      expect(summary).toContain("条件比较");
      expect(summary).not.toContain("应为仄，实际为平");
      const context = buildProsodyContext(report)!;
      expect(context).toMatchObject({
        rhymeBook: book,
        toneBasis: basis,
        applicability: "uncertain",
      });
      if (book === "xinyun") {
        expect(summary).toContain("参考句式要求仄；按中华新韵，此字读作平声");
        expect(
          context.issues.find(
            (c) =>
              c.ruleId === "METER.POSITION" &&
              c.locations.some((l) => l.tokenId === "l7c7"),
          ),
        ).toMatchObject({ expected: ["Z"], observed: ["P"] });
      }
    },
  );
  it("explicit ancient form does not inherit regulated verse faults", async () => {
    const report = await analyze("xinyun", "ancient");
    expect(report.genre.applicability).toBe("not_applicable");
    expect(report.summary.status).toBe("not_applicable");
    expect(buildProsodyContext(report)?.applicability).toBe("not_applicable");
  });
});
