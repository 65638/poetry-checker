import { afterEach, describe, expect, it, vi } from "vitest";
import { studioPost } from "../src/api/poetry-studio";
import { AI_CLIENT_TIMEOUT_MS } from "../src/api/timeouts";

afterEach(() => vi.unstubAllGlobals());
describe("literary request failures", () => {
  it("leaves time for the server's timeout fallback report", () =>
    expect(AI_CLIENT_TIMEOUT_MS).toBeGreaterThan(90_000));
  it("keeps sanitized API explanations for retry", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: { message: "模型回答过长，请重试。" } }),
          { status: 502 },
        ),
    );
    await expect(studioPost("poetry-assistant", {})).rejects.toThrow(
      "模型回答过长",
    );
  });
  it("handles gateway HTML without exposing parsing internals", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("<html>gateway</html>", { status: 504 }),
    );
    await expect(studioPost("poetry-assistant", {})).rejects.toThrow(
      "服务暂时未能完成请求（504）",
    );
  });
  it("explains network failure and keeps cancellation distinct", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(studioPost("poetry-assistant", {})).rejects.toThrow(
      "暂时连接不上服务",
    );
    const controller = new AbortController();
    controller.abort();
    const reason = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", async () => {
      throw reason;
    });
    await expect(
      studioPost("poetry-assistant", {}, controller.signal),
    ).rejects.toBe(reason);
  });
});
