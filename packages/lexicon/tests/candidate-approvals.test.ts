import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
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

describe("J03 与 D2 批次审批只作用于明确候选", () => {
  it("白已审不连带批准同部的昔；一已审不连带批准日", () => {
    const snapshot = load();
    const approved = new Set(
      snapshot.evidence
        .filter(
          (item) =>
            item.reviewStatus === "approved" && item.id.endsWith(":j03"),
        )
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
  it("68条新增审批准确对应冻结来源批次，原件与来源字节摘要可复核", () => {
    const approval = JSON.parse(
      readFileSync(
        join(root, "data/reviews/d2-closeout-batch-approval.json"),
        "utf8",
      ),
    ) as {
      actualReply: string;
      approvedScope: {
        batchFile: string;
        batchSha256: string;
        candidateCount: number;
        candidateIds: string[];
      };
      recordFiles: Array<{ path: string; sha256: string }>;
    };
    const batchBytes = readFileSync(
      join(root, approval.approvedScope.batchFile),
    );
    expect(createHash("sha256").update(batchBytes).digest("hex")).toBe(
      approval.approvedScope.batchSha256,
    );
    const batch = JSON.parse(batchBytes.toString("utf8")) as {
      source: { path: string; sha256: string };
      items: Array<{ candidate: { id: string }; machineStatus: string }>;
    };
    for (const file of [...approval.recordFiles, batch.source]) {
      expect(
        createHash("sha256")
          .update(readFileSync(join(root, file.path)))
          .digest("hex"),
        file.path,
      ).toBe(file.sha256);
    }
    const expectedIds = batch.items
      .filter((item) => item.machineStatus === "source_character_found")
      .map((item) => item.candidate.id)
      .sort();
    expect(expectedIds).toHaveLength(68);
    expect(approval.approvedScope.candidateCount).toBe(68);
    expect([...approval.approvedScope.candidateIds].sort()).toEqual(
      expectedIds,
    );
    expect(approval.actualReply).toBe("同意该批次与“千里”裁定");
    const registeredIds = readCandidateApprovals(root)
      .filter((item) => item.evidenceId.endsWith(":d2-batch"))
      .map((item) => item.candidateId)
      .sort();
    expect(registeredIds).toEqual(expectedIds);
    const snapshot = load();
    const batchEvidence = snapshot.evidence.filter((item) =>
      item.id.endsWith(":d2-batch"),
    );
    expect(batchEvidence).toHaveLength(68);
    expect(
      batchEvidence.every((item) => item.reviewStatus === "approved"),
    ).toBe(true);
    expect(registeredIds).not.toContain("pingshui:里:qu:四寘");
  });
  it("明确批准的候选均有独立证据，未选竞争候选没有删除", () => {
    const snapshot = load();
    const approvals = readCandidateApprovals(root, "pingshui");
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
