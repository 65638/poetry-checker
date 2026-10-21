import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  startHarness,
  waitFor,
  sleep,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";
const out = resolve(process.argv[2] ?? "artifacts/library-atmosphere");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const { evaluate, cdp } = h;
const result = { revision: revision(), checks: [], journeys: [], errors: [] };
cdp.on("Runtime.exceptionThrown", (e) =>
  result.errors.push(
    e.exceptionDetails.exception?.description ?? e.exceptionDetails.text,
  ),
);
const check = async (name, run) => {
  await run();
  result.checks.push(name);
  console.log("[PASS]", name);
};
const shot = async (name) =>
  writeFileSync(
    join(out, name + ".png"),
    Buffer.from(
      (await cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
const settled = () =>
  waitFor(() => evaluate("!document.documentElement.dataset.journey"));
// Chromium hit-tests snapshot navigation as HTML: exercise real pointer reversal.
async function nav(place) {
  const p = await evaluate(
    `(() => { const r=document.querySelector('[aria-controls="${place}-space"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      button: "left",
      clickCount: 1,
      ...p,
    });
}
const moon = () =>
  evaluate(
    "(() => {const r=document.querySelector('.pc-continuous__moon').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()",
  );
const scenery = () =>
  evaluate(
    "new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.pc-continuous__panorama')).transform).m41",
  );
try {
  await h.load();
  await evaluate("document.fonts.ready.then(() => true)");
  await shot("checker-1440");
  await check("all-six-directions-opposite-landscape-fixed-moon", async () => {
    let previous = "checker";
    const order = ["checker", "dictionary", "library"];
    const origin = await moon();
    for (const next of [
      "dictionary",
      "library",
      "checker",
      "library",
      "dictionary",
      "checker",
    ]) {
      const start = await scenery();
      await evaluate(
        "(() => {window.__journeyFrames=[]; window.__journeyStart=performance.now(); const id=window.__journeyRun=(window.__journeyRun??0)+1; requestAnimationFrame(function frame(t){if(window.__journeyRun!==id)return;window.__journeyFrames.push(t);requestAnimationFrame(frame)});return true})()",
      );
      await nav(next);
      await waitFor(() =>
        evaluate(
          "document.getAnimations().some(a => a.animationName?.startsWith('pc-walk-in'))",
        ),
      );
      await sleep(180);
      const mid = await scenery();
      const forward = order.indexOf(next) > order.indexOf(previous);
      assert.ok(
        forward ? mid > start : mid < start,
        JSON.stringify({ previous, next, start, mid }),
      );
      assert.deepEqual(await moon(), origin);
      const animations = await evaluate(
        "document.getAnimations().filter(a=>a.animationName?.startsWith('pc-walk')).map(a=>({name:a.animationName,duration:a.effect.getTiming().duration}))",
      );
      assert.ok(
        animations.some(
          (a) => a.name === (forward ? "pc-walk-in-right" : "pc-walk-in-left"),
        ),
      );
      assert.ok(animations.every((a) => a.duration === 760));
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.pc-place:not([hidden])').length",
        ),
        1,
      );
      if (previous === "checker" && next === "library")
        await shot("direct-transition");
      await settled();
      const timing = await evaluate(
        "(() => {window.__journeyRun++;const f=window.__journeyFrames,d=f.slice(1).map((t,i)=>t-f[i]).sort((a,b)=>a-b);return {elapsed:performance.now()-window.__journeyStart,frames:f.length,p95:d[Math.floor(d.length*.95)],maxGap:Math.max(...d)}})()",
      );
      result.journeys.push({ from: previous, to: next, ...timing });
      assert.deepEqual(await moon(), origin);
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-continuous').dataset.place",
        ),
        next,
      );
      if (next !== "checker") await shot(next + "-1440");
      previous = next;
    }
  });
  await check("direct-rapid-reversal-retains-one-panel", async () => {
    await nav("library");
    await waitFor(() =>
      evaluate("!document.querySelector('#library-space').hidden"),
    );
    await sleep(120);
    await nav("checker");
    await waitFor(() =>
      evaluate("!document.querySelector('#checker-space').hidden"),
    );
    await settled();
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.pc-place:not([hidden])').length",
      ),
      1,
    );
  });
  await check(
    "catalogue-remains-beside-reader-and-character-lookup",
    async () => {
      await nav("library");
      await settled();
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-library-heading').textContent.includes('2022首入藏')",
        ),
      );
      await evaluate(
        "window.__catalogue=document.querySelector('.pc-library-catalogue');window.__list=document.querySelector('.pc-library-list');window.__list.scrollTop=80;window.__listY=window.__list.scrollTop;true",
      );
      await evaluate(
        "(() => {const r=window.__list.getBoundingClientRect();const el=[...window.__list.querySelectorAll('.pc-library-title')].find(el=>{const t=el.getBoundingClientRect();return t.top>=r.top && t.bottom<=r.bottom});if(!el)throw new Error('No visible title');el.dataset.visibleTitle='yes';return true})()",
      );
      const titlePoint = await evaluate(
        "(() => {const r=document.querySelector('[data-visible-title]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
      );
      for (const type of ["mousePressed", "mouseReleased"])
        await cdp.send("Input.dispatchMouseEvent", {
          type,
          button: "left",
          clickCount: 1,
          ...titlePoint,
        });
      await sleep(400);
      assert.ok(
        await evaluate(
          "window.__catalogue===document.querySelector('.pc-library-catalogue') && window.__list===document.querySelector('.pc-library-list')",
        ),
      );
      assert.ok(
        await evaluate("Math.abs(window.__list.scrollTop-window.__listY)<1"),
      );
      assert.ok(
        await evaluate(
          "document.querySelector('.pc-library-reading').getBoundingClientRect().left>document.querySelector('.pc-library-catalogue').getBoundingClientRect().right",
        ),
      );
      await h.viewport(1440, 650);
      await evaluate(
        "window.__list.scrollTop=64;window.__listY=window.__list.scrollTop;true",
      );
      assert.ok(await evaluate("window.__listY>0"));
      await h.click(".pc-library > .pc-studio-tabs button:nth-child(2)");
      assert.ok(
        await evaluate(
          "document.querySelector('.pc-library-worktable').hidden",
        ),
      );
      await h.click(".pc-library > .pc-studio-tabs button:first-child");
      assert.ok(
        await evaluate(
          "window.__catalogue===document.querySelector('.pc-library-catalogue') && Math.abs(window.__list.scrollTop-window.__listY)<1",
        ),
      );
      await h.viewport(1440, 900);
      const picked = await evaluate(
        "document.querySelector('.pc-library-character').textContent",
      );
      await h.click(".pc-library-character");
      assert.equal(
        await evaluate("document.querySelector('[aria-label=原诗查字]').value"),
        picked,
      );
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('[aria-label=原诗查字]')).textAlign",
        ),
        "center",
      );
      await evaluate("scrollTo(0,0)");
      await shot("reader-1440");
      await h.click(
        ".pc-library-reading .pc-studio-actions:nth-of-type(2) > button",
      );
      await waitFor(() =>
        evaluate("location.hash.startsWith('#dictionary?char=')"),
      );
      await settled();
      await evaluate("scrollTo(0,0)");
      await nav("library");
      await settled();
      assert.ok(
        await evaluate(
          "!!document.querySelector('.pc-library-reading') && window.__catalogue===document.querySelector('.pc-library-catalogue')",
        ),
      );
    },
  );
  await check("direct-journey-preserves-scroll", async () => {
    await evaluate("scrollTo(0,220)");
    const y = await evaluate("scrollY");
    await evaluate("location.hash='checker'");
    await waitFor(() =>
      evaluate("!document.querySelector('#checker-space').hidden"),
    );
    await settled();
    await evaluate("location.hash='library'");
    await waitFor(() =>
      evaluate("!document.querySelector('#library-space').hidden"),
    );
    await settled();
    assert.ok(Math.abs((await evaluate("scrollY")) - y) < 2);
  });
  await check("three-scenes-and-reading-fit-small-screens", async () => {
    await h.media(true);
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-workspace').dataset.motion==='off'",
      ),
    );
    for (const width of [320, 375, 768, 1024]) {
      await h.viewport(width, 900);
      for (const place of ["checker", "dictionary", "library"]) {
        await evaluate(`location.hash="${place}";true`);
        await waitFor(() =>
          evaluate(`!document.querySelector('#${place}-space').hidden`),
        );
        await evaluate("scrollTo(0,0)");
        await settled();
        await sleep(80);
        assert.ok(
          await evaluate(
            "document.documentElement.scrollWidth <= innerWidth+1",
          ),
          place + " " + width,
        );
        if (width === 375) await shot(place + "-375");
      }
    }
    await h.viewport(375, 900, true);
    await h.click(".pc-library-title");
    await sleep(100);
    assert.ok(
      await evaluate(
        "document.querySelector('.pc-library-reading').getBoundingClientRect().top >= 0",
      ),
    );
    await shot("reader-375");
    await h.click(".pc-library-reading .pc-studio-action");
    assert.ok(
      await evaluate(
        "document.querySelector('.pc-library-catalogue').getBoundingClientRect().top >= -1",
      ),
    );
  });
  await check("effects-off-reduced-motion-and-fallback", async () => {
    assert.equal(
      await evaluate("document.querySelector('.pc-rain').dataset.running"),
      "false",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-library-room')).transitionDuration",
      ),
      "0s",
    );
    await h.media(false);
    await evaluate(
      "window.dispatchEvent(new CustomEvent('pc-motion-preference-change',{detail:'off'}));true",
    );
    await sleep(80);
    assert.equal(
      await evaluate("document.querySelector('.pc-rain').dataset.running"),
      "false",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-places__links'),'::after').transitionDuration",
      ),
      "0s",
    );
    await evaluate(
      "document.startViewTransition=undefined; location.hash='checker';true",
    );
    await waitFor(() =>
      evaluate("!document.querySelector('#checker-space').hidden"),
    );
    assert.equal(
      await evaluate("!!document.documentElement.dataset.journey"),
      false,
    );
  });
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(join(out, "results.json"), JSON.stringify(result, null, 2));
  await h.stop();
}
