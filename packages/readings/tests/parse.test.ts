import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseText } from "../src/index.js";
import type { ParsedPoem } from "@poetry/contracts";
import {
  FOUR_LINE_DENG_GUAN_QUE_LOU,
  PUNCTUATED_DENG_GUAN_QUE_LOU,
} from "./fixtures.js";

/**
 * 所有解析用例都要满足的结构不变量：
 * 原文切片、字位唯一、行列与 tokenId 一致、行文本与字位一致。
 */
function expectParseInvariants(poem: ParsedPoem): void {
  expect(poem.inputHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(new Set(poem.tokens.map((token) => token.tokenId)).size).toBe(
    poem.tokens.length,
  );

  for (const token of poem.tokens) {
    expect(poem.originalText.slice(token.startUtf16, token.endUtf16)).toBe(
      token.text,
    );
    expect(token.tokenId).toBe(`l${token.line}c${token.column}`);
    expect(token.startUtf16).toBeLessThan(token.endUtf16);
    expect([...token.text]).toHaveLength(1);
  }

  for (const line of poem.lines) {
    const lineTokens = poem.tokens.filter((token) => token.line === line.line);
    expect(line.tokenIds).toEqual(lineTokens.map((token) => token.tokenId));
    expect(line.text).toBe(lineTokens.map((token) => token.text).join(""));
    expect(lineTokens.map((token) => token.column)).toEqual(
      lineTokens.map((_, index) => index + 1),
    );
  }
}

describe("parseText：排版与原文位置", () => {
  it("B-D1-01 登鹳雀楼标点版与四行版得到同样四句五字，但原文位置与 hash 不同", () => {
    const punctuated = parseText({ text: PUNCTUATED_DENG_GUAN_QUE_LOU });
    const fourLine = parseText({ text: FOUR_LINE_DENG_GUAN_QUE_LOU });

    expect(punctuated.lines).toHaveLength(4);
    expect(fourLine.lines).toHaveLength(4);
    for (const poem of [punctuated, fourLine]) {
      expect(poem.lines.map((line) => line.text)).toEqual([
        "白日依山尽",
        "黄河入海流",
        "欲穷千里目",
        "更上一层楼",
      ]);
      expect(poem.lines.map((line) => line.tokenIds.length)).toEqual([
        5, 5, 5, 5,
      ]);
      expect(poem.tokens.map((token) => token.tokenId)).toEqual([
        "l1c1",
        "l1c2",
        "l1c3",
        "l1c4",
        "l1c5",
        "l2c1",
        "l2c2",
        "l2c3",
        "l2c4",
        "l2c5",
        "l3c1",
        "l3c2",
        "l3c3",
        "l3c4",
        "l3c5",
        "l4c1",
        "l4c2",
        "l4c3",
        "l4c4",
        "l4c5",
      ]);
      expect(poem.quality).toBe("ok");
      expectParseInvariants(poem);
    }

    // 标点版每句后面还有标点，末句还有换行，位置必须各自切回原文。
    expect(punctuated.originalText).toBe(PUNCTUATED_DENG_GUAN_QUE_LOU);
    expect(fourLine.originalText).toBe(FOUR_LINE_DENG_GUAN_QUE_LOU);
    expect(punctuated.inputHash).not.toBe(fourLine.inputHash);

    const lastPunctuated = punctuated.tokens.at(-1);
    const lastFourLine = fourLine.tokens.at(-1);
    expect(lastPunctuated?.text).toBe("楼");
    expect(lastPunctuated?.startUtf16).toBe(23);
    expect(lastFourLine?.startUtf16).toBe(22);
  });

  it("B-D1-02 CRLF、空行、连续边界都不生成空诗句", () => {
    const crlf = parseText({ text: "白日依山尽，\r\n\r\n黄河入海流。" });
    expect(crlf.lines).toHaveLength(2);
    expect(crlf.lines.map((line) => line.text)).toEqual([
      "白日依山尽",
      "黄河入海流",
    ]);
    expect(crlf.tokens.map((token) => token.startUtf16)).toEqual([
      0, 1, 2, 3, 4, 10, 11, 12, 13, 14,
    ]);
    expectParseInvariants(crlf);

    const trailing = parseText({ text: "白日依山尽，，，\n\n" });
    expect(trailing.lines).toHaveLength(1);
    expect(trailing.tokens).toHaveLength(5);
    expect(trailing.quality).toBe("ok");
    expectParseInvariants(trailing);

    const mixedBoundaries = parseText({ text: "白日依山尽！？；。\n黄河" });
    expect(mixedBoundaries.lines.map((line) => line.text)).toEqual([
      "白日依山尽",
      "黄河",
    ]);
    expectParseInvariants(mixedBoundaries);
  });

  it("B-D1-03 补充平面汉字不拆代理对，位置与 tokenId 精确", () => {
    const poem = parseText({ text: "𠀀白，日" });
    expect(poem.originalText.length).toBe(5);
    expect(poem.tokens.map((token) => token.tokenId)).toEqual([
      "l1c1",
      "l1c2",
      "l2c1",
    ]);
    expect(
      poem.tokens.map((token) => [
        token.text,
        token.startUtf16,
        token.endUtf16,
      ]),
    ).toEqual([
      ["𠀀", 0, 2],
      ["白", 2, 3],
      ["日", 4, 5],
    ]);
    expect(poem.lines.map((line) => line.text)).toEqual(["𠀀白", "日"]);
    expectParseInvariants(poem);
  });

  it("B-D1-04 非汉字内容保留原文、记 notice、降级为 needs_review，后续偏移仍准确", () => {
    const poem = parseText({ text: "白A日，黄🙂河" });
    expect(poem.tokens.map((token) => token.tokenId)).toEqual([
      "l1c1",
      "l1c2",
      "l2c1",
      "l2c2",
    ]);
    expect(poem.tokens.map((token) => token.startUtf16)).toEqual([0, 2, 4, 7]);
    expect(poem.originalText).toBe("白A日，黄🙂河");
    expect(poem.quality).toBe("needs_review");
    expect(
      poem.notices.map((notice) => [
        notice.code,
        notice.startUtf16,
        notice.endUtf16,
      ]),
    ).toEqual([
      ["PARSE_UNSUPPORTED_CHARACTER", 1, 2],
      ["PARSE_UNSUPPORTED_CHARACTER", 5, 7],
    ]);
    expectParseInvariants(poem);
  });

  it("汉字重复记号与部首不占字位，后续列不错位", () => {
    // 々(U+3005) 属于 Han Script 但不是表意文字：不能算成独立字位。
    const poem = parseText({ text: "月々夜" });
    expect(poem.tokens.map((token) => token.text)).toEqual(["月", "夜"]);
    expect(
      poem.tokens.map((token) => [token.startUtf16, token.endUtf16]),
    ).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(poem.tokens.map((token) => token.tokenId)).toEqual(["l1c1", "l1c2"]);
    expect(poem.quality).toBe("needs_review");
    expect(
      poem.notices.map((notice) => [
        notice.code,
        notice.startUtf16,
        notice.endUtf16,
      ]),
    ).toEqual([["PARSE_UNSUPPORTED_CHARACTER", 1, 2]]);
    expect(poem.notices[0]?.message).toContain("重复记号");
    expectParseInvariants(poem);

    // 康熙部首 ⼀(U+2F00) 同理：保留原文，不占字位。
    const radical = parseText({ text: "⼀白日" });
    expect(radical.tokens.map((token) => token.text)).toEqual(["白", "日"]);
    expect(radical.tokens[0]?.startUtf16).toBe(1);
    expect(radical.originalText).toBe("⼀白日");
    expectParseInvariants(radical);

    // 〇(U+3007) 是表意文字、有读音，仍要建字位——不能一概排除。
    const numeral = parseText({ text: "二〇二年" });
    expect(numeral.tokens.map((token) => token.text)).toEqual([
      "二",
      "〇",
      "二",
      "年",
    ]);
    expect(numeral.quality).toBe("ok");
    expectParseInvariants(numeral);
  });

  it("B-D1-05 标题原样保留并提示，不按字数硬断长串", () => {
    const withTitle = parseText({
      text: "登鹳雀楼\n白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。",
    });
    // 标题行 + 四句正文；逗号与句号都把正文切成句子。
    expect(withTitle.lines).toHaveLength(5);
    expect(withTitle.lines.map((line) => line.text)).toEqual([
      "登鹳雀楼",
      "白日依山尽",
      "黄河入海流",
      "欲穷千里目",
      "更上一层楼",
    ]);
    expect(withTitle.tokens.slice(0, 4).map((token) => token.text)).toEqual([
      "登",
      "鹳",
      "雀",
      "楼",
    ]);
    expect(withTitle.originalText.startsWith("登鹳雀楼\n")).toBe(true);
    expect(withTitle.quality).toBe("needs_review");
    expect(withTitle.notices.map((notice) => notice.code)).toContain(
      "PARSE_SUSPECTED_TITLE",
    );
    expectParseInvariants(withTitle);

    const longRun = parseText({ text: "白日照香炉生紫烟瀑布挂前川" });
    expect(longRun.lines).toHaveLength(1);
    expect(longRun.tokens).toHaveLength(13);
    expect(longRun.quality).toBe("needs_review");
    expect(longRun.notices.map((notice) => notice.code)).toContain(
      "PARSE_LINE_SPLIT_UNCERTAIN",
    );
    expectParseInvariants(longRun);

    // 有句边界时不做这个提示：启发式只针对“全文无边界”的长串。
    const bounded = parseText({ text: "白日照香炉生紫烟瀑布挂，前川" });
    expect(bounded.notices.map((notice) => notice.code)).not.toContain(
      "PARSE_LINE_SPLIT_UNCERTAIN",
    );
  });

  it("空文本与纯标点不造空诗句，用空数组加 notice 表达", () => {
    for (const text of ["", "，。！；？", "  \n\t\u3000"]) {
      const poem = parseText({ text });
      expect(poem.tokens).toEqual([]);
      expect(poem.lines).toEqual([]);
      expect(poem.quality).toBe("needs_review");
      expect(poem.notices.map((notice) => notice.code)).toContain(
        "PARSE_NO_HAN_TEXT",
      );
    }
  });
});

describe("parseText：原文摘要与白名单", () => {
  it("inputHash 是原始 UTF-8 文本的 SHA-256，标点变化会改变结果", () => {
    const text = "白日依山尽，黄河入海流。";
    const expected = createHash("sha256").update(text, "utf8").digest("hex");
    expect(parseText({ text }).inputHash).toBe(expected);

    const sameCharacters = "白日依山尽\n黄河入海流";
    expect(parseText({ text: sameCharacters }).inputHash).not.toBe(expected);
    // 汉字序列一致不代表 hash 一致
    expect(
      parseText({ text: sameCharacters }).tokens.map((token) => token.text),
    ).toEqual(parseText({ text }).tokens.map((token) => token.text));
  });

  it("引号、括号等白名单排版字符不占字位、不降级", () => {
    const poem = parseText({ text: "「白日」依山尽" });
    expect(poem.tokens).toHaveLength(5);
    expect(poem.tokens.map((token) => token.text)).toEqual([
      "白",
      "日",
      "依",
      "山",
      "尽",
    ]);
    expect(poem.quality).toBe("ok");
    expect(poem.notices).toEqual([]);
    expect(poem.tokens[0]?.startUtf16).toBe(1);
    expectParseInvariants(poem);
  });

  it("不白名单的符号不能靠宽泛正则整体吞掉", () => {
    const poem = parseText({ text: "白日123依山尽" });
    expect(poem.tokens.map((token) => token.text)).toEqual([
      "白",
      "日",
      "依",
      "山",
      "尽",
    ]);
    expect(poem.originalText).toBe("白日123依山尽");
    expect(poem.quality).toBe("needs_review");
    expect(poem.notices).toHaveLength(3);
    expect(poem.tokens[2]?.startUtf16).toBe(5);
    expectParseInvariants(poem);
  });
});
