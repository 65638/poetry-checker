/* global process, console */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  startHarness,
  sleep,
  makeRecorder,
  REPO_ROOT,
  revision,
  LONG,
} from "./harness.mjs";

const result = { revision: revision(), scenarios: [] };
const record = makeRecorder(result);
const h = await startHarness();
const active = () =>
  h.evaluate(
    "document.querySelector('.pc-rail__line[aria-current=location]')?.querySelector('.pc-rail__no').textContent",
  );
const state = () =>
  h.evaluate(
    "({ active: document.querySelector('.pc-rail__line[aria-current=location]')?.textContent, scroll: scrollY, jumps: window.__intoView, line4: document.querySelector('#pc-line-4').getBoundingClientRect().top })",
  );
async function select(n) {
  const p = await h.evaluate(
    `(() => { const el=document.querySelectorAll('.pc-rail__line')[${n - 1}]; el.scrollIntoView({block:'nearest'}); const r=el.getBoundingClientRect();window.__intoView=[];return {x:r.x+r.width*.7,y:r.y+r.height/2}; })()`,
  );
  await h.mouse("mouseMoved", p.x, p.y);
  await h.mouse("mousePressed", p.x, p.y, { button: "left", clickCount: 1 });
  await h.mouse("mouseReleased", p.x, p.y, { button: "left", clickCount: 1 });
}
try {
  await h.load();
  await h.setText("白日依山尽，黄河入海流。欲穷千里目，更上一层楼。");
  await h.analyze();
  await record("short-poem-click-four-stays-four", async () => {
    await select(4);
    await sleep(1600);
    const s = await state();
    assert.equal(await active(), "4", JSON.stringify(s));
    assert.deepEqual(s.jumps, ["pc-line-4"]);
    return s;
  });
  await record("repeated-pointer-selections-follow-chosen-line", async () => {
    const selected = [];
    for (const n of [2, 3, 1, 4]) {
      await select(n);
      await sleep(900);
      selected.push(await active());
      assert.equal(selected.at(-1), String(n), JSON.stringify(await state()));
    }
    return selected;
  });
  await record("blank-click-does-not-reset-directory", async () => {
    await select(4);
    await sleep(900);
    await h.mouse("mousePressed", 1400, 450, { button: "left", clickCount: 1 });
    await h.mouse("mouseReleased", 1400, 450, {
      button: "left",
      clickCount: 1,
    });
    await sleep(400);
    assert.equal(await active(), "4", JSON.stringify(await state()));
  });
  await record("keyboard-selection-stays-four", async () => {
    await h.evaluate("document.querySelectorAll('.pc-rail__line')[3].focus()");
    await h.key("Enter", "Enter", 13, 0, String.fromCharCode(13));
    await sleep(1200);
    assert.equal(await active(), "4", JSON.stringify(await state()));
    assert.equal(await h.evaluate("document.activeElement.id"), "pc-line-4");
  });
  await record("manual-scroll-resumes-tracking", async () => {
    await h.evaluate(
      "window.__intoView=[];window.scrollTo({top:0,behavior:'instant'})",
    );
    await sleep(400);
    assert.equal(await active(), "1", JSON.stringify(await state()));
    assert.deepEqual(await h.evaluate("window.__intoView"), []);
  });
  await h.setText(LONG);
  await h.analyze();
  await record("long-poem-selection-and-scroll-tracking", async () => {
    await select(4);
    await sleep(1400);
    assert.equal(await active(), "4");
    await h.evaluate(
      "document.getElementById('pc-line-12').scrollIntoView({block:'center',behavior:'instant'})",
    );
    await sleep(400);
    assert.equal(await active(), "12");
  });
  await h.media(true);
  await record("reduced-motion-selection", async () => {
    await select(3);
    await sleep(400);
    assert.equal(await active(), "3");
  });
} finally {
  await h.stop();
}
writeFileSync(
  join(REPO_ROOT, "docs/design/moonlit-ui/rail-selection-results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
for (const r of result.scenarios) console.log(r.status, r.name, r.error ?? "");
process.exitCode = result.scenarios.some((r) => r.status !== "pass") ? 1 : 0;
