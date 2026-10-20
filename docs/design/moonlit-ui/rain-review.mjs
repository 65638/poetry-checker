/* global process, console, Buffer, fetch */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  startHarness,
  sleep,
  revision,
  REPO_ROOT,
  makeRecorder,
  LONG,
} from "./harness.mjs";

const round = process.argv[2] || "rain-round1";
const dir = join(REPO_ROOT, "docs/design/moonlit-ui", round);
mkdirSync(dir, { recursive: true });
const result = {
  revision: revision(),
  at: new Date().toISOString(),
  mode: "production build / real local API",
  shots: [],
  scenarios: [],
};
const scenario = makeRecorder(result);
const h = await startHarness({ production: true });
result.url = h.url;
result.browser = await h.cdp.send("Browser.getVersion");
const { evaluate, cdp, mouse, load, click } = h;
const poem = "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。";
const shot = async (name) => {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(dir, name + ".png"), Buffer.from(data, "base64"));
  result.shots.push({
    name: name + ".png",
    at: new Date().toISOString(),
    viewport: await evaluate("({ width: innerWidth, height: innerHeight })"),
  });
};
const probe = async () =>
  evaluate(`(() => {
  window.__rainProbe = { frames: 0, curves: [], rings: [] };
  const proto = CanvasRenderingContext2D.prototype;
  const clear = proto.clearRect, move = proto.moveTo, curve = proto.quadraticCurveTo, ellipse = proto.ellipse;
  proto.clearRect = function (...a) { if (this.canvas.classList.contains('pc-rain')) { window.__rainProbe.frames++; window.__rainProbe.curves = []; window.__rainProbe.rings = []; } return clear.apply(this, a); };
  proto.moveTo = function (x, y) { if (this.canvas.classList.contains('pc-rain')) this.__rainStart = [x, y]; return move.call(this, x, y); };
  proto.quadraticCurveTo = function (...a) { if (this.canvas.classList.contains('pc-rain')) window.__rainProbe.curves.push({ start: this.__rainStart, end: a.slice(2), control: a.slice(0, 2) }); return curve.apply(this, a); };
  proto.ellipse = function (...a) { if (this.canvas.classList.contains('pc-rain')) window.__rainProbe.rings.push(a.slice(0, 4)); return ellipse.apply(this, a); };
  window.__rainUnprobe = () => { proto.clearRect = clear; proto.moveTo = move; proto.quadraticCurveTo = curve; proto.ellipse = ellipse; };
})()`);
try {
  await load();
  await shot("1440-initial");
  await scenario("native-cursors-and-no-luminous-follower", async () => {
    const d = await evaluate(`(() => {
      const cursor = (s) => getComputedStyle(document.querySelector(s)).cursor;
      return { scene: cursor('.pc-root'), paper: cursor('.pc-plinth'), button: cursor('.pc-examples__item'), text: cursor('textarea'), halo: !!document.querySelector('.pc-scene__halo') };
    })()`);
    assert(d.scene.includes("cursor-rain-light.svg"));
    assert(d.paper.includes("cursor-rain-ink.svg"));
    assert(d.button.includes("cursor-rain-action-ink.svg"));
    assert.equal(d.text, "text");
    assert(!d.halo);
    for (const name of ["light", "ink", "action-light", "action-ink"])
      assert((await fetch(h.url + "design/cursor-rain-" + name + ".svg")).ok);
    return d;
  });
  await probe();
  await scenario(
    "idle-rain-paints-and-creates-small-water-impacts",
    async () => {
      const frames = await evaluate("window.__rainProbe.frames");
      await sleep(1200);
      const d = await evaluate(
        "({ frames: window.__rainProbe.frames, drops: window.__rainProbe.curves.length, rings: window.__rainProbe.rings.length })",
      );
      assert(d.frames > frames + 20);
      assert(d.drops >= 65 && d.drops <= 250);
      assert(d.rings > 0 && d.rings <= 24);
      return d;
    },
  );
  await scenario("pointer-bends-nearby-rain-and-then-settles", async () => {
    const sample = async () => {
      const samples = [];
      for (let i = 0; i < 12; i++) {
        samples.push(
          ...(await evaluate(
            "window.__rainProbe.curves.filter((p) => Math.hypot(p.end[0]-1130, p.end[1]-530) < 130).map((p) => Math.abs(p.end[0]-p.start[0]))",
          )),
        );
        await sleep(80);
      }
      return samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
    };
    const baseline = await sample();
    for (let x = 860; x <= 1130; x += 15) {
      await mouse("mouseMoved", x, 530);
      await sleep(16);
    }
    await shot("1440-pointer-wind");
    const bent = await sample();
    assert(bent > baseline * 1.4, JSON.stringify({ baseline, bent }));
    await sleep(1300);
    const stillPainting = await evaluate("window.__rainProbe.frames");
    await sleep(200);
    assert((await evaluate("window.__rainProbe.frames")) > stillPainting);
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-rain').dataset.reacting || null",
      ),
      null,
    );
    return {
      baselineHorizontalStroke: baseline,
      pointerHorizontalStroke: bent,
      ambientContinues: true,
    };
  });
  await scenario(
    "water-click-large-ring-and-control-click-no-large-ring",
    async () => {
      await mouse("mousePressed", 1020, 740, { button: "left", clickCount: 1 });
      await mouse("mouseReleased", 1020, 740, {
        button: "left",
        clickCount: 1,
      });
      await sleep(550);
      const max = await evaluate(
        "Math.max(0, ...window.__rainProbe.rings.map((r) => r[2]))",
      );
      assert(max > 28, `no deliberate ring ${max}`);
      await shot("1440-water-click");
      await sleep(1800);
      await click(".pc-examples__item");
      await sleep(550);
      const controlMax = await evaluate(
        "Math.max(0, ...window.__rainProbe.rings.map((r) => r[2]))",
      );
      assert(controlMax <= 26, `control spawned ring ${controlMax}`);
      return { clickedWaterRadius: max, controlRadius: controlMax };
    },
  );
  await scenario("paper-and-touch-do-not-drive-rain", async () => {
    await mouse("mouseMoved", 300, 300);
    await sleep(80);
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-rain').dataset.reacting || null",
      ),
      null,
    );
    await mouse("mouseMoved", 1100, 500);
    await evaluate(
      "window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 900, clientY: 500 }))",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-rain').dataset.reacting || null",
      ),
      null,
    );
    return { paperSheltered: true, touchClearsPointer: true };
  });
  for (const type of ["blur", "hidden", "forced-colors"]) {
    await scenario(`${type}-pauses-and-resumes-all-motion`, async () => {
      if (type === "blur")
        await evaluate("window.dispatchEvent(new Event('blur'))");
      if (type === "hidden")
        await evaluate(
          "Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))",
        );
      if (type === "forced-colors")
        await cdp.send("Emulation.setEmulatedMedia", {
          features: [{ name: "forced-colors", value: "active" }],
        });
      await sleep(100);
      const frames = await evaluate("window.__rainProbe.frames");
      await sleep(220);
      assert.equal(await evaluate("window.__rainProbe.frames"), frames);
      assert.equal(await h.sceneAnims("running"), 0);
      if (type === "blur")
        await evaluate("window.dispatchEvent(new Event('focus'))");
      if (type === "hidden")
        await evaluate(
          "Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))",
        );
      if (type === "forced-colors")
        await cdp.send("Emulation.setEmulatedMedia", { features: [] });
      await sleep(200);
      assert((await evaluate("window.__rainProbe.frames")) > frames);
      return { paused: true, resumed: true };
    });
  }
  await scenario("effects-off-and-live-reduced-motion-stop-loop", async () => {
    await click(".pc-motion-toggle");
    await sleep(100);
    let frames = await evaluate("window.__rainProbe.frames");
    await sleep(200);
    assert.equal(await evaluate("window.__rainProbe.frames"), frames);
    await shot("1440-effects-off");
    await click(".pc-motion-toggle");
    await sleep(150);
    await h.media(true);
    await sleep(100);
    frames = await evaluate("window.__rainProbe.frames");
    await sleep(200);
    assert.equal(await evaluate("window.__rainProbe.frames"), frames);
    assert.equal(await h.sceneAnims("running"), 0);
    await shot("1440-reduced-motion");
    await h.media(false);
    return { offStops: true, reducedStops: true };
  });
  await evaluate("window.__rainUnprobe()");
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [900, 900],
    [899, 900],
    [375, 812],
  ]) {
    await load({ width, height, mobile: width === 375 });
    await shot(`${width}-initial`);
    await h.setText(poem);
    await h.analyze();
    await scenario(`reading-layout-and-cursors-${width}`, async () => {
      const d = await evaluate(
        "({ overflow: document.documentElement.scrollWidth > innerWidth, cursor: getComputedStyle(document.querySelector('.pc-cell')).cursor, paper: getComputedStyle(document.querySelector('.pc-manuscript')).cursor })",
      );
      assert(!d.overflow);
      if (width >= 900) {
        assert(d.cursor.includes("cursor-rain-action-ink"));
        assert(d.paper.includes("cursor-rain-ink"));
      }
      return d;
    });
    await shot(`${width}-report`);
  }
  await load();
  await h.setText(LONG);
  await h.analyze();
  await evaluate(
    "window.scrollTo(0, document.documentElement.scrollHeight * .5)",
  );
  await sleep(400);
  await shot("1440-long-middle");
  await evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  await sleep(400);
  await shot("1440-long-bottom");
  await load();
  result.idle = [];
  for (const t of [0, 10, 20, 30]) {
    if (t) await sleep(10000);
    await shot(`idle-${t}s`);
    result.idle.push(
      await evaluate(
        `({ t: ${t}, canvas: document.querySelector('.pc-rain').dataset.running, animations: document.getAnimations().filter(a => a.playState === 'running').length })`,
      ),
    );
  }
} catch (error) {
  result.fatal = error.message;
} finally {
  await h.stop();
}
writeFileSync(
  join(dir, "manifest.json"),
  JSON.stringify(result, null, 2) + "\n",
);
for (const s of result.scenarios) console.log(s.status, s.name, s.error ?? "");
console.log(`Shots ${result.shots.length}; fatal ${result.fatal || "none"}`);
process.exitCode =
  result.fatal || result.scenarios.some((s) => s.status !== "pass") ? 1 : 0;
