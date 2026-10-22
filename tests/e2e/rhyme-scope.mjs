import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor } from '../../docs/design/moonlit-ui/harness.mjs';

const text = '珠水云山毓秀长，甲工星火启南疆。\n博学慎思穷奥理，明辨笃行铸栋梁。\n红砖绿瓦藏经纬，铁骨钢筋写慨慷。\n三区并峙开新局，工科翘楚耀湾区。';
const out = resolve(process.argv[2] ?? 'artifacts/rhyme-scope');
mkdirSync(out, {recursive: true});
const critiques = [];
let latestReport;
const app = buildApp({readingAssistant: {apiKey: 'controlled-regression-only', fetcher: async (_url, init) => {
  const input = JSON.parse(JSON.parse(init.body).messages[1].content);
  let output;
  if (input.task === 'critique') {
    critiques.push(input);
    output = {overview: '受控文学评议，不重判格律。', strengths: [], revisions: []};
  } else {
    output = {suggestions: input.targets.map(t => ({tokenId: t.tokenId, candidateId: t.candidates[0].id, pronunciation: null, reason: '受控回归选音，不作为真实模型准确率证据。'}))};
  }
  return new Response(JSON.stringify({choices: [{finish_reason: 'stop', message: {content: JSON.stringify(output)}}]}));
}}});
app.addHook('onSend', async (req, _reply, payload) => {
  if (req.url === '/api/v1/analyze' && typeof payload === 'string') latestReport = JSON.parse(payload);
});
const baseUrl = await app.listen({host: '127.0.0.1', port: 0});
const h = await startHarness({production: true, api: {baseUrl, stop: () => app.close()}});
const errors=[];
h.cdp.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.text));
try {
  await h.load({reduce: true});
  await h.setText(text);
  for (const book of ['xinyun', 'pingshui']) {
    await h.evaluate(`document.querySelector('input[type=radio][value=${book}]').click()`);
    await h.analyze();
    await waitFor(() => critiques.some(c => c.rhymeBook === book));
    assert.equal(latestReport.policy.rhymeBook, book);
    assert.equal(latestReport.poem.tokens.find(t => t.tokenId === 'l7c7').tone, book === 'xinyun' ? 'P' : 'Z');
    const input = critiques.find(c => c.rhymeBook === book);
    assert.equal(input.prosodyContext.applicability, 'uncertain');
    assert.equal(input.prosodyContext.rhymeBook, book);
    assert.equal(input.evaluationBasis.toneBasis, book === 'xinyun' ? 'mandarin_base' : 'historical');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-critique')?.innerText.includes('条件比较')"));
    assert(await h.evaluate("document.querySelector('.pc-report').innerText.includes('不代表原诗出律')"));
    assert(!await h.evaluate("document.querySelector('.pc-report').innerText.includes('红线 = 违规')"));
    writeFileSync(join(out, book + '-report.json'), JSON.stringify(latestReport, null, 2));
    console.log('[PASS]', book, 'full poem / conditional UI / AI context / book switching');
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'result.json'), JSON.stringify({passed: 2, errors, realModelCalled: false}, null, 2));
} finally { await h.stop(); }
