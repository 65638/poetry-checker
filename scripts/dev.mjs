#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const apiPort = Number(process.env.PORT ?? 3000);
const webPort = Number(process.env.WEB_PORT ?? 5173);
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
  const { createServer } = await import(
    pathToFileURL(require.resolve("vite")).href
  );
  web = await createServer({
    root: join(root, "apps/web"),
    configFile: join(root, "apps/web/vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: webPort,
      strictPort: true,
      proxy: Object.fromEntries(
        ["/api", "/healthz", "/readyz"].map((path) => [
          path,
          `http://127.0.0.1:${apiPort}`,
        ]),
      ),
    },
  });
  await web.listen();
  console.log(
    `[dev] API http://127.0.0.1:${apiPort} · Web http://127.0.0.1:${webPort} · Ctrl+C 全部停止`,
  );
} catch (error) {
  console.error(`[dev] 启动失败：${error.message}`);
  await stop(1);
}
