import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { archivedAssetMiddleware } from "../../scripts/preview-assets.mjs";
let root, url, server;
before(async () => {
  root = await mkdtemp(join(tmpdir(), "poetry-published-assets-"));
  const site = join(root, "site"),
    archive = join(root, "archive");
  await mkdir(join(site, "assets"), { recursive: true });
  await mkdir(archive);
  await writeFile(
    join(archive, "LibraryContainer-AbCd1234.js"),
    'export const version="previous";',
  );
  await writeFile(join(archive, "index-AbCd1234.css"), "body{color:red}");
  await writeFile(join(site, "assets", "current-AbCd1234.js"), "current");
  await writeFile(join(archive, "current-AbCd1234.js"), "obsolete");
  await writeFile(join(archive, ".env.local"), "must-not-serve");
  const middleware = archivedAssetMiddleware(site, archive);
  server = createServer((request, response) =>
    middleware(request, response, (error) => {
      response.statusCode = error ? 500 : 418;
      response.end("normal-handler");
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  // This temporary directory was created exclusively by this test.
  if (root) await rm(root, { recursive: true, force: true });
});
test("old lazy chunks retain exact body, JavaScript MIME and immutable caching", async () => {
  const response = await fetch(`${url}/assets/LibraryContainer-AbCd1234.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /javascript/u);
  assert.match(response.headers.get("cache-control"), /immutable/u);
  assert.equal(await response.text(), 'export const version="previous";');
});
test("current assets and non-GET requests use the normal handler", async () => {
  for (const [path, method] of [
    ["current-AbCd1234.js", "GET"],
    ["LibraryContainer-AbCd1234.js", "POST"],
  ]) {
    assert.equal(
      (await fetch(`${url}/assets/${path}`, { method })).status,
      418,
    );
  }
});
test("HEAD has the same headers and no body; CSS has its own MIME", async () => {
  const response = await fetch(`${url}/assets/index-AbCd1234.css?v=1`, {
    method: "HEAD",
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/css/u);
  assert.equal(Number(response.headers.get("content-length")), 15);
  assert.equal(await response.text(), "");
});
test("missing hashed assets return 404 instead of an HTML page", async () => {
  const response = await fetch(`${url}/assets/missing-AbCd1234.js`);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /<html/iu);
});
test("private names and encoded traversal cannot address the archive", async () => {
  for (const path of [
    "/assets/.env.local",
    "/assets/%2e%2e%2f.env.local",
    "/assets/%2fLibraryContainer-AbCd1234.js",
    "/index.html",
    "/assets/LibraryContainer-AbCd1234.js/extra",
  ]) {
    const response = await fetch(url + path);
    assert.equal(response.status, 418);
    assert.equal(await response.text(), "normal-handler");
  }
});
