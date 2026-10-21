import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';
import { POEMS } from '../integration/e2e/d3-acceptance-api.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/automatic-reference');
mkdirSync(out, { recursive: true });
let mode = 'success';
let modelCalls = 0;
const app = buildApp({ readingAssistant: { apiKey: 'test-only-controlled-key', analysisTimeoutMs: 1000, fetcher: async (_url, init) => {
  modelCalls++;
  if (mode === 'failure') return new Response('controlled unavailable', { status: 500 });
  const data = JSON.parse(JSON.parse(init.body).messages[1].content);
  if (data.task === 'critique') return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ overview: '受控评议，仅验证已有自动辨音流程不受新增工作台影响。', strengths: [], revisions: [] }) } }] }));
  const suggestions = data.targets.map((target) => ({ tokenId: target.tokenId, candidateId: (target.candidates.find((candidate) => candidate.toneClass === (target.character === '不' ? 'ru' : 'qu')) ?? target.candidates[0]).id, pronunciation: null, reason: '受控推理，仅验证自动应用链路。' }));
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ suggestions }) } }] }));
} } });
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'controlled-model-with-real-server-orchestration-and-browser', realModelInference: false, checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', (event) => result.errors.push(event.exceptionDetails.text));
const check = async (name, run) => { await run(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async (name) => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const moveTo = async (selector) => {
  const position = await h.evaluate(`(() => { const element=document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView({block:'center',behavior:'instant'}); const r=element.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  await h.mouse('mouseMoved', position.x, position.y);
};
try {
  await check('whole-poem-automatically-applies-model-without-confirmation', async () => {
    await h.load({ reduce: true });
    await h.setText(POEMS[0].text);
    const seen = [];
    h.cdp.on('Network.requestWillBeSent', (event) => { if (event.request.url.endsWith('/api/v1/analyze') && event.request.postData) seen.push(JSON.parse(event.request.postData)); });
    await h.cdp.send('Network.enable');
    await h.analyze();
    assert(modelCalls > 0);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].readingOverrides, []);
    assert.equal(await h.evaluate("document.querySelector('.pc-status').textContent.includes('GLM已自动辨析')"), true);
    await h.click('[data-token-id="l4c1"]');
    await waitFor(() => h.evaluate("document.querySelector('.pc-evidence')?.textContent.includes('GLM 自动辨音')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-evidence').textContent.includes('采用此读音并重查')"), false);
    await shot('automatic-character');
    await h.key('Escape');
  });
  await check('missing-dictionary-entry-is-distinct-from-applied-context-choice', async () => {
    await h.setText('金樽清酒斗十千，停杯投箸不能食。');
    await h.analyze();
    assert.equal(await h.evaluate("document.querySelector('[data-token-id=l1c2] .pc-cell__tone').textContent"), '缺录');
    assert.equal(await h.evaluate("document.querySelector('[data-token-id=l2c5] .pc-cell__tone').textContent"), '仄');
    assert.equal(await h.evaluate("document.querySelector('.pc-status').textContent.includes('所选韵书缺录1个字位（樽）')"), true);
    await h.click('[data-token-id=l1c2]');
    await h.click('.pc-guangyun summary');
    await waitFor(() => h.evaluate("document.querySelector('.pc-guangyun').textContent.includes('zūn')"));
    await shot('missing-entry-reference');
    await h.key('Escape');
  });
  await check('model-failure-still-produces-usable-report', async () => {
    mode = 'failure';
    await h.setText(POEMS[1].text);
    await h.analyze();
    assert.equal(await h.evaluate("document.querySelector('.pc-status').textContent.includes('GLM本次辨音未完成')"), true);
    assert.equal(await h.evaluate("document.querySelector('.pc-input__submit').disabled"), false);
    mode = 'success';
  });
  await check('hover-dwell-short-crossing-cancels-and-click-is-immediate', async () => {
    await h.setText(POEMS[2].text);
    await h.analyze();
    await h.evaluate(`(() => { window.__noteScrolls=[]; const pane=document.querySelector('.pc-notes__body'); const original=pane.scrollTo.bind(pane); pane.scrollTo=(options)=>{ window.__noteScrolls.push(performance.now()); original(options); }; })()`);
    await moveTo('.pc-cell__reference');
    await sleep(250);
    assert.equal(await h.evaluate('window.__noteScrolls.length'), 0);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-reference__note')"), false);
    await h.mouse('mouseMoved', 5, 5);
    await sleep(900);
    assert.equal(await h.evaluate('window.__noteScrolls.length'), 0);
    await moveTo('.pc-cell__reference');
    await sleep(250);
    assert.equal(await h.evaluate('window.__noteScrolls.length'), 0);
    await waitFor(() => h.evaluate('window.__noteScrolls.length > 0'), 2500);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-reference__note')"), true);
    await h.mouse('mouseMoved', 5, 5);
    await sleep(200);
    await h.evaluate('window.__noteScrolls=[]');
    await h.click('.pc-cell__reference');
    await waitFor(() => h.evaluate('window.__noteScrolls.length > 0'), 600);
    await h.key('Escape');
    await shot('hover-1440');
  });
  await check('footer-and-mobile-layout-at-375-and-320', async () => {
    for (const width of [375, 320]) {
      await h.viewport(width, 900, true);
      await h.evaluate("document.querySelector('.pc-colophon').scrollIntoView({block:'center',behavior:'instant'})");
      await sleep(100);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
      assert.equal(await h.evaluate("document.querySelector('.pc-colophon').textContent.includes('未经全面人工核验')"), true);
      await shot('footer-' + width);
    }
  });
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await h.stop();
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.checks.length, failure: result.failure, errors: result.errors }));
}
