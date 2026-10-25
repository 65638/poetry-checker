import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { registerStatic } from "../../scripts/production-static.mjs";
import { StaticCompressionCache } from "../../scripts/static-compression-cache.mjs";

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

it("静态文本协商gzip、HEAD与GET元信息一致，保留缓存及安全边界", async () => {
  const root = await mkdtemp(join(tmpdir(), "poetry-static-gzip-"));
  const app = Fastify();
  const text = "<p>空山不见人，但闻人语响。</p>".repeat(120);
  try {
    await mkdir(join(root, "dist/assets"), { recursive: true });
    await mkdir(join(root, "private"));
    await writeFile(join(root, "dist/index.html"), text);
    await writeFile(join(root, "private/secret.txt"), text + "private-marker");
    await symlink(join(root, "private"), join(root, "dist/linked"), "junction");
    for (const extension of ["js", "css", "svg", "txt"])
      await writeFile(
        join(root, `dist/assets/text-12345678.${extension}`),
        text,
      );
    await writeFile(join(root, "dist/assets/small-12345678.txt"), "small");
    await writeFile(join(root, "dist/assets/image-12345678.png"), text);
    await registerStatic(app, join(root, "dist"));
    for (const url of [
      "/",
      "/assets/text-12345678.js",
      "/assets/text-12345678.css",
      "/assets/text-12345678.svg",
      "/assets/text-12345678.txt",
    ]) {
      const compressed = await app.inject({
        url,
        headers: { "accept-encoding": "gzip" },
      });
      expect(compressed.headers["content-encoding"], url).toBe("gzip");
      expect(gunzipSync(compressed.rawPayload).toString()).toBe(text);
      expect(compressed.headers.vary).toBe("Accept-Encoding");
      expect(Number(compressed.headers["content-length"])).toBe(
        compressed.rawPayload.length,
      );
      const head = await app.inject({
        method: "HEAD",
        url,
        headers: { "accept-encoding": "gzip" },
      });
      expect(head.body).toBe("");
      for (const header of [
        "content-encoding",
        "content-length",
        "content-type",
        "cache-control",
        "vary",
      ])
        expect(head.headers[header], header).toBe(compressed.headers[header]);
      expect(compressed.headers["cache-control"]).toBe(
        url === "/" ? "no-cache" : "public, max-age=31536000, immutable",
      );
      const identity = await app.inject({
        url,
        headers: { "accept-encoding": "gzip;q=0" },
      });
      expect(identity.headers["content-encoding"]).toBeUndefined();
      expect(identity.body).toBe(text);
      expect(identity.headers.vary).toBe("Accept-Encoding");
    }
    for (const url of [
      "/assets/small-12345678.txt",
      "/assets/image-12345678.png",
    ]) {
      const r = await app.inject({
        url,
        headers: { "accept-encoding": "gzip" },
      });
      expect(r.headers["content-encoding"]).toBeUndefined();
    }
    for (const url of [
      "/linked/secret.txt",
      "/%2e%2e/private/secret.txt",
      "/.env.local",
    ]) {
      const r = await app.inject({
        url,
        headers: { "accept-encoding": "gzip" },
      });
      expect(r.statusCode).toBe(404);
      expect(r.body).not.toContain("private-marker");
    }
    const replacement = text.replaceAll("空山", "幽谷");
    await writeFile(join(root, "dist/index.html"), replacement);
    const changed = new Date(Date.now() + 2000);
    await utimes(join(root, "dist/index.html"), changed, changed);
    const updated = await app.inject({
      url: "/",
      headers: { "accept-encoding": "gzip" },
    });
    expect(gunzipSync(updated.rawPayload).toString()).toBe(replacement);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("静态压缩缓存复用相同字节、合并并发读取并按修改时间失效", async () => {
  const root = await mkdtemp(join(tmpdir(), "poetry-compression-cache-"));
  const file = join(root, "index.html");
  const cache = new StaticCompressionCache();
  try {
    await writeFile(file, "A".repeat(2048));
    const info = await stat(file);
    const [first, parallel] = await Promise.all([
      cache.get(file, info),
      cache.get(file, info),
    ]);
    expect(first).not.toBeNull();
    expect(parallel).toBe(first);
    expect(await cache.get(file, info)).toBe(first);
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(first!.length);
    await writeFile(file, "B".repeat(2048));
    const changed = new Date(Date.now() + 2000);
    await utimes(file, changed, changed);
    const next = await cache.get(file, await stat(file));
    expect(next).not.toBe(first);
    expect(gunzipSync(next!).toString()).toBe("B".repeat(2048));
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(next!.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("静态压缩缓存最多16个文件，读取改变淘汰顺序，超2MB文件不缓存", async () => {
  const root = await mkdtemp(join(tmpdir(), "poetry-compression-lru-"));
  const cache = new StaticCompressionCache();
  try {
    const records = [];
    for (let i = 0; i < 16; i++) {
      const file = join(root, `${i}.txt`);
      await writeFile(file, "A".repeat(2048));
      const info = await stat(file);
      records.push({ file, info, data: await cache.get(file, info) });
    }
    expect(await cache.get(records[0]!.file, records[0]!.info)).toBe(
      records[0]!.data,
    );
    const newest = join(root, "new.txt");
    await writeFile(newest, "B".repeat(2048));
    await cache.get(newest, await stat(newest));
    expect(cache.size).toBe(16);
    expect(await cache.get(records[0]!.file, records[0]!.info)).toBe(
      records[0]!.data,
    );
    expect(await cache.get(records[1]!.file, records[1]!.info)).not.toBe(
      records[1]!.data,
    );
    const oldBytes = cache.bytes;
    const huge = join(root, "huge.txt");
    await writeFile(huge, "X".repeat(2 * 1024 * 1024 + 1));
    expect(await cache.get(huge, await stat(huge))).toBeNull();
    expect(cache.size).toBe(16);
    expect(cache.bytes).toBe(oldBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("静态压缩缓存保留的gzip字节总量不超过8MB", async () => {
  const root = await mkdtemp(join(tmpdir(), "poetry-compression-budget-"));
  const cache = new StaticCompressionCache();
  try {
    // Hex text compresses, but remains large enough to exercise the byte budget.
    const text = randomBytes(1024 * 1024).toString("hex");
    let sum = 0;
    let first;
    for (let i = 0; i < 9; i++) {
      const file = join(root, `${i}.txt`);
      await writeFile(file, text);
      const info = await stat(file);
      const data = await cache.get(file, info);
      expect(data).not.toBeNull();
      sum += data!.length;
      if (i === 0) first = { file, info, data };
      expect(cache.bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    }
    expect(sum).toBeGreaterThan(8 * 1024 * 1024);
    expect(cache.size).toBeLessThan(9);
    expect(await cache.get(first!.file, first!.info)).not.toBe(first!.data);
    expect(cache.bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
