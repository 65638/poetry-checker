import { createRequire } from "node:module";
import { get } from "node:http";
import { PassThrough } from "node:stream";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { registerCompression } from "../../scripts/production-compression.mjs";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const Fastify = require("fastify");
const value = { poem: "空山不见人，但闻人语响。".repeat(180) };
const json = JSON.stringify(value);

describe("生产完整JSON响应压缩", () => {
  it.each(["string", "buffer", "object"])(
    "%s载荷解压后逐字一致，长度使用压缩后字节数",
    async (kind) => {
      const app = Fastify();
      registerCompression(app);
      app.get("/", async (_request, reply) =>
        reply
          .type("application/json; charset=utf-8")
          .header("Content-Length", Buffer.byteLength(json))
          .header("ETag", '"original"')
          .send(
            kind === "buffer"
              ? Buffer.from(json)
              : kind === "object"
                ? value
                : json,
          ),
      );
      try {
        const r = await app.inject({
          url: "/",
          headers: { "accept-encoding": "gzip, br" },
        });
        expect(r.headers["content-encoding"]).toBe("gzip");
        expect(gunzipSync(r.rawPayload).toString("utf8")).toBe(json);
        expect(Number(r.headers["content-length"])).toBe(r.rawPayload.length);
        expect(r.rawPayload.length).toBeLessThan(Buffer.byteLength(json));
        expect(r.headers.etag).toBe('W/"original"');
      } finally {
        await app.close();
      }
    },
  );
  it.each([
    [undefined, false],
    ["gzip;q=0", false],
    ["br", false],
    ["gzip;q=0, *;q=1", false],
    ["gzip;q=0.5, identity;q=1", false],
    ["gzip;q=0.5", false],
    ["gzip;q=0.5, identity;q=0.1", true],
    ["gzip;q=1, identity;q=0", true],
    ["*;q=1", true],
    ["GZIP; q=1.000", true],
    ["gzip;q=invalid", false],
    ["*;q=0", false],
  ] as const)("协商 %s，压缩=%s", async (encoding, compressed) => {
    const app = Fastify();
    registerCompression(app);
    app.get("/", async (_request, reply) =>
      reply.header("Vary", "Origin").send(value),
    );
    try {
      const r = await app.inject({
        url: "/",
        headers: encoding ? { "accept-encoding": encoding } : {},
      });
      expect(r.headers["content-encoding"]).toBe(
        compressed ? "gzip" : undefined,
      );
      expect(r.headers.vary).toBe("Origin, Accept-Encoding");
      expect(
        compressed ? gunzipSync(r.rawPayload).toString("utf8") : r.body,
      ).toBe(json);
    } finally {
      await app.close();
    }
  });
  it.each(["Origin, accept-encoding", "*"])(
    "合并Vary时保留%s且不重复",
    async (vary) => {
      const app = Fastify();
      registerCompression(app);
      app.get("/", async (_request, reply) =>
        reply.header("Vary", vary).send(value),
      );
      try {
        expect(
          (
            await app.inject({
              url: "/",
              headers: { "accept-encoding": "gzip" },
            })
          ).headers.vary,
        ).toBe(vary);
      } finally {
        await app.close();
      }
    },
  );
  it("跳过HEAD、无内容状态、小JSON、已有编码和no-transform", async () => {
    const app = Fastify();
    registerCompression(app);
    app.get("/", async () => value);
    app.get("/small", async () => ({ ok: true }));
    app.get("/encoded", async (_request, reply) =>
      reply
        .header("Content-Encoding", "br")
        .type("application/json")
        .send(json),
    );
    app.get("/fixed", async (_request, reply) =>
      reply.header("Cache-Control", "public, no-transform").send(value),
    );
    app.get("/204", async (_request, reply) => reply.code(204).send());
    app.get("/304", async (_request, reply) => reply.code(304).send());
    try {
      for (const url of ["/small", "/fixed", "/204", "/304"]) {
        const r = await app.inject({
          url,
          headers: { "accept-encoding": "gzip" },
        });
        expect(r.headers["content-encoding"], url).toBeUndefined();
      }
      const head = await app.inject({
        method: "HEAD",
        url: "/",
        headers: { "accept-encoding": "gzip" },
      });
      expect(head.body).toBe("");
      expect(head.headers["content-encoding"]).toBeUndefined();
      const encoded = await app.inject({
        url: "/encoded",
        headers: { "accept-encoding": "gzip" },
      });
      expect(encoded.headers["content-encoding"]).toBe("br");
      expect(encoded.body).toBe(json);
    } finally {
      await app.close();
    }
  });
  it("错误JSON保留状态和结构，problem+json也可压缩", async () => {
    const app = Fastify();
    registerCompression(app);
    app.get("/", async (_request, reply) =>
      reply
        .code(422)
        .type("application/problem+json")
        .send({ error: { message: "输入不完整".repeat(300) } }),
    );
    try {
      const r = await app.inject({
        url: "/",
        headers: { "accept-encoding": "gzip" },
      });
      expect(r.statusCode).toBe(422);
      expect(r.headers["content-encoding"]).toBe("gzip");
      expect(
        JSON.parse(gunzipSync(r.rawPayload).toString()).error.message,
      ).toBe("输入不完整".repeat(300));
    } finally {
      await app.close();
    }
  });
  it.each(["application/x-ndjson", "text/event-stream", "text/plain"])(
    "完整%s也不压缩",
    async (contentType) => {
      const app = Fastify();
      registerCompression(app);
      app.get("/", async (_request, reply) =>
        reply.type(contentType).send(json),
      );
      try {
        const r = await app.inject({
          url: "/",
          headers: { "accept-encoding": "gzip" },
        });
        expect(r.headers["content-encoding"]).toBeUndefined();
        expect(r.body).toBe(json);
      } finally {
        await app.close();
      }
    },
  );
  it.each(["application/x-ndjson", "application/json"])(
    "%s流首段在流结束之前实际到达，不被压缩器缓冲",
    async (contentType) => {
      const app = Fastify();
      registerCompression(app);
      const stream = new PassThrough();
      app.get("/", async (_request, reply) => {
        stream.write('{"first":true}\n');
        return reply.type(contentType).send(stream);
      });
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      try {
        await new Promise<void>((resolve, reject) => {
          const req = get(
            address,
            { headers: { "accept-encoding": "gzip" } },
            (res) => {
              let body = "";
              let released = false;
              res.on("data", (chunk) => {
                body += chunk.toString();
                if (!released) {
                  released = true;
                  try {
                    expect(stream.writableEnded).toBe(false);
                    expect(res.headers["content-encoding"]).toBeUndefined();
                    expect(body).toContain('"first":true');
                    stream.end('{"last":true}\n');
                  } catch (error) {
                    reject(error);
                    req.destroy();
                  }
                }
              });
              res.on("end", () => {
                clearTimeout(timer);
                try {
                  expect(body).toBe('{"first":true}\n{"last":true}\n');
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
              res.on("error", reject);
            },
          );
          const timer = setTimeout(() => {
            req.destroy();
            stream.end();
            reject(new Error("首段被缓冲"));
          }, 2000);
          req.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
        });
      } finally {
        stream.destroy();
        await app.close();
      }
    },
  );
});
