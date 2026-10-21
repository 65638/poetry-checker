import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';
import { POEMS } from '../integration/e2e/d3-acceptance-api.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/automatic-refresh');
mkdirSync(out, { recursive: true });
const requests = [];
let release;
let hold = false;
let fail = false;
const app = buildApp({ readingAssistant: { apiKey: '' } });
app.addHook('preHandler', async (request, reply) => {
  if (request.url !== '/api/v1/analyze') return;
  requests.push(request.body);
  if (hold) await new Promise(resolve => { release = resolve; });
  if (fail) return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'controlled refresh failure', fieldErrors: [] } });
});
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'real-api-model-disabled-controlled-delay-and-failure', checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', event => result.errors.push(event.exceptionDetails.text));
const check = async (name, run) => { await run(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async name => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const updated = () => waitFor(() => h.evaluate("!!document.querySelector('.pc-report:not(.pc-report--stale)') && !document.querySelector('.pc-root--busy')"));
const text = POEMS[0].text;
try {
  await h.load({ reduce: true });
  await check('initial-text-waits-for-manual-analysis', async () => {
    await h.setText(text);
    await sleep(1800);
    assert.equal(requests.length, 0);
    await h.analyze();
    assert.equal(requests.length, 1);
  });
  await check('reading-folding-and-switching-places-do-not-reanalyze', async () => {
    await h.click('[data-token-id=l1c1]');
    await h.key('Escape');
    await h.evaluate("document.querySelector('.pc-rail__edit').click(); document.querySelector('.pc-rail__edit').click(); true");
    await h.click('[aria-controls=dictionary-space]');
    await h.click('[aria-controls=library-space]');
    await h.click('[aria-controls=checker-space]');
    await sleep(1800);
    assert.equal(requests.length, 1);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-stale')"), false);
  });
  await check('rapid-edits-coalesce-and-old-directory-remains-readable-while-updating', async () => {
    hold = true;
    await h.setText(text.replace('白日', '红日'));
    await sleep(1000);
    await h.setText(text.replace('白日', '落日'));
    await sleep(1000);
    assert.equal(requests.length, 1);
    await waitFor(() => requests.length === 2 && !!release);
    assert.equal(requests[1].text, text.replace('白日', '落日'));
    assert.equal(await h.evaluate("document.querySelector('.pc-stale').textContent.includes('正在更新分析')"), true);
    assert.equal(await h.evaluate("Array.from(document.querySelectorAll('.pc-rail__line')).every(b=>!b.disabled)"), true);
    await h.click('.pc-rail__line');
    assert.equal(await h.evaluate("document.querySelector('.pc-rail__line').getAttribute('aria-current')"), 'location');
    assert.equal(await h.evaluate("getComputedStyle(document.querySelector('.pc-reading')).opacity"), '1');
    await shot('updating-readable-1440');
    hold = false;
    release();
    release = null;
    await updated();
    assert.equal(await h.evaluate("document.querySelector('[data-token-id=l1c1]').textContent.includes('落')"), true);
    await sleep(1800);
    assert.equal(requests.length, 2);
  });
  await check('chinese-composition-finishes-before-auto-update', async () => {
    await h.evaluate(`(() => {
      const input = document.querySelector('.pc-input__text');
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    })()`);
    await sleep(1800);
    assert.equal(requests.length, 2);
    await h.evaluate("document.querySelector('.pc-input__text').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); true");
    await waitFor(() => requests.length === 3);
    await updated();
    assert.equal(requests[2].text, text);
  });
  await check('book-change-refreshes-once-and-failure-does-not-loop', async () => {
    await h.click('.pc-segmented__option:has(input[value=cilin])');
    await waitFor(() => requests.length === 4);
    await updated();
    assert.equal(requests[3].rhymeBook, 'cilin');
    assert.equal(await h.evaluate("document.querySelector('.pc-policy').textContent.includes('词林正韵')"), true);
    fail = true;
    await h.setText(text.replace('白日', '红日'));
    await waitFor(() => requests.length === 5);
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-banner--error')"));
    await sleep(3200);
    assert.equal(requests.length, 5);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-reading') && !document.querySelector('.pc-rail__line').disabled"), true);
    await h.viewport(375, 812, true);
    await h.evaluate("document.querySelector('.pc-rail__directory-toggle').click(); document.querySelector('.pc-rail').scrollIntoView({block:'start',behavior:'instant'}); true");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await shot('failed-refresh-readable-375');
    fail = false;
    await h.analyze();
    await updated();
    assert.equal(requests.length, 6);
  });
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  await shot('failure');
  console.error(error);
  process.exitCode = 1;
} finally {
  hold = false;
  release?.();
  writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  await h.stop();
}
console.log(JSON.stringify({ passed: result.checks.length, errors: result.errors }));
