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

describe("真实编排（部分候选已审，全库仍未发布）", () => {
  it("登鹳雀楼的全部有效候选证据齐备，真实编排返回合律", async () => {
    const r = await analyze(req(), loadResources());
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.response.summary.status).toBe("pass");
    expect(r.response.prosody.selectedTemplateId).toBe("wujue-ze-unrhymed");
    expect(r.response.prosody.rhyme.status).toBe("pass");
  });

  it("未审竞争候选仍被拦截；固定句语境不得泛化到单字", async () => {
    const r = await analyze(req("里"), loadResources());
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("DATA_NOT_READY");
    expect(r.body.error.message).toContain("LOOKUP_EVIDENCE_UNVERIFIED");
    // 定位信息透出到 fieldErrors，可追溯字位
    expect(JSON.stringify(r.body.error.fieldErrors)).toContain("tokenId");
  });

  it("同一输入两次分析逐字节稳定", async () => {
    const resources = loadResources();
    const a = await analyze(req(), resources);
    const b = await analyze(req(), resources);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("词林全量已装载：未审批范围仍在证据门槛返回 503", async () => {
    const r = await analyze(req(POEM, "cilin"), loadResources());
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe("DATA_NOT_READY");
    }
  });
});
