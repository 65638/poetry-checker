/* global process, setTimeout, console */
// Text-only regression for the single-column result reveal after Analyze. Writes JSON, never images.
// Usage: node docs/design/distinctive-ui/reveal-regression.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { REPO_ROOT, startApi, waitFor, revision } from "../../../scripts/acceptance-runtime.mjs";
import { launchBrowser } from "../../../tests/e2e/cdp.mjs";

const results = { revision: revision(), at: new Date().toISOString(), viewport: "375x812", scenarios: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let api, web, browser;
try {
  api = await startApi();
  const root = join(REPO_ROOT, "apps/web");
  const require = createRequire(join(root, "package.json"));
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  process.env.VITE_API_BASE_URL = "";
  web = await createServer({
    root,
    configFile: join(root, "vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, proxy: Object.fromEntries(["/api", "/healthz", "/readyz"].map((p) => [p, api.baseUrl])) },
  });
  await web.listen();
  const url = `http://127.0.0.1:${web.httpServer.address().port}/`;
  results.url = url;
  browser = await launchBrowser();
  const { cdp, evaluate, click } = browser;

  async function load(reduce) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
    await cdp.send("Page.navigate", { url });
    await waitFor(() => evaluate("Boolean(document.querySelector('.pc-input__text'))"));
    await sleep(reduce ? 50 : 1200);
    await evaluate(`(() => {
      window.__calls = 0; window.__mode = "pass";
      const scroll = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (o) {
        if (this.classList.contains("pc-manuscript")) window.__calls += 1;
        return scroll.call(this, o);
      };
      const orig = window.fetch;
      window.fetch = async (...args) => {
        if (String(args[0]).includes("/analyze")) {
          if (window.__mode === "fail") return new Response("{}", { status: 500, headers: { "content-type": "application/json" } });
          if (window.__mode === "slow") await new Promise((r) => setTimeout(r, 1500));
        }
        return orig(...args);
      };
    })()`);
  }
  const idle = () => waitFor(() => evaluate("!document.querySelector('.pc-input__submit').disabled"), 20000);
  const reset = () => evaluate("(window.scrollTo(0, 0), window.__calls = 0)");
  const calls = () => evaluate("window.__calls");
  async function scenario(name, fn) {
    try { results.scenarios.push({ name, status: "pass", detail: await fn() }); }
    catch (e) { results.scenarios.push({ name, status: "fail", error: e.message }); }
  }
  async function loadExample() {
    await click(".pc-examples__list li:nth-child(1) button");
    await sleep(100);
  }

  for (const reduce of [true, false]) {
    const tag = reduce ? "reduced" : "normal";
    await load(reduce);
    await loadExample();
    await click(".pc-input__submit"); await idle(); await sleep(900);
    await scenario(`pointer-first-${tag}`, async () => { assert.equal(await calls(), 1); return { calls: 1 }; });

    await reset();
    await click(".pc-input__submit"); await idle(); await sleep(900);
    await scenario(`pointer-same-text-reanalysis-${tag}`, async () => {
      const n = await calls(); assert.equal(n, 1); return { calls: n };
    });
  }

  await load(true);
  await loadExample();
  await evaluate("window.__mode = 'fail'");
  await click(".pc-input__submit"); await idle(); await sleep(900);
  await scenario("failure-no-scroll", async () => {
    const d = await evaluate("({ calls: window.__calls, error: Boolean(document.querySelector('[role=alert]')) })");
    assert.equal(d.calls, 0); return d;
  });
  await evaluate("window.__mode = 'pass'");
  await sleep(1200);
  await scenario("failure-no-delayed-scroll", async () => { assert.equal(await calls(), 0); return { calls: 0 }; });

  await load(true);
  await loadExample();
  await evaluate("window.__mode = 'slow'");
  await click(".pc-input__submit");
  await sleep(200);
  await evaluate("document.querySelector('.pc-input__text').focus()");
  await cdp.send("Input.insertText", { text: "x" });
  await sleep(2500);
  await scenario("edit-during-request-cancels-no-delayed-scroll", async () => {
    const d = await evaluate("({ calls: window.__calls, busy: document.querySelector('.pc-input__submit').disabled, report: Boolean(document.querySelector('.pc-status')) })");
    assert.equal(d.calls, 0); return d;
  });

  await load(true);
  await loadExample();
  await evaluate("window.__mode = 'slow'");
  await click(".pc-input__submit");
  await sleep(200);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 180, y: 400, deltaX: 0, deltaY: 120 });
  await idle(); await sleep(900);
  await scenario("user-scroll-while-pending-no-reveal", async () => {
    const d = await evaluate("({ calls: window.__calls, report: Boolean(document.querySelector('.pc-status')) })");
    assert.equal(d.calls, 0); assert(d.report); return d;
  });

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await load(true);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await loadExample();
  await click(".pc-input__submit"); await idle(); await sleep(900);
  await scenario("desktop-1440-no-reveal", async () => { assert.equal(await calls(), 0); return { calls: 0 }; });
} finally {
  const dir = join(REPO_ROOT, "artifacts/acceptance");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "reveal-regression.json"), JSON.stringify(results, null, 2) + "\n");
  await browser?.stop(); await web?.close(); await api?.stop();
}
for (const s of results.scenarios) console.log(s.status, s.name, s.error ?? "");
process.exitCode = results.scenarios.some((s) => s.status === "fail") ? 1 : 0;