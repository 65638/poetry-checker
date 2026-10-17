/**
 * fixture/mocks 的坐标与语义回归（对应「修 mock」批次）。
 *
 * 生成器 `fixtures/mocks/generate.ts` 已内置自检；这里在测试层再固化一遍，
 * 防止有人手工改 JSON 或改生成器时把坐标问题带回来。
 */
import { describe, expect, it } from "vitest";
import { loadMockScenario, type MockScenario } from "./fixtures";

/** 除 mismatch 外的合法场景。 */
const LEGAL: MockScenario[] = [
  "pass",
  "fail",
  "needs_review",
  "not_applicable",
  "unsupported",
  "supplementary",
];

describe("Finding.locations 坐标", () => {
  it.each(LEGAL)("%s：所有定位都引用存在且行列一致的 token", (name) => {
    const report = loadMockScenario(name);
    const byId = new Map(report.poem.tokens.map((token) => [token.tokenId, token]));
    expect(report.prosody.checks.length).toBeGreaterThan(0);

    for (const check of report.prosody.checks) {
      expect(check.locations.length).toBeGreaterThan(0);
      for (const location of check.locations) {
        const token = byId.get(location.tokenId);
        expect(token, `字位 ${location.tokenId} 不存在于 ${name}`).toBeDefined();
        // 不得硬编码 line/column：必须与 token 自身一致
        expect(location.line).toBe(token!.line);
        expect(location.column).toBe(token!.column);
      }
    }
  });

  it("不再是「l2c5 却写成 line 1, column 1」的旧缺陷", () => {
    for (const name of LEGAL) {
      const report = loadMockScenario(name);
      for (const check of report.prosody.checks) {
        for (const location of check.locations) {
          const isHardcodedOneOne = location.line === 1 && location.column === 1;
          const tokenIsAtOneOne =
            report.poem.tokens.find((token) => token.tokenId === location.tokenId)
              ?.line === 1 &&
            report.poem.tokens.find((token) => token.tokenId === location.tokenId)
              ?.column === 1;
          // 只有 token 真的在 (1,1) 时，才允许坐标是 (1,1)
          if (isHardcodedOneOne) expect(tokenIsAtOneOne).toBe(true);
        }
      }
    }
  });
});

describe("诊断语义与场景一致", () => {
  it("fail 场景的 expected 与 observed 确实不同", () => {
    const report = loadMockScenario("fail");
    const failing = report.prosody.checks.filter((check) => check.status === "fail");
    expect(failing.length).toBeGreaterThan(0);
    for (const check of failing) {
      expect([...check.expected].sort()).not.toEqual([...check.observed].sort());
    }
  });

  it.each(LEGAL.filter((name) => name !== "fail"))(
    "%s 的非 fail 诊断不自我矛盾（expected 与 observed 一致）",
    (name) => {
      const report = loadMockScenario(name);
      for (const check of report.prosody.checks) {
        if (check.status === "fail") continue;
        expect([...check.expected].sort()).toEqual([...check.observed].sort());
      }
    },
  );

  it("observed 与该字位真实平仄一致", () => {
    for (const name of LEGAL) {
      const report = loadMockScenario(name);
      const byId = new Map(report.poem.tokens.map((token) => [token.tokenId, token]));
      for (const check of report.prosody.checks) {
        for (const location of check.locations) {
          const token = byId.get(location.tokenId)!;
          const expectedObserved = token.tone === null ? [] : [token.tone];
          expect(check.observed).toEqual(expectedObserved);
        }
      }
    }
  });
});

describe("原文坐标不受影响", () => {
  it.each(LEGAL)("%s：token 的 UTF-16 切片等于 token.text", (name) => {
    const report = loadMockScenario(name);
    for (const token of report.poem.tokens) {
      expect(
        report.poem.originalText.slice(token.startUtf16, token.endUtf16),
      ).toBe(token.text);
    }
  });

  it("supplementary 仍含补充平面汉字，且切片按 UTF-16", () => {
    const report = loadMockScenario("supplementary");
    const pair = report.poem.tokens.filter(
      (token) => [...token.text].length === 1 && token.text.length === 2,
    );
    expect(pair.length).toBeGreaterThan(0);
    for (const token of pair) {
      expect(token.endUtf16 - token.startUtf16).toBe(2);
    }
  });
});

describe("mismatch 仍保持为拒绝测试场景", () => {
  it("保留行文本与字位错位（Schema 通过但语义不自洽）", () => {
    const report = loadMockScenario("mismatch");
    expect(report.summary.status).toBe("pass");

    const byId = new Map(report.poem.tokens.map((token) => [token.tokenId, token]));
    const brokenLines = report.poem.lines.filter((line) => {
      const expected = line.tokenIds
        .map((id) => byId.get(id)?.text ?? "")
        .join("");
      return expected !== line.text;
    });
    expect(brokenLines.length).toBeGreaterThan(0);
  });

  it("token 切片本身是好的（错位只在行文本层）", () => {
    const report = loadMockScenario("mismatch");
    for (const token of report.poem.tokens) {
      expect(
        report.poem.originalText.slice(token.startUtf16, token.endUtf16),
      ).toBe(token.text);
    }
  });
});
