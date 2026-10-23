import { describe, expect, it } from "vitest";
import type { LibraryWork } from "@poetry/contracts";
import { relatedReadings } from "../src/app/relatedReadings";
const poem = (
  id: string,
  text: string,
  author = "甲",
  dynasty = "唐",
): LibraryWork => ({
  id,
  title: id,
  author,
  dynasty,
  paragraphs: text.split("\n"),
  source: "受控测试",
  sourceUrl: null,
  tags: [],
  kind: "verse",
});
const source = poem(
  "本诗",
  "空山不见人，但闻人语响。\n返景入深林，复照青苔上。",
  "王维",
);
describe("local related reading suggestions", () => {
  it("uses real shared words, returns verbatim excerpts and excludes self, duplicate bodies and prose", () => {
    const aligned = poem(
      "山中",
      "荆溪白石出，天寒红叶稀。\n山路元无雨，空翠湿人衣。",
      "王维",
    );
    const mismatch = poem("无词句关联", "青青子衿，悠悠我心。", "乙");
    const results = relatedReadings(
      source,
      [
        source,
        aligned,
        { ...aligned, id: "重复" },
        mismatch,
        { ...aligned, id: "散文", kind: "prose" },
      ],
      "words",
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.work.id).toBe("山中");
    expect(results[0]!.terms).toEqual(["山"]);
    expect(
      aligned.paragraphs.some((p) => p.includes(results[0]!.excerpt)),
    ).toBe(true);
    for (const term of results[0]!.terms) {
      expect(source.paragraphs.join("\n")).toContain(term);
      expect(aligned.paragraphs.join("\n")).toContain(term);
    }
  });
  it("does not infer shared authors from unknown names or a different recorded dynasty", () => {
    const same = poem("静景", "日落天地阔。", "王维");
    expect(
      relatedReadings(
        source,
        [
          same,
          poem("同名异朝", "月落。", "王维", "宋"),
          poem("别的作者", "日出。", "李白"),
        ],
        "author",
      ).map((hit) => hit.work.id),
    ).toEqual(["静景"]);
    for (const unknown of ["", "佚名", "唐佚名", "无名氏", "作者未载"])
      expect(
        relatedReadings(
          { ...source, author: unknown },
          [{ ...same, author: unknown }],
          "author",
        ),
      ).toEqual([]);
  });
  it("respects favorites, preserves source characters and prefers informative shared phrases", () => {
    const original = poem("月诗", "月下故乡远，明月照故乡。");
    const exact = poem("共词", "明月故乡同。");
    const broad = poem("常见", "江月落。", "乙");
    const traditional = poem("異體", "故鄉遠。");
    const all = [exact, broad, traditional];
    const snapshot = JSON.stringify(all);
    expect(relatedReadings(original, all, "words")[0]!.work.id).toBe("共词");
    expect(
      relatedReadings(original, all, "words", new Set([broad.id])).map(
        (hit) => hit.work.id,
      ),
    ).toEqual([broad.id]);
    expect(relatedReadings(original, [traditional], "words")).toEqual([]);
    expect(JSON.stringify(all)).toBe(snapshot);
  });
});
