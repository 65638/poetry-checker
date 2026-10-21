#!/usr/bin/env node
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  REPO_ROOT,
  freePort,
  waitFor,
  revision,
} from "./acceptance-runtime.mjs";
import { launchBrowser } from "../tests/e2e/cdp.mjs";
import { POEMS } from "../tests/integration/e2e/d3-acceptance-api.mjs";

const out = resolve(process.argv[2] ?? "artifacts/acceptance/g07/startup.json");
const previewMode = process.argv.includes("--preview");
const result = {
  generatedAt: new Date().toISOString(),
  revision: revision(),
  node: process.version,
  runtime: previewMode ? "production-preview" : "development",
  checks: [],
  offlineRuntime: {
    scope:
      "Dependencies already installed. Browser blocks all non-loopback requests; not an OS-wide firewall or offline installer.",
  },
};
let child, browser, occupied;
function launch(port, webPort) {
  return fork(
    resolve(REPO_ROOT, "scripts/dev.mjs"),
    previewMode ? ["--preview"] : [],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        WEB_PORT: String(webPort),
        POETRY_DEV_MOCK: "0",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    },
  );
}
async function shutdown(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = once(proc, "exit");
  proc.send("shutdown");
  await Promise.race([
    exited,
    new Promise((_, reject) => {
      const t = setTimeout(() => reject(new Error("shutdown timeout")), 10000);
      t.unref();
    }),
  ]);
}
try {
  const port = await freePort(),
    webPort = await freePort();
  child = launch(port, webPort);
  let log = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (x) => (log += x));
  await waitFor(async () => {
    if (child.exitCode !== null)
      throw new Error(`dev exited ${child.exitCode}`);
    try {
      return (await fetch(`http://127.0.0.1:${webPort}/healthz`)).ok;
    } catch {
      return false;
    }
  });
  result.checks.push({
    name: "Windows path + isolated ports + real API proxy",
    passed: true,
  });
  console.log("[PASS] isolated startup and real proxy");
  const ready = await fetch(`http://127.0.0.1:${webPort}/readyz`);
  assert.equal(ready.status, 503);
  result.readinessHttp = ready.status;
  browser = await launchBrowser();
  const { cdp, evaluate, click, key } = browser;
  // Startup/connection checks need stable hit targets, independent of the
  // scene-transition animation. Normal motion is covered by dictionary.mjs.
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  let allow = true;
  const blocked = [];
  cdp.on("Fetch.requestPaused", (e) => {
    if (!allow) return;
    const u = new URL(e.request.url);
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
    if (!local) blocked.push(u.origin);
    void cdp.send(
      local ? "Fetch.continueRequest" : "Fetch.failRequest",
      local
        ? { requestId: e.requestId }
        : { requestId: e.requestId, errorReason: "BlockedByClient" },
    );
  });
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${webPort}/` });
  await waitFor(() =>
    evaluate("Boolean(document.querySelector('.pc-input__text'))"),
  );
  if (previewMode)
    assert.equal(
      await evaluate(
        "!!document.querySelector('[data-testid=dev-shell-panel]')",
      ),
      false,
    );
  await click(".pc-input__text");
  await key("a", "KeyA", 65, 2);
  await cdp.send("Input.insertText", { text: POEMS[0].text });
  await click(".pc-input__submit");
  await waitFor(() =>
    evaluate("Boolean(document.querySelector('.pc-status--pass'))"),
  );
  await click('[aria-controls="dictionary-space"]');
  await click(".pc-dictionary__input");
  await cdp.send("Input.insertText", { text: "月" });
  await click(".pc-dictionary__searchline button");
  await waitFor(() =>
    evaluate(
      "document.querySelector('.pc-dictionary__glyph')?.textContent === '月'",
    ),
  );
  await click(".pc-dictionary__compare-button");
  await waitFor(() =>
    evaluate(
      "document.querySelectorAll('.pc-dictionary__comparison-row').length === 3",
    ),
  );
  await evaluate(
    "fetch('https://example.com/g07-offline-probe').catch(()=>null)",
  );
  assert(blocked.includes("https://example.com"));
  result.offlineRuntime = {
    ...result.offlineRuntime,
    passed: true,
    formalRoute: "/",
    realPoem: POEMS[0].id,
    summary: "pass",
    dictionary: {
      character: "月",
      threeBookComparison: true,
      dataVersion: await evaluate(
        "document.querySelector('.pc-dictionary__version').textContent",
      ),
    },
    blockedOrigins: blocked,
  };
  allow = false;
  console.log(
    "[PASS] real analysis with browser non-loopback requests blocked",
  );
  await cdp.send("Fetch.disable");
  await browser.stop();
  browser = null;
  await shutdown(child);
  child = null;
  for (const p of [port, webPort]) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(p, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => server.close(resolve));
  }
  result.checks.push({
    name: "Parent coordinated shutdown releases both owned ports",
    passed: true,
    method:
      "IPC invokes same cleanup as SIGINT; Windows force-kill is not covered",
  });
  console.log("[PASS] coordinated shutdown releases both ports");
  occupied = createServer();
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const busyPort = occupied.address().port;
  child = launch(busyPort, await freePort());
  child.stdout.resume();
  child.stderr.resume();
  const [code] = await once(child, "exit");
  child = null;
  assert.equal(code, 1);
  assert(occupied.listening);
  result.checks.push({
    name: "Occupied API port exits 1; unrelated owner survives",
    passed: true,
  });
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.error = error.stack;
} finally {
  await browser?.stop();
  await shutdown(child);
  if (occupied) await new Promise((resolve) => occupied.close(resolve));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
