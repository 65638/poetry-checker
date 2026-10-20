/* global process, console */
// Run after pnpm build. The API and production frontend use their own free localhost ports.
import { startStack } from "./harness.mjs";
const stack = await startStack({ production: true });
console.log(
  JSON.stringify({
    url: stack.url,
    previewPid: process.pid,
    apiPid: stack.apiPid,
    cleanup: `taskkill /PID ${process.pid} /T /F`,
    mode: "production frontend, real local API",
  }),
);
let closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  await stack.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
