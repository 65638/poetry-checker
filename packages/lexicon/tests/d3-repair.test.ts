import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deserializeSnapshot } from "../src/index.js";

const read = (path: string): Buffer =>
  readFileSync(new URL(`../../../${path}`, import.meta.url));
const snapshot = (name: string) =>
  deserializeSnapshot(JSON.parse(read(`data/normalized/${name}`).toString()));

describe("D3 数据修复的审批边界", () => {
  it.each([
    "上平:一东",
    "上平:四支",
    "下平:七阳",
    "下平:十蒸",
    "去:十五翰",
    "去:二十三漾",
  ])("%s 不因批准单个候选而批准整部（105/106 两快照）", (group) => {
    for (const name of [
      "pingshui.full-d2.json",
      "pingshui.full-d2-patched.json",
    ]) {
      const s = snapshot(name);
      expect(
        s.evidence.find((e) => e.id === `ev:pingshui:${group}`)?.reviewStatus,
      ).toBe("unverified");
      const approvedGroups = s.evidence
        .filter(
          (e) =>
            e.id.startsWith("ev:pingshui:") && e.reviewStatus === "approved",
        )
        .map((e) => e.id);
      expect(approvedGroups).toEqual(
        name.includes("patched") ? ["ev:pingshui:上:三讲"] : [],
      );
    }
  });

  it("词林只删除8条非汉字杂项，不改变三库的发布门槛", () => {
    const cilin = snapshot("cilin.full-d2.json");
    expect(cilin.candidates).toHaveLength(5395);
    expect(
      cilin.candidates.every((c) => /^\p{Script=Han}$/u.test(c.character)),
    ).toBe(true);
    expect(cilin.groups).toHaveLength(33);
    expect(
      cilin.candidates.filter((c) => c.character === "更").length,
    ).toBeGreaterThan(1);
    for (const name of [
      "pingshui.full-d2-patched.json",
      "cilin.full-d2.json",
      "xinyun.full-d2.json",
    ]) {
      const s = snapshot(name);
      expect(s.reviewStatus).toBe("unverified");
      if (s.book !== "pingshui")
        expect(s.evidence.every((e) => e.reviewStatus === "unverified")).toBe(
          true,
        );
    }
  });

  it("新版本与旧版本不同，版本差异记录绑定实际快照及原始来源字节", () => {
    const record = JSON.parse(
      read("data/reviews/d3-a-repair-version-change.json").toString(),
    ) as {
      versions: Array<{
        path: string;
        before: { dataVersion: string };
        after: { dataVersion: string; sha256: string };
        removedCandidateIds: string[];
        addedCandidateIds: string[];
      }>;
      sourceFiles: Array<{
        path: string;
        sha256: string;
        unchangedFromIntegration: boolean;
      }>;
    };
    expect(record.versions).toHaveLength(3);
    for (const v of record.versions) {
      const bytes = read(v.path);
      expect(JSON.parse(bytes.toString()).dataVersion).toBe(
        v.after.dataVersion,
      );
      expect(v.after.dataVersion).not.toBe(v.before.dataVersion);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        v.after.sha256,
      );
      expect(v.addedCandidateIds).toEqual([]);
      expect(v.removedCandidateIds).toHaveLength(
        v.path.includes("cilin") ? 8 : 0,
      );
    }
    for (const source of record.sourceFiles) {
      expect(createHash("sha256").update(read(source.path)).digest("hex")).toBe(
        source.sha256,
      );
      expect(source.unchangedFromIntegration).toBe(true);
    }
  });
});
