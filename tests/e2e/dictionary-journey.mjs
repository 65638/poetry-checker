import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  startHarness,
  waitFor,
  sleep,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";
const out = resolve(process.argv[2] ?? "artifacts/dictionary-journey");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const { evaluate, cdp } = h;
async function click(selector) {
  if (
    !selector.startsWith("[aria-controls=") ||
    !(await evaluate("!!document.documentElement.dataset.journey"))
  )
    return h.click(selector);
  // Captured navigation is hit-tested as HTML; exercise the real pointer path.
  const point = await evaluate(
    `(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      button: "left",
      clickCount: 1,
      ...point,
    });
}
const report = { revision: revision(), checks: [], errors: [] };
cdp.on("Runtime.exceptionThrown", (e) =>
  report.errors.push(e.exceptionDetails.text),
);
const check = async (name, run) => {
  await run();
  report.checks.push({ name, status: "pass" });
  console.log("[PASS]", name);
};
const settled = () =>
  waitFor(() => evaluate("!document.documentElement.dataset.journey"));
const shot = async (name) =>
  writeFileSync(
    join(out, name + ".png"),
    Buffer.from(
      (await cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
try {
  await h.load();
  await check("paired-horizontal-snapshots", async () => {
    await click('[aria-controls="dictionary-space"]');
    await waitFor(() =>
      evaluate(
        "document.getAnimations().some(a => a.animationName === 'pc-walk-in-right')",
      ),
    );
    const frames = await evaluate(`(() => {
      const animations = document.getAnimations().filter(a => ['pc-walk-in-right','pc-walk-out-left'].includes(a.animationName));
      animations.forEach(a => { a.pause(); a.currentTime = 380; });
      return animations.map(a => ({name:a.animationName, frames:a.effect.getKeyframes(), duration:a.effect.getTiming().duration}));
    })()`);
    assert.equal(frames.length, 2);
    assert.ok(frames.every((f) => f.duration === 560));
    await sleep(100);
    const transforms = await evaluate(`['old','new'].map(kind => {
      const style = getComputedStyle(document.documentElement, '::view-transition-' + kind + '(garden-content)');
      return new DOMMatrixReadOnly(style.transform).m41;
    })`);
    assert.ok(
      transforms[0] < -50 && transforms[1] > 50,
      JSON.stringify(transforms),
    );
    await shot("transition-middle");
    await evaluate(
      "document.getAnimations().filter(a => a.playState === 'paused').forEach(a => a.play())",
    );
    await settled();
    await shot("dictionary");
    await click('[aria-controls="checker-space"]');
    await waitFor(() =>
      evaluate(
        "document.getAnimations().some(a => a.animationName === 'pc-walk-in-left')",
      ),
    );
    await settled();
  });
  await check(
    "rapid-reversal-preserves-input-and-one-visible-panel",
    async () => {
      await h.setText("白日依山尽，黄河入海流。");
      await click('[aria-controls="dictionary-space"]');
      await waitFor(() =>
        evaluate("!document.querySelector('#dictionary-space').hidden"),
      );
      await sleep(120);
      await click('[aria-controls="checker-space"]');
      await sleep(1200);
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.pc-place:not([hidden])').length",
        ),
        1,
      );
      assert.equal(
        await evaluate("document.querySelector('.pc-input__text').value"),
        "白日依山尽，黄河入海流。",
      );
      assert.equal(
        await evaluate("document.querySelector('#checker-space').hidden"),
        false,
      );
      assert.equal(
        await evaluate("!!document.documentElement.dataset.journey"),
        false,
      );
    },
  );
  await check("wordslips-query-and-centered-input", async () => {
    await click('[aria-controls="dictionary-space"]');
    await settled();
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-dictionary__input')).textAlign",
      ),
      "center",
    );
    await click(".pc-dictionary__landscapes button:nth-child(2)");
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__examples button').textContent.trim()",
      ),
      "山",
    );
    await click(".pc-dictionary__examples button");
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-dictionary__glyph')?.textContent === '山'",
      ),
    );
    await click(".pc-dictionary__actions button");
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__bookmark').textContent",
      ),
      "已藏",
    );
    await evaluate("window.scrollTo(0,0)");
    await shot("dictionary-result");
  });
  await check("hash-navigation-restores-each-scroll-position", async () => {
    await evaluate("window.scrollTo(0,320)");
    const before = await evaluate("scrollY");
    await evaluate("location.hash='checker'");
    await settled();
    await waitFor(() =>
      evaluate("!document.querySelector('#checker-space').hidden"),
    );
    await evaluate("location.hash='dictionary'");
    await waitFor(() =>
      evaluate("!document.querySelector('#dictionary-space').hidden"),
    );
    await settled();
    assert.ok(Math.abs((await evaluate("scrollY")) - before) < 2);
  });
  await check("mobile-wordslips-and-folio-fit", async () => {
    for (const width of [320, 375, 768]) {
      await h.viewport(width, 900);
      await evaluate("window.scrollTo(0,0)");
      await sleep(200);
      assert.ok(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
      );
      if (width === 375) {
        await shot("mobile");
        await evaluate(
          "document.querySelector('.pc-dictionary__wordslips').scrollIntoView({block:'center'})",
        );
        await shot("mobile-slips");
      }
    }
  });
  await check("reduced-motion-and-api-fallback", async () => {
    await h.media(true);
    await click('[aria-controls="checker-space"]');
    assert.equal(
      await evaluate("document.querySelector('#checker-space').hidden"),
      false,
    );
    assert.equal(
      await evaluate("!!document.documentElement.dataset.journey"),
      false,
    );
    await h.media(false);
    await evaluate("document.startViewTransition = undefined");
    await click('[aria-controls="dictionary-space"]');
    assert.equal(
      await evaluate("document.querySelector('#dictionary-space').hidden"),
      false,
    );
  });
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(join(out, "results.json"), JSON.stringify(report, null, 2));
  await h.stop();
}
