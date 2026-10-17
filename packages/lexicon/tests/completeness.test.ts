import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type {
  Evidence,
  ReadingCandidate,
  RhymeGroup,
  SourceRecord,
} from "@poetry/contracts";
import { describe, expect, it } from "vitest";

import {
  CILIN_GATE,
  LexiconError,
  PINGSHUI_GATE,
  XINYUN_GATE,
  checkCompleteness,
  defineSnapshot,
  gateFor,
  isLexiconError,
} from "../src/index.js";
import { pingshuiSnapshotFromCwr } from "../src/adapters/chinese-word-rhyme.js";
import type { SnapshotInput } from "../src/snapshot.js";

const RAW_PINGSHUI = new URL(
  "../../../data/raw/chinese_word_rhyme/Pingshui_Rhyme.json",
  import.meta.url,
);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * 按发布门槛造一份“数量正好、韵目正确”的合成快照。
 * mutate 用于制造韵目错误、空部等反例，仍保持 groupCount=106。
 */
function syntheticGateSnapshot(
  mutate: (groups: RhymeGroup[]) => void = () => {},
): SnapshotInput {
  const groups: RhymeGroup[] = [];
  const evidence: Evidence[] = [];
  const candidates: ReadingCandidate[] = [];
  const sources: SourceRecord[] = [
    {
      id: "src-synthetic-gate",
      title: "内部合成门槛样本（非真实韵书）",
      edition: null,
      url: null,
      license: "internal-test-only",
      snapshotSha256: null,
      revision: null,
      retrievedAt: null,
    },
  ];

  PINGSHUI_GATE.groups.forEach((entry, index) => {
    const groupId = `g-${index}`;
    const evidenceId = `ev-${index}`;
    groups.push({
      id: groupId,
      book: "pingshui",
      name: entry.name,
      toneClass: entry.toneClass,
      evidenceIds: [evidenceId],
    });
    evidence.push({
      id: evidenceId,
      sourceId: "src-synthetic-gate",
      kind: "rhyme_entry",
      locator: `synthetic ${entry.bucket}/${entry.name}`,
      assertion: "合成占位记录，仅用于完整性检查器验证",
      excerpt: null,
      reviewStatus: "unverified",
    });
    candidates.push({
      id: `c-${index}`,
      character: "甲",
      book: "pingshui",
      toneClass: entry.toneClass as "ping" | "shang" | "qu" | "ru",
      tone: entry.toneClass === "ping" ? "P" : "Z",
      groupIds: [groupId],
      gloss: null,
      modernReading: null,
      fanqie: null,
      evidenceIds: [evidenceId],
    });
  });

  mutate(groups);

  return {
    dataVersion: "fixture-completeness-d1",
    book: "pingshui",
    reviewStatus: "approved",
    notice: "合成门槛样本，仅用于检查器验证。",
    candidates,
    groups,
    evidence,
    sources,
  };
}

describe("A-D1-06 缺三讲的固定快照", () => {
  it("固定提交原表被检查器判定缺上声三讲，且尚未通过发布门槛", () => {
    const bytes = readFileSync(RAW_PINGSHUI);
    const table = JSON.parse(bytes.toString("utf8")) as Record<
      string,
      Record<string, string[]>
    >;
    const snapshot = defineSnapshot(
      pingshuiSnapshotFromCwr(table, {
        dataVersion: "pingshui-cwr-ff0e9c1-d1",
        revision: "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18",
        dataPath: "data/Pingshui_Rhyme.json",
        snapshotSha256: sha256(bytes),
        retrievedAt: null,
        license: "MIT（上游转载授权待核实）",
      }),
    );

    // 检查器本身不抛异常：缺部要被“报告”，而不是让测试崩掉。
    const report = checkCompleteness(snapshot, PINGSHUI_GATE);

    expect(report.groupCount).toBe(105);
    expect(report.expectedGroupCount).toBe(106);
    expect(report.missingGroups).toEqual(["三讲"]);
    expect(report.bucketCounts).toMatchObject({
      上平: 15,
      下平: 15,
      上: 28,
      去: 30,
      入: 17,
    });
    expect(
      report.issues.filter((issue) => issue.code === "GROUP_MISSING"),
    ).toHaveLength(1);
    // 数据门槛失败与检查器工作正常必须分开表达。
    expect(report.releaseGatePassed).toBe(false);
    expect(snapshot.reviewStatus).toBe("unverified");
  });

  it("缺部源也存在真实的候选记录，不是空表", () => {
    const bytes = readFileSync(RAW_PINGSHUI);
    const snapshot = defineSnapshot(
      pingshuiSnapshotFromCwr(
        JSON.parse(bytes.toString("utf8")) as Record<
          string,
          Record<string, string[]>
        >,
        {
          dataVersion: "pingshui-cwr-ff0e9c1-d1",
          revision: "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18",
          dataPath: "data/Pingshui_Rhyme.json",
          snapshotSha256: sha256(bytes),
          retrievedAt: null,
          license: "MIT（上游转载授权待核实）",
        },
      ),
    );
    expect(snapshot.candidates.length).toBeGreaterThan(10_000);
    expect(snapshot.groups).toHaveLength(105);
    expect(new Set(snapshot.groups.map((group) => group.name)).size).toBe(105);
  });
});

describe("A-D1-07 数量凑不齐门槛", () => {
  it("韵目写错但数量仍是 106 部，仍判不通过", () => {
    const snapshot = defineSnapshot(
      syntheticGateSnapshot((groups) => {
        const target = groups.find((group) => group.name === "三讲");
        if (target === undefined) throw new Error("门槛缺少三讲");
        target.name = "三讲錯";
      }),
    );
    const report = checkCompleteness(snapshot, PINGSHUI_GATE);

    expect(report.groupCount).toBe(106);
    expect(report.missingGroups).toEqual(["三讲"]);
    expect(report.unexpectedGroups).toEqual(["三讲錯"]);
    expect(report.releaseGatePassed).toBe(false);
  });

  it("某部为空（占位凑数）仍判不通过", () => {
    const input = syntheticGateSnapshot();
    const target = input.groups.find((group) => group.name === "三讲");
    if (target === undefined) throw new Error("门槛缺少三讲");
    const pruned: SnapshotInput = {
      ...input,
      candidates: input.candidates.filter(
        (candidate) => !candidate.groupIds.includes(target.id),
      ),
    };
    const report = checkCompleteness(defineSnapshot(pruned), PINGSHUI_GATE);

    expect(report.groupCount).toBe(106);
    expect(report.emptyGroups).toEqual(["三讲"]);
    expect(report.releaseGatePassed).toBe(false);
  });

  it("韵目与内容齐全但未审核时，发布门槛同样不通过", () => {
    const input = syntheticGateSnapshot();
    const report = checkCompleteness(
      defineSnapshot({ ...input, reviewStatus: "unverified" }),
      PINGSHUI_GATE,
    );
    expect(report.missingGroups).toEqual([]);
    expect(report.emptyGroups).toEqual([]);
    expect(
      report.issues.some(
        (issue) => issue.code === "REVIEW_STATUS_NOT_APPROVED",
      ),
    ).toBe(true);
    expect(report.releaseGatePassed).toBe(false);
  });

  it("齐全且已审核时门槛通过（检查器不是永远返回失败）", () => {
    const report = checkCompleteness(
      defineSnapshot(syntheticGateSnapshot()),
      PINGSHUI_GATE,
    );
    expect(report.issues).toEqual([]);
    expect(report.releaseGatePassed).toBe(true);
  });

  it("三套韵书门槛的数量、韵目与分部各自成立", () => {
    expect(PINGSHUI_GATE.groups).toHaveLength(106);
    expect(
      new Set(PINGSHUI_GATE.groups.map((entry) => entry.bucket)).size,
    ).toBe(5);
    expect(CILIN_GATE.groups).toHaveLength(33);
    expect(new Set(CILIN_GATE.groups.map((entry) => entry.bucket)).size).toBe(
      19,
    );
    expect(XINYUN_GATE.groups).toHaveLength(56);
    expect(new Set(XINYUN_GATE.groups.map((entry) => entry.bucket)).size).toBe(
      14,
    );
    expect(new Set(PINGSHUI_GATE.groups.map((entry) => entry.name)).size).toBe(
      106,
    );
    expect(gateFor("pingshui")).toBe(PINGSHUI_GATE);
    expect(gateFor("cilin")).toBe(CILIN_GATE);
    expect(gateFor("xinyun")).toBe(XINYUN_GATE);
  });
});

describe("A-D1-08 引用完整性", () => {
  it("候选引用不存在的证据时拒绝注册", () => {
    const input = syntheticGateSnapshot();
    const [first] = input.candidates;
    if (first === undefined) throw new Error("无候选");
    first.evidenceIds = ["ev-not-exist"];
    let caught: unknown;
    try {
      defineSnapshot(input);
    } catch (error) {
      caught = error;
    }
    expect(isLexiconError(caught)).toBe(true);
    if (!isLexiconError(caught)) throw new Error("未抛出 LexiconError");
    expect(caught.code).toBe("LEXICON_REFERENCE_UNRESOLVED");
    expect(caught.message).toContain("ev-not-exist");
  });

  it("候选引用不存在的韵部时拒绝注册", () => {
    const input = syntheticGateSnapshot();
    const [first] = input.candidates;
    if (first === undefined) throw new Error("无候选");
    first.groupIds = ["g-not-exist"];
    expect(() => defineSnapshot(input)).toThrow(LexiconError);
    expect(() => defineSnapshot(input)).toThrow(/不存在的韵部/u);
  });

  it("证据引用不存在的来源时拒绝注册", () => {
    const input = syntheticGateSnapshot();
    const [first] = input.evidence;
    if (first === undefined) throw new Error("无证据");
    first.sourceId = "src-not-exist";
    expect(() => defineSnapshot(input)).toThrow(/不存在的来源/u);
  });

  it("结构与引用都完整的快照可以通过", () => {
    expect(() => defineSnapshot(syntheticGateSnapshot())).not.toThrow();
  });
});
