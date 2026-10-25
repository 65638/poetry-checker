import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";
import { requestPoetry } from "./poetry-studio";

export type RhymeTaskInput = Extract<PoetryAssistantRequest, { task: "rhyme" }>;
type RhymeResponse = Extract<PoetryAssistantResponse, { task: "rhyme" }>;
export type RhymeProgress = { completed: number; total: number };
/** Local aggregation, deliberately not presented as a single model response. */
export type RhymeBatchResult = {
  task: "rhyme";
  result: RhymeResponse["result"];
  coverage: RhymeProgress & { batches: number };
};
type Request = (
  input: RhymeTaskInput,
  signal?: AbortSignal,
) => Promise<PoetryAssistantResponse>;

/** A session belongs to one immutable poem/reading/candidate snapshot. */
export class RhymeBatchSession {
  readonly input: RhymeTaskInput;
  private readonly batches: RhymeTaskInput[];
  private readonly completed: RhymeResponse["result"][] = [];
  private execution = 0;
  private activeController: AbortController | null = null;

  constructor(
    input: RhymeTaskInput,
    private readonly request: Request = requestPoetry,
  ) {
    if (!input.candidateIds.length || input.candidateIds.length > 100_000)
      throw new Error("请先取得完整同韵候选，再开始荐字。");
    if (new Set(input.candidateIds).size !== input.candidateIds.length)
      throw new Error("同韵候选有重复，请重新查阅韵书。");
    this.input = { ...input, candidateIds: [...input.candidateIds] };
    this.batches = [];
    for (let offset = 0; offset < this.input.candidateIds.length; offset += 120)
      this.batches.push({
        ...this.input,
        candidateIds: this.input.candidateIds.slice(offset, offset + 120),
      });
  }

  get progress(): RhymeProgress {
    return {
      completed: Math.min(
        this.completed.length * 120,
        this.input.candidateIds.length,
      ),
      total: this.input.candidateIds.length,
    };
  }

  /** Reusing this session resumes only unfinished batches after cancellation/failure. */
  async run(
    signal: AbortSignal,
    onProgress?: (progress: RhymeProgress) => void,
  ): Promise<RhymeBatchResult> {
    signal.throwIfAborted();
    const execution = ++this.execution;
    this.activeController?.abort();
    const own = new AbortController();
    this.activeController = own;
    const combined = AbortSignal.any([signal, own.signal]);
    const assertActive = () => {
      combined.throwIfAborted();
      if (execution !== this.execution)
        throw new DOMException("本次荐字已被后续请求替代。", "AbortError");
    };
    onProgress?.(this.progress);
    while (this.completed.length < this.batches.length) {
      assertActive();
      const input = this.batches[this.completed.length]!;
      const response = await this.request(
        { ...input, candidateIds: [...input.candidateIds] },
        combined,
      );
      // A transport may still resolve after its request has been cancelled.
      assertActive();
      if (response.task !== "rhyme")
        throw new Error("收到的结果不是本次荐字结果。");
      const ids = new Set(input.candidateIds);
      const seen = new Set<string>();
      for (const match of response.result.matches) {
        if (!ids.has(match.id) || seen.has(match.id))
          throw new Error("荐字结果含范围外或重复候选，已拒绝显示本批结果。");
        seen.add(match.id);
      }
      this.completed.push({
        matches: response.result.matches.map((match) => ({ ...match })),
      });
      onProgress?.(this.progress);
    }
    assertActive();
    return {
      task: "rhyme",
      result: {
        matches: this.completed.flatMap((value) =>
          value.matches.map((match) => ({ ...match })),
        ),
      },
      coverage: { ...this.progress, batches: this.batches.length },
    };
  }
}
