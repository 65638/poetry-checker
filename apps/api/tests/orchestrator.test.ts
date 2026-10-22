import { describe, expect, it } from "vitest";
import type { AnalyzeRequest } from "@poetry/contracts";
import { loadResources } from "../src/resources.js";
import { analyze } from "../src/orchestrator.js";
import { createReadingAssistant } from "../src/reading-assistant.js";

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
  it("保留模型已答字位，漏答不冒充缺字或成功辨音，后续批次照常完成", async () => {
    const resources = loadResources();
    const request = req("更".repeat(25));
    const local = await analyze(request, resources);
    let calls = 0;
    const service = createReadingAssistant(resources, {
      apiKey: "controlled-test-key",
      fetcher: async (_url, init) => {
        calls++;
        const payload = JSON.parse(
          JSON.parse(String(init?.body)).messages[1].content,
        ) as { requestedTokenIds: string[] };
        const returned =
          payload.requestedTokenIds.length > 1
            ? payload.requestedTokenIds.slice(0, -1)
            : payload.requestedTokenIds;
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    suggestions: returned.map((tokenId) => ({
                      tokenId,
                      candidateId: "pingshui:更:qu:二十四敬",
                      pronunciation: "gèng",
                      reason: "受控归属验证，非诗意判断。",
                    })),
                  }),
                },
              },
            ],
          }),
        );
      },
    });
    const result = await analyze(request, resources, {
      readingAssistant: service,
    });
    expect(calls).toBe(2);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok" || local.kind !== "ok") return;
    expect(result.response.readingAssistant?.state).toBe("partial");
    expect(result.response.readingAssistant?.appliedTokenIds).toHaveLength(24);
    expect(result.response.readingAssistant?.appliedTokenIds).not.toContain(
      "l1c24",
    );
    expect(result.response.readingAssistant?.appliedTokenIds).toContain(
      "l1c25",
    );
    expect(result.response.readingAssistant?.message).toContain(
      "AI漏回1个字位",
    );
    expect(
      result.response.poem.tokens.find((token) => token.tokenId === "l1c24"),
    ).toEqual(
      local.response.poem.tokens.find((token) => token.tokenId === "l1c24"),
    );
  });
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
