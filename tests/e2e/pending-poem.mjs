import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';
import { POEMS } from '../integration/e2e/d3-acceptance-api.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/pending-poem');
mkdirSync(out, { recursive: true });
const waiting = [];
let fail = false;
const app = buildApp({ readingAssistant: { apiKey: '' } });
app.addHook('preHandler', async (request, reply) => {
  if (request.url !== '/api/v1/analyze') return;
  await new Promise(release => waiting.push({ text: request.body.text, release }));
  if (fail) return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'controlled waiting failure', fieldErrors: [] } });
});
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'real-api-model-disabled-controlled-delay-and-failure', checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', event => result.errors.push(event.exceptionDetails.text));
const check = async (name, run) => { await run(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async name => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const pendingText = () => h.evaluate("Array.from(document.querySelectorAll('.pc-pending__line > span:last-child')).map(el=>el.textContent).join('')");
const normalize = text => text.replace(/\s/gu, '');
const contrast = async () => {
  const colors = await h.evaluate("({fg:getComputedStyle(document.querySelector('.pc-pending__line')).color,bg:getComputedStyle(document.querySelector('.pc-manuscript')).backgroundColor})");
  const luminance = color => color.match(/\d+(?:\.\d+)?/gu).slice(0, 3).map(Number).map(c=>{const v=c/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[0.2126,0.7152,0.0722][i],0);
  assert(!colors.bg.startsWith('rgba'), JSON.stringify(colors));
  assert((luminance(colors.bg)+0.05)/(luminance(colors.fg)+0.05)>=4.5, JSON.stringify(colors));
};
const submit = async text => {
  await h.setText(text);
  await h.click('.pc-input__submit');
  await waitFor(() => waiting.length > 0);
  await waitFor(() => h.evaluate("!!document.querySelector('.pc-pending')"));
};
const finish = async () => {
  waiting.shift().release();
  await waitFor(() => h.evaluate("!!document.querySelector('.pc-report:not(.pc-report--stale)') && !document.querySelector('.pc-root--busy')"));
};
const text = POEMS[0].text;
try {
  await check('first-request-shows-complete-original-without-invented-analysis', async () => {
    await h.load({ reduce: false });
    await submit(text);
    assert.equal(normalize(await pendingText()), normalize(text));
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report')"), false);
    assert.equal(await h.evaluate("document.querySelector('.pc-pending__status').textContent"), '正在分析');
    assert.equal(await h.evaluate("!!document.querySelector('.pc-pending .pc-cell__tone')"), false);
    await sleep(450);
    await contrast();
    await h.evaluate("document.querySelector('.pc-pending').scrollIntoView({block:'start',behavior:'instant'}); true");
    await shot('waiting-1440');
    await finish();
    assert.equal(await h.evaluate("!!document.querySelector('.pc-pending')"), false);
  });
  await check('mobile-submission-reveals-poem-and-reduced-motion-stays-still', async () => {
    await h.load({ width: 375, height: 812, mobile: true, reduce: true });
    await submit(text);
    await waitFor(() => h.evaluate("document.querySelector('.pc-pending').getBoundingClientRect().top < innerHeight / 2"));
    assert.equal(normalize(await pendingText()), normalize(text));
    assert.equal(await h.evaluate("document.querySelector('.pc-pending__status svg').getAnimations().filter(a=>a.playState==='running').length"), 0);
    for (const width of [375, 320, 768]) {
      await h.viewport(width, 812, true);
      await contrast();
      assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      await shot('waiting-' + width);
    }
    const scrollBefore = await h.evaluate('window.scrollY');
    await h.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 120, y: 400, deltaY: 160, deltaX: 0 });
    await sleep(300);
    await finish();
    result.mobileUserScroll = { before: scrollBefore, after: await h.evaluate('window.scrollY') };
    assert.equal(await h.evaluate("window.__intoView.filter(x=>x.includes('pc-manuscript')).length"), 1);
  });
  await check('current-poem-remains-distinct-from-previous-report-and-long-lines-wrap', async () => {
    await h.viewport(375, 812, true);
    const longText = '白日依山尽'.repeat(36) + '。\n' + text + '\n𠀀山中';
    await h.setText(longText);
    await waitFor(() => waiting.length > 0);
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-pending')"));
    assert.equal(normalize(await pendingText()), normalize(longText));
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report--stale')"), true);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    const line = await h.evaluate("(() => {const r=document.querySelector('.pc-pending__line > span:last-child').getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};})()");
    assert(line.left >= 0 && line.right <= 375 && line.height > 80, JSON.stringify(line));
    await h.evaluate("document.querySelector('.pc-pending').scrollIntoView({block:'start',behavior:'instant'}); true");
    await shot('waiting-long-375');
    await h.evaluate("document.querySelector('.pc-plinth__toggle').click(); true");
    await h.click('.pc-pending__edit');
    await waitFor(() => h.evaluate("document.activeElement === document.querySelector('.pc-input__text') && !document.querySelector('.pc-input__text').closest('[inert]')"));
    assert.equal(waiting.length, 1);
    await finish();
  });
  await check('first-request-failure-keeps-original-readable-and-retry-replaces-it', async () => {
    await h.load({ reduce: true });
    fail = true;
    await submit(text);
    waiting.shift().release();
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-banner--error')"));
    assert.equal(normalize(await pendingText()), normalize(text));
    assert.equal(await h.evaluate("document.querySelector('.pc-pending__status').textContent"), '诗文原稿');
    assert.equal(await h.evaluate("!!document.querySelector('.pc-pending__status svg')"), false);
    await shot('failure-original');
    fail = false;
    await h.click('.pc-input__submit');
    await waitFor(() => waiting.length > 0);
    await finish();
    assert.equal(await h.evaluate("!!document.querySelector('.pc-pending')"), false);
  });
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  await shot('failure');
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const request of waiting.splice(0)) request.release();
  writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  await h.stop();
}
console.log(JSON.stringify({ passed: result.checks.length, errors: result.errors }));
