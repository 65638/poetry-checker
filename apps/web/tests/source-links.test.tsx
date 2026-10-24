import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceLink } from "../src/presentation/components/SourceLink";
import { sourceLinkUrl } from "../src/utils/sourceLinks";

describe("来源外链展示策略", () => {
  it.each([
    "https://commons.wikimedia.org/wiki/File:Example.jpg",
    "https://upload.wikimedia.org/example.jpg",
    "https://foundation.wikimedia.org/wiki/Policy",
    "https://ZH.WIKISOURCE.ORG./wiki/平水韻",
    "https://zh.m.wikipedia.org/wiki/诗",
    "https://w.wiki/example",
    "https://wikidata.org/wiki/Q1",
    "javascript:alert(1)",
  ])("关闭 %s", (url) => {
    expect(sourceLinkUrl(url)).toBeNull();
    const html = renderToStaticMarkup(
      <SourceLink url={url}>原作出处</SourceLink>,
    );
    expect(html).toContain("原作出处");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<a ");
  });
  it("保持其他来源可访问，按实际域名而非标题或路径匹配", () => {
    const url = "https://example.org/wikimedia.org";
    expect(sourceLinkUrl(url)).toBe(url);
    expect(
      sourceLinkUrl("https://wikimedia.org@example.org/page"),
    ).not.toBeNull();
    expect(
      renderToStaticMarkup(<SourceLink url={url}>出处</SourceLink>),
    ).toContain("href=");
  });
});
