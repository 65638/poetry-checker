import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { BookId } from "@poetry/contracts";
import type { SnapshotInput } from "../../packages/lexicon/src/snapshot.js";

export interface CandidateApproval {
  candidateId: string;
  evidenceId: string;
  approvedBy: string;
  approvedAt: string;
  basis: string;
  recordFiles: string[];
}

export function readCandidateApprovals(
  root: string,
  book?: BookId,
): CandidateApproval[] {
  const parsed = JSON.parse(
    readFileSync(join(root, "data/reviews/approved-evidence.json"), "utf8"),
  ) as { candidateApprovals?: CandidateApproval[] };
  const approvals = parsed.candidateApprovals ?? [];
  for (const item of approvals) {
    if (
      !item.approvedBy ||
      !item.approvedAt ||
      !item.basis ||
      item.recordFiles.length === 0
    )
      throw new Error(`候选审批缺少范围/责任记录：${item.candidateId}`);
    for (const record of item.recordFiles)
      if (!existsSync(join(root, record)))
        throw new Error(`审批原件未归档：${record}`);
    if (item.evidenceId.endsWith(":d4-a-01")) {
      const acceptancePath = "data/reviews/d4/a/acceptance-01.json";
      if (!item.recordFiles.includes(acceptancePath))
        throw new Error("D4审批缺少接受记录");
      const acceptance = JSON.parse(
        readFileSync(join(root, acceptancePath), "utf8"),
      ) as {
        actualReply: string;
        requestFile: string;
        requestSha256: string;
        sourceBatch: string;
        sourceBatchSha256: string;
        acceptedCandidateIds: string[];
      };
      const requestBytes = readFileSync(join(root, acceptance.requestFile));
      const batchBytes = readFileSync(join(root, acceptance.sourceBatch));
      const sha = (value: Buffer): string =>
        createHash("sha256").update(value).digest("hex");
      const request = JSON.parse(requestBytes.toString("utf8")) as {
        candidateIds: string[];
        sourceBatchSha256: string;
      };
      if (
        !acceptance.actualReply ||
        sha(requestBytes) !== acceptance.requestSha256 ||
        sha(batchBytes) !== acceptance.sourceBatchSha256 ||
        request.sourceBatchSha256 !== acceptance.sourceBatchSha256
      ) {
        throw new Error("D4审批请求或来源批次摘要不匹配");
      }
      if (
        !acceptance.acceptedCandidateIds.includes(item.candidateId) ||
        JSON.stringify([...request.candidateIds].sort()) !==
          JSON.stringify([...acceptance.acceptedCandidateIds].sort())
      ) {
        throw new Error(`D4审批候选超出接受范围：${item.candidateId}`);
      }
    }
  }
  return book
    ? approvals.filter((item) => item.candidateId.startsWith(`${book}:`))
    : approvals;
}

/** 为具体候选追加独立证据，不改变原部级断言、声类、候选集合或整库审核状态。 */
export function applyCandidateApprovals(
  input: SnapshotInput,
  approvals: readonly CandidateApproval[],
): SnapshotInput {
  const output = {
    ...structuredClone(input),
    evidence: [...structuredClone(input.evidence)],
  };
  const candidates = new Map(output.candidates.map((item) => [item.id, item]));
  const evidence = new Map(output.evidence.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const approval of approvals) {
    const candidate = candidates.get(approval.candidateId);
    if (candidate === undefined)
      throw new Error(`审批候选不在快照中：${approval.candidateId}`);
    if (seen.has(candidate.id) || evidence.has(approval.evidenceId))
      throw new Error(`重复候选审批或证据 ID：${candidate.id}`);
    seen.add(candidate.id);
    const original = evidence.get(candidate.evidenceIds[0] ?? "");
    if (original === undefined)
      throw new Error(`候选原始证据缺失：${candidate.id}`);
    const record = {
      id: approval.evidenceId,
      sourceId: original.sourceId,
      kind: "rhyme_entry" as const,
      locator: `${original.locator}；候选 ${candidate.id}；审核记录 ${approval.recordFiles.join("；")}`,
      assertion: `${approval.basis}；仅覆盖候选 ${candidate.id}，不批准所属整部。审核记录：${approval.approvedBy}，${approval.approvedAt}`,
      excerpt: null,
      reviewStatus: "approved" as const,
    };
    output.evidence.push(record);
    evidence.set(record.id, record);
    candidate.evidenceIds.push(record.id);
  }
  return output;
}
