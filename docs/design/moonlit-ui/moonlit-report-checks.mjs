/* global process, console */
// Reading rail, editor disclosure and IME regression. Usage: node docs/design/moonlit-ui/moonlit-report-checks.mjs
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { REPO_ROOT, LONG, revision, sleep, startHarness, makeRecorder } from "./harness.mjs";

const results = { suite: "report", revision: revision(), at: new Date().toISOString(), scenarios: [] };
const scenario = makeRecorder(results);
let h;
try {
  h = await startHarness();
  results.url = h.url;
  const { evaluate, click, key, load, setText, analyze, idle } = h;

  await load();
  await evaluate("window.__ta = document.querySelector('.pc-input__text'), 1");
  await setText(LONG);
  await analyze();

  await scenario("rail-lines-match-report", async () => {
    const d = await evaluate("({ rail: document.querySelectorAll('.pc-rail__line').length, lines: document.querySelectorAll('.pc-line').length })");
    assert(d.rail >= 8, `rail ${d.rail}`);
    assert.equal(d.rail, d.lines);
    return d;
  });

  for (const at of ["top", "middle", "bottom"]) {
    await scenario(`rail-in-viewport-${at}`, async () => {
      await evaluate(`(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        window.scrollTo({ top: ${JSON.stringify(at)} === 'top' ? 0 : ${JSON.stringify(at)} === 'middle' ? max / 2 : max, behavior: 'instant' });
      })()`);
      await sleep(400);
      return evaluate(`(() => {
        const r = document.querySelector('.pc-rail').getBoundingClientRect();
        const f = document.querySelector('.pc-colophon').getBoundingClientRect();
        const d = { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, footerTop: Math.round(f.top) };
        if (d.top < 0 || d.bottom > d.vh) throw new Error('rail outside viewport ' + JSON.stringify(d));
        if (d.bottom > d.footerTop + 1) throw new Error('rail overlaps footer ' + JSON.stringify(d));
        return d;
      })()`);
    });
  }

  await scenario("scroll-spy-never-scrolls", async () => {
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' }); window.__intoView = []; window.__scrollTo = 0; const s = window.scrollTo.bind(window); window.scrollTo = (...a) => { window.__scrollTo += 1; return s(...a); }; 1");
    await evaluate("document.getElementById('pc-line-12').getBoundingClientRect().top + scrollY - 200");
    await evaluate("document.documentElement.scrollTop = document.getElementById('pc-line-12').getBoundingClientRect().top + scrollY - 200, 1");
    await sleep(600);
    const d = await evaluate("({ into: window.__intoView.length, scrollTo: window.__scrollTo, active: document.querySelector('.pc-rail__line[aria-current=location]')?.textContent || null })");
    assert.equal(d.into, 0);
    assert.equal(d.scrollTo, 0);
    assert(d.active, "no active rail line");
    return d;
  });

  await scenario("rail-jump-pointer-flash", async () => {
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' }), 1");
    await click(".pc-rail__line:nth-of-type(1)");
    await evaluate("window.__intoView = [], 1");
    const target = await evaluate(`(() => { const b = document.querySelectorAll('.pc-rail__line'); b[b.length - 2].click(); return b.length - 1; })()`);
    await sleep(80);
    const d = await evaluate(`({ into: window.__intoView.slice(), flash: document.getElementById('pc-line-${target}')?.classList.contains('pc-line--flash') })`);
    assert(d.into.includes(`pc-line-${target}`), JSON.stringify(d.into));
    return d;
  });

  await scenario("rail-jump-keyboard-focus", async () => {
    await evaluate("document.querySelectorAll('.pc-rail__line')[3].focus(), 1");
    await key("Enter", "Enter", 13, 0, String.fromCharCode(13));
    await sleep(900);
    const id = await evaluate("document.activeElement.id");
    assert.equal(id, "pc-line-4");
    return { focused: id };
  });

  await scenario("editor-collapse-expand-keeps-textarea", async () => {
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' }), 1");
    await click(".pc-plinth__toggle");
    await sleep(500);
    const c = await evaluate(`({
      same: document.querySelector('.pc-input__text') === window.__ta,
      inert: document.getElementById('pc-editor-body').inert,
      focusOnToggle: document.activeElement.classList.contains('pc-plinth__toggle'),
      expanded: document.querySelector('.pc-plinth__toggle').getAttribute('aria-expanded'),
    })`);
    await click(".pc-plinth__toggle");
    await sleep(500);
    const o = await evaluate("({ same: document.querySelector('.pc-input__text') === window.__ta, inert: document.getElementById('pc-editor-body').inert })");
    assert(c.same && o.same, "textarea remounted");
    assert(c.inert && !o.inert, "inert not toggled");
    assert(c.focusOnToggle, "focus left toggle");
    return { collapsed: c, expanded: o };
  });

  await scenario("ime-composition-and-ctrl-enter", async () => {
    await evaluate(`(() => {
      const ta = document.querySelector('.pc-input__text');
      ta.focus();
      ta.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      return 1;
    })()`);
    await key("Enter", "Enter", 13, 2);
    await sleep(300);
    const during = await evaluate("Boolean(document.querySelector('.pc-root--busy'))");
    await evaluate("document.querySelector('.pc-input__text').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })), 1");
    await setText("床前明月光，疑是地上霜。举头望明月，低头思故乡。");
    await evaluate("document.querySelector('.pc-input__text').focus(), 1");
    await key("Enter", "Enter", 13, 2);
    await sleep(200);
    await idle();
    await sleep(400);
    const d = await evaluate("({ lines: document.querySelectorAll('.pc-line').length, same: document.querySelector('.pc-input__text') === window.__ta })");
    assert.equal(during, false, "submitted during composition");
    assert.equal(d.lines, 4);
    assert(d.same, "textarea remounted after new report");
    return { submittedDuringComposition: during, ...d };
  });
} catch (e) {
  results.fatal = e.message;
} finally {
  if (h) await h.stop();
}
const dir = join(REPO_ROOT, "docs/design/moonlit-ui/results");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "report-checks.json"), JSON.stringify(results, null, 2) + String.fromCharCode(10));
const failed = results.scenarios.filter((s) => s.status !== "pass");
console.log(`report checks: ${results.scenarios.length - failed.length}/${results.scenarios.length} pass${results.fatal ? " fatal=" + results.fatal : ""}`);
for (const f of failed) console.log(`FAIL ${f.name}: ${f.error}`);
process.exit(failed.length || results.fatal ? 1 : 0);