/* global process, setTimeout, console */
// Text-only layout probe for self-review: prints geometry, never images.
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, startApi, waitFor } from "../../../scripts/acceptance-runtime.mjs";
import { launchBrowser } from "../../../tests/e2e/cdp.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROBE = `(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const fs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).fontSize + ' ' + getComputedStyle(e).fontFamily.split(',')[0] : null; };
  const lines = [...document.querySelectorAll('.pc-line')].map(l => { const ys = new Set([...l.querySelectorAll('.pc-cell')].map(c => Math.round(c.getBoundingClientRect().y))); return ys.size; });
  return { vw: innerWidth, scrollW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    stage: r('.pc-stage'), title: r('.pc-title'), titleFont: fs('.pc-title'), glyph: r('.pc-stage__glyph'),
    plinth: r('.pc-plinth'), textarea: r('.pc-input__text'), submit: r('.pc-input__submit'), manuscript: r('.pc-manuscript'),
    status: r('.pc-status'), statusLabel: fs('.pc-status__label'), reading: r('.pc-reading'), cell: r('.pc-cell'), cellFont: fs('.pc-cell__char'),
    rowsPerLine: lines, dialog: r('[role=dialog]'), statusBody: r('.pc-status > div:nth-child(2)'), examples: r('.pc-examples'), parts: [...document.querySelectorAll('.pc-plinth, .pc-plinth__heading, .pc-input > *')].map(e => e.className.split(' ')[0] + ':' + Math.round(e.getBoundingClientRect().y) + '+' + Math.round(e.getBoundingClientRect().height)).join(' '),
    attention: document.querySelectorAll('.pc-findings:not(.pc-findings--settled) > li').length, settled: document.querySelectorAll('.pc-findings--settled > li').length };
})()`;

let api, web, browser;
try {
  api = await startApi();
  const appRoot = join(REPO_ROOT, "apps/web");
  const require = createRequire(join(appRoot, "package.json"));
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  process.env.VITE_API_BASE_URL = "";
  web = await createServer({ root: appRoot, configFile: join(appRoot, "vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, proxy: Object.fromEntries(["/api", "/healthz", "/readyz"].map((p) => [p, api.baseUrl])) } });
  await web.listen();
  const url = `http://127.0.0.1:${web.httpServer.address().port}/`;
  browser = await launchBrowser();
  const { cdp, evaluate } = browser;
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const sizes = (process.env.PROBE_SIZES || "1440x1000,768x1000,375x812").split(",").map((s) => s.split("x").map(Number));
  for (const [width, height] of sizes) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await cdp.send("Page.navigate", { url });
    await waitFor(() => evaluate("Boolean(document.querySelector('.pc-input__text'))"));
    await sleep(200);
    console.log("initial", JSON.stringify(await evaluate(PROBE)));
    await evaluate("document.querySelectorAll('.pc-examples__item')[0].click()");
    await sleep(150);
    await evaluate("document.querySelector('.pc-input__submit').click()");
    await waitFor(() => evaluate("Boolean(document.querySelector('.pc-status'))"), 30000);
    await sleep(200);
    console.log("report", JSON.stringify(await evaluate(PROBE)));
  }
} finally {
  await browser?.stop?.();
  await web?.close?.();
  await api?.stop?.();
}
