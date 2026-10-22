import { afterEach, expect, it, vi } from "vitest";
import { libraryGet } from "../src/api/library";
afterEach(() => vi.unstubAllGlobals());
it("handles an HTML gateway response with a readable retry message", async () => {
  vi.stubGlobal(
    "fetch",
    async () => new Response("<html>gateway</html>", { status: 502 }),
  );
  await expect(libraryGet("library")).rejects.toThrow(
    "参考资料暂不可用（502）",
  );
});
it("keeps a specific API explanation and handles incomplete JSON", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ error: { message: "本篇未提供逐字注音。" } }),
        { status: 404 },
      ),
  );
  await expect(libraryGet("library")).rejects.toThrow("本篇未提供逐字注音");
  vi.stubGlobal("fetch", async () => new Response("{"));
  await expect(libraryGet("library")).rejects.toThrow("资料未完整返回");
});
it("explains network errors but preserves intentional cancellation", async () => {
  const error = new TypeError("fetch failed");
  vi.stubGlobal("fetch", async () => {
    throw error;
  });
  await expect(libraryGet("library")).rejects.toThrow("暂时连接不上资料服务");
  const c = new AbortController();
  c.abort();
  await expect(libraryGet("library", c.signal)).rejects.toBe(error);
});
