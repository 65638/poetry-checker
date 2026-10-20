/* global process, console */
// Reveal, stale, evidence drawer and mid-width regression. Usage: node docs/design/moonlit-ui/moonlit-reveal-checks.mjs
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { REPO_ROOT, revision, sleep, startHarness, makeRecorder } from "./harness.mjs";

const POEM = "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。";
const results = { suite: "reveal", revision: revision(), at: new Date().toISOString(), scenarios: [] };
const scenario = makeRecorder(results);
let h;
try {
  h = await startHarness();
  results.url = h.url;
  const { evaluate, click, key, load, setText, analyze, idle } = h;
  const reveals = () => evaluate("window.__intoView.filter((c) => String(c).includes('pc-manuscript')).length");
  const reset = () => evaluate("window.__intoView = [], 1");

  await load({ width: 375, height: 812, mobile: true });
  await setText(POEM);
  await scenario("reveal-375-pointer-click", async () => {
    await reset();
    await analyze();
    const n = await reveals();
    assert(n >= 1, "no reveal after pointer click");
    return { reveals: n };
  });

  await scenario("reveal-375-same-text-replays", async () => {
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' }), 1");
    await reset();
    await analyze();
    const d = { reveals: await reveals(), anims: await evaluate("document.querySelector('.pc-report').getAnimations({ subtree: true }).length") };
    assert(d.reveals >= 1, "no reveal on same-text reanalysis");
    return d;
  });

  await scenario("reveal-375-ctrl-enter", async () => {
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' }), document.querySelector('.pc-input__text').focus(), 1");
    await reset();
    await key("Enter", "Enter", 13, 2);
    await sleep(150);
    await idle();
    await sleep(500);
    const n = await reveals();
    assert(n >= 1, "no reveal after Ctrl+Enter");
    return { reveals: n };
  });

  await scenario("no-reveal-after-wheel", async () => {
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' }), 1");
    await reset();
    // Wheel in the same task as the click, so it always lands while the request is pending.
    await evaluate("document.querySelector('.pc-input__submit').click(), window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 })), 1");
    await sleep(150);
    await idle();
    await sleep(500);
    const n = await reveals();
    assert.equal(n, 0, "revealed despite wheel");
    return { reveals: n };
  });

  await scenario("no-reveal-on-failure", async () => {
    await setText("abc");
    await reset();
    await click(".pc-input__submit");
    await sleep(150);
    await idle();
    await sleep(500);
    const d = { reveals: await reveals(), alert: await evaluate("Boolean(document.querySelector('[role=alert]'))") };
    assert.equal(d.reveals, 0, "revealed on failure");
    return d;
  });

  await load({ width: 1440, height: 900 });
  await setText(POEM);
  await scenario("no-reveal-at-1440", async () => {
    await reset();
    await analyze();
    const n = await reveals();
    assert.equal(n, 0, "revealed at desktop width");
    return { reveals: n };
  });

  await scenario("evidence-open-close-reopen-escape", async () => {
    const id = await evaluate("document.querySelector('[data-token-id]').dataset.tokenId");
    const sel = `[data-token-id="${id}"]`;
    await click(sel);
    await sleep(400);
    const open1 = await evaluate("Boolean(document.querySelector('[role=dialog]'))");
    await click(".pc-evidence__header button");
    await sleep(400);
    const closed = await evaluate("!document.querySelector('[role=dialog]')");
    await evaluate(`document.querySelector(${JSON.stringify(sel)}).focus(), 1`);
    await key("Enter", "Enter", 13, 0, String.fromCharCode(13));
    await sleep(400);
    const open2 = await evaluate("Boolean(document.querySelector('[role=dialog]'))");
    await key("Escape", "Escape", 27);
    await sleep(400);
    const restored = await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(sel)})`);
    assert(open1 && closed && open2 && restored, JSON.stringify({ open1, closed, open2, restored }));
    return { open1, closed, open2, restored };
  });

  await scenario("candidate-override-still-works", async () => {
    const found = await evaluate(`(() => {
      const cells = [...document.querySelectorAll('[data-token-id]')];
      return cells.map((c) => c.dataset.tokenId);
    })()`);
    for (const id of found) {
      await evaluate(`document.querySelector('[data-token-id="${id}"]').click(), 1`);
      await sleep(250);
      const n = await evaluate("[...document.querySelectorAll('.pc-candidate button')].filter((b) => /改用此读音/.test(b.textContent) && !b.disabled).length");
      if (n > 0) {
        await evaluate("[...document.querySelectorAll('.pc-candidate button')].find((b) => /改用此读音/.test(b.textContent) && !b.disabled).click(), 1");
        await sleep(300);
        await idle();
        await sleep(400);
        const tokens = await evaluate("document.querySelectorAll('[data-token-id]').length");
        assert.equal(tokens, 20);
        return { token: id, tokens };
      }
      await key("Escape", "Escape", 27);
      await sleep(150);
    }
    return { skipped: "no selectable alternative candidate in this poem" };
  });

  await scenario("settled-finding-auto-opens", async () => {
    await evaluate("document.querySelector('[role=dialog]') && document.querySelector('.pc-evidence__header button').click(), 1");
    await sleep(300);
    const d = await evaluate(`(() => {
      const det = document.querySelector('.pc-settled');
      if (!det) return { skipped: 'no settled findings' };
      det.open = false;
      const b = det.querySelector('.pc-finding__locate');
      b.click();
      return { before: false };
    })()`);
    if (d.skipped) return d;
    await sleep(300);
    const open = await evaluate("document.querySelector('.pc-settled').open");
    assert(open, "settled details did not open");
    return { open };
  });

  await scenario("stale-disables-rail", async () => {
    await evaluate("document.querySelector('[role=dialog]') && document.querySelector('.pc-evidence__header button').click(), 1");
    await setText(POEM + "白");
    await sleep(300);
    const d = await evaluate("({ stale: Boolean(document.querySelector('.pc-stale')), disabled: [...document.querySelectorAll('.pc-rail__line')].every((b) => b.disabled) })");
    assert(d.stale && d.disabled, JSON.stringify(d));
    return d;
  });

  for (const w of [900, 1024, 1100]) {
    await load({ width: w, height: 900 });
    await setText(POEM);
    await analyze();
    await scenario(`verdict-not-squeezed-${w}`, () => evaluate(`(() => {
      const t = document.querySelector('.pc-status__body').getBoundingClientRect();
      const lines = [...document.querySelectorAll('.pc-line__cells')].map((c) => Math.round(c.getBoundingClientRect().height));
      const cell = Math.round(document.querySelector('.pc-cell').getBoundingClientRect().height);
      const d = { verdictWidth: Math.round(t.width), lineHeights: lines, cell };
      if (d.verdictWidth < 240) throw new Error('verdict squeezed ' + JSON.stringify(d));
      if (lines.some((x) => x > cell * 1.6)) throw new Error('five-char line wraps ' + JSON.stringify(d));
      return d;
    })()`));
  }
} catch (e) {
  results.fatal = e.message;
} finally {
  if (h) await h.stop();
}
const dir = join(REPO_ROOT, "docs/design/moonlit-ui/results");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "reveal-checks.json"), JSON.stringify(results, null, 2) + String.fromCharCode(10));
const failed = results.scenarios.filter((s) => s.status !== "pass");
console.log(`reveal checks: ${results.scenarios.length - failed.length}/${results.scenarios.length} pass${results.fatal ? " fatal=" + results.fatal : ""}`);
for (const f of failed) console.log(`FAIL ${f.name}: ${f.error}`);
process.exit(failed.length || results.fatal ? 1 : 0);