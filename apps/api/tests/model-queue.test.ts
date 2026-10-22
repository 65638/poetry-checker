import { describe, expect, it } from "vitest";
import { ModelQueueFullError, ModelRequestQueue } from "../src/model-queue.js";

const signal = () => new AbortController().signal;
describe("bounded model request admission", () => {
  it("keeps two running and admits queued work in arrival order", async () => {
    const queue = new ModelRequestQueue(2, 3),
      order: number[] = [];
    const a = await queue.acquire(signal()),
      b = await queue.acquire(signal());
    const c = queue.acquire(signal()).then((release) => {
      order.push(3);
      return release;
    });
    const d = queue.acquire(signal()).then((release) => {
      order.push(4);
      return release;
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    a();
    a(); // A second release must not grant another slot.
    const releaseC = await c;
    expect(order).toEqual([3]);
    const e = queue.acquire(signal()).then((release) => {
      order.push(5);
      return release;
    });
    b();
    const releaseD = await d;
    expect(order).toEqual([3, 4]);
    releaseC();
    const releaseE = await e;
    expect(order).toEqual([3, 4, 5]);
    releaseD();
    releaseE();
  });
  it("removes cancelled waiters and preserves the rest of the queue", async () => {
    const queue = new ModelRequestQueue(1, 1),
      controller = new AbortController();
    const releaseA = await queue.acquire(signal());
    const waiting = queue.acquire(controller.signal);
    const rejected = expect(waiting).rejects.toThrow("cancelled");
    await expect(queue.acquire(signal())).rejects.toBeInstanceOf(
      ModelQueueFullError,
    );
    controller.abort(new Error("cancelled"));
    await rejected;
    const next = queue.acquire(signal());
    releaseA();
    (await next)();
    (await queue.acquire(signal()))();
  });
  it("never takes a slot for an already aborted request", async () => {
    const queue = new ModelRequestQueue(1, 0),
      controller = new AbortController();
    controller.abort(new Error("expired"));
    await expect(queue.acquire(controller.signal)).rejects.toThrow("expired");
    (await queue.acquire(signal()))();
  });
});
