import { afterEach, describe, expect, it, vi } from "vitest";
import { requestModel } from "../src/model-request.js";

afterEach(() => vi.useRealTimers());
const init = (signal = new AbortController().signal) => ({
  signal,
  method: "POST",
  body: '{"model":"test","messages":[]}',
});
describe("bounded model transport recovery", () => {
  it("stops after two HTTP attempts even when the provider stays unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response("busy", { status: 503, headers: { "Retry-After": "0" } }),
    );
    expect(
      (await requestModel(fetcher, "https://example.com/model", init())).status,
    ).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects a late success after cancellation even if the transport ignores abort", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async () => {
      controller.abort();
      return new Response("late");
    });
    await expect(
      requestModel(
        fetcher,
        "https://example.com/model",
        init(controller.signal),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([500, 502, 503, 504])(
    "recovers once from HTTP %i using the same body and deadline",
    async (status) => {
      vi.useFakeTimers();
      const options = init();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response("temporary", { status }))
        .mockResolvedValueOnce(new Response('{"choices":[]}'));
      const pending = requestModel(
        fetcher,
        "https://example.com/model",
        options,
      );
      await vi.advanceTimersByTimeAsync(350);
      expect((await pending).status).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[0]?.[1]).toBe(fetcher.mock.calls[1]?.[1]);
      expect(fetcher.mock.calls[1]?.[1]?.signal).toBe(options.signal);
    },
  );
  it("retries a short Retry-After while respecting cancellation during the pause", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("busy", { status: 429, headers: { "Retry-After": "1" } }),
      );
    const pending = requestModel(
      fetcher,
      "https://example.com/model",
      init(controller.signal),
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: 401 },
    { status: 403 },
    { status: 400 },
    { status: 429 },
    { status: 429, headers: { "Retry-After": "60" } },
    { status: 503, headers: { "Retry-After": "invalid" } },
  ])(
    "does not repeat permanent errors, balance limits, or a long/invalid wait %#",
    async (responseInit) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("provider detail", responseInit));
      expect(
        (await requestModel(fetcher, "https://example.com/model", init()))
          .status,
      ).toBe(responseInit.status);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("does not retry HTTP 200 even when its content is incomplete", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{"));
    expect(
      await (
        await requestModel(fetcher, "https://example.com/model", init())
      ).text(),
    ).toBe("{");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("recovers from a connection failure once, never indefinitely", async () => {
    vi.useFakeTimers();
    const error = new TypeError("fetch failed");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(error);
    const pending = requestModel(fetcher, "https://example.com/model", init());
    const rejected = expect(pending).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(350);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shares the original timeout budget rather than starting another attempt after timeout", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("temporary", { status: 503 }));
    const pending = requestModel(
      fetcher,
      "https://example.com/model",
      init(controller.signal),
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    setTimeout(() => controller.abort(), 40);
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
