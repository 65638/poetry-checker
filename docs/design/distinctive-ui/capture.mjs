/* global process, setTimeout, Buffer, console */
// Saves screenshots of the real "/" route (real API) to disk. Never returns image data.
// Usage: node docs/design/distinctive-ui/capture.mjs <outDir> [round-label]
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, startApi, readiness, waitFor } from "../../../scripts/acceptance-runtime.mjs";
import { launchBrowser } from "../../../tests/e2e/cdp.mjs";

const out = resolve(process.argv[2] ?? "docs/design/distinctive-ui/round0");
const label = process.argv[3] ?? "round0";
mkdirSync(out, { recursive: true });
const sha = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
const dirty = execSync("git status --porcelain -- apps/web/src/presentation", { cwd: REPO_ROOT }).toString().trim() !== "";
const manifest = { label, sha, dirty, route: "/", dataMode: "real API (isolated)", shots: [] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let api, web, browser;
try {
  api = await startApi();
  manifest.readiness = (await readiness(api.baseUrl)).mode;
  const appRoot = join(REPO_ROOT, "apps/web");
  const require = createRequire(join(appRoot, "package.json"));
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  process.env.VITE_API_BASE_URL = "";
  web = await createServer({
    root: appRoot,
    configFile: join(appRoot, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: Object.fromEntries(["/api", "/healthz", "/readyz"].map((p) => [p, api.baseUrl])),
    },
  });
  await web.listen();
  manifest.url = `http://127.0.0.1:${web.httpServer.address().port}/`;
  browser = await launchBrowser();
  const { cdp, evaluate } = browser;

  let vh = 1000;
  const shot = async (name, width, mode, note, full = false) => {
    const image = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
    const file = `${name}-${width}x${vh}.png`;
    writeFileSync(join(out, file), Buffer.from(image.data, "base64"));
    manifest.shots.push({ file, viewport: `${width}x${vh}`, mode, note, at: new Date().toISOString() });
  };
  const viewport = (width, height = width < 600 ? 812 : 1000) => {
    vh = height;
    return cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 600,
    });
  };
  const reduced = (on) =>
    cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }],
    });
  const clickSel = (sel) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const load = async () => {
    await cdp.send("Page.navigate", { url: manifest.url });
    await waitFor(() => evaluate("Boolean(document.querySelector('.pc-input__text'))"));
  };
  const analyzeExample = async (index) => {
    await evaluate(`document.querySelectorAll('.pc-examples__item')[${index}].click()`);
    await sleep(150);
    await clickSel(".pc-input__submit");
    await waitFor(() => evaluate("Boolean(document.querySelector('.pc-status'))"), 30000);
  };

  for (const width of [1440, 375]) {
    await reduced(false);
    await viewport(width);
    await load();
    await sleep(120);
    await shot("motion-opening-120ms", width, "motion", "opening frame ~120ms after input ready");
    await sleep(1200);
    await shot("initial", width, "motion settled", "empty state, first viewport");
    await analyzeExample(0);
    await sleep(140);
    await shot("motion-report-140ms", width, "motion", "report reveal frame ~140ms");
    await sleep(1000);
    await shot("report", width, "motion settled", "real pingshui report, first example, top");
    await evaluate("document.querySelector('.pc-reading').scrollIntoView({block:'start'})");
    await sleep(300);
    await shot("report-poem", width, "motion settled", "poem grid scrolled into view");
    await clickSel('[data-token-id="l1c1"]');
    await waitFor(() => evaluate("Boolean(document.querySelector('[role=dialog]'))"));
    await sleep(500);
    await shot("evidence", width, "motion settled", "evidence drawer open on l1c1");
    await evaluate("document.querySelector('.pc-evidence__header button').click()");
    await sleep(300);
  }

  for (const [w, h] of [[1440, 900], [1366, 768]]) {
    await viewport(w, h);
    await load();
    await sleep(1200);
    await shot("initial", w, "motion settled", "first viewport: examples, input, book, Analyze");
  }
  await viewport(900, 900);
  await load();
  await sleep(1200);
  await analyzeExample(0);
  await sleep(1000);
  await shot("report", 900, "motion settled", "intermediate width report");
  await evaluate("document.querySelector('.pc-notes').scrollIntoView({block:'start'})");
  await sleep(300);
  await shot("findings", 900, "motion settled", "findings tally + disclosure closed");
  await viewport(1440, 900);
  await load();
  await sleep(1200);
  await analyzeExample(0);
  await sleep(1000);
  await clickSel(".pc-settled__summary");
  await evaluate("document.querySelector('.pc-notes').scrollIntoView({block:'start'})");
  await sleep(300);
  await shot("findings-open", 1440, "motion settled", "settled checks disclosure open");

  await viewport(768);
  await load();
  await sleep(1200);
  await shot("initial", 768, "motion settled", "tablet layout");
  await analyzeExample(2);
  await sleep(1000);
  await shot("report-huanghelou", 768, "motion settled", "third example, historical tags");

  await reduced(true);
  await viewport(1440);
  await load();
  await sleep(60);
  await shot("reduced-initial-60ms", 1440, "reduced-motion", "should already be final");
  await analyzeExample(0);
  await sleep(60);
  await shot("reduced-report-60ms", 1440, "reduced-motion", "should already be final");
  await evaluate(`(() => { const t = document.querySelector('.pc-input__text'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, t.value + '改'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(() => evaluate("Boolean(document.querySelector('.pc-report--stale'))"));
  await evaluate("window.scrollTo(0, 0)");
  await sleep(200);
  await shot("stale", 1440, "reduced-motion", "edited after report");
  await clickSel(".pc-segmented__option:has(input[value=cilin]) input");
  await sleep(200);
  await clickSel(".pc-input__submit");
  await waitFor(() => evaluate("Boolean(document.querySelector('[role=alert]'))"), 30000).catch(() => {});
  await sleep(300);
  await shot("error-cilin", 1440, "reduced-motion", "cilin not ready alert expected");
  manifest.alert = await evaluate("document.querySelector('[role=alert]')?.textContent?.slice(0, 80) ?? null");
} finally {
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await browser?.stop?.();
  await web?.close?.();
  await api?.stop?.();
}
console.log(`captured ${manifest.shots.length} -> ${out}`);
