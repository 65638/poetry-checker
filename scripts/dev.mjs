#!/usr/bin/env node
// 一键启动 API(3000) + Web(5173)：Ctrl+C 统一清理子进程；端口占用时明确报错退出。
import { spawn } from "node:child_process";

const procs = [];

function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, shell: true, stdio: "inherit" });
  procs.push(child);
  child.on("exit", (code) => {
    console.log(`[dev] ${name} 退出（code=${code}）`);
  });
  return child;
}

function cleanup() {
  for (const p of procs) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"]);
      } else {
        p.kill("SIGTERM");
      }
    } catch {
      // 已退出
    }
  }
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

const root = new URL("..", import.meta.url).pathname;
start("api", "pnpm", ["--filter", "@poetry/api", "dev"], root);
start("web", "pnpm", ["--filter", "@poetry/web", "dev"], root);
console.log("[dev] API http://localhost:3000 · Web http://localhost:5173 · Ctrl+C 全部停止");
