import { describe, expect, it } from "vitest";
import type { LookupResult } from "@poetry/contracts";
import type { CharacterLookup } from "../src/api/characters";
import { compareBooks } from "../src/app/dictionaryComparison";
import { lookupPassage, passageRowStatus } from "../src/app/passageLookup";

const missing = (
  character: string,
  book: LookupResult["book"] = "pingshui",
  version = "test-only",
): LookupResult => ({
  book,
  dataVersion: version,
  entries: [],
  missing: [character],
  groups: [],
  evidence: [],
  sources: [],
});

describe("passage lookup preserves per-character failures and limits request work", () => {
  it("keeps first occurrence order, distinct glyphs and at most four active queries", async () => {
    let active = 0,
      peak = 0;
    const lookup: CharacterLookup = async (character, book) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) =>
        setTimeout(resolve, character === "明" ? 15 : 1),
      );
      active--;
      if (character === "泉") throw new TypeError("fetch failed");
      return missing(character, book);
    };
    const progress: number[] = [];
    const result = await lookupPassage(
      "明月松间照，清泉石上流。明𠀀餘余馀",
      "pingshui",
      lookup,
      new AbortController().signal,
      (done) => progress.push(done),
    );
    expect(result.rows.map((row) => row.character)).toEqual([
      ..."明月松间照清泉石上流𠀀餘余馀",
    ]);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(result.rows.find((row) => row.character === "泉")?.error).toBe(
      "连接失败",
    );
    expect(
      passageRowStatus(result.rows.find((row) => row.character === "泉")!),
    ).toBe("error");
    expect(passageRowStatus(result.rows[0]!)).toBe("missing");
    expect(progress).toEqual(
      Array.from({ length: result.rows.length }, (_, i) => i + 1),
    );
  });
  it("does not silently omit over-limit characters or start cancelled jobs", async () => {
    let calls = 0;
    const lookup: CharacterLookup = async (character) => {
      calls++;
      return missing(character);
    };
    await expect(
      lookupPassage(
        Array.from({ length: 97 }, (_, i) =>
          String.fromCodePoint(0x4e00 + i),
        ).join(""),
        "pingshui",
        lookup,
        new AbortController().signal,
      ),
    ).rejects.toThrow("96");
    const controller = new AbortController();
    controller.abort();
    await expect(
      lookupPassage("明月", "pingshui", lookup, controller.signal),
    ).rejects.toThrow("取消");
    expect(calls).toBe(0);
  });
  it("rejects mixing snapshot versions within one passage overview", async () => {
    const result = await lookupPassage(
      "明月",
      "pingshui",
      async (character, book) =>
        missing(character, book, character === "明" ? "old" : "new"),
      new AbortController().signal,
    );
    expect(result.rows[0]?.result?.dataVersion).toBe("old");
    expect(result.rows[1]?.result).toBeNull();
    expect(result.rows[1]?.error).toContain("版本");
  });
});

describe("three-book lookup keeps independent successes and errors", () => {
  it("reuses current book, requests the other books and exposes a failed book", async () => {
    const current = missing("月");
    const called: string[] = [];
    const result = await compareBooks(
      "月",
      current,
      async (character, book) => {
        called.push(book);
        if (book === "cilin") throw new Error("snapshot unavailable");
        return missing(character, book);
      },
      new AbortController().signal,
    );
    expect(called).toEqual(["cilin", "xinyun"]);
    expect(result[0]?.result).toBe(current);
    expect(result[1]?.error).toBe("snapshot unavailable");
    expect(result[2]?.result?.book).toBe("xinyun");
  });
});
