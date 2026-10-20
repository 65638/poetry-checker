import { afterAll, describe, expect, it } from "vitest";
import { AnalysisResponseSchema } from "@poetry/contracts";
import { checkReportClosure } from "@poetry/prosody";
import { buildApp } from "../src/server.js";

// 独立手写期望，来自已裁正文/体裁及既定教学口径；不从待测输出生成预期。
const cases = [
  {
    title: "登鹳雀楼",
    text: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
    status: "pass",
    form: "wujue",
    template: "wujue-ze-unrhymed",
    count: 20,
  },
  {
    title: "静夜思",
    text: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
    status: "not_applicable",
    form: null,
    template: null,
    count: 20,
  },
  {
    title: "黄鹤楼",
    text: "昔人已乘黄鹤去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。",
    status: "fail",
    form: "qilv",
    template: "qilv-ping-unrhymed",
    count: 56,
  },
] as const;

const app = buildApp();
afterAll(async () => {
  await app.close();
});

describe("三首核心诗真实 API（无 fixture）", () => {
  it.each(cases)(
    "$title：体裁、模板、押韵和可定位依据保持独立预期",
    async (entry) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload: {
          text: entry.text,
          rhymeBook: "pingshui",
          genreHint: "auto",
          formHint: "auto",
          ruleSet: "teaching-v1",
          readingOverrides: [],
        },
      });
      expect(response.statusCode).toBe(200);
      const report = AnalysisResponseSchema.parse(response.json());
      expect(report.summary.status).toBe(entry.status);
      expect(report.genre.formId).toBe(entry.form);
      expect(report.genre.basisType).toBe("reviewed_metadata");
      expect(report.prosody.selectedTemplateId).toBe(entry.template);
      expect(report.poem.tokens).toHaveLength(entry.count);
      expect(
        report.poem.tokens.every((token) => token.toneStatus === "resolved"),
      ).toBe(true);
      expect(checkReportClosure(report.prosody, report.poem)).toEqual({
        ok: true,
        problems: [],
      });

      const evidence = new Map(
        report.provenance.evidence.map((item) => [item.id, item]),
      );
      const sourceIds = new Set(
        report.provenance.sources.map((item) => item.id),
      );
      const ruleIds = new Set(report.provenance.rules.map((item) => item.id));
      for (const item of evidence.values())
        expect(sourceIds.has(item.sourceId), item.id).toBe(true);
      for (const item of [
        ...report.poem.tokens,
        ...report.prosody.checks,
        ...report.provenance.rules,
        report.genre,
      ]) {
        for (const id of item.evidenceIds)
          expect(evidence.has(id), id).toBe(true);
      }
      for (const check of report.prosody.checks) {
        expect(ruleIds.has(check.ruleId), check.ruleId).toBe(true);
        if (check.resolvedBy !== null)
          expect(ruleIds.has(check.resolvedBy)).toBe(true);
      }
      if (entry.title === "静夜思") {
        expect(report.genre.applicability).toBe("not_applicable");
        expect(
          report.prosody.checks.some((check) => check.status === "fail"),
        ).toBe(false);
      } else {
        expect(report.genre.applicability).toBe("applicable");
        expect(report.prosody.rhyme.status).toBe("pass");
        expect(report.prosody.rhyme.commonGroupIds).toEqual([
          "group:pingshui:下平:十一尤",
        ]);
      }
      if (entry.title === "登鹳雀楼") {
        const li = report.poem.tokens.find(
          (token) => token.tokenId === "l3c4",
        )!;
        expect(li.text).toBe("里");
        expect(li.selectionMethod).toBe("context_rule");
        expect(li.selectedReadingId).toBe("pingshui:里:shang:四纸");
        expect(li.evidenceIds).toContain("ctx:d2-closeout:qianli");
        const competitor = li.candidates.find(
          (candidate) => candidate.id === "pingshui:里:qu:四寘",
        )!;
        expect(competitor).toBeDefined();
        expect(
          competitor.evidenceIds.every(
            (id) => evidence.get(id)?.reviewStatus === "unverified",
          ),
        ).toBe(true);
        // 同为仄声不能冒称唯一读音：上/去声歧义仍显示。
        const shang = report.poem.tokens.find(
          (token) => token.tokenId === "l4c2",
        )!;
        expect(shang.readingStatus).toBe("ambiguous");
        expect(shang.tone).toBe("Z");
      }
      if (entry.title === "黄鹤楼") {
        expect(report.genre.historicalTags).toContain("特殊拗律");
        const deviations = report.prosody.checks.filter(
          (check) =>
            check.status === "fail" && check.ruleId === "METER.POSITION",
        );
        expect(deviations.length).toBeGreaterThan(0);
        expect(deviations.every((check) => check.locations.length > 0)).toBe(
          true,
        );
      }
    },
  );

  it.each(["千里", "表里", "里外", "欲穷千里山"])(
    "语境不得扩张到未批准短语：%s",
    async (text) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload: {
          text,
          rhymeBook: "pingshui",
          genreHint: "auto",
          formHint: "auto",
          ruleSet: "teaching-v1",
          readingOverrides: [],
        },
      });
      expect(response.statusCode).toBe(200);
      const token = response
        .json()
        .poem.tokens.find((item: { text: string }) => item.text === "里");
      expect(token.selectionMethod).toBe("unresolved");
      expect(token.effectiveCandidateIds).toHaveLength(token.candidates.length);
    },
  );
});
