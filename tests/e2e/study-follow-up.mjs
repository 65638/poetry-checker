import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/study-follow-up');
mkdirSync(out, { recursive: true });
let behavior = 'success';
const requests = [];
const longAnswer = '山林的安静不等于没有声音，原诗让人语从看不见的地方传来。光落在青苔上，给幽深的树林留下一个具体而可感的落点。'.repeat(7);
const app = buildApp({ readingAssistant: {
  provider: 'deepseek', apiKey: 'controlled-test-key',
  fetcher: async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    const output = input.task === 'critique'
      ? { overview: input.question === '长文排版检查。' ? longAnswer : '受控回答：' + (input.question ?? '通篇观照'), strengths: ['仅验证交互'], revisions: [] }
      : { suggestions: input.targets.map(target => ({ tokenId: target.tokenId, candidateId: target.candidates[0].id, pronunciation: null, reason: '受控测试。' })) };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }));
  },
} });
app.addHook('preHandler', async (request, reply) => {
  if (request.url !== '/api/v1/poetry-assistant') return;
  requests.push(structuredClone(request.body));
  if (behavior === 'slow') await sleep(2500);
  if (behavior === 'fail') return reply.code(503).send({error:{message:'受控失败，请重试。'}});
});
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'controlled-upstream-real-api-browser', realModelInference: false, checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', event => result.errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text));
const check = async (name, run) => { await run(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async name => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
async function clickText(scope, label) {
  await h.evaluate(`(() => { const target=[...document.querySelectorAll(${JSON.stringify(scope)})].find(element=>element.textContent.trim()===${JSON.stringify(label)}); if(!target)throw new Error('Missing '+${JSON.stringify(label)}); target.setAttribute('data-followup-target','yes'); })()`);
  try { await h.click('[data-followup-target="yes"]'); }
  finally { await h.evaluate("document.querySelector('[data-followup-target]')?.removeAttribute('data-followup-target')"); }
}
async function fillQuestion(question) {
  await h.evaluate(`(() => { document.querySelector('.pc-study-follow-up').open=true; const input=document.querySelector('[aria-label="围绕回答追问"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(question)});input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
}
async function follow(question) {
  await fillQuestion(question);
  await clickText('.pc-study-follow-up button', '发送追问');
  await waitFor(()=>h.evaluate(`document.querySelector('.pc-poetry-review > h3 + p')?.textContent === ${JSON.stringify('受控回答：'+question)}`));
}
try {
  await h.load({ path: '#checker', reduce: true });
  await h.cdp.send('Browser.grantPermissions',{origin:new URL(h.url).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  const poem='白日依山尽，黄河入海流。欲穷千里目，更上一层楼。';
  await h.setText(poem);
  await h.analyze();
  await waitFor(()=>h.evaluate("!!document.querySelector('.pc-study-follow-up')"));
  await check('follow-up-sends-only-explicitly-with-visible-answer-and-original-poem',async()=>{
    const count=requests.length;
    await h.click('.pc-study-follow-up > summary');
    await h.click('.pc-study-follow-up__examples button');
    await sleep(400);
    assert.equal(requests.length,count);
    await follow('请解释空间层次。');
    assert.equal(requests.length,count+1);
    assert.equal(requests.at(-1).text,poem);
    assert.deepEqual(requests.at(-1).followUp.turns,[{answer:'受控回答：通篇观照',details:'可取之处\n• 仅验证交互'}]);
    assert.equal(await h.evaluate("document.querySelector('.pc-study-follow-up-context .pc-study-follow-up__details').textContent.includes('仅验证交互')"),true);
    assert.equal(await h.evaluate("document.querySelector('.pc-study-follow-up-context').textContent.includes('参考了 1 轮')"),true);
  });
  await check('follow-up-keeps-only-three-turns-and-saves-context-with-answer',async()=>{
    for(const question of ['这怎样影响情绪？','还有别的理解吗？','哪些说法需要核实？']) await follow(question);
    assert.equal(requests.at(-1).followUp.turns.length,3);
    assert.equal(requests.at(-1).followUp.turns[0].question,'请解释空间层次。');
    await clickText('.pc-poetry-review .pc-study-result-actions button','收藏评议');
    await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')??'{\"entries\":[]}').entries.some(entry=>entry.input.followUp?.turns.length===3)"));
    await clickText('.pc-poetry-review .pc-study-result-actions button','复制评议');
    const concise=await h.evaluate('navigator.clipboard.readText()');
    assert(concise.includes('哪些说法需要核实？') && !concise.includes('追问背景') && !concise.includes('还有别的理解吗？'));
    await h.click('.pc-poetry-review .pc-study-share-options input');
    await clickText('.pc-poetry-review .pc-study-result-actions button','复制评议');
    const copied=await h.evaluate('navigator.clipboard.readText()');
    assert(copied.includes('追问背景')&&copied.includes('还有别的理解吗？'));
    assert(!copied.includes('textHash'));
    await h.click('.pc-study-follow-up > summary');
    await h.viewport(320,900,true);
    await h.evaluate("document.querySelector('.pc-study-follow-up').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await shot('follow-up-320');
    await h.viewport(1440,1000);
  });
  await check('retry-preserves-the-exact-failed-follow-up-and-history',async()=>{
    behavior='fail';
    await fillQuestion('请进一步解释。');
    await clickText('.pc-study-follow-up button','发送追问');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-poetry-critique .pc-studio-error')"));
    const failed=requests.at(-1);
    behavior='success';
    await clickText('.pc-poetry-critique button','重试本次研读');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-review > h3 + p')?.textContent==='受控回答：请进一步解释。'"));
    assert.deepEqual(requests.at(-1),failed);
  });
  await check('modified-draft-cannot-send-a-follow-up-about-the-old-poem',async()=>{
    const count=requests.length;
    await h.setText('白日依山尽，黄河入海流。欲穷千里目，更上两层楼。');
    await fillQuestion('改稿后继续？');
    assert.equal(await h.evaluate("document.querySelector('.pc-study-follow-up button[type=submit]').disabled"),true);
    await sleep(350);
    assert.equal(requests.length,count);
    await h.setText(poem);
  });
  await check('history-restore-cancels-follow-up-and-ignores-late-answer',async()=>{
    behavior='slow';
    const count=requests.length;
    await fillQuestion('不能覆盖回看结果的追问。');
    await clickText('.pc-study-follow-up button','发送追问');
    await waitFor(()=>requests.length===count+1);
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-task-request-preview .pc-study-follow-up-context')"));
    await h.evaluate("document.querySelector('.pc-study-history').open=true");
    await h.click('.pc-study-history button');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-poetry-review')"));
    await sleep(2800);
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-review > h3 + p').textContent"),'受控回答：请进一步解释。');
    assert.equal(await h.evaluate("!!document.querySelector('.pc-task-request-preview')"),false);
    behavior='success';
  });
  await check('library-follow-up-stays-with-the-selected-original',async()=>{
    await h.evaluate("location.hash='library'");
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
    await h.click('.pc-library-title');
    await h.evaluate("(() => {document.querySelector('.pc-library-questions .pc-study-question').open=true;const input=document.querySelector('.pc-library-questions textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'这首诗的情绪如何？');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await h.click('.pc-library-questions button[type=submit]');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-literary .pc-study-follow-up')"));
    const previous=requests.at(-1);
    await h.evaluate("document.querySelector('.pc-library-literary .pc-study-follow-up').open=true");
    await h.click('.pc-library-literary .pc-study-follow-up__examples button');
    await h.click('.pc-library-literary .pc-study-follow-up button[type=submit]');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-literary .pc-study-follow-up-context')"));
    assert.equal(requests.at(-1).text,previous.text);
    assert.equal(requests.at(-1).followUp.turns[0].question,previous.question);
    assert.equal(requests.at(-1).mode,'reading');
  });
  await check('long-answer-is-readable-without-changing-the-stored-answer',async()=>{
    await h.evaluate("(()=>{document.querySelector('.pc-library-literary .pc-study-follow-up').open=true;const e=document.querySelector('.pc-library-literary [aria-label=围绕回答追问]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'长文排版检查。');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await h.click('.pc-library-literary .pc-study-follow-up button[type=submit]');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-literary .pc-study-prose')?.textContent.includes('山林的安静')"));
    const shown=await h.evaluate("document.querySelector('.pc-library-literary .pc-study-prose').textContent");
    assert(shown.includes('\n\n'));assert.equal(shown.replace(/\n/g,''),longAnswer);
    assert.equal(await h.evaluate("getComputedStyle(document.querySelector('.pc-library-literary .pc-study-prose')).whiteSpace"),'pre-line');
    await clickText('.pc-library-literary .pc-study-result-actions button','收藏评议');
    const stored=await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.find(entry=>entry.input.question==='长文排版检查。').response.result.overview");
    assert.equal(stored,longAnswer);
    await h.viewport(320,900,true);await h.evaluate("document.querySelector('.pc-library-literary .pc-study-prose').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await shot('long-answer-320');
  });
  assert.deepEqual(result.errors,[]);
} catch(error) { result.failure=error.stack; process.exitCode=1; await shot('failure').catch(()=>{}); }
finally { await h.stop(); writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n'); }
