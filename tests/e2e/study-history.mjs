import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/study-history');
mkdirSync(out, { recursive: true });
let slow = false;
const requests = [];
const app = buildApp({ readingAssistant: {
  provider: 'deepseek', apiKey: 'controlled-test-key',
  fetcher: async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    const output = input.task === 'critique'
      ? { overview: '受控回答：' + (input.question ?? '通篇观照'), strengths: ['仅验证交互'], revisions: [] }
      : { suggestions: input.targets.map(t => ({ tokenId: t.tokenId, candidateId: t.candidates[0].id, pronunciation: null, reason: '受控测试。' })) };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }));
  },
} });
app.addHook('preHandler', async request => {
  if (request.url !== '/api/v1/poetry-assistant') return;
  requests.push(structuredClone(request.body));
  if (slow) await sleep(5000);
});
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'controlled-upstream-real-api-browser', realModelInference: false, checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', e => result.errors.push(e.exceptionDetails.exception?.description ?? e.exceptionDetails.text));
const check = async (name, fn) => { await fn(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async name => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const reviewContains = text => h.evaluate(`document.querySelector('.pc-poetry-review')?.textContent.includes(${JSON.stringify(text)})`);
async function clickText(scope, label) {
  await h.evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)}); if(!e)throw new Error('Missing '+${JSON.stringify(label)}); e.setAttribute('data-history-target','yes'); })()`);
  try { await h.click('[data-history-target="yes"]'); }
  finally { await h.evaluate("document.querySelector('[data-history-target]')?.removeAttribute('data-history-target')"); }
}
async function ask(question, wait = true) {
  await h.evaluate(`(() => { document.querySelector('.pc-study-question').open=true; const e=document.querySelector('[aria-label="本诗研读问题"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(question)});e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await clickText('.pc-study-question button', '就此提问');
  if (wait) await waitFor(() => reviewContains('受控回答：' + question));
}
try {
  await h.load({ path: '#checker', reduce: true });
  await h.setText('白日依山尽，黄河入海流。欲穷千里目，更上一层楼。');
  await h.analyze();
  await waitFor(() => reviewContains('受控回答：通篇观照'));
  await check('questions-return-to-earlier-answer-without-another-model-request', async () => {
    await ask('画面如何变化？');
    await ask('结尾如何展开？');
    const count = requests.length;
    await h.click('.pc-study-history summary');
    await clickText('.pc-study-history button', '画面如何变化？');
    await waitFor(() => reviewContains('受控回答：画面如何变化？'));
    assert.equal(await reviewContains('这份回答的问题：画面如何变化？'), true);
    await sleep(200);
    assert.equal(requests.length, count);
    assert.equal(await h.evaluate("document.querySelector('.pc-study-history [aria-pressed=true]').textContent"), '画面如何变化？当前显示');
  });
  await check('explicit-answer-rerun-uses-original-question-and-replaces-history-entry', async () => {
    const count = requests.length;
    await clickText('.pc-poetry-critique button', '重新回答');
    await waitFor(() => requests.length === count + 1);
    await waitFor(() => h.evaluate("[...document.querySelectorAll('.pc-poetry-critique button')].some(e=>e.textContent.trim()==='重新回答' && !e.disabled)"));
    assert.equal(requests.at(-1).question, '画面如何变化？');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-study-history li').length"), 3);
  });
  await check('restoring-history-stops-pending-answer-and-rejects-late-result', async () => {
    slow = true;
    const count = requests.length;
    await ask('迟到的回答不得覆盖。', false);
    await waitFor(() => requests.length === count + 1);
    await waitFor(() => h.evaluate("document.querySelector('.pc-task-request-preview')?.textContent.includes('本次提问：迟到的回答不得覆盖。')"));
    await h.evaluate("(() => { const e=document.querySelector('[aria-label=\"本诗研读问题\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'尚未提交的新问题');e.dispatchEvent(new Event('input',{bubbles:true})); })()");
    assert.equal(await h.evaluate("document.querySelector('.pc-task-request-preview').textContent.includes('尚未提交的新问题')"), false);
    await h.click('.pc-task-request-preview summary');
    assert.equal(await h.evaluate("document.querySelector('.pc-task-request-preview blockquote').textContent"), '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。');
    await h.viewport(320, 900, true);
    await h.evaluate("document.querySelector('.pc-task-request-preview').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
    await shot('pending-question-320');
    await clickText('.pc-study-history button', '结尾如何展开？');
    await waitFor(() => reviewContains('受控回答：结尾如何展开？'));
    assert.equal(await h.evaluate("!!document.querySelector('.pc-task-request-preview')"), false);
    await sleep(5200);
    assert.equal(await reviewContains('受控回答：结尾如何展开？'), true);
    assert.equal(await reviewContains('迟到的回答'), false);
    assert.equal(requests.length, count + 1);
    slow = false;
  });
  await check('history-is-bounded-and-fits-small-screens', async () => {
    for (let i = 1; i <= 5; i++) await ask(`补充问题${i}：请结合原诗解释具体表达。`);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-study-history li').length"), 6);
    assert.equal(await h.evaluate("document.querySelector('.pc-study-history').textContent.includes('通篇观照')"), false);
    await h.viewport(320, 900, true);
    await h.evaluate("document.querySelector('.pc-study-history').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
    await shot('history-320');
    await h.evaluate("document.querySelector('.pc-study-history__list').focus()");
    await h.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
    await h.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});
    await waitFor(()=>h.evaluate("document.querySelector('.pc-study-history__list').scrollTop>20"));
    await shot('history-keyboard-end-320');
  });
  await check('new-poem-does-not-inherit-other-poems-question-history', async () => {
    await h.viewport(1440, 1000);
    await h.setText('床前明月光，疑是地上霜。举头望明月，低头思故乡。');
    await h.analyze();
    await waitFor(() => reviewContains('受控回答：通篇观照'));
    assert.equal(await h.evaluate("!!document.querySelector('.pc-study-history')"), false);
    assert.equal(await reviewContains('补充问题'), false);
  });
  assert.deepEqual(result.errors, []);
} catch (error) { result.failure = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { await h.stop(); writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2)+'\n'); }
