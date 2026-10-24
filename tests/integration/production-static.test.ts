import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { registerStatic } from "../../scripts/production-static.mjs";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const Fastify = require("fastify");
it("生产入口仅提供公开构建文件、保持API及同源提交，并阻止路径越界", async () => {
  const root = await mkdtemp(join(tmpdir(), "poetry-static-"));
  const app = Fastify();
  try {
    await mkdir(join(root, "dist/assets"), { recursive: true });
    await mkdir(join(root, "private"));
    await writeFile(join(root, "private/secret.txt"), "test-private-marker");
    await writeFile(join(root, "dist/index.html"), "<h1>诗词</h1>");
    await writeFile(
      join(root, "dist/assets/index-12345678.js"),
      "console.log(1)",
    );
    await symlink(join(root, "private"), join(root, "dist/linked"), "junction");
    app.get("/healthz", async () => ({ status: "ok" }));
    app.post("/api/test", async () => ({ ok: true }));
    await registerStatic(app, join(root, "dist"));
    expect((await app.inject("/")).body).toContain("诗词");
    expect((await app.inject("/healthz")).json()).toEqual({ status: "ok" });
    const asset = await app.inject("/assets/index-12345678.js");
    expect(asset.headers["content-type"]).toContain("javascript");
    expect(asset.headers["cache-control"]).toContain("immutable");
    expect((await app.inject({ method: "HEAD", url: "/" })).body).toBe("");
    for (const url of [
      "/.env.local",
      "/%2e%2e/private/secret.txt",
      "/linked/secret.txt",
      "/apps/api/src/server.ts",
      "/api/missing",
      "/assets/missing.js",
    ]) {
      const res = await app.inject(url);
      expect(res.statusCode, url).toBe(404);
      expect(res.body).not.toContain("test-private-marker");
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/test",
          headers: {
            host: "example.test:6767",
            origin: "http://example.test:6767",
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/test",
          headers: {
            host: "example.test:6767",
            origin: "https://foreign.test",
          },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
