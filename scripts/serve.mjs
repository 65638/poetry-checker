import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerStatic } from "./production-static.mjs";

const environment =
  process.env.POETRY_ENV_FILE ??
  fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(environment)) process.loadEnvFile(environment);
if (process.env.POETRY_DEV_MOCK === "1")
  throw new Error("Public server cannot run mock data");
const port = Number(process.env.PORT ?? 6767);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const { buildApp } = await import("../apps/api/src/server.ts");
const app = buildApp();
await registerStatic(
  app,
  fileURLToPath(new URL("../apps/web/dist/", import.meta.url)),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    app.close().catch(() => {
      process.exitCode = 1;
    });
  });
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port });
console.log(`[poetry] Production service listening on port ${port}`);
