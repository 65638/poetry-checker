import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  startHarness,
  waitFor,
  sleep,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const out = resolve(process.argv[2] ?? "artifacts/final-polish");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const { evaluate, cdp } = h;
const result = { revision: revision(), checks: [], errors: [], bursts: [] };
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
const settled = async (place) => {
  await waitFor(() =>
    evaluate(
      `document.querySelector('.pc-workspace').dataset.place==='${place}' && !document.documentElement.dataset.journey`,
    ),
  );
  await sleep(40);
};
const go = async (place) => {
  await evaluate("location.hash=" + JSON.stringify(place));
  await settled(place);
};
async function nav(place) {
  const p = await evaluate(
    `(()=>{const r=document.querySelector('[aria-controls="${place}-space"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await h.mouse(type, p.x, p.y, { button: "left", clickCount: 1 });
}
const box = (selector) =>
  evaluate(
    `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})()`,
  );
const overlap = (a, b) =>
  a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
try {
  await h.load();
  await evaluate(`(()=>{
    const start=document.startViewTransition.bind(document);
    window.__vt={starts:0,skips:0,live:0,peak:0};
    document.startViewTransition=update=>{
      const t=start(update), skip=t.skipTransition.bind(t);
      window.__vt.starts++;window.__vt.live++;window.__vt.peak=Math.max(window.__vt.peak,window.__vt.live);
      t.skipTransition=()=>{window.__vt.skips++;skip()};
      t.finished.then(()=>window.__vt.live--,()=>window.__vt.live--);
      return t;
    };
    return true;
  })()`);
  await shot("checker-desktop");
  await check(
    "rapid-input-retains-current-snapshot-no-forced-skip",
    async () => {
      for (const delay of [35, 90, 180]) {
        await go("checker");
        await evaluate("scrollTo(0,0);true");
        const before = await evaluate("({...window.__vt})");
        const moon = await box(".pc-continuous__moon");
        const sequence = [
          "dictionary",
          "library",
          "checker",
          "dictionary",
          "library",
          "checker",
          "library",
        ];
        for (const p of sequence) {
          await nav(p);
          await sleep(delay);
        }
        await settled("library");
        const after = await evaluate("({...window.__vt})");
        assert.equal(after.skips, before.skips);
        assert.equal(after.peak, 1);
        assert.ok(after.starts - before.starts < sequence.length);
        assert.equal(await evaluate("location.hash"), "#library");
        assert.equal(
          await evaluate(
            "document.querySelectorAll('.pc-place:not([hidden])').length",
          ),
          1,
        );
        assert.deepEqual(await box(".pc-continuous__moon"), moon);
        result.bursts.push({
          interval: delay,
          clicks: sequence.length,
          transitions: after.starts - before.starts,
          skips: after.skips - before.skips,
        });
      }
    },
  );
  await check("pending-destination-survives-reduced-motion", async () => {
    await go("checker");
    await nav("dictionary");
    await sleep(90);
    await nav("library");
    await h.media(true);
    await settled("library");
    assert.equal(
      await evaluate("document.querySelector('.pc-continuous').dataset.place"),
      "library",
    );
    assert.equal(
      await evaluate("document.querySelector('.pc-rain').dataset.running"),
      "false",
    );
    await h.media(false);
  });
  await check("library-lamp-proportion-and-blur-pause", async () => {
    await shot("library-desktop");
    const desktop = await box(".pc-library-lantern");
    await evaluate("window.dispatchEvent(new Event('blur'));true");
    await sleep(40);
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-library-room__lamp')).animationPlayState",
      ),
      "paused",
    );
    assert.equal(
      await evaluate("document.querySelector('.pc-rain').dataset.running"),
      "false",
    );
    await evaluate("window.dispatchEvent(new Event('focus'));true");
    await h.viewport(375, 812, true);
    const mobile = await box(".pc-library-lantern");
    assert.ok(mobile.x >= 0 && mobile.right <= 375);
    assert.ok(
      Math.abs(desktop.width / desktop.height - mobile.width / mobile.height) <
        0.01,
    );
    await h.viewport(1440, 900);
    assert.ok(
      !overlap(
        await box(".pc-library-heading > .pc-studio-actions"),
        await box(".pc-continuous__moon"),
      ),
    );
  });
  await check("slow-first-analysis-keeps-current-poem-readable", async () => {
    await go("checker");
    await evaluate("scrollTo(0,0)");
    await h.setText("白日依山尽，黄河入海流。欲穷千里目，更上一层楼。");
    await evaluate(
      `window.__nativeFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/analyze'))await new Promise(r=>setTimeout(r,650));return window.__nativeFetch(...args)};true`,
    );
    await h.click(".pc-input__submit");
    await sleep(250);
    assert.ok(
      await evaluate(
        "document.querySelector('.pc-pending__status')?.textContent.includes('正在')",
      ),
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.pc-pending__line > span:last-child')].map(el=>el.textContent).join('')",
      ),
      "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.pc-pending .pc-cell__tone').length",
      ),
      0,
    );
    await waitFor(
      () => evaluate("!!document.querySelector('.pc-report')"),
      20000,
    );
    await h.idle();
    await sleep(400);
    await evaluate("window.fetch=window.__nativeFetch;scrollTo(0,0);true");
    await shot("report-desktop");
  });
  await check("repeated-analysis-does-not-flash-a-second-poem", async () => {
    await evaluate(
      `window.__pendingFlashes=0;window.__pendingObserver=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n instanceof Element&&(n.matches('.pc-pending')||n.querySelector('.pc-pending')))window.__pendingFlashes++});window.__pendingObserver.observe(document.querySelector('.pc-manuscript'),{childList:true,subtree:true});true`,
    );
    for (let i = 0; i < 3; i++) await h.analyze();
    assert.equal(await evaluate("window.__pendingFlashes"), 0);
    await evaluate("window.__pendingObserver.disconnect();true");
  });
  await check("draft-tools-within-editor-and-paper-palette", async () => {
    const editor = await box(".pc-plinth"),
      tools = await box(".pc-draft-tools");
    assert.ok(
      tools.x >= editor.x &&
        tools.right <= editor.right &&
        tools.bottom <= editor.bottom,
    );
    assert.ok(
      !overlap(await box(".pc-draft-tools"), await box(".pc-masthead")),
    );
    const paper = await evaluate(
      "getComputedStyle(document.querySelector('.pc-manuscript')).backgroundColor",
    );
    await go("library");
    await h.click(".pc-library-title");
    await sleep(230);
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-library-reading')).backgroundColor",
      ),
      paper,
    );
    assert.ok(
      await evaluate("!!document.querySelector('.pc-library-reading-hint')"),
    );
    await evaluate("scrollTo(0,0)");
    await shot("reader-desktop");
  });
  await check(
    "all-three-regions-responsive-and-no-header-overlap",
    async () => {
      await h.media(true);
      for (const width of [320, 375, 768, 1024, 1440]) {
        await h.viewport(width, 900, width < 800);
        for (const p of ["checker", "dictionary", "library"]) {
          await go(p);
          await evaluate("scrollTo(0,0)");
          await sleep(80);
          assert.ok(
            await evaluate(
              "document.documentElement.scrollWidth<=innerWidth+1",
            ),
            p + " " + width,
          );
          const buttons = await evaluate(
            "[...document.querySelectorAll('.pc-places button')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width}})",
          );
          assert.ok(
            buttons.every((b) => b.x >= 0 && b.right <= width && b.width >= 70),
          );
          if (p === "checker")
            assert.ok(
              !overlap(
                await box(".pc-masthead__titles"),
                await box(".pc-masthead__tools"),
              ),
            );
          if (width === 375) await shot(p + "-mobile");
        }
      }
    },
  );
  await check("queued-navigation-fallback-and-state-preserved", async () => {
    await evaluate("document.startViewTransition=undefined;true");
    await h.media(false);
    await go("checker");
    assert.equal(
      await evaluate("document.querySelector('.pc-input__text').value"),
      "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
    );
    assert.ok(await evaluate("!!document.querySelector('.pc-report')"));
    await go("library");
    assert.ok(
      await evaluate("!!document.querySelector('.pc-library-reading')"),
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
