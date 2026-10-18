import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyCandidateApprovals,
  readCandidateApprovals,
} from "../../../scripts/data/candidate-approvals.js";
import { deserializeSnapshot } from "../src/index.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const load = () =>
  deserializeSnapshot(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../data/normalized/pingshui.full-d2-patched.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );

describe("J03 审批只作用于明确候选", () => {
  it("白已审不连带批准同部的昔；一已审不连带批准日", () => {
    const snapshot = load();
    const approved = new Set(
      snapshot.evidence
        .filter((item) => item.reviewStatus === "approved")
        .map((item) => item.id),
    );
    for (const id of ["pingshui:白:ru:入声十一陌", "pingshui:一:ru:入声四质"]) {
      expect(
        snapshot.candidates
          .find((item) => item.id === id)
          ?.evidenceIds.some((id) => approved.has(id)),
      ).toBe(true);
    }
    for (const id of [
      "pingshui:昔:ru:入声十一陌",
      "pingshui:昔:ru:入声十药",
      "pingshui:日:ru:入声四质",
    ]) {
      expect(
        snapshot.candidates
          .find((item) => item.id === id)
          ?.evidenceIds.some((id) => approved.has(id)),
      ).toBe(false);
    }
    expect(snapshot.reviewStatus).toBe("unverified");
  });
  it("十处裁定指向的八个唯一候选已审，未选竞争候选没有删除", () => {
    const snapshot = load();
    const approvals = readCandidateApprovals(root);
    const approved = new Set(
      snapshot.evidence
        .filter((item) => item.reviewStatus === "approved")
        .map((item) => item.id),
    );
    for (const approval of approvals) {
      const candidate = snapshot.candidates.find(
        (item) => item.id === approval.candidateId,
      );
      expect(candidate?.evidenceIds).toContain(approval.evidenceId);
      expect(approved.has(approval.evidenceId)).toBe(true);
    }
    const wang = snapshot.candidates.filter((item) => item.character === "望");
    expect(wang.map((item) => item.toneClass).sort()).toEqual(["ping", "qu"]);
    expect(
      wang
        .find((item) => item.toneClass === "ping")
        ?.evidenceIds.some((id) => approved.has(id)),
    ).toBe(false);
  });
  it("候选不在数据、重复审批、重复证据 ID 必须报错；不修改输入", () => {
    const snapshot = load();
    const approval = readCandidateApprovals(root)[0]!;
    const before = JSON.stringify(snapshot);
    expect(() =>
      applyCandidateApprovals(snapshot, [
        { ...approval, candidateId: "not-present" },
      ]),
    ).toThrow("审批候选不在快照");
    expect(() => applyCandidateApprovals(snapshot, [approval])).toThrow(
      "重复候选审批或证据",
    );
    expect(() =>
      applyCandidateApprovals(snapshot, [
        { ...approval, evidenceId: "test-new" },
        { ...approval, evidenceId: "test-another" },
      ]),
    ).toThrow("重复候选审批或证据");
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
