import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  startHarness,
  waitFor,
  sleep,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";
const out = resolve(process.argv[2] ?? "artifacts/continuous-garden");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const { evaluate, cdp, click } = h;
const report = { revision: revision(), checks: [] };
const shot = async (name) =>
  writeFileSync(
    join(out, name + ".png"),
    Buffer.from(
      (await cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
const check = async (name, run) => {
  const detail = await run();
  report.checks.push({ name, status: "pass", detail });
  console.log("[PASS]", name);
};
const settled = () =>
  waitFor(() => evaluate("!document.documentElement.dataset.journey"));
const geometry = () =>
  evaluate(`(() => {
  const r=document.querySelector('.pc-continuous__moon').getBoundingClientRect();
  return {x:r.x,y:r.y,width:r.width,height:r.height};
})()`);
try {
  await h.load();
  await shot("pavilion");
  await check("moon-stays-fixed-and-world-is-not-duplicated", async () => {
    const before = await geometry();
    await evaluate(
      "window.__rain=document.querySelector('.pc-rain');window.__moon=document.querySelector('.pc-continuous__moon');true",
    );
    await click('[aria-controls="dictionary-space"]');
    await waitFor(() =>
      evaluate(
        "document.getAnimations().some(a=>a.animationName==='pc-walk-in-right')",
      ),
    );
    for (const time of [90, 280, 470]) {
      await evaluate(`document.getAnimations().forEach(a=>{
        if (['pc-walk-in-right','pc-walk-out-left'].includes(a.animationName) ||
            (a.effect?.target?.classList?.contains('pc-continuous__panorama'))) {
          a.pause();a.currentTime=${time};
        }
      })`);
      await sleep(60);
      assert.deepEqual(await geometry(), before);
      const world = await evaluate(`({
        old:getComputedStyle(document.documentElement,'::view-transition-old(garden-world)').display,
        next:getComputedStyle(document.documentElement,'::view-transition-new(garden-world)').animationName,
        transform:getComputedStyle(document.documentElement,'::view-transition-group(garden-world)').transform
      })`);
      assert.equal(world.old, "none");
      assert.equal(world.next, "none");
      assert.ok(
        world.transform === "none" ||
          world.transform === "matrix(1, 0, 0, 1, 0, 0)",
      );
      await shot("walk-" + time);
    }
    await evaluate(
      "document.getAnimations().filter(a=>a.playState==='paused').forEach(a=>a.play())",
    );
    await settled();
    await sleep(100);
    assert.deepEqual(await geometry(), before);
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.pc-continuous__moon').length===1 && document.querySelectorAll('.pc-rain').length===1 && window.__rain===document.querySelector('.pc-rain') && window.__moon===document.querySelector('.pc-continuous__moon')",
      ),
      true,
    );
    await shot("library");
    return {
      moon: before,
      checkpoints: [90, 280, 470],
      persistentCanvas: true,
    };
  });
  await check("pointer-reacts-over-water-not-over-paper", async () => {
    await h.mouse("mouseMoved", 990, 810);
    await h.mouse("mouseMoved", 1010, 812);
    await sleep(60);
    assert.equal(
      await evaluate("document.querySelector('.pc-rain').dataset.reacting"),
      "true",
    );
    await click(".pc-dictionary__examples button");
    await waitFor(() =>
      evaluate("!!document.querySelector('.pc-dictionary__glyph')"),
    );
    await evaluate("window.scrollTo(0,0)");
    await h.mouse("mouseMoved", 900, 800);
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-rain').dataset.reacting ?? null",
      ),
      null,
    );
    await shot("library-result");
  });
  await check("ambient-effects-stop-on-blur-and-motion-off", async () => {
    await evaluate("window.dispatchEvent(new Event('blur'))");
    await sleep(100);
    assert.equal(
      await evaluate("document.querySelector('.pc-rain').dataset.running"),
      "false",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-continuous__chime')).animationPlayState",
      ),
      "paused",
    );
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await waitFor(() =>
      evaluate("document.querySelector('.pc-rain').dataset.running==='true'"),
    );
    await click(".pc-dictionary .pc-motion-toggle");
    await sleep(100);
    assert.equal(
      await evaluate("document.querySelector('.pc-rain').dataset.running"),
      "false",
    );
    await click(".pc-dictionary .pc-motion-toggle");
    await h.media(true);
    await sleep(100);
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-continuous__panorama')).transitionDuration",
      ),
      "0s",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-continuous__chime')).animationName",
      ),
      "none",
    );
    await h.media(false);
  });
  await check("mobile-scene-and-result-layout", async () => {
    for (const width of [320, 375, 768]) {
      await h.viewport(width, 900);
      await evaluate("window.scrollTo(0,0)");
      await sleep(200);
      assert.ok(
        await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),
      );
      if (width === 375) await shot("mobile");
    }
  });
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  writeFileSync(join(out, "scene.json"), JSON.stringify(report, null, 2));
  await h.stop();
}
