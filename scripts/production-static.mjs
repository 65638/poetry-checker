import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { acceptsGzip, varyByEncoding } from "./production-compression.mjs";
import { StaticCompressionCache } from "./static-compression-cache.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

/** Only the prebuilt public directory is served, never source or configuration. */
export async function registerStatic(app, directory) {
  const root = await realpath(directory);
  const compressedFiles = new StaticCompressionCache();
  await stat(resolve(root, "index.html"));
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    // A foreign webpage must not silently spend this server's model quota.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin) {
        let allowed = false;
        try {
          allowed = new URL(origin).host === request.headers.host;
        } catch {
          /* reject */
        }
        if (!allowed)
          return reply.code(403).send({
            error: {
              code: "ORIGIN_NOT_ALLOWED",
              message: "请从本站页面提交。",
              fieldErrors: [],
            },
          });
      }
    }
  });
  app.get("/*", async (request, reply) => {
    let pathname;
    try {
      pathname = decodeURIComponent(request.url.split("?")[0]);
    } catch {
      return reply.code(400).send({ error: "Invalid path" });
    }
    const parts = pathname.split("/");
    if (
      pathname.includes("\\") ||
      pathname.includes("\0") ||
      parts.some((p) => p.startsWith("."))
    )
      return reply.code(404).send({ error: "Not found" });
    if (pathname === "/api" || pathname.startsWith("/api/"))
      return reply.code(404).send({ error: "Not found" });
    const name = pathname === "/" ? "index.html" : pathname.slice(1);
    const type = types[extname(name)];
    if (!type) return reply.code(404).send({ error: "Not found" });
    let file;
    let info;
    try {
      file = await realpath(resolve(root, name));
      if (!file.startsWith(root + sep))
        return reply.code(404).send({ error: "Not found" });
      info = await stat(file);
      if (!info.isFile()) return reply.code(404).send({ error: "Not found" });
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
    reply.type(type);
    reply.header(
      "Cache-Control",
      name.startsWith("assets/") && /-[\w-]{8,}\./u.test(name)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    if (
      [".html", ".js", ".css", ".svg", ".txt"].includes(extname(name)) &&
      info.size >= 1024
    ) {
      varyByEncoding(reply);
      if (acceptsGzip(request.headers["accept-encoding"])) {
        const compressed = await compressedFiles.get(file, info);
        if (compressed) {
          reply.header("Content-Encoding", "gzip");
          reply.header("Content-Length", compressed.length);
          return reply.send(compressed);
        }
        // A concurrently published index may have changed during the read.
        info = await stat(file);
      }
    }
    reply.header("Content-Length", info.size);
    return reply.send(createReadStream(file));
  });
}
