/* global process, console, Buffer */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  startHarness,
  sleep,
  revision,
  REPO_ROOT,
  makeRecorder,
} from "./harness.mjs";

const dir = join(REPO_ROOT, "docs/design/moonlit-ui/refinement-review");
mkdirSync(dir, { recursive: true });
const result = {
  revision: revision(),
  at: new Date().toISOString(),
  scenarios: [],
  shots: [],
};
const scenario = makeRecorder(result);
const h = await startHarness({ production: true });
const { evaluate, mouse, click } = h;
const shot = async (name) => {
  const { data } = await h.cdp.send("Page.captureScreenshot", {
    format: "png",
  });
  writeFileSync(join(dir, name + ".png"), Buffer.from(data, "base64"));
  result.shots.push(name + ".png");
};
const over = async (selector) => {
  await evaluate(
    `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`,
  );
  const p = await evaluate(
    `(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,
  );
  await mouse("mouseMoved", p.x, p.y);
  await sleep(80);
};
try {
  await h.load();
  await shot("desktop-home");
  await scenario("blank-drag-does-not-select-decorative-text", async () => {
    await mouse("mouseMoved", 650, 230);
    await mouse("mousePressed", 650, 230, { button: "left", clickCount: 1 });
    await mouse("mouseMoved", 1200, 570, { buttons: 1 });
    await mouse("mouseReleased", 1200, 570, { button: "left", clickCount: 1 });
    assert.equal(await evaluate("getSelection().toString()"), "");
    return { selected: "" };
  });
  await evaluate(`(() => {
    window.__rain = { rings: [], gain: [] };
    const p = CanvasRenderingContext2D.prototype;
    const ellipse = p.ellipse, stroke = p.stroke;
    p.ellipse = function (...args) {
      if (this.canvas.classList.contains('pc-rain')) window.__rain.rings.push({at:performance.now(),x:args[0],y:args[1],r:args[2]});
      return ellipse.apply(this,args);
    };
    p.stroke = function (...args) {
      if (this.canvas.classList.contains('pc-rain') && Math.abs(this.lineWidth - 1.2) < .001)
        window.__rain.gain.push({at:performance.now(),alpha:Number(this.strokeStyle.match(/([.\\d]+)\\)$/)?.[1] || 0)/.4});
      return stroke.apply(this,args);
    };
  })()`);
  await scenario(
    "pointer-water-trail-without-clicking-and-no-control-trail",
    async () => {
      for (let x = 900; x <= 1040; x += 20) {
        await mouse("mouseMoved", x, 760);
        await sleep(100);
      }
      await sleep(400);
      const trail = await evaluate(
        "window.__rain.rings.filter(r=>r.y===760 && r.r>26)",
      );
      assert(trail.length > 0, "no pointer-created water rings");
      await shot("water-wake");
      await evaluate("window.__rain.rings=[]");
      await over("textarea");
      await sleep(1700);
      await evaluate("window.__rain.rings=[]");
      await over(".pc-examples__item");
      await sleep(400);
      assert.equal(
        await evaluate("window.__rain.rings.filter(r=>r.r>26).length"),
        0,
      );
      return { trailSamples: trail.length };
    },
  );
  await scenario("rain-gain-interpolates-in-both-directions", async () => {
    await evaluate("document.activeElement.blur()");
    await sleep(1800);
    await evaluate(
      "window.__rain.gain=[]; document.querySelector('textarea').focus()",
    );
    await sleep(1650);
    const down = await evaluate("window.__rain.gain.map(p=>p.alpha)");
    assert(
      down.some((n) => n > 0.4 && n < 0.8),
      JSON.stringify(down.slice(0, 10)),
    );
    assert(down.at(-1) < 0.29);
    await evaluate(
      "window.__rain.gain=[]; document.querySelector('textarea').blur()",
    );
    await sleep(1650);
    const up = await evaluate("window.__rain.gain.map(p=>p.alpha)");
    assert(up.some((n) => n > 0.4 && n < 0.8));
    assert(up.at(-1) > 0.95);
    return {
      fadeOutRange: [down[0], down.at(-1)],
      fadeInRange: [up[0], up.at(-1)],
    };
  });
  await click(".pc-examples__list li:nth-child(3) button");
  await h.analyze();
  await scenario("violations-visible-before-selecting-a-finding", async () => {
    const data = await evaluate(`(() => {
      const bad=[...document.querySelectorAll('.pc-cell--violation')];
      return { count:bad.length, badges:bad.map(el=>el.parentElement.querySelector('.pc-cell__reference')?.textContent),
        tone:parseFloat(getComputedStyle(document.querySelector('.pc-cell__tone')).fontSize),
        line:getComputedStyle(bad[0]).borderBottomWidth };
    })()`);
    assert(data.count > 0);
    assert(data.badges.every(Boolean));
    assert(data.tone >= 18);
    assert.equal(data.line, "3px");
    return data;
  });
  await evaluate(
    "document.querySelector('.pc-reading').scrollIntoView({block:'start'})",
  );
  await sleep(400);
  await shot("desktop-poem");
  await scenario(
    "cell-and-finding-highlight-both-ways-with-keyboard-navigation",
    async () => {
      await over(".pc-cell--violation");
      assert(
        (await evaluate(
          "document.querySelectorAll('.pc-finding--selected').length",
        )) > 0,
      );
      assert(
        (
          await evaluate(
            "document.querySelector('.pc-reading__annotation').textContent",
          )
        ).includes("违规"),
      );
      const number = await evaluate(
        "document.querySelector('.pc-cell--violation').parentElement.querySelector('.pc-cell__reference').textContent",
      );
      await evaluate(
        "document.querySelector('.pc-cell--violation').parentElement.querySelector('.pc-cell__reference').focus()",
      );
      await h.key("Enter", "Enter", 13, 0, "\r");
      await sleep(650);
      const noteNumber = await evaluate(
        "document.activeElement.querySelector('.pc-finding__no')?.textContent",
      );
      assert.equal(noteNumber, number);
      await shot("linked-finding");
      await evaluate(
        "document.activeElement.querySelector('.pc-finding__locate').focus()",
      );
      await h.key("Enter", "Enter", 13, 0, "\r");
      await sleep(650);
      assert(await evaluate("document.activeElement.matches('.pc-cell')"));
      assert(
        (await evaluate(
          "document.querySelectorAll('.pc-cell--related').length",
        )) > 0,
      );
      // Hover a different finding without changing the selected one.
      await over(".pc-finding--fail");
      assert(
        (await evaluate(
          "document.querySelectorAll('.pc-cell--related').length",
        )) > 0,
      );
      return { number, keyboardRoundTrip: true };
    },
  );
  await scenario(
    "report-text-remains-selectable-and-editor-keeps-identity",
    async () => {
      const selection = await evaluate(
        `(() => { const e=document.querySelector('.pc-finding__msg'); const r=document.createRange(); r.selectNodeContents(e); const s=getSelection();s.removeAllRanges();s.addRange(r);const text=s.toString();s.removeAllRanges();return {text,css:getComputedStyle(e).userSelect};})()`,
      );
      assert(selection.text.length > 0);
      assert.equal(selection.css, "text");
      await evaluate(
        "window.__ta=document.querySelector('textarea'); window.scrollTo(0,0)",
      );
      await click(".pc-plinth__toggle");
      await sleep(100);
      const mid = await evaluate(
        "document.querySelector('.pc-editor-body').getBoundingClientRect().height",
      );
      await sleep(350);
      const end = await evaluate(
        "document.querySelector('.pc-editor-body').getBoundingClientRect().height",
      );
      assert(mid > end + 10, JSON.stringify({ mid, end }));
      assert(end < 2);
      await click(".pc-plinth__toggle");
      await sleep(400);
      assert(
        await evaluate("window.__ta===document.querySelector('textarea')"),
      );
      return { collapseMid: mid, collapseEnd: end, identity: true };
    },
  );
  for (const width of [375, 768, 1024, 1440]) {
    await scenario("report-fit-" + width, async () => {
      await h.viewport(width, 900, width === 375);
      await evaluate(
        "document.querySelector('.pc-reading').scrollIntoView({block:'start'})",
      );
      await sleep(500);
      const data =
        await evaluate(`({ overflow:document.documentElement.scrollWidth>innerWidth,
        cellOverflow:[...document.querySelectorAll('.pc-line__cells')].some(el=>el.scrollWidth>el.clientWidth+1),
        tone:parseFloat(getComputedStyle(document.querySelector('.pc-cell__tone')).fontSize) })`);
      assert(!data.overflow);
      assert(!data.cellOverflow);
      assert(data.tone >= 16);
      await shot("poem-" + width);
      return data;
    });
  }
  await scenario(
    "reduced-motion-stops-rain-and-disclosure-transitions",
    async () => {
      await h.media(true);
      await sleep(100);
      assert.equal(
        await evaluate("document.querySelector('.pc-rain').dataset.running"),
        "false",
      );
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('.pc-editor-body')).transitionDuration",
        ),
        "0s, 0s, 0s",
      );
      return { reduced: true };
    },
  );
} catch (error) {
  result.fatal = error.message;
} finally {
  await h.stop();
}
writeFileSync(
  join(dir, "results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
for (const s of result.scenarios) console.log(s.status, s.name, s.error ?? "");
if (result.fatal) console.log("FATAL", result.fatal);
process.exitCode =
  result.fatal || result.scenarios.some((s) => s.status !== "pass") ? 1 : 0;
