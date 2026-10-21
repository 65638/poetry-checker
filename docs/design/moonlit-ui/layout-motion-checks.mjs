/* global process, console, Buffer */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  startHarness,
  sleep,
  makeRecorder,
  REPO_ROOT,
  revision,
} from "./harness.mjs";
const result = { revision: revision(), scenarios: [] };
const record = makeRecorder(result);
const h = await startHarness();
const poem = "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。";
const dir = process.argv[3]
  ? resolve(process.argv[3])
  : join(REPO_ROOT, "docs/design/moonlit-ui/layout-motion");
mkdirSync(dir, { recursive: true });
async function shot(name) {
  const { data } = await h.cdp.send("Page.captureScreenshot", {
    format: "png",
  });
  writeFileSync(join(dir, name + ".png"), Buffer.from(data, "base64"));
}
async function trace(action) {
  await h.evaluate(`(() => {
    window.__layout=[];window.__editor=document.querySelector('textarea');
    const start=performance.now();
    const sample=t=>{
      const box=s=>{const el=document.querySelector(s);if(!el)return null;const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
      window.__layout.push({t:t-start,y:scrollY,panel:box('.pc-plinth'),input:box('textarea'),rail:box('.pc-rail'),report:box('.pc-manuscript'),same:window.__editor===document.querySelector('textarea'),busy:!!document.querySelector('.pc-busy'),label:document.querySelector('.pc-input__submit').textContent,disabled:document.querySelector('.pc-input__submit').disabled});
      if(t-start<1800)requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  })()`);
  await sleep(60);
  await action();
  await sleep(1900);
  return h.evaluate("window.__layout");
}
function maxStep(frames, key, index) {
  return Math.max(
    0,
    ...frames
      .slice(1)
      .map((f, i) =>
        f[key] && frames[i][key]
          ? Math.abs(f[key][index] - frames[i][key][index])
          : 0,
      ),
  );
}
// Compare geometry at a common sampling interval. A delayed CDP/headless frame
// can span several paint intervals; retain raw frames above for timing review.
function stepPerFrame(frames, key, index) {
  return Math.max(
    0,
    ...frames
      .slice(1)
      .map((f, i) =>
        f[key] && frames[i][key]
          ? Math.abs(f[key][index] - frames[i][key][index]) *
            Math.min(1, 16.67 / Math.max(1, f.t - frames[i].t))
          : 0,
      ),
  );
}
try {
  await h.load();
  await h.setText(poem);
  await record("first-analysis-editor-geometry", async () => {
    const frames = await trace(() =>
      h.evaluate("document.querySelector('.pc-input__submit').click()"),
    );
    const data = {
      panelStep: maxStep(frames, "panel", 3),
      textareaStep: maxStep(frames, "input", 3),
      frames,
    };
    assert(frames.every((f) => f.same));
    assert(
      data.panelStep < 65,
      JSON.stringify({
        panelStep: data.panelStep,
        textareaStep: data.textareaStep,
      }),
    );
    assert(
      data.textareaStep < 20,
      JSON.stringify({ textareaStep: data.textareaStep }),
    );
    return data;
  });
  await shot("desktop-result");
  for (const [name, selector] of [
    ["settings-open", ".pc-input__settings"],
    ["settings-close", ".pc-input__settings"],
    ["editor-collapse", ".pc-plinth__toggle"],
    ["editor-expand", ".pc-plinth__toggle"],
    ["reanalyze", ".pc-input__submit"],
  ])
    await record(name, async () => {
      const frames = await trace(() =>
        h.evaluate(`document.querySelector('${selector}').click()`),
      );
      const step = maxStep(frames, "panel", 3);
      const normalizedStep = stepPerFrame(frames, "panel", 3);
      assert(frames.every((f) => f.same));
      assert(
        normalizedStep < 65,
        "height jump " + JSON.stringify({ step, normalizedStep }),
      );
      return { step, normalizedStep, frames };
    });
  await record("fast-reanalysis-has-no-loading-flash", async () => {
    const frames = await trace(() =>
      h.evaluate("document.querySelector('.pc-input__submit').click()"),
    );
    assert(!frames.some((f) => f.busy || f.label.includes("分析中")));
    return { frames };
  });
  await record("slow-analysis-shows-readable-feedback", async () => {
    await h.evaluate(
      "window.__fetch=window.fetch;window.fetch=async(...a)=>{const response=await window.__fetch(...a);await new Promise(r=>setTimeout(r,230));return response;}",
    );
    const frames = await trace(() =>
      h.evaluate("document.querySelector('.pc-input__submit').click()"),
    );
    await h.evaluate("window.fetch=window.__fetch");
    const visible = frames.filter((f) => f.busy);
    assert(visible.length > 0);
    assert(visible.at(-1).t - visible[0].t >= 280);
    assert(frames.some((f) => f.disabled));
    return { visibleMs: visible.at(-1).t - visible[0].t, frames };
  });
  await record("even-line-highlight-returns-to-original-color", async () => {
    const color = () =>
      h.evaluate(
        "getComputedStyle(document.querySelector('#pc-line-2')).backgroundColor",
      );
    const before = await color();
    await h.evaluate("document.querySelectorAll('.pc-rail__line')[1].click()");
    await sleep(1060);
    const nearEnd = await color();
    await sleep(300);
    const after = await color();
    const rgb = (s) => s.match(/[\d.]+/g).map(Number);
    assert.deepEqual(rgb(after), rgb(before));
    assert(
      rgb(nearEnd).length === 3 &&
        rgb(nearEnd).every((v, i) => Math.abs(v - rgb(after)[i]) < 5),
      JSON.stringify({ before, nearEnd, after }),
    );
    return { before, nearEnd, after };
  });
  await record("settings-while-sidebar-is-sticky", async () => {
    await h.evaluate("window.scrollTo({top:500,behavior:'instant'})");
    await sleep(300);
    const frames = await trace(() =>
      h.evaluate("document.querySelector('.pc-input__settings').click()"),
    );
    const step = maxStep(frames, "panel", 1);
    assert(step < 40, "sticky top jumped " + step);
    await h.evaluate("document.querySelector('.pc-input__settings').click()");
    await sleep(500);
    return { step, frames };
  });
  await record("evidence-open-close-keeps-page-position", async () => {
    await h.evaluate(
      "document.querySelector('.pc-cell').scrollIntoView({block:'center',behavior:'instant'})",
    );
    const before = await h.evaluate("scrollY");
    await h.evaluate(
      "document.querySelector('.pc-cell').focus({preventScroll:true});document.querySelector('.pc-cell').click()",
    );
    await sleep(400);
    const open = await h.evaluate("scrollY");
    await h.key("Escape", "Escape", 27);
    await sleep(400);
    const closed = await h.evaluate("scrollY");
    assert(Math.abs(open - before) < 2);
    assert(Math.abs(closed - before) < 2);
    return { before, open, closed };
  });
  await h.load({ width: 375, height: 812, mobile: true });
  await h.setText(poem);
  await record("mobile-result-scroll-waits-for-layout", async () => {
    const frames = await trace(() =>
      h.evaluate("document.querySelector('.pc-input__submit').click()"),
    );
    const end = frames.at(-1);
    assert(
      Math.abs(end.report[1] - 16) < 5,
      "report missed its final scroll target: " + end.report[1],
    );
    return { frames };
  });
  await shot("mobile-result");
  await h.media(true);
  await record("reduced-motion-disclosures-still-work", async () => {
    await h.evaluate(
      "window.scrollTo({top:0,behavior:'instant'});document.querySelector('.pc-plinth__toggle').click()",
    );
    await sleep(60);
    assert.equal(
      await h.evaluate(
        "Math.round(document.querySelector('.pc-editor-body').getBoundingClientRect().height)",
      ),
      0,
    );
    await h.evaluate("document.querySelector('.pc-plinth__toggle').click()");
    await sleep(60);
    assert(
      (await h.evaluate(
        "document.querySelector('.pc-editor-body').getBoundingClientRect().height",
      )) > 100,
    );
  });
} finally {
  await h.stop();
}
writeFileSync(
  join(dir, process.argv[2] || "results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
for (const s of result.scenarios) console.log(s.status, s.name, s.error ?? "");
process.exitCode = result.scenarios.some((s) => s.status !== "pass") ? 1 : 0;
