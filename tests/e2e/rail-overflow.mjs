import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  startHarness,
  sleep,
  LONG,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const out = resolve(process.argv[2] ?? "artifacts/rail-overflow");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const result = { revision: revision(), checks: [], errors: [] };
h.cdp.on("Runtime.exceptionThrown", (e) =>
  result.errors.push(e.exceptionDetails.text),
);
const shot = async (name) =>
  writeFileSync(
    join(out, name + ".png"),
    Buffer.from(
      (await h.cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
const geometry = () =>
  h.evaluate(`(() => {
  const rect = selector => {
    const el=document.querySelector(selector), r=el.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right,scroll:el.scrollHeight,client:el.clientHeight};
  };
  return {
    rail:rect('.pc-rail'),directory:rect('.pc-rail__directory'),lines:rect('.pc-rail__lines'),
    label:rect('#pc-rail-lines'),edit:rect('.pc-rail__edit'),desk:rect('.pc-desk__inner'),
    pageWidth:document.documentElement.scrollWidth,width:innerWidth
  };
})()`);
const valid = (g) => {
  assert.ok(g.label.bottom <= g.lines.top + 1, JSON.stringify(g));
  assert.ok(g.lines.bottom <= g.edit.top - 6, JSON.stringify(g));
  assert.ok(g.directory.bottom <= g.edit.top - 6, JSON.stringify(g));
  assert.ok(g.edit.bottom <= g.rail.bottom - 6, JSON.stringify(g));
  assert.ok(g.lines.height >= 43, JSON.stringify(g));
  assert.ok(g.pageWidth <= g.width, JSON.stringify(g));
};
const check = async (name, fn) => {
  await fn();
  result.checks.push({ name, status: "pass" });
  console.log("[PASS]", name);
};
const showButton = async () => {
  await h.evaluate(`(() => {
    const pane=document.querySelector('.pc-desk__inner');
    pane.scrollTop=pane.scrollHeight;
    pane.scrollIntoView({block:'start',behavior:'instant'});
  })()`);
  await sleep(120);
  return h.evaluate(`(() => {
    const b=document.querySelector('.pc-rail__edit'),r=b.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b};
  })()`);
};
try {
  await h.load();
  await h.setText(LONG);
  await h.analyze();
  await check("expanded-settings-and-stale-report-do-not-overlap", async () => {
    await h.evaluate(
      "document.querySelector('.pc-input__settings').click();true",
    );
    await h.setText("");
    await sleep(500);
    valid(await geometry());
    assert.ok((await showButton()).hit);
    await shot("expanded-stale");
  });
  await check(
    "short-and-narrow-desktop-keeps-edit-button-reachable",
    async () => {
      for (const [width, height] of [
        [1440, 700],
        [1024, 600],
        [900, 500],
        [1440, 480],
      ]) {
        await h.viewport(width, height);
        await sleep(100);
        valid(await geometry());
        const point = await showButton();
        assert.ok(
          point.hit,
          JSON.stringify({ width, height, point, geometry: await geometry() }),
        );
        await h.mouse("mousePressed", point.x, point.y, {
          button: "left",
          clickCount: 1,
        });
        await h.mouse("mouseReleased", point.x, point.y, {
          button: "left",
          clickCount: 1,
        });
        await sleep(450);
        assert.equal(
          await h.evaluate(
            "document.querySelector('.pc-editor-body').dataset.collapsed",
          ),
          "true",
        );
        valid(await geometry());
        await h.evaluate(
          "document.querySelector('.pc-rail__edit').click();true",
        );
        await sleep(450);
        valid(await geometry());
        assert.ok((await showButton()).hit);
        await shot("rail-" + width + "-" + height);
      }
    },
  );
  await check(
    "resized-textarea-and-transition-frames-stay-separated",
    async () => {
      await h.viewport(1440, 900);
      await h.evaluate(
        "document.querySelector('.pc-input__text').style.height='460px';true",
      );
      await sleep(450);
      valid(await geometry());
      assert.ok((await showButton()).hit);
      const frames = await h.evaluate(`new Promise(resolve=>{
      const frames=[],start=performance.now();
      document.querySelector('.pc-rail__edit').click();
      const frame=t=>{
        const r=s=>document.querySelector(s).getBoundingClientRect();
        frames.push({line:r('.pc-rail__lines').bottom,button:r('.pc-rail__edit').top});
        if(t-start<500)requestAnimationFrame(frame);else resolve(frames);
      };requestAnimationFrame(frame);
    })`);
      assert.ok(
        frames.every((f) => f.line <= f.button - 6),
        JSON.stringify(frames),
      );
    },
  );
  await check("mobile-directory-retains-in-flow-layout", async () => {
    await h.viewport(375, 812);
    await h.evaluate(
      "document.querySelector('.pc-rail__directory-toggle').click();true",
    );
    await sleep(450);
    valid(await geometry());
    assert.equal(
      await h.evaluate(
        "getComputedStyle(document.querySelector('.pc-desk__inner')).position",
      ),
      "static",
    );
    await h.evaluate(
      "document.querySelector('.pc-rail').scrollIntoView({block:'center',behavior:'instant'});true",
    );
    await shot("mobile");
  });
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  await shot("failure");
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await h.stop();
}
