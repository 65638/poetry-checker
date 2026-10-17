/**
 * 业务测试共用装置。
 * - loadMockScenario：读取 fixtures/mocks 下已通过 Schema 的开发场景；
 * - scriptedTransport：按调用顺序回放响应，并允许手动控制解析时机，
 *   用来构造「慢 A / 快 B」的乱序场景；
 * - deferred：手动 resolve 的 Promise。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AnalysisResponseSchema, type AnalysisResponse } from "@poetry/contracts";
import type { Transport } from "../src/api/analyze";
import type { InputDraft } from "../src/view-contract";

const here = dirname(fileURLToPath(import.meta.url));
const mocksDir = join(here, "..", "..", "..", "fixtures", "mocks");

export type MockScenario =
  | "pass"
  | "fail"
  | "needs_review"
  | "not_applicable"
  | "unsupported"
  | "mismatch";

export function loadMockScenario(name: MockScenario): AnalysisResponse {
  const raw = readFileSync(join(mocksDir, `${name}.json`), "utf8");
  // 解析一次 Schema，确保喂给业务层的报告一定合法。
  return AnalysisResponseSchema.parse(JSON.parse(raw));
}

export function scenarioDraft(scenario: MockScenario): InputDraft {
  const report = loadMockScenario(scenario);
  return {
    text: report.poem.originalText,
    rhymeBook: report.policy.rhymeBook,
    genreHint: "auto",
    formHint: "auto",
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export interface ScriptedCall {
  path: string;
  body: unknown;
  signal: AbortSignal | undefined;
}

export interface ScriptedTransport extends Transport {
  calls: ScriptedCall[];
}

/**
 * 第 n 次调用返回 script[n]。
 * 每个条目可以是一个 Response，也可以是一个返回 Response 的 Promise，
 * 从而精确控制两个并发请求的完成顺序。
 */
export function scriptedTransport(
  script: Array<Response | Promise<Response>>,
): ScriptedTransport {
  const calls: ScriptedCall[] = [];
  let index = 0;
  return {
    calls,
    async post(path, body, signal) {
      calls.push({ path, body, signal });
      const next = script[index];
      index += 1;
      if (next === undefined) {
        throw new Error(`scriptedTransport: 第 ${index} 次调用没有预设响应`);
      }
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return next;
    },
  };
}

/**
 * 与 scriptedTransport 相同，但**故意忽略 abort 信号**。
 * 真实网络里已发出的请求仍可能成功返回；用它来验证
 * 「即使旧请求成功迟到，也只能靠请求序号丢弃」。
 */
export function unabortableTransport(
  script: Array<Response | Promise<Response>>,
): ScriptedTransport {
  const calls: ScriptedCall[] = [];
  let index = 0;
  return {
    calls,
    async post(path, body, signal) {
      calls.push({ path, body, signal });
      const next = script[index];
      index += 1;
      if (next === undefined) {
        throw new Error(`unabortableTransport: 第 ${index} 次调用没有预设响应`);
      }
      return next;
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  fieldErrors: Array<{ path: string; message: string }> = [],
): Response {
  return jsonResponse({ error: { code, message, fieldErrors } }, status);
}

/** 把报告包装成该报告原文对应的成功响应。 */
export function okResponse(report: AnalysisResponse): Response {
  return jsonResponse(report);
}
