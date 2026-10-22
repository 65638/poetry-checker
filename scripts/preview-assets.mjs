import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const assetName =
  /^\/assets\/([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|ttf|otf|png|jpe?g|webp|svg|avif))$/u;
const types = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** Only old content-addressed public assets are served here; current assets keep Vite's normal handling. */
export function archivedAssetMiddleware(siteDirectory, archiveDirectory) {
  return (request, response, next) => {
    if (request.method !== "GET" && request.method !== "HEAD") return next();
    const match = assetName.exec((request.url ?? "").split("?")[0]);
    if (!match || existsSync(join(siteDirectory, "assets", match[1])))
      return next();
    void readFile(join(archiveDirectory, match[1])).then(
      (bytes) => {
        response.setHeader("Content-Type", types[match[2]]);
        response.setHeader("Content-Length", bytes.byteLength);
        response.setHeader(
          "Cache-Control",
          "public, max-age=31536000, immutable",
        );
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(request.method === "HEAD" ? undefined : bytes);
      },
      (error) => {
        if (error.code !== "ENOENT") return next(error);
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(
          request.method === "HEAD"
            ? undefined
            : "Published asset is unavailable. Refresh the page to load the current release.",
        );
      },
    );
  };
}
