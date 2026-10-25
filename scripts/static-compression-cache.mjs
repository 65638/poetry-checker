import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

const compress = promisify(gzip);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 16;

/** The caller must resolve and authorize the file before using this cache. */
export class StaticCompressionCache {
  #entries = new Map();
  #pending = new Map();
  #bytes = 0;

  get size() {
    return this.#entries.size;
  }
  // Budget counts retained gzip bytes; source bytes are released after encoding.
  get bytes() {
    return this.#bytes;
  }

  async get(file, info) {
    const key = `${info.mtimeMs}:${info.size}`;
    const previous = this.#entries.get(file);
    if (previous?.key === key) {
      this.#entries.delete(file);
      this.#entries.set(file, previous);
      return previous.data;
    }
    this.#remove(file);
    if (info.size < 1024 || info.size > MAX_FILE_BYTES) return null;
    const active = this.#pending.get(file);
    if (active?.key === key) return active.promise;
    // A version change while encoding falls back to streaming, not a second read.
    if (active) return null;
    // Bound simultaneous reads/encodes as well as the retained cache.
    if (this.#pending.size >= MAX_ENTRIES) return null;
    const entry = { key, promise: null };
    entry.promise = (async () => {
      const original = await readFile(file);
      const current = await stat(file);
      if (
        original.length !== info.size ||
        current.size !== info.size ||
        current.mtimeMs !== info.mtimeMs
      )
        return null;
      const data = await compress(original, { level: 6 });
      if (data.length >= original.length) return null;
      // An older concurrent read must not overwrite a newer file version.
      if (this.#pending.get(file) === entry) {
        this.#remove(file);
        this.#entries.set(file, { key, data });
        this.#bytes += data.length;
        while (
          this.#entries.size > MAX_ENTRIES ||
          this.#bytes > MAX_CACHE_BYTES
        )
          this.#remove(this.#entries.keys().next().value);
      }
      return data;
    })();
    this.#pending.set(file, entry);
    try {
      return await entry.promise;
    } finally {
      if (this.#pending.get(file) === entry) this.#pending.delete(file);
    }
  }

  #remove(file) {
    const entry = this.#entries.get(file);
    if (entry) {
      this.#bytes -= entry.data.length;
      this.#entries.delete(file);
    }
  }
}
