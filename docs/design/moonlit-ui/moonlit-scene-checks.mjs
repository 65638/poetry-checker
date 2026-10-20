/* global process, console */
// Scene + motion-preference regression. Usage: node docs/design/moonlit-ui/moonlit-scene-checks.mjs
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  REPO_ROOT,
  revision,
  sleep,
  startHarness,
  makeRecorder,
} from "./harness.mjs";

const results = {
  suite: "scene",
  revision: revision(),
  at: new Date().toISOString(),
  scenarios: [],
};
const scenario = makeRecorder(results);
let h;
try {
  h = await startHarness();
  results.url = h.url;
  const { evaluate, click, load, media, sceneAnims, mouse } = h;
  const rootAttr = (name) =>
    evaluate(`document.querySelector('.pc-root').dataset.${name} || null`);
  const durReport = () =>
    evaluate(
      "parseFloat(getComputedStyle(document.querySelector('.pc-root')).getPropertyValue('--pc-dur-report'))",
    );

  for (const [w, ht] of [
    [1440, 900],
    [1366, 768],
  ]) {
    await load({ width: w, height: ht });
    await scenario(`analyze-above-fold-${w}x${ht}`, () =>
      evaluate(`(() => {
      const r = document.querySelector('.pc-input__submit').getBoundingClientRect();
      const ex = document.querySelector('.pc-examples__item');
      const ta = document.querySelector('.pc-input__text');
      const d = { bottom: Math.round(r.bottom), vh: innerHeight, rows: ta.rows, exampleBeforeEditor: ex ? ex.getBoundingClientRect().top < ta.getBoundingClientRect().top : null };
      if (d.bottom > d.vh) throw new Error('submit bottom ' + d.bottom + ' > ' + d.vh);
      return d;
    })()`),
    );
  }

  await load();
  await scenario("idle-rain-running-independent-of-pointer", async () => {
    const running = await sceneAnims("running");
    const r0 = await evaluate("window.__raf");
    await sleep(1500);
    const r1 = await evaluate("window.__raf");
    assert(running >= 3, `ambient running ${running}`);
    assert(
      r1 - r0 > 10,
      "rain canvas must keep painting while pointer is still",
    );
    return { running, rainFramesWhileIdle: r1 - r0 };
  });

  await scenario("pointer-move-then-settle", async () => {
    for (let i = 0; i < 14; i += 1) {
      await mouse("mouseMoved", 200 + i * 45, 140 + i * 12);
      await sleep(16);
    }
    await sleep(80);
    const moving = await evaluate(
      "({ reacting: document.querySelector('.pc-rain').dataset.reacting || null, running: document.querySelector('.pc-rain').dataset.running || null, px: Number(getComputedStyle(document.querySelector('.pc-scene')).getPropertyValue('--pc-px')) })",
    );
    assert.equal(moving.reacting, "true");
    assert.equal(moving.running, "true");
    await sleep(2600);
    const r0 = await evaluate("window.__raf");
    await sleep(500);
    const r1 = await evaluate("window.__raf");
    const settled = await evaluate(
      "({ reacting: document.querySelector('.pc-rain').dataset.reacting || null, px: Number(getComputedStyle(document.querySelector('.pc-scene')).getPropertyValue('--pc-px')) })",
    );
    assert.equal(settled.reacting, null, "pointer wind must settle");
    assert(Math.abs(settled.px) < 0.01, `parallax not settled ${settled.px}`);
    assert(r1 - r0 > 10, "rain canvas must continue after pointer settles");
    const ambient = await sceneAnims("running");
    assert(ambient >= 3, "ambient continues after settle");
    return { moving, settled, ambient };
  });

  await scenario("touch-pointer-clears-rain-response", async () => {
    await mouse("mouseMoved", 300, 300);
    await sleep(50);
    await evaluate(
      "window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 50, clientY: 50 }))",
    );
    await sleep(50);
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-rain').dataset.reacting || null",
      ),
      null,
    );
    return { response: "cleared" };
  });

  await scenario("decor-inert-and-cursors", () =>
    evaluate(`(() => {
    const s = document.querySelector('.pc-scene');
    if (s.getAttribute('aria-hidden') !== 'true') throw new Error('scene not aria-hidden');
    if (getComputedStyle(s).pointerEvents !== 'none') throw new Error('scene intercepts pointer');
    const ta = getComputedStyle(document.querySelector('.pc-input__text')).cursor;
    if (ta !== 'text') throw new Error('textarea cursor ' + ta);
    const rc = getComputedStyle(document.querySelector('.pc-root')).cursor;
    if (rc.includes('none')) throw new Error('cursor none');
    return { textarea: ta, root: rc.slice(0, 60) };
  })()`),
  );

  await scenario("rain-impact-cap-and-spacing", async () => {
    await evaluate(`(() => {
      window.__rings = [];
      const proto = CanvasRenderingContext2D.prototype;
      window.__restoreRings = { clear: proto.clearRect, ellipse: proto.ellipse };
      proto.clearRect = function(...a) { if(this.canvas.classList.contains('pc-rain')) window.__rings = []; return window.__restoreRings.clear.apply(this,a); };
      proto.ellipse = function(...a) { if(this.canvas.classList.contains('pc-rain')) window.__rings.push(a); return window.__restoreRings.ellipse.apply(this,a); };
    })()`);
    for (let i = 0; i < 5; i += 1) {
      await mouse("mousePressed", 990 + i * 12, 760, {
        button: "left",
        clickCount: 1,
      });
      await mouse("mouseReleased", 990 + i * 12, 760, {
        button: "left",
        clickCount: 1,
      });
      await sleep(i === 2 ? 300 : 30);
    }
    await sleep(200);
    const rings = await evaluate("window.__rings");
    await evaluate(
      "CanvasRenderingContext2D.prototype.clearRect = window.__restoreRings.clear; CanvasRenderingContext2D.prototype.ellipse = window.__restoreRings.ellipse",
    );
    const clicks = new Set(rings.filter((r) => r[1] === 760).map((r) => r[0]));
    assert(
      clicks.size >= 1 && clicks.size <= 2,
      `deliberate impact count ${clicks.size}`,
    );
    assert(rings.length <= 26, `unbounded rain impacts ${rings.length}`);
    return { deliberate: clicks.size, totalRenderedEllipses: rings.length };
  });

  await scenario("hidden-page-pauses-scene", async () => {
    await evaluate(
      "(Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }), document.dispatchEvent(new Event('visibilitychange')), 0)",
    );
    await sleep(120);
    const paused = await evaluate(
      "document.querySelector('.pc-scene').hasAttribute('data-paused') && document.querySelector('.pc-rain').dataset.running === 'false'",
    );
    const running = await sceneAnims("running");
    await evaluate(
      "(Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }), document.dispatchEvent(new Event('visibilitychange')), 0)",
    );
    await sleep(120);
    const resumed = await sceneAnims("running");
    assert(paused, "hidden page did not pause rain");
    assert.equal(running, 0, `running while hidden ${running}`);
    assert(resumed >= 3, "resumes when visible");
    return { running, resumed };
  });

  await scenario("effects-toggle-off-persists", async () => {
    await click(".pc-motion-toggle");
    await sleep(150);
    const off = {
      motion: await rootAttr("motion"),
      dur: await durReport(),
      running: await sceneAnims("running"),
      saved: await evaluate("localStorage.getItem('pc-motion-effects')"),
      pressed: await evaluate(
        "document.querySelector('.pc-motion-toggle').getAttribute('aria-pressed')",
      ),
    };
    assert.equal(off.motion, "off");
    assert(off.dur <= 1);
    assert.equal(off.running, 0);
    assert.equal(off.saved, "off");
    assert.equal(off.pressed, "false");
    await load({ clear: false });
    const reloaded = await rootAttr("motion");
    assert.equal(reloaded, "off");
    await click(".pc-motion-toggle");
    await sleep(150);
    assert.equal(await rootAttr("motion"), "on");
    return { off, reloaded };
  });

  await scenario("keyboard-toggle", async () => {
    await evaluate("document.querySelector('.pc-motion-toggle').focus()");
    await h.key(" ", "Space", 32, 0, " ");
    await sleep(150);
    const motion = await rootAttr("motion");
    await h.key(" ", "Space", 32, 0, " ");
    await sleep(150);
    assert.equal(motion, "off");
    assert.equal(await rootAttr("motion"), "on");
    return { motion };
  });

  await scenario("live-reduced-motion-overrides-saved-on", async () => {
    await evaluate("localStorage.setItem('pc-motion-effects', 'on')");
    await media(true);
    await sleep(200);
    const d = {
      motion: await rootAttr("motion"),
      dur: await durReport(),
      anims: await sceneAnims(),
      disabled: await evaluate(
        "document.querySelector('.pc-motion-toggle').disabled",
      ),
    };
    await media(false);
    await sleep(200);
    assert.equal(d.motion, "off");
    assert(d.dur <= 1);
    assert.equal(d.anims, 0);
    assert(d.disabled);
    return d;
  });

  await scenario("blocked-storage-still-toggles", async () => {
    const { identifier } = await h.cdp.send(
      "Page.addScriptToEvaluateOnNewDocument",
      {
        source:
          "Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });",
      },
    );
    try {
      await load({ clear: false });
      const before = await rootAttr("motion");
      await click(".pc-motion-toggle");
      await sleep(150);
      const after = await rootAttr("motion");
      assert.equal(before, "on");
      assert.equal(after, "off");
      return { before, after };
    } finally {
      await h.cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
        identifier,
      });
    }
  });
} finally {
  const dir = join(REPO_ROOT, "docs/design/moonlit-ui/results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "scene-checks.json"),
    JSON.stringify(results, null, 2) + String.fromCharCode(10),
  );
  await h?.stop();
}
for (const s of results.scenarios) console.log(s.status, s.name, s.error ?? "");
process.exitCode = results.scenarios.some((s) => s.status === "fail") ? 1 : 0;
