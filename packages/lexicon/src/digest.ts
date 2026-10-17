/**
 * 业务内容摘要：规范化后稳定序列化 + SHA-256。
 *
 * 约定：retrievedAt（下载时间）与生成时间不进入业务摘要，只进入来源登记；
 * 因此同一快照重复规范化/建索引得到相同摘要（验收 A-D1-10）。
 */
import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    result[key] = canonicalize(record[key]);
  }
  return result;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 剥掉不参与业务摘要的字段（只保留结构与事实）。 */
export function withoutVolatileFields(value: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(value)) as unknown;
  if (clone === null || typeof clone !== "object" || Array.isArray(clone)) {
    return clone;
  }
  const record = clone as Record<string, unknown>;
  const sources = record.sources;
  if (Array.isArray(sources)) {
    for (const source of sources) {
      if (source !== null && typeof source === "object") {
        delete (source as Record<string, unknown>).retrievedAt;
      }
    }
  }
  delete record.generatedAt;
  delete record.builtAt;
  return record;
}

/** 业务内容摘要：相同事实必得同一摘要。 */
export function businessContentDigest(value: unknown): string {
  return sha256Hex(canonicalJson(withoutVolatileFields(value)));
}
