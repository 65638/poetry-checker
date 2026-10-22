import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/product-refinement/new-flows');
mkdirSync(out, { recursive: true });
let behavior = 'success';
let critiques = 0;
let transientAttempts = 0;
const app = buildApp({ readingAssistant: {
  provider: 'deepseek', apiKey: 'controlled-test-key',
  fetcher: async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    if (behavior === 'transient-provider' && input.task === 'critique' && ++transientAttempts === 1)
      return new Response('controlled temporary provider outage', { status: 503 });
    const output = input.task === 'critique'
      ? { overview: '浏览器受控赏读结果。' + input.direction, strengths: ['此内容只验证交互，不代表模型文学判断。'], revisions: [] }
      : { suggestions: input.targets.map(t => ({ tokenId: t.tokenId, candidateId: t.candidates[0].id, pronunciation: null, reason: '受控交互测试。' })) };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }));
  },
} });
app.addHook('preHandler', async (request, reply) => {
  if (request.url !== '/api/v1/poetry-assistant' || request.body.task !== 'critique') return;
  critiques++;
  if (behavior === 'malformed') return reply.send({ task: 'critique', result: {} });
  if (behavior === 'failure') return reply.code(503).send({ error: { message: '受控暂时不可用，请重试。' } });
  if (behavior === 'slow') await sleep(3500);
});
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'controlled-upstream-real-api-browser', realModelInference: false, checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', e => result.errors.push(e.exceptionDetails.exception?.description ?? e.exceptionDetails.text));
const check = async (name, fn) => { await fn(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async name => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const fill = (selector, value) => h.evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
async function clickText(scope, label) {
  await h.evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)}); if(!e)throw new Error('Missing '+${JSON.stringify(label)}); e.setAttribute('data-refinement-target','yes'); })()`);
  try { await h.click('[data-refinement-target="yes"]'); }
  finally { await h.evaluate("document.querySelector('[data-refinement-target]')?.removeAttribute('data-refinement-target')"); }
}
try {
  await check('recent-reading-persists-and-reopens-original', async () => {
    await h.load({ path: '#library', reduce: true });
    await waitFor(() => h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
    await h.click('.pc-library-title');
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-library-reading')"));
    const title = await h.evaluate("document.querySelector('.pc-library-reading > h2').textContent");
    const visit = await h.evaluate("JSON.parse(localStorage.getItem('poetry-reading-journal-v1'))[0].id");
    await h.cdp.send('Page.reload');
    await waitFor(() => h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-reading-journal')"));
    await h.click('.pc-reading-journal summary');
    await h.click('.pc-reading-journal button');
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-library-reading')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-library-reading > h2').textContent"), title);
    assert.deepEqual(await h.evaluate("JSON.parse(localStorage.getItem('poetry-reading-journal-v1')).map(v=>v.id)"), [visit]);
  });
  await check('whole-poem-clipboard-and-txt-preserve-original-and-source', async () => {
    await h.cdp.send('Browser.grantPermissions', { origin: new URL(h.url).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await clickText('.pc-poem-share button', '复制整首');
    await waitFor(() => h.evaluate("document.querySelector('.pc-library-reading').textContent.includes('整首已复制')"));
    const copied = await h.evaluate('navigator.clipboard.readText()');
    assert(copied.includes('来源：') && copied.startsWith('《'));
    assert(!copied.includes('inputHash') && !copied.includes('needs_review'));
    const downloads = [];
    h.cdp.on('Browser.downloadWillBegin', e => downloads.push(e));
    const directory = join(out, 'downloads');
    mkdirSync(directory, { recursive: true });
    await h.cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory, eventsEnabled: true });
    await clickText('.pc-poem-share button', '下载诗文');
    await waitFor(() => downloads.length > 0 && existsSync(join(directory, downloads[0].suggestedFilename)));
    assert.equal(readFileSync(join(directory, downloads[0].suggestedFilename), 'utf8'), copied.replace(/\r\n/g, '\n'));
  });
  await check('reading-font-and-quiet-preferences-persist-and-fit-mobile', async () => {
    const before = await h.evaluate("parseFloat(getComputedStyle(document.querySelector('.pc-library-reading .pc-library-verses')).fontSize)");
    await h.click('[aria-label^="诗文字号"]');
    await h.click('[aria-label^="诗文字号"]');
    assert.equal(await h.evaluate("document.querySelector('.pc-workspace').dataset.readingSize"), '2');
    assert(await h.evaluate("parseFloat(getComputedStyle(document.querySelector('.pc-library-reading .pc-library-verses')).fontSize)") > before);
    await clickText('.pc-reading-tools button', '◐静读');
    await h.cdp.send('Page.reload');
    await waitFor(() => h.evaluate("document.querySelector('.pc-workspace')?.dataset.readingSize==='2'"));
    assert.equal(await h.evaluate("document.querySelector('.pc-reading-tools [aria-pressed]').getAttribute('aria-pressed')"), 'true');
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-reading-journal')"));
    await h.click('.pc-reading-journal summary');
    await h.click('.pc-reading-journal button');
    await h.evaluate("document.querySelector('.pc-library-reading').scrollIntoView({block:'start',behavior:'instant'})");
    await shot('reading-1440');
    for (const width of [375, 320]) {
      await h.viewport(width, 900, true);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, `${width}px overflow`);
      await h.evaluate("document.querySelector('.pc-library-reading').scrollIntoView({block:'start',behavior:'instant'})");
      await shot('reading-' + width);
    }
    await h.viewport(1440, 1000);
  });
  await check('failed-rerun-keeps-same-poem-result-and-retries-once', async () => {
    await h.evaluate("location.hash='checker'");
    await waitFor(() => h.evaluate("document.querySelector('.pc-workspace').dataset.place==='checker'"));
    await h.setText('白日依山尽，黄河入海流。欲穷千里目，更上一层楼。');
    await h.analyze();
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('浏览器受控赏读结果')"));
    behavior = 'failure';
    await clickText('.pc-poetry-critique button', '重新评议');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-critique .pc-studio-error')?.textContent.includes('受控暂时不可用')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-review').textContent.includes('浏览器受控赏读结果')"), true);
    const before = critiques;
    behavior = 'success';
    await clickText('.pc-poetry-critique button', '重试本次研读');
    await waitFor(() => h.evaluate("!document.querySelector('.pc-poetry-critique .pc-studio-error') && [...document.querySelectorAll('.pc-poetry-critique button')].some(e=>e.textContent.trim()==='重新评议' && !e.disabled)"));
    assert.equal(critiques, before + 1);
  });
  await check('incomplete-ai-result-has-readable-retry-and-keeps-last-result', async () => {
    behavior = 'malformed';
    await clickText('.pc-poetry-critique button', '重新评议');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-critique .pc-studio-error')?.textContent.includes('研读结果不完整')"));
    const message = await h.evaluate("document.querySelector('.pc-poetry-critique .pc-studio-error').textContent");
    assert(!message.includes('invalid_type') && !message.includes('expected') && !message.includes('path'));
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-review').textContent.includes('浏览器受控赏读结果')"), true);
    behavior = 'success';
    await clickText('.pc-poetry-critique button', '重试本次研读');
    await waitFor(() => h.evaluate("!document.querySelector('.pc-poetry-critique .pc-studio-error') && [...document.querySelectorAll('.pc-poetry-critique button')].some(e=>e.textContent.trim()==='重新评议' && !e.disabled)"));
  });
  await check('one-transient-provider-failure-recovers-without-manual-resubmission', async () => {
    behavior = 'transient-provider';
    transientAttempts = 0;
    const before = critiques;
    await clickText('.pc-poetry-critique button', '重新评议');
    await waitFor(() => transientAttempts === 2);
    await waitFor(() => h.evaluate("!document.querySelector('.pc-poetry-critique .pc-studio-error') && [...document.querySelectorAll('.pc-poetry-critique button')].some(e=>e.textContent.trim()==='重新评议' && !e.disabled)"));
    assert.equal(critiques, before + 1, 'one browser request with a bounded server recovery');
  });
  await check('cancel-suppresses-late-response-and-resume-keeps-input', async () => {
    behavior = 'slow';
    await clickText('.pc-poetry-critique button', '重新评议');
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-poetry-critique [aria-label=\"取消请求\"]:not(:disabled)')"));
    await h.click('.pc-poetry-critique [aria-label="取消请求"]');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-critique').textContent.includes('已停止本次研读')"));
    await sleep(3800);
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-critique').textContent.includes('已停止本次研读')"), true);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-poetry-review')"), true);
    behavior = 'success';
    await clickText('.pc-poetry-critique button', '重新研读');
    await waitFor(() => h.evaluate("!document.querySelector('.pc-poetry-critique').textContent.includes('已停止本次研读') && !!document.querySelector('.pc-poetry-review')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。');
  });
  await check('returning-to-analyzed-direction-reuses-result-and-explicit-rerun-still-requests-ai', async () => {
    const direction=async value=>h.evaluate(`(() => {const e=document.querySelector('[aria-label="评议侧重"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    behavior='success';
    const before=critiques;
    await direction('imagery');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('imagery')"));
    assert.equal(critiques,before+1);
    behavior='failure';
    await direction('meaning');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-critique').textContent.includes('已取回本次会话')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-review').textContent.includes('meaning')"),true);
    await sleep(250);
    assert.equal(critiques,before+1,'returning reuses a completed exact request');
    await clickText('.pc-poetry-critique button','重新评议');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-poetry-critique .pc-studio-error')"));
    assert.equal(critiques,before+2,'explicit rerun bypasses cache');
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-review').textContent.includes('meaning')"),true);
    behavior='slow';
    await direction('sound');
    await waitFor(()=>critiques===before+3);
    await direction('meaning');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('meaning')"));
    await sleep(3800);
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-review').textContent.includes('meaning')"),true,'late sound response cannot overwrite cached meaning result');
    assert.equal(critiques,before+3);
    behavior='success';
  });
  await check('new-poem-does-not-show-old-ai-result', async () => {
    behavior = 'failure';
    await h.setText('床前明月光，疑是地上霜。举头望明月，低头思故乡。');
    await h.analyze();
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-poetry-critique .pc-studio-error')"));
    assert.equal(await h.evaluate("!!document.querySelector('.pc-poetry-review')"), false);
    behavior = 'success';
  });
  await check('notebook-search-aligned-diff-and-restore-before', async () => {
    const draft = text => ({ text, rhymeBook: 'pingshui', genreHint: 'auto', formHint: 'auto' });
    const before = '白日依山尽，\n黄河入海流。';
    const after = '白日依山尽，\n春风过小楼。\n黄河入海流。';
    await h.evaluate(`localStorage.setItem('poetry-notebook-v1',${JSON.stringify(JSON.stringify({ version: 1, entries: [
      { id: 'snapshot', at: '2026-10-23T01:00:00Z', before: draft(before), after: draft(before), note: '存稿' },
      { id: 'edit', at: '2026-10-23T02:00:00Z', before: draft(before), after: draft(after), note: '插入春风一句' },
    ] }))})`);
    await h.cdp.send('Page.reload');
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-poetry-desk')"));
    await clickText('.pc-poetry-desk > [role="tablist"] button', '推敲笺');
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-notebook-entry').length===2"));
    await fill('[aria-label="查找推敲笺"]', '春风');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-notebook-entry').length"), 1);
    await fill('[aria-label="查找推敲笺"]', '找不到的诗');
    assert.equal(await h.evaluate("document.querySelector('.pc-notebook-archive').textContent.includes('未找到相符')"), true);
    await fill('[aria-label="查找推敲笺"]', '');
    await h.click('.pc-notebook-archive input[type="checkbox"]');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-notebook-entry').length"), 1);
    await h.click('.pc-notebook-entry details summary');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-notebook-lines [data-change=added]').length"), 1);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-notebook-lines [data-change=removed]').length"), 0);
    await h.evaluate("document.querySelector('.pc-notebook-archive').scrollIntoView({block:'start',behavior:'instant'})");
    await shot('notebook-1440');
    await h.viewport(320, 900, true);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
    await shot('notebook-320');
    await clickText('.pc-notebook-entry button', '恢复修改前');
    await waitFor(() => h.evaluate(`document.querySelector('.pc-input__text').value===${JSON.stringify(before)}`));
    assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-notebook-v1')).entries.at(-1).note"), '恢复修改前：插入春风一句');
  });
  assert.deepEqual(result.errors, []);
} catch (error) { result.failure = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { await h.stop(); writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n'); }
