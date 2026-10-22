import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";

const TTL_MS = 15 * 60 * 1000;
const LIMIT = 12;

/** In-memory only. A full request (including rule context) owns each successful result. */
export class PoetryResultCache {
  private readonly entries = new Map<
    string,
    { at: number; result: PoetryAssistantResponse }
  >();
  constructor(private readonly now: () => number = Date.now) {}

  get(input: PoetryAssistantRequest): PoetryAssistantResponse | null {
    const key = JSON.stringify(input);
    const entry = this.entries.get(key);
    if (!entry) return null;
    const age = this.now() - entry.at;
    if (age < 0 || age >= TTL_MS) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.result;
  }

  set(input: PoetryAssistantRequest, result: PoetryAssistantResponse): void {
    const key = JSON.stringify(input);
    this.entries.delete(key);
    this.entries.set(key, { at: this.now(), result });
    while (this.entries.size > LIMIT)
      this.entries.delete(this.entries.keys().next().value!);
  }
}
