import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCandidateApprovals } from "../../../scripts/data/candidate-approvals.js";
import { deserializeSnapshot } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (relative: string): Buffer =>
  readFileSync(new URL(`../../../${relative}`, import.meta.url));
const hash = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const acceptance = JSON.parse(
  read("data/reviews/d4/a/acceptance-01.json").toString(),
) as {
  actualReply: string;
  requestFile: string;
  requestSha256: string;
  sourceBatch: string;
  sourceBatchSha256: string;
  acceptedCandidateIds: string[];
  excludedCandidateIds: string[];
};
const cilin = () =>
  deserializeSnapshot(
    JSON.parse(read("data/normalized/cilin.full-d2.json").toString()),
  );

describe("D4 user acceptance 01 applies only its 16 exact cilin candidates", () => {
  it("binds the actual user reply to both frozen request and original batch bytes", () => {
    expect(acceptance.actualReply).toBe("接受这16项并落库");
    expect(hash(read(acceptance.requestFile))).toBe(acceptance.requestSha256);
    expect(acceptance.requestSha256).toBe(
      "b040d64121702c0ecda2d59f66d798eb8a34fd3b2d68a9aab92590eadb679334",
    );
    expect(hash(read(acceptance.sourceBatch))).toBe(
      acceptance.sourceBatchSha256,
    );
    const request = JSON.parse(read(acceptance.requestFile).toString()) as {
      candidateIds: string[];
    };
    expect(acceptance.acceptedCandidateIds).toHaveLength(16);
    expect([...acceptance.acceptedCandidateIds].sort()).toEqual(
      [...request.candidateIds].sort(),
    );
    const approved = readCandidateApprovals(root, "cilin");
    expect(approved.map((a) => a.candidateId).sort()).toEqual(
      [...request.candidateIds].sort(),
    );
    expect(readCandidateApprovals(root, "pingshui")).toHaveLength(83);
    expect(readCandidateApprovals(root, "xinyun")).toEqual([]);
  });

  it("adds 16 independent evidence records, keeps all groups and competitors unexpanded", () => {
    const snapshot = cilin();
    const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
    expect(snapshot.candidates).toHaveLength(5395);
    expect(snapshot.groups).toHaveLength(33);
    expect(snapshot.evidence).toHaveLength(49);
    expect(snapshot.reviewStatus).toBe("unverified");
    expect(
      snapshot.evidence.filter((e) => e.reviewStatus === "approved"),
    ).toHaveLength(16);
    for (const approval of readCandidateApprovals(root, "cilin")) {
      const candidate = snapshot.candidates.find(
        (c) => c.id === approval.candidateId,
      );
      expect(candidate?.evidenceIds).toContain(approval.evidenceId);
      expect(evidence.get(approval.evidenceId)?.reviewStatus).toBe("approved");
    }
    for (const group of snapshot.groups)
      expect(
        group.evidenceIds.every(
          (id) => evidence.get(id)?.reviewStatus === "unverified",
        ),
      ).toBe(true);
    for (const id of [
      ...acceptance.excludedCandidateIds,
      "cilin:东:ping:第一部·平声",
    ]) {
      const candidate = snapshot.candidates.find((c) => c.id === id);
      expect(candidate).toBeDefined();
      expect(
        candidate?.evidenceIds.every(
          (id) => evidence.get(id)?.reviewStatus === "unverified",
        ),
      ).toBe(true);
    }
    expect(
      snapshot.candidates.filter((c) => c.character === "更"),
    ).toHaveLength(2);
    expect(snapshot.candidates.filter((c) => c.character === "余")).toEqual([]);
  });

  it("records a real version change with no candidate/group/source ID migration", () => {
    const change = JSON.parse(
      read("data/reviews/d4/a/approved-01/version-change.json").toString(),
    ) as {
      before: { dataVersion: string };
      after: { dataVersion: string; sha256: string };
      addedCandidateIds: string[];
      removedCandidateIds: string[];
      addedEvidenceIds: string[];
      idMigration: unknown[];
      groupsUnchanged: boolean;
      sourcesUnchanged: boolean;
      candidateFactsUnchanged: boolean;
    };
    expect(change.after.dataVersion).not.toBe(change.before.dataVersion);
    expect(cilin().dataVersion).toBe(change.after.dataVersion);
    expect(hash(read("data/normalized/cilin.full-d2.json"))).toBe(
      change.after.sha256,
    );
    expect(change.addedCandidateIds).toEqual([]);
    expect(change.removedCandidateIds).toEqual([]);
    expect(change.idMigration).toEqual([]);
    expect(change.addedEvidenceIds).toHaveLength(16);
    expect(
      change.groupsUnchanged &&
        change.sourcesUnchanged &&
        change.candidateFactsUnchanged,
    ).toBe(true);
  });
});
