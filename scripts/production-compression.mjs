import { promisify } from "node:util";
import { gzip } from "node:zlib";

const compress = promisify(gzip);
const MIN_BYTES = 1024;

export function acceptsGzip(header) {
  if (typeof header !== "string" || !header.trim()) return false;
  const qualities = new Map();
  for (const part of header.split(",")) {
    const [coding, ...parameters] = part.trim().toLowerCase().split(";");
    if (!coding) continue;
    let quality = 1;
    for (const parameter of parameters) {
      const [name, value] = parameter.trim().split("=");
      if (name.trim() === "q") {
        const q = value?.trim() ?? "";
        quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u.test(q)
          ? Number(q)
          : 0;
      }
    }
    qualities.set(coding.trim(), quality);
  }
  const gzipQuality = qualities.get("gzip") ?? qualities.get("*") ?? 0;
  const identityQuality =
    qualities.get("identity") ?? (qualities.get("*") === 0 ? 0 : 1);
  return gzipQuality > 0 && gzipQuality >= identityQuality;
}

export function varyByEncoding(reply) {
  const previous = reply.getHeader("vary");
  const fields = (
    Array.isArray(previous) ? previous.join(",") : String(previous ?? "")
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !fields.some((value) =>
      ["*", "accept-encoding"].includes(value.toLowerCase()),
    )
  )
    fields.push("Accept-Encoding");
  reply.header("Vary", fields.join(", "));
}

/** Compress only completed JSON payloads; analysis events and streams pass through. */
export function registerCompression(app) {
  app.addHook("onSend", async (request, reply, payload) => {
    if (
      request.method === "HEAD" ||
      [204, 304].includes(reply.statusCode) ||
      reply.getHeader("content-encoding") ||
      !(typeof payload === "string" || Buffer.isBuffer(payload)) ||
      !/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/iu.test(
        String(reply.getHeader("content-type") ?? ""),
      ) ||
      /(?:^|,)\s*no-transform\s*(?:,|$)/iu.test(
        String(reply.getHeader("cache-control") ?? ""),
      )
    )
      return payload;
    const bytes = typeof payload === "string" ? Buffer.from(payload) : payload;
    if (bytes.length < MIN_BYTES) return payload;
    // Uncompressed variants also need Vary: a shared cache must not mix clients.
    varyByEncoding(reply);
    if (!acceptsGzip(request.headers["accept-encoding"])) return payload;
    const compressed = await compress(bytes, { level: 6 });
    if (compressed.length >= bytes.length) return payload;
    reply.header("Content-Encoding", "gzip");
    reply.removeHeader("Content-Length");
    // A strong validator for identity bytes cannot identify the gzip bytes.
    const etag = reply.getHeader("etag");
    if (typeof etag === "string" && !etag.startsWith("W/"))
      reply.header("ETag", `W/${etag}`);
    return compressed;
  });
}
