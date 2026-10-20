/* global process, console, Buffer */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startHarness, sleep, revision, REPO_ROOT } from "./harness.mjs";
const dir = join(REPO_ROOT, "docs/design/moonlit-ui/rain-motion");
mkdirSync(join(dir, "frames"), { recursive: true });
const h = await startHarness({ production: true });
const result = {
  revision: revision(),
  at: new Date().toISOString(),
  frames: [],
  route: "/",
  viewport: "1440x900",
  mode: "real production app / canvas instrumented for timings only",
};
try {
  await h.load();
  await h.evaluate(`(() => {
    window.__paints = []; window.__longTasks = [];
    const proto = CanvasRenderingContext2D.prototype;
    const clear = proto.clearRect;
    let last = 0;
    proto.clearRect = function(...a) {
      if (this.canvas.classList.contains('pc-rain')) { const now = performance.now(); if (last) window.__paints.push(now-last); last = now; }
      return clear.apply(this,a);
    };
    window.__motionObserver = new PerformanceObserver(l => l.getEntries().forEach(e => window.__longTasks.push(e.duration)));
    window.__motionObserver.observe({ type: 'longtask', buffered: false });
  })()`);
  const start = Date.now();
  let moves = 0;
  while (Date.now() - start < 10000) {
    const t = (Date.now() - start) / 1000;
    await h.mouse(
      "mouseMoved",
      1060 + Math.sin(t * 2) * 190,
      535 + Math.cos(t * 1.5) * 150,
    );
    moves++;
    await sleep(16);
  }
  result.performance = await h.evaluate(`(() => {
    const a = window.__paints.slice(3).sort((a,b) => a-b);
    const q = p => Number(a[Math.floor((a.length-1)*p)].toFixed(2));
    return { paintCount: a.length, p50: q(.5), p95: q(.95), p99: q(.99), over50ms: a.filter(t => t>50).length, longTasks: window.__longTasks, moves: ${moves} };
  })()`);
  // Screen frames include real layout and rain, not an invented animation or canvas-only mockup.
  await h.load();
  for (let i = 0; i < 72; i++) {
    if (i >= 18 && i < 47)
      await h.mouse(
        "mouseMoved",
        880 + (i - 18) * 13,
        520 + Math.sin((i - 18) / 5) * 65,
      );
    if (i === 48) {
      await h.mouse("mousePressed", 1010, 788, {
        button: "left",
        clickCount: 1,
      });
      await h.mouse("mouseReleased", 1010, 788, {
        button: "left",
        clickCount: 1,
      });
    }
    const at = Date.now();
    const { data } = await h.cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    const file = `frame-${String(i).padStart(3, "0")}.png`;
    writeFileSync(join(dir, "frames", file), Buffer.from(data, "base64"));
    result.frames.push({
      file,
      at,
      phase:
        i < 18
          ? "idle"
          : i < 47
            ? "pointer-wind"
            : i < 61
              ? "water-click"
              : "settled",
    });
    await sleep(Math.max(1, 100 - (Date.now() - at)));
  }
  result.note =
    "Actual browser screenshots at recorded timestamps. Browser capture omits native OS cursor; SVG assets and computed cursor styles are separately tested. Headless timing is not a display FPS certification.";
} finally {
  await h.stop();
}
writeFileSync(
  join(dir, "manifest.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result.performance));
process.exitCode = 0;
