/* global process, console, Buffer */
// Round evidence capture: screenshots to disk only, plus idle/pointer motion stats. Usage: node docs/design/moonlit-ui/capture.mjs round1
import { join } from "node:path";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { REPO_ROOT, LONG, revision, sleep, startHarness } from "./harness.mjs";

const round = process.argv[2] || "round1";
const dir = join(REPO_ROOT, "docs/design/moonlit-ui", round);
mkdirSync(dir, { recursive: true });
const sha = revision().commit;
const dirty = execSync("git status --porcelain", { cwd: REPO_ROOT }).toString().trim().length > 0;
const POEM = "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。";
const manifest = { round, sha, dirty, data: "real local API via isolated harness (not fixture)", route: "/", shots: [], motion: {} };

const h = await startHarness();
manifest.url = h.url;
const { cdp, evaluate, load, setText, analyze, idle, mouse } = h;

async function shot(name, mode, vp, full = false) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
  const file = `${vp.width}x${vp.height}-${name}.png`;
  writeFileSync(join(dir, file), Buffer.from(data, "base64"));
  manifest.shots.push({ file, state: name, mode, viewport: `${vp.width}x${vp.height}`, fullPage: full, at: new Date().toISOString() });
}
const scrollTo = (frac) => evaluate(`window.scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * ${frac}, behavior: 'instant' }), 1`);

try {
  const VIEWPORTS = [[1440, 900], [1366, 768], [1280, 800], [1100, 900], [1024, 768], [900, 900], [899, 900], [768, 1024], [375, 812]];
  for (const [width, height] of VIEWPORTS) {
    const vp = { width, height };
    const mobile = width < 500;
    await load({ width, height, mobile });
    await shot("initial", "effects-on", vp);
    await setText(POEM);
    await analyze();
    await scrollTo(0);
    await sleep(300);
    await shot("report", "effects-on", vp);
    if ([1440, 900, 375].includes(width)) {
      await shot("report-full", "effects-on", vp, true);
      const id = await evaluate("document.querySelector('[data-token-id]').dataset.tokenId");
      await evaluate(`document.querySelector('[data-token-id="${id}"]').click(), 1`);
      await sleep(600);
      await shot("evidence", "effects-on", vp);
      await evaluate("document.querySelector('.pc-evidence__header button').click(), 1");
      await sleep(300);
      await setText(LONG);
      await analyze();
      for (const [label, frac] of [["long-top", 0], ["long-middle", 0.5], ["long-bottom", 1]]) {
        await scrollTo(frac);
        await sleep(500);
        await shot(label, "effects-on", vp);
      }
      await setText(LONG + "白");
      await scrollTo(0);
      await sleep(400);
      await shot("stale", "effects-on", vp);
      await setText("abc");
      await h.click(".pc-input__submit");
      await sleep(150);
      await idle();
      await sleep(500);
      await scrollTo(0);
      await shot("error", "effects-on", vp);
    }
  }

  for (const [width, height, mobile] of [[1440, 900, false], [375, 812, true]]) {
    const vp = { width, height };
    await load({ width, height, mobile, reduce: true });
    await shot("initial", "reduced-motion", vp);
    await setText(POEM);
    await analyze();
    await scrollTo(0);
    await shot("report", "reduced-motion", vp);
  }

  await load({ width: 1440, height: 900 });
  await h.click(".pc-motion-toggle");
  await sleep(400);
  await shot("initial", "effects-off", { width: 1440, height: 900 });
  await h.click(".pc-motion-toggle");

  await load({ width: 1440, height: 900 });
  const vp = { width: 1440, height: 900 };
  const idleFrames = [];
  for (const t of [0, 10, 20, 30]) {
    if (t) await sleep(10000);
    await shot(`idle-t${t}s`, "effects-on idle", vp);
    idleFrames.push(await evaluate(`(() => {
      const pick = (s, pseudo) => { const e = document.querySelector(s); return e ? getComputedStyle(e, pseudo).transform : null; };
      return { t: ${t}, mist: pick('.pc-scene__mist--low', '::before'), haze: pick('.pc-scene__haze'), glint: pick('.pc-scene__glint--a'), raf: window.__raf };
    })()`));
  }
  manifest.motion.idle = idleFrames;

  await evaluate(`(() => {
    window.__frames = []; window.__long = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: false }); } catch { window.__long = null; }
    let last = performance.now();
    const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__frames.length < 2000) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return 1;
  })()`);
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < 10000) {
    const x = 720 + Math.round(520 * Math.cos(i / 25));
    const y = 450 + Math.round(320 * Math.sin(i / 17));
    await mouse("mouseMoved", x, y);
    if (i % 100 === 50) await shot(`pointer-${i}`, "effects-on pointer", vp);
    i += 1;
    await sleep(16);
  }
  await sleep(1200);
  await shot("pointer-settled", "effects-on settled", vp);
  manifest.motion.pointer = await evaluate(`(() => {
    const f = window.__frames.slice(5).sort((a, b) => a - b);
    const q = (p) => Math.round(f[Math.min(f.length - 1, Math.floor(f.length * p))] * 10) / 10;
    return { moves: ${i}, frames: f.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), over50ms: f.filter((x) => x > 50).length, longTasks: window.__long };
  })()`);
  manifest.motion.note = "Headless Chromium frame timings; indicative only, not a device benchmark.";
} catch (e) {
  manifest.fatal = e.message;
} finally {
  await h.stop();
}
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + String.fromCharCode(10));
console.log(`capture ${round}: ${manifest.shots.length} shots, pointer=${JSON.stringify(manifest.motion.pointer || null)}${manifest.fatal ? " fatal=" + manifest.fatal : ""}`);
process.exit(manifest.fatal ? 1 : 0);