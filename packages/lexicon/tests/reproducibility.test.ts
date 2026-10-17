import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  businessContentDigest,
  canonicalJson,
  sha256Hex,
} from "../src/digest.js";
import { defineSnapshot } from "../src/snapshot.js";
import { pingshuiSnapshotFromCwr } from "../src/adapters/chinese-word-rhyme.js";
import type { CwrSourceOptions } from "../src/adapters/chinese-word-rhyme.js";

const RAW_PINGSHUI = new URL(
  "../../../data/raw/chinese_word_rhyme/Pingshui_Rhyme.json",
  import.meta.url,
);

function loadTable(): Record<string, Record<string, string[]>> {
  return JSON.parse(readFileSync(RAW_PINGSHUI).toString("utf8")) as Record<
    string,
    Record<string, string[]>
  >;
}

function options(retrievedAt: string | null): CwrSourceOptions {
  const bytes = readFileSync(RAW_PINGSHUI);
  return {
    dataVersion: "pingshui-cwr-ff0e9c1-d1",
    revision: "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18",
    dataPath: "data/Pingshui_Rhyme.json",
    snapshotSha256: createHash("sha256").update(bytes).digest("hex"),
    retrievedAt,
    license: "MIT（上游转载授权待核实）",
  };
}

describe("A-D1-10 重复规范化与建索引的稳定性", () => {
  it("同一快照重复构建得到完全相同的业务内容", () => {
    const table = loadTable();
    const first = pingshuiSnapshotFromCwr(
      table,
      options("2026-10-17T00:00:00Z"),
    );
    const second = pingshuiSnapshotFromCwr(
      table,
      options("2026-10-17T00:00:00Z"),
    );
    expect(second).toEqual(first);
    expect(canonicalJson(second)).toBe(canonicalJson(first));
  });

  it("下载时间不进入业务摘要，但确实留在来源登记里", () => {
    const table = loadTable();
    const early = pingshuiSnapshotFromCwr(
      table,
      options("2026-10-17T00:00:00Z"),
    );
    const late = pingshuiSnapshotFromCwr(
      table,
      options("2027-03-01T09:30:00Z"),
    );

    expect(businessContentDigest(early)).toBe(businessContentDigest(late));
    expect(canonicalJson(early)).not.toBe(canonicalJson(late));
    expect(sha256Hex(canonicalJson(early))).not.toBe(
      sha256Hex(canonicalJson(late)),
    );
    expect(early.sources[0]?.retrievedAt).toBe("2026-10-17T00:00:00Z");
    expect(late.sources[0]?.retrievedAt).toBe("2027-03-01T09:30:00Z");
  });

  it("冻结后的快照重复计算摘要仍然一致", () => {
    const table = loadTable();
    const optionsValue = options(null);
    const frozen = defineSnapshot(pingshuiSnapshotFromCwr(table, optionsValue));
    const again = defineSnapshot(pingshuiSnapshotFromCwr(table, optionsValue));
    expect(businessContentDigest(frozen)).toBe(businessContentDigest(again));
    expect(businessContentDigest(frozen)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("来源摘要固定在上游文件字节上，可独立复核", () => {
    const bytes = readFileSync(RAW_PINGSHUI);
    const optionsValue = options(null);
    expect(optionsValue.snapshotSha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(optionsValue.snapshotSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
