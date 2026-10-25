import type { RhymeWordsResponse } from "@poetry/contracts";

const MAX_CATALOGS = 8;
const MAX_CANDIDATES = 10_000;

/** Session-only complete catalogs. Include the data version in each caller key. */
export class RhymeCatalogCache {
  private readonly entries = new Map<
    string,
    { value: RhymeWordsResponse; candidates: number }
  >();
  private count = 0;

  get size(): number {
    return this.entries.size;
  }

  get candidateCount(): number {
    return this.count;
  }

  get(key: string): RhymeWordsResponse | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: RhymeWordsResponse): void {
    const candidates = value.lookup.entries.reduce(
      (sum, entry) => sum + entry.candidates.length,
      0,
    );
    // Never retain an outdated value when its replacement is too large to cache.
    this.remove(key);
    if (candidates > MAX_CANDIDATES) return;
    this.entries.set(key, { value, candidates });
    this.count += candidates;
    while (this.entries.size > MAX_CATALOGS || this.count > MAX_CANDIDATES)
      this.remove(this.entries.keys().next().value!);
  }

  clear(): void {
    this.entries.clear();
    this.count = 0;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      this.count -= entry.candidates;
      this.entries.delete(key);
    }
  }
}
