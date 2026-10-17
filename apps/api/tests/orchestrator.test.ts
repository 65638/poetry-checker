import { describe, expect, it } from "vitest";
import type { AnalyzeRequest } from "@poetry/contracts";
import { loadResources } from "../src/resources.js";
import { analyze } from "../src/orchestrator.js";

const POEM = "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。";
const req = (text = POEM, rhymeBook: AnalyzeRequest["rhymeBook"] = "pingshui"): AnalyzeRequest => ({
  text, rhymeBook, genreHint: "auto", formHint: "auto", ruleSet: "teaching-v1", readingOverrides: [],
});

describe("真实编排（A 三库全量快照，均未审核）", () => {
  it("解析→查字→消歧链路真实执行；未审核证据被 B 门槛拦截为 503 DATA_NOT_READY（模块码可见）", async () => {
    const r = await analyze(req(), loadResources());
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("DATA_NOT_READY");
    expect(r.body.error.message).toContain("LOOKUP_EVIDENCE_UNVERIFIED");
    // 定位信息透出到 fieldErrors，可追溯字位
    expect(JSON.stringify(r.body.error.fieldErrors)).toContain("tokenId");
  });

  it("同一输入两次分析逐字节稳定（含 503 语义）", async () => {
    const resources = loadResources();
    const a = await analyze(req(), resources);
    const b = await analyze(req(), resources);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("词林全量已装载：真实编排执行至证据门槛，503 语义与平水一致", async () => {
    const r = await analyze(req(POEM, "cilin"), loadResources());
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe("DATA_NOT_READY");
    }
  });
});
