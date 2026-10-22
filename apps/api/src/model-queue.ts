export class ModelQueueFullError extends Error {}

interface Waiter {
  signal: AbortSignal;
  grant: () => void;
  abort: () => void;
}

/** Bounded FIFO admission. The caller owns the deadline, including time spent waiting. */
export class ModelRequestQueue {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    private readonly concurrency = 2,
    private readonly capacity = 4,
  ) {}

  async acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();
    if (this.active < this.concurrency) {
      this.active++;
      return this.releaseOnce();
    }
    if (this.waiting.length >= this.capacity) throw new ModelQueueFullError();
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        grant: resolve,
        abort: () => {
          const index = this.waiting.indexOf(waiter);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(signal.reason);
        },
      };
      this.waiting.push(waiter);
      signal.addEventListener("abort", waiter.abort, { once: true });
    });
    return this.releaseOnce();
  }

  private releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) {
        // Transfer the occupied slot before any new caller can take it.
        next.signal.removeEventListener("abort", next.abort);
        next.grant();
      } else this.active--;
    };
  }
}
