/**
 * 示例正文与已批准版本的一致性（D3）。
 *
 * 目的：`apps/web/src/app/examples.ts` 里的正文是**静态复制**的已批正文，
 * 复制就可能抄错、被顺手"修"成通行版、或被人加换行改变原文。
 * 这里用仓库内的批准记录把它钉死：
 * - 正文必须与 `tests/golden/cases/*.json` 的 `text` 逐字一致；
 * - 只按汉字算的 SHA-256 必须等于 `data/works/metadata.json` 的
 *   `approvedTextFingerprints`（与 `packages/genre` 的 `fingerprintText` 同口径）；
 * - 题名/作者与元数据一致；
 * - 指纹与元数据对不上就说明抄的是异文（例如静夜思宋刊本、黄鹤楼首句异文）。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/app/examples";

const readJson = (relative: string): unknown =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"),
  );

const HAN = /\p{Script=Han}/u;

/** 与 packages/genre 的 normalizeForFingerprint 同口径：只留汉字。 */
function hanOnly(text: string): string {
  let out = "";
  for (const char of text) if (HAN.test(char)) out += char;
  return out;
}

/** 与 packages/genre 的 fingerprintText 同口径。 */
function fingerprint(text: string): string {
  return createHash("sha256").update(hanOnly(text), "utf8").digest("hex");
}

interface GoldenCase {
  id: string;
  title: string;
  author: string;
  text: string;
  reviewStatus: string;
  request: { rhymeBook: string };
  evidenceIds: string[];
}

interface WorkMetadata {
  id: string;
  title: string;
  author: string;
  approvedTextFingerprints: string[];
  reviewStatus: string;
}

const CASES: GoldenCase[] = [
  readJson("../../../tests/golden/cases/dengguanquelou.json"),
  readJson("../../../tests/golden/cases/jingyesi.json"),
  readJson("../../../tests/golden/cases/huanghelou.json"),
] as GoldenCase[];

const WORKS = readJson("../../../data/works/metadata.json") as WorkMetadata[];

const caseByTitle = new Map(CASES.map((item) => [item.title, item]));

describe("示例正文来源", () => {
  it("三个示例都填了正文（空正文会让按钮 disabled 并显示「待核对」）", () => {
    expect(EXAMPLES).toHaveLength(3);
    for (const example of EXAMPLES) {
      expect(example.text.trim().length, `${example.title} 正文为空`).toBeGreaterThan(0);
      expect(example.author.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(CASES.map((item) => [item.title, item] as const))(
    "%s：正文与已批准 golden 用例逐字一致",
    (title, golden) => {
      const example = EXAMPLES.find((item) => item.title === title);
      expect(example, `缺少示例 ${title}`).toBeDefined();
      // 逐字比较（含标点），不允许"通行版"替换或手工加换行
      expect(example?.text).toBe(golden.text);
      expect(example?.author).toBe(golden.author);
    },
  );

  it("golden 用例本身是 approved（否则不应被前端当示例）", () => {
    for (const golden of CASES) {
      expect(golden.reviewStatus).toBe("approved");
      expect(golden.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it("示例正文是平水韵可分析的正文（golden 请求口径为 pingshui）", () => {
    for (const golden of CASES) expect(golden.request.rhymeBook).toBe("pingshui");
  });
});

describe("示例正文指纹与已批元数据一致", () => {
  it.each(CASES.map((item) => [item.title] as const))(
    "%s：指纹命中 approvedTextFingerprints",
    (title) => {
      const example = EXAMPLES.find((item) => item.title === title);
      expect(example).toBeDefined();
      const work = WORKS.find((item) => item.title === title);
      expect(work, `缺少作品元数据 ${title}`).toBeDefined();
      expect(work?.reviewStatus).toBe("approved");
      expect(work?.approvedTextFingerprints).toContain(
        fingerprint(example?.text ?? ""),
      );
    },
  );

  it("指纹口径只算汉字：加换行/改标点不改变指纹，改字才改变", () => {
    const canonical = caseByTitle.get("登鹳雀楼")?.text ?? "";
    expect(fingerprint(canonical)).toBe(fingerprint(canonical.replace(/，/g, "\n")));
    expect(fingerprint(canonical)).not.toBe(fingerprint(canonical.replace("白", "红")));
  });

  it("静夜思宋刊异文与黄鹤楼首句异文都不被示例采用", () => {
    const songkan = "床前看月光，疑是地上霜。举头望山月，低头思故乡。";
    const huangheVariant =
      "昔人已乘白云去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。";
    const fingerprints = EXAMPLES.map((item) => fingerprint(item.text));
    expect(fingerprints).not.toContain(fingerprint(songkan));
    expect(fingerprints).not.toContain(fingerprint(huangheVariant));
  });
});
