import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/library-questions');
mkdirSync(out, { recursive: true });
let slow = false, analyses = 0;
const requests = [];
const app = buildApp({ readingAssistant: {
  provider: 'deepseek', apiKey: 'controlled-test-key',
  fetcher: async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    assert.equal(input.task, 'critique');
    assert.equal(input.prosodyContext, undefined);
    const output = { overview: '受控诗库回答：' + input.question, strengths: ['仅验证原诗问答交互。'], revisions: [] };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }));
  },
} });
app.addHook('preHandler', async request => {
  if (request.url === '/api/v1/analyze') analyses++;
  if (request.url !== '/api/v1/poetry-assistant') return;
  requests.push(structuredClone(request.body));
  if (slow) await sleep(2000);
});
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'controlled-upstream-real-api-browser', realModelInference: false, checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', e => result.errors.push(e.exceptionDetails.exception?.description ?? e.exceptionDetails.text));
const check = async (name, fn) => { await fn(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async name => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const fill = (selector, value) => h.evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
async function choose(title) {
  await fill('[aria-label="检索诗库"]', '题名:' + title);
  await waitFor(() => h.evaluate(`document.querySelector('.pc-library-title')?.textContent.includes(${JSON.stringify(title)})`));
  await h.click('.pc-library-title');
  await waitFor(() => h.evaluate(`document.querySelector('.pc-library-reading > h2')?.textContent.includes(${JSON.stringify(title)})`));
}
async function ask(question, wait = true) {
  await h.evaluate("document.querySelector('.pc-library-questions .pc-study-question').open=true");
  await fill('.pc-library-questions textarea', question);
  await h.click('.pc-library-questions button[type=submit]');
  if (wait) await waitFor(() => h.evaluate(`document.querySelector('.pc-library-literary')?.textContent.includes(${JSON.stringify('受控诗库回答：' + question)})`));
}
try {
  await h.load({ path: '#library', reduce: true });
  await waitFor(() => h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
  await choose('登鹳雀楼');
  await check('direct-question-keeps-library-open-and-skips-reading-analysis', async () => {
    await h.click('.pc-library-questions summary');
    await fill('.pc-library-questions textarea', '结尾如何拓展视野？');
    await sleep(1000);
    assert.equal(requests.length, 0);
    await ask('结尾如何拓展视野？');
    assert.equal(analyses, 0);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].mode, 'reading');
    assert.equal(requests[0].text.replace(/\s/gu, ''), '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。');
    assert.equal(await h.evaluate('location.hash'), '#library');
    assert.equal(await h.evaluate("document.querySelector('.pc-library-literary').textContent.includes('不作合律判断')"), true);
  });
  await check('question-answer-can-be-saved-with-original-poem-and-title', async () => {
    await h.click('.pc-library-literary .pc-study-result-actions button');
    await waitFor(() => h.evaluate("!!localStorage.getItem('poetry-study-archive-v1')"));
    const entry = await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries[0]");
    assert.equal(entry.input.question, '结尾如何拓展视野？');
    assert.equal(entry.input.text, requests[0].text);
    assert(entry.title.includes('登鹳雀楼'));
    await h.viewport(320, 900, true);
    await h.evaluate("document.querySelector('.pc-library-questions').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
    await shot('question-320');
  });
  await check('switching-poems-aborts-old-question-and-clears-input-and-history', async () => {
    await h.viewport(1440, 1000);
    slow = true;
    await ask('这条旧诗问题不能落到新诗。', false);
    await waitFor(() => requests.length === 2);
    await choose('鹿柴');
    await sleep(2300);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-library-literary')"), false);
    assert.equal(await h.evaluate("document.querySelector('.pc-library-questions textarea').value"), '');
    slow = false;
    await ask('空山与人语矛盾吗？');
    assert(requests.at(-1).text.includes('空山不见人'));
    assert.equal(analyses, 0);
  });
  await check('long-poem-questions-use-selected-section-and-save-section-title', async () => {
    await choose('离骚');
    await waitFor(() => h.evaluate("!!document.querySelector('[aria-label=\"研读选段\"]')"));
    await ask('这段的情绪线索是什么？');
    const first = requests.at(-1).text;
    await h.evaluate("(() => { const e=document.querySelector('[aria-label=\"研读选段\"]');e.value='1';e.dispatchEvent(new Event('change',{bubbles:true})); })()");
    await waitFor(() => h.evaluate("!document.querySelector('.pc-library-literary')"));
    await ask('第二段的核心意象是什么？');
    assert.notEqual(requests.at(-1).text, first);
    assert(requests.at(-1).text.length <= 2000);
    assert.equal(await h.evaluate("document.querySelector('.pc-library-questions').textContent.includes('第2段')"), true);
    await h.click('.pc-library-literary .pc-study-result-actions button');
    await waitFor(() => h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.some(e=>e.title.includes('选段2/'))"));
    assert.equal(analyses, 0);
  });
  assert.deepEqual(result.errors, []);
} catch (error) { result.failure = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { await h.stop(); writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2)+'\n'); }
