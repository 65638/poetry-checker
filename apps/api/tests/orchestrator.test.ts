import { describe, expect, it } from "vitest";
import type { AnalyzeRequest } from "@poetry/contracts";
import { loadResources } from "../src/resources.js";
import { analyze } from "../src/orchestrator.js";

const POEM = "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。";
const req = (
  text = POEM,
  rhymeBook: AnalyzeRequest["rhymeBook"] = "pingshui",
): AnalyzeRequest => ({
  text,
  rhymeBook,
  genreHint: "auto",
  formHint: "auto",
  ruleSet: "teaching-v1",
  readingOverrides: [],
});

describe("真实编排（参考分析，不阻断未审候选）", () => {
  it("登鹳雀楼的全部有效候选证据齐备，真实编排返回合律", async () => {
    const r = await analyze(req(), loadResources());
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.response.summary.status).toBe("pass");
    expect(r.response.prosody.selectedTemplateId).toBe("wujue-ze-unrhymed");
    expect(r.response.prosody.rhyme.status).toBe("pass");
  });

  it("未审竞争候选保留，固定句语境不泛化到单字", async () => {
    const r = await analyze(req("里"), loadResources());
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const token = r.response.poem.tokens[0]!;
    expect(token.selectionMethod).toBe("unresolved");
    expect(token.effectiveCandidateIds).toHaveLength(token.candidates.length);
    expect(
      r.response.provenance.evidence.some(
        (item) => item.reviewStatus === "unverified",
      ),
    ).toBe(true);
  });

  it("同一输入两次分析逐字节稳定", async () => {
    const resources = loadResources();
    const a = await analyze(req(), resources);
    const b = await analyze(req(), resources);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("词林未审范围可分析，保留参考提示和原审核状态", async () => {
    const r = await analyze(req(POEM, "cilin"), loadResources());
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.response.policy.notice).toContain("参考分析");
      expect(
        r.response.provenance.evidence.some(
          (item) => item.reviewStatus === "unverified",
        ),
      ).toBe(true);
    }
  });
});
