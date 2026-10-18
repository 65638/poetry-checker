/**
 * 作品元数据草案的机器验收（E / D2）。
 *
 * 验证：metadata.json 结构合法、指纹与固定正文一致、异文不合并、unverified 不被当成依据。
 * 这些用例只证明“元数据自洽”，不证明正文来源已核实——来源缺口见 data/works/anomalies.md。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WorkMetadataSchema } from "@poetry/contracts";
import type { AnnotatedPoem, WorkMetadata } from "@poetry/contracts";
import { describe, expect, it } from "vitest";
import { classifyGenre, fingerprintText } from "../src/index.js";
import { makeWorkMetadata } from "./fixtures.js";

const METADATA_PATH = fileURLToPath(
  new URL("../../../data/works/metadata.json", import.meta.url),
);

const TEXTS: Record<string, string> = {
  "work:dengguanquelou": "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
  "work:jingyesi": "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
  "work:huanghelou":
    "昔人已乘黄鹤去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。",
};

const CLAUSES: Record<string, string[]> = {
  "work:dengguanquelou": [
    "白日依山尽",
    "黄河入海流",
    "欲穷千里目",
    "更上一层楼",
  ],
  "work:jingyesi": ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
};

const SONGKAN = "床前看月光，疑是地上霜。举头望山月，低头思故乡。";
const HUANGHELOU_VARIANT =
  "昔人已乘白云去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。";

function readMetadata(): WorkMetadata[] {
  const raw = JSON.parse(readFileSync(METADATA_PATH, "utf8")) as unknown;
  expect(Array.isArray(raw)).toBe(true);
  return (raw as unknown[]).map((item) => WorkMetadataSchema.parse(item));
}

/** 用真实正文构造 AnnotatedPoem（字位无候选），只用于体裁与指纹路径。 */
function poemFromClauses(clauses: string[]): AnnotatedPoem {
  const lineTexts = clauses.map((clause) => clause);
  const originalText = clauses.join("，") + "。";
  let cursor = 0;
  const tokens = lineTexts.flatMap((text, lineIndex) =>
    [...text].map((char, columnIndex) => {
      const start = cursor;
      cursor += char.length;
      return {
        tokenId: `l${lineIndex + 1}c${columnIndex + 1}`,
        text: char,
        line: lineIndex + 1,
        column: columnIndex + 1,
        startUtf16: start,
        endUtf16: cursor,
        candidates: [],
        effectiveCandidateIds: [],
        readingStatus: "unknown" as const,
        selectedReadingId: null,
        selectionMethod: "unresolved" as const,
        possibleTones: [],
        toneStatus: "unknown" as const,
        tone: null,
        reason: "真实正文占位：本用例不涉及读音",
        evidenceIds: [],
      };
    }),
  );

  return {
    originalText,
    inputHash: createHash("sha256").update(originalText, "utf8").digest("hex"),
    lines: lineTexts.map((text, lineIndex) => ({
      line: lineIndex + 1,
      text,
      tokenIds: tokens
        .filter((token) => token.line === lineIndex + 1)
        .map((token) => token.tokenId),
    })),
    tokens,
    quality: "ok",
    notices: [],
    book: "pingshui",
  };
}

describe("data/works/metadata.json 自洽性", () => {
  it("三条记录都通过 WorkMetadataSchema，且全部 unverified + 无证据", () => {
    const works = readMetadata();
    expect(works).toHaveLength(3);
    for (const work of works) {
      expect(work.reviewStatus).toBe("unverified");
      expect(work.evidenceIds).toEqual([]);
      expect(work.approvedTextFingerprints).toHaveLength(1);
    }
  });

  it("每条指纹都等于固定正文的 fingerprintText", () => {
    for (const work of readMetadata()) {
      const text = TEXTS[work.id];
      expect(text, `缺少 ${work.id} 的固定正文`).toBeDefined();
      expect(work.approvedTextFingerprints[0]).toBe(
        fingerprintText(text as string),
      );
    }
  });

  it("《静夜思》固定为古绝：ancient + formId=null + 古绝标签", () => {
    const jingyesi = readMetadata().find((work) => work.id === "work:jingyesi");
    expect(jingyesi).toBeDefined();
    expect(jingyesi?.formFamily).toBe("ancient");
    expect(jingyesi?.formId).toBeNull();
    expect(jingyesi?.historicalTags).toContain("古绝");
  });

  it("异文不合并：宋刊《李太白文集》指纹不同且未登记进元数据", () => {
    const works = readMetadata();
    const jingyesi = works.find((work) => work.id === "work:jingyesi");
    const songkanFingerprint = fingerprintText(SONGKAN);
    expect(songkanFingerprint).not.toBe(
      fingerprintText(TEXTS["work:jingyesi"] as string),
    );
    for (const work of works) {
      expect(work.approvedTextFingerprints).not.toContain(songkanFingerprint);
    }
    expect(jingyesi?.approvedTextFingerprints).toHaveLength(1);
  });

  it("《黄鹤楼》首句异文同样不合并", () => {
    const variantFingerprint = fingerprintText(HUANGHELOU_VARIANT);
    expect(variantFingerprint).not.toBe(
      fingerprintText(TEXTS["work:huanghelou"] as string),
    );
    for (const work of readMetadata()) {
      expect(work.approvedTextFingerprints).not.toContain(variantFingerprint);
    }
  });

  it("同字数不能区分版本：两版《静夜思》都是 20 字但指纹不同", () => {
    const adopted = TEXTS["work:jingyesi"] as string;
    const adoptedChars = [...adopted].filter((char) =>
      /\p{Script=Han}/u.test(char),
    ).length;
    const variantChars = [...SONGKAN].filter((char) =>
      /\p{Script=Han}/u.test(char),
    ).length;
    expect(adoptedChars).toBe(20);
    expect(variantChars).toBe(20);
    expect(fingerprintText(adopted)).not.toBe(fingerprintText(SONGKAN));
  });
});

describe("体裁判别与作品元数据的交互", () => {
  it("unverified 元数据即使指纹一致也不参与判定", () => {
    const poem = poemFromClauses(CLAUSES["work:jingyesi"] as string[]);
    const result = classifyGenre({
      poem,
      candidates: [],
      metadata: readMetadata(),
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.basisType).not.toBe("reviewed_metadata");
    expect(result.formFamily).not.toBe("ancient");
    expect(result.applicability).toBe("uncertain");
  });

  it("人工通过后同一指纹可走 reviewed_metadata，古绝不再按近体判定", () => {
    const poem = poemFromClauses(CLAUSES["work:jingyesi"] as string[]);
    const approved = [
      makeWorkMetadata({
        id: "work:jingyesi",
        title: "静夜思",
        text: TEXTS["work:jingyesi"] as string,
        formFamily: "ancient",
        reviewStatus: "approved",
        evidenceIds: ["evidence:test-only"],
      }),
    ];
    const result = classifyGenre({
      poem,
      candidates: [],
      metadata: approved,
      genreHint: "auto",
      formHint: "auto",
    });

    expect(result.basisType).toBe("reviewed_metadata");
    expect(result.formFamily).toBe("ancient");
    expect(result.formId).toBeNull();
    expect(result.applicability).toBe("not_applicable");
  });

  it("古绝形制与五绝相同，凭形制会给出近体形制推断而非古体", () => {
    const poem = poemFromClauses(CLAUSES["work:jingyesi"] as string[]);
    const result = classifyGenre({
      poem,
      candidates: [],
      metadata: [],
      genreHint: "auto",
      formHint: "auto",
    });

    // 形制会被推断为 wujue，但因缺候选特征，结论仍是 uncertain，不能据此判古体或近体通过。
    expect(result.formId).toBe("wujue");
    expect(result.applicability).toBe("uncertain");
    expect(result.formFamily).not.toBe("ancient");
  });
});
