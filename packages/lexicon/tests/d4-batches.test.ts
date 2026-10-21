import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";
import type { Evidence, ReadingCandidate } from "@poetry/contracts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
function read<T>(relative: string): T {
  return JSON.parse(readFileSync(path.join(root, relative), "utf8")) as T;
}
function sha(relative: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(root, relative)))
    .digest("hex");
}
interface Entry {
  book: string;
  candidateId: string;
  character: string;
  positions: string[];
  evidenceIds: string[];
  sourcePath: string;
  sourceSha256: string;
  sourceCheck: { locator: string };
  machineStatus: string;
  independentSource: { lines: number[]; status: string } | null;
}
interface Batch {
  approvalRecord: null;
  book: string;
  work: { caseId: string; slug: string };
  entries: Entry[];
  counts: { positions: number; coveredPositions: number };
  gaps: { character: string; positions: string[] }[];
}
const index = read<{
  batches: { file: string; sha256: string }[];
  counts: { positions: number; coveredPositions: number };
}>("data/reviews/d4/a/index.json");
const batches = index.batches.map((b) => read<Batch>(b.file));
const runtimeManifest = read<Record<string, { file: string }>>(
  "apps/api/src/snapshot-manifest.json",
);
const snapshots = Object.fromEntries(
  Object.entries(runtimeManifest).map(([book, item]) => [
    book,
    read<{ candidates: ReadingCandidate[]; evidence: Evidence[] }>(
      `data/normalized/${item.file}`,
    ),
  ]),
);

describe("D4 exact review batches: preserve data and audit scope", () => {
  it("freezes final JSON bytes with both index and adjacent SHA files", () => {
    expect(batches).toHaveLength(6);
    for (const batch of index.batches) {
      expect(sha(batch.file)).toBe(batch.sha256);
      const checksum = readFileSync(
        path.join(root, `${batch.file}.sha256`),
        "utf8",
      );
      expect(checksum).toBe(`${batch.sha256}  ${path.basename(batch.file)}\n`);
    }
  });

  it("exchanges every competitor at every B position, without inventing candidates", () => {
    const rows = read<{
      rows: {
        caseId: string;
        book: string;
        tokenId: string;
        allCandidateIds: string[];
      }[];
    }>("data/reviews/d4/b/effective-candidates.json").rows;
    for (const batch of batches) {
      const positions = rows.filter(
        (r) => r.book === batch.book && r.caseId === batch.work.caseId,
      );
      expect(positions).toHaveLength(batch.counts.positions);
      for (const row of positions) {
        const position = `${batch.work.slug}/${row.tokenId}`;
        const ids = batch.entries
          .filter((e) => e.positions.includes(position))
          .map((e) => e.candidateId);
        expect(ids.sort()).toEqual([...row.allCandidateIds].sort());
      }
      for (const entry of batch.entries) {
        const candidate = snapshots[batch.book]?.candidates.find(
          (c) => c.id === entry.candidateId,
        );
        expect(candidate?.character).toBe(entry.character);
        expect(candidate?.evidenceIds).toEqual(
          expect.arrayContaining(entry.evidenceIds),
        );
        expect(sha(entry.sourcePath)).toBe(entry.sourceSha256);
      }
    }
    expect(index.counts).toMatchObject({
      positions: 192,
      coveredPositions: 191,
    });
  });

  it("points cilin entries to actual array members and isolates missing traditional-source matches", () => {
    const raw = read<Record<string, Record<string, string[]>>>(
      "data/raw/chinese_word_rhyme/Cilin_Rhyme.json",
    );
    for (const entry of batches
      .filter((b) => b.book === "cilin")
      .flatMap((b) => b.entries)) {
      for (const pointer of entry.sourceCheck.locator.split("; ")) {
        const [, ordinal = "", tone = "", offset = ""] = pointer.split("/");
        expect(raw[ordinal]?.[tone]?.[Number(offset)]).toBe(entry.character);
      }
      if (!entry.independentSource?.lines.length)
        expect(entry.machineStatus).toBe("needs_review");
      else
        expect(entry.independentSource.status).toBe(
          "exact_character_in_same_part_and_tone",
        );
    }
    // These are distinct characters; source discovery must never make an implicit alias.
    const gapBatch = batches.find(
      (b) => b.book === "cilin" && b.work.slug === "huanghelou",
    );
    expect(gapBatch?.gaps).toMatchObject([
      { character: "余", positions: ["huanghelou/l2c4"] },
    ]);
    expect(
      gapBatch?.entries.some((e) => ["余", "餘", "馀"].includes(e.character)),
    ).toBe(false);
    const edges = read<{ edges: { id: string; status: string }[] }>(
      "data/variants/variant-edges-d2.json",
    ).edges;
    expect(
      edges
        .filter((e) => ["edge-餘-余", "edge-馀-余"].includes(e.id))
        .every((e) => e.status === "pending_review"),
    ).toBe(true);
  });

  it("keeps new review drafts out of approved runtime evidence and preserves old exact scope", () => {
    const approvals = read<{
      candidateApprovals: { candidateId: string }[];
      approvedEvidenceIds: string[];
    }>("data/reviews/approved-evidence.json");
    expect(
      approvals.candidateApprovals.filter((a) =>
        a.candidateId.startsWith("pingshui:"),
      ),
    ).toHaveLength(83);
    expect(
      approvals.candidateApprovals.filter((a) =>
        a.candidateId.startsWith("cilin:"),
      ),
    ).toHaveLength(16);
    expect(approvals.approvedEvidenceIds).toEqual(["ev:pingshui:上:三讲"]);
    for (const batch of batches) expect(batch.approvalRecord).toBeNull();
    for (const book of ["xinyun"])
      expect(
        snapshots[book]?.evidence.every((e) => e.reviewStatus === "unverified"),
      ).toBe(true);
    for (const entry of batches
      .filter((b) => b.book === "xinyun")
      .flatMap((b) => b.entries))
      expect(entry.machineStatus).toBe("needs_review");
  });

  it("registers fetched source bytes and validates draft IDs without making context selections", () => {
    const manifest = read<{
      sources: {
        id: string;
        files: { path: string; snapshotSha256: string }[];
      }[];
    }>("data/sources/manifest.json");
    for (const id of [
      "src:wikisource:cilinzhengyun",
      "src:wikimedia:terms-of-use",
    ]) {
      const source = manifest.sources.find((s) => s.id === id);
      expect(source?.files.length).toBe(1);
      for (const file of source?.files ?? [])
        expect(sha(file.path)).toBe(file.snapshotSha256);
    }
    const drafts = read<{
      drafts: {
        book: string;
        target: string;
        candidateIds: string[];
        selectCandidateIds: string[];
        reviewStatus: string;
      }[];
    }>("data/reviews/d4/b/context-drafts.json").drafts;
    expect(drafts).toHaveLength(13);
    for (const draft of drafts) {
      expect(draft.selectCandidateIds).toEqual([]);
      expect(draft.reviewStatus).toBe("unverified");
      for (const id of draft.candidateIds)
        expect(
          snapshots[draft.book]?.candidates.find((c) => c.id === id)?.character,
        ).toBe(draft.target);
    }
  });
});
