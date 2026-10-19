import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

export function revision() {
  return {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).trim().length > 0,
  };
}

export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  return port;
}

// Only children started by this runner are ever stopped.
export function managedProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  let logs = "";
  let error;
  child.on("error", (err) => {
    error = err;
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      logs = (logs + chunk.toString()).slice(-16000);
    });
  }
  return {
    child,
    check() {
      if (error) throw error;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`子进程提前退出：${logs}`);
      }
    },
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid)
        return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await Promise.race([exited, delay(1000)]);
      }
    },
  };
}

export async function waitFor(check, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`等待超时（${timeoutMs}ms）`);
}

export async function startApi(timeoutMs = 20000) {
  const port = await freePort();
  // --import tsx runs the server in this process, not a CLI wrapper with orphan children.
  const proc = managedProcess(
    process.execPath,
    ["--import", "tsx", "apps/api/src/server.ts"],
    {
      env: { ...process.env, PORT: String(port), POETRY_DEV_MOCK: "0" },
    },
  );
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => {
      proc.check();
      try {
        return (
          await fetch(`${baseUrl}/healthz`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok;
      } catch {
        return false;
      }
    }, timeoutMs);
    return { ...proc, baseUrl };
  } catch (err) {
    await proc.stop();
    throw err;
  }
}

export async function readiness(baseUrl) {
  const response = await fetch(`${baseUrl}/readyz`, {
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  const header = response.headers.get("x-poetry-versions");
  return {
    http: response.status,
    mode: response.headers.get("x-poetry-mode") ?? "undeclared",
    versions: header
      ? JSON.parse(decodeURIComponent(header))
      : (body.versions ?? null),
    body,
  };
}
