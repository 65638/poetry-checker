#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { archivedAssetMiddleware } from "./preview-assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const apiPort = Number(process.env.PORT ?? 3000);
const webPort = Number(process.env.WEB_PORT ?? 5173);
const previewMode = process.argv.includes("--preview");
const previewDirectory = process.env.POETRY_PREVIEW_DIST
  ? resolve(process.env.POETRY_PREVIEW_DIST)
  : join(root, "apps/web/dist");
let api, web;
let closing;
async function stop(code = 0) {
  if (closing) return closing;
  closing = (async () => {
    await web?.close();
    if (api?.pid && api.exitCode === null && api.signalCode === null) {
      await new Promise((resolve) => {
        api.once("exit", resolve);
        api.kill("SIGTERM");
      });
    }
    process.exitCode = code;
    if (process.connected) process.disconnect();
  })();
  return closing;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void stop());
if (process.send)
  process.on("message", (message) => {
    if (message === "shutdown") void stop();
  });

try {
  if (process.argv.slice(2).some((arg) => arg !== "--preview"))
    throw new Error("用法：node scripts/dev.mjs [--preview]");
  if (previewMode && !existsSync(join(previewDirectory, "index.html")))
    throw new Error(
      "缺少页面构建，请先运行 pnpm build，再运行 node scripts/dev.mjs --preview",
    );
  for (const port of [apiPort, webPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT / WEB_PORT 必须是 1–65535 的整数");
    const probe = createNetServer();
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => probe.close(resolve));
  }
  if (apiPort === webPort) throw new Error("API 与 Web 端口必须不同");
  api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(apiPort) },
    windowsHide: true,
    stdio: "inherit",
  });
  api.once("error", (error) => {
    console.error(`[dev] API 启动失败：${error.message}`);
    void stop(1);
  });
  api.once("exit", (code) => {
    if (!closing) {
      console.error(`[dev] API 已退出：${code}`);
      void stop(code || 1);
    }
  });
  const require = createRequire(join(root, "apps/web/package.json"));
  const { createServer, preview } = await import(
    pathToFileURL(require.resolve("vite")).href
  );
  const connection = {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: Object.fromEntries(
      ["/api", "/healthz", "/readyz"].map((path) => [
        path,
        `http://127.0.0.1:${apiPort}`,
      ]),
    ),
  };
  const config = {
    root: join(root, "apps/web"),
    configFile: join(root, "apps/web/vite.config.ts"),
    ...(previewMode ? { build: { outDir: previewDirectory } } : {}),
    ...(previewMode && process.env.POETRY_PREVIEW_ASSET_ARCHIVE
      ? {
          plugins: [
            {
              name: "poetry-previous-release-assets",
              configurePreviewServer(server) {
                server.middlewares.use(
                  archivedAssetMiddleware(
                    previewDirectory,
                    resolve(process.env.POETRY_PREVIEW_ASSET_ARCHIVE),
                  ),
                );
              },
            },
          ],
        }
      : {}),
    server: connection,
    preview: connection,
  };
  if (previewMode) {
    const server = await preview(config);
    web = {
      close: () =>
        new Promise((resolve, reject) =>
          server.httpServer.close((error) =>
            error ? reject(error) : resolve(),
          ),
        ),
    };
  } else {
    web = await createServer(config);
    await web.listen();
  }
  console.log(
    `[${previewMode ? "preview" : "dev"}] API http://127.0.0.1:${apiPort} · Web http://127.0.0.1:${webPort} · Ctrl+C 全部停止`,
  );
} catch (error) {
  console.error(`[dev] 启动失败：${error.message}`);
  await stop(1);
}
