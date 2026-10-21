import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, revision } from '../../docs/design/moonlit-ui/harness.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/poetry-studio');
mkdirSync(out, { recursive: true });
const calls = [];
const fetcher = async (_url, init) => {
  const data = JSON.parse(JSON.parse(init.body).messages[1].content);
  calls.push(data.task ?? 'reading');
  let output;
  if (!data.task) output = { suggestions: data.targets.map((target) => ({ tokenId: target.tokenId, candidateId: target.candidates[0].id, pronunciation: null, reason: '受控浏览器测试，不是语言学判定。' })) };
  if (data.task === 'critique') output = { overview: '受控全诗评议：结合全文讨论山水。', strengths: ['受控优点说明。'], revisions: data.mode === 'writing' && data.text === '山高水远。' ? [{ startTokenId: 'l1c4', endTokenId: 'l1c4', original: '远', replacement: '长', reason: '受控改字场景。', tradeoff: '受控取舍说明。' }] : [] };
  if (data.task === 'search') { const poem = data.poems.find((p) => p.title === '夜雨寄北'); assert(poem, '夜雨寄北 must be recalled for this scene'); output = { matches: [{ id: poem.id, quote: poem.paragraphs[0].slice(0, 5), reason: '受控意境排序，非真实推理。' }] }; }
  if (data.task === 'compare') output = { overview: '受控对读总评。', aspects: [{ name: '意象', left: '受控左诗分析。', right: '受控右诗分析。' }] };
  if (data.task === 'rhyme') output = { matches: [{ id: data.candidates[0].id, reason: '受控同韵语义推荐。' }] };
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }));
};
const app = buildApp({ readingAssistant: { apiKey: 'controlled-test-key', fetcher } });
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'controlled-upstream-real-api-lexicon-browser-indexeddb', realModelInference: false, checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', (event) => result.errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text));
const check = async (name, run) => { await run(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async (name) => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const fill = (selector, value) => h.evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
const upload = async (selector, path) => {
  const { root } = await h.cdp.send('DOM.getDocument');
  const { nodeId } = await h.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  await h.cdp.send('DOM.setFileInputFiles', { nodeId, files: [path] });
};
// Locate by visible label without synthesizing a DOM click.
async function clickText(scope, label) {
  const selector = await h.evaluate(`(() => { const nodes=[...document.querySelectorAll(${JSON.stringify(scope)})]; const n=nodes.find(el=>el.textContent.trim()===${JSON.stringify(label)}); if(!n) throw new Error('Missing '+${JSON.stringify(label)}); n.setAttribute('data-studio-test-target','yes'); return '[data-studio-test-target="yes"]'; })()`);
  try { await h.click(selector); } finally { await h.evaluate("document.querySelector('[data-studio-test-target]')?.removeAttribute('data-studio-test-target')"); }
}
try {
  await check('third-library-region-and-import-dedup-persist', async () => {
    await h.load({ path: '#library', reduce: true });
    await waitFor(() => h.evaluate("document.querySelector('.pc-library-heading .pc-studio-action')?.disabled===false"));
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-places button').length"), 3);
    const path = join(out, 'import.json');
    writeFileSync(path, JSON.stringify([{ title: '浏览器导入样本', author: '测试', paragraphs: ['举头望明月，低头思故乡。'], source: '临时导入测试，非审核数据' }]));
    await upload('.pc-library input[type="file"]', path);
    await waitFor(() => h.evaluate("document.querySelector('.pc-library-heading').textContent.includes('2023首入藏')"));
    await upload('.pc-library input[type="file"]', path);
    await waitFor(() => h.evaluate("document.querySelector('.pc-library > .pc-studio-notice')?.textContent.includes('重复1首')"));
    await h.cdp.send('Page.reload');
    await waitFor(() => h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2023首入藏')"));
    await shot('library-1440');
  });
  await check('scene-search-returns-verbatim-quote-and-opens-original', async () => {
    await clickText('.pc-library-search [role="tab"]', '诗境');
    await fill('[aria-label="检索诗库"]', '雨夜思乡');
    await clickText('.pc-library-query button', '寻诗');
    await waitFor(() => h.evaluate("document.querySelector('.pc-library-excerpt')?.textContent.includes('受控意境排序')"));
    await h.click('.pc-library-title');
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-library-reading .pc-library-verses')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-library-reading > h2').textContent"), '夜雨寄北');
    assert.equal(await h.evaluate("document.querySelector('.pc-library-reading').textContent.includes('巴山夜雨涨秋池')"), true);
    await h.click('.pc-library-reading [aria-label="收藏此诗"]');
    assert.equal(await h.evaluate("document.querySelector('.pc-library-reading [aria-label=\"收藏此诗\"]').getAttribute('aria-pressed')"), 'true');
    await shot('original-poem');
  });
  await check('two-poems-compare-and-swap-with-model-notes', async () => {
    await clickText('.pc-library-reading button', '加入对读');
    await clickText('.pc-library-comparison button', '比较两诗');
    await waitFor(() => h.evaluate("document.querySelector('.pc-library-comparison-notes')?.textContent.includes('受控对读总评')"));
    const before = await h.evaluate("document.querySelectorAll('.pc-library-poem h2')[0].textContent");
    await h.click('[aria-label="交换左右诗作"]');
    await waitFor(() => h.evaluate("!document.querySelector('.pc-library-comparison-notes')"));
    assert.notEqual(await h.evaluate("document.querySelectorAll('.pc-library-poem h2')[0].textContent"), before);
    await shot('compare-1440');
    await h.viewport(375, 900, true);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), true);
    await h.evaluate("document.querySelector('.pc-library-comparison').scrollIntoView({block:'start',behavior:'instant'})");
    await shot('compare-375');
    await h.viewport(1440, 1000);
  });
  await check('library-study-opens-checker-in-reading-mode', async () => {
    await clickText('.pc-library > [role="tablist"] [role="tab"]', '诗库');
    await clickText('.pc-library-reading button', '研读此诗');
    await waitFor(() => h.evaluate("location.hash==='#checker' && !!document.querySelector('.pc-report')"));
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('受控全诗评议')"));
    assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-poetry-critique [role=tab]')].find(el=>el.textContent==='原诗赏读').getAttribute('aria-selected')"), 'true');
  });
  await check('adopt-revision-reanalyze-undo-redo-notebook', async () => {
    await h.setText('山高水远。');
    await clickText('.pc-poetry-critique [role="tab"]', '写作推敲');
    await h.analyze();
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-poetry-edit ins')"));
    await clickText('.pc-poetry-edit button', '采纳并复查');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '山高水长。');
    await h.click('[aria-label="撤销上次修改"]');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '山高水远。');
    await h.click('[aria-label="重做修改"]');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '山高水长。');
    await clickText('.pc-poetry-desk > [role="tablist"] [role="tab"]', '推敲笺');
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-notebook-entry').length>=4"));
    const saved = await h.evaluate("JSON.parse(localStorage.getItem('poetry-notebook-v1')).entries");
    assert(saved.some((entry) => entry.note.includes('GLM炼字') && entry.before.text==='山高水远。' && entry.after.text==='山高水长。'));
    await h.click('.pc-notebook-entry:nth-of-type(2) button');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '山高水远。');
    await h.cdp.send('Page.reload');
    await waitFor(() => h.evaluate("document.querySelector('.pc-input__text')?.value==='山高水远。'"));
    await h.analyze();
    await clickText('.pc-poetry-desk > [role="tablist"] [role="tab"]', '推敲笺');
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-notebook-entry').length>=5"));
    assert.equal(await h.evaluate("document.querySelector('.pc-notebook-entry').textContent.includes('恢复推敲笺')"), true);
    await h.evaluate("document.querySelector('.pc-poetry-desk').scrollIntoView({block:'start',behavior:'instant'})");
    await shot('notebook-1440');
    for (const width of [375, 320]) {
      await h.viewport(width, 900, true);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await shot('notebook-'+width);
    }
    await h.viewport(1440, 1000);
  });
  await check('real-rhyme-peers-semantic-selection-and-mobile-fit', async () => {
    await clickText('.pc-poetry-desk > [role="tablist"] [role="tab"]', '同韵寻字');
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-rhyme-characters button').length>0"));
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => h.evaluate("[...document.querySelectorAll('.pc-poetry-edit')].some(el=>el.textContent.includes('受控同韵语义推荐'))"));
    await h.evaluate("document.querySelector('.pc-poetry-desk').scrollIntoView({block:'start',behavior:'instant'})");
    await shot('rhyme-1440');
    for (const width of [375, 320]) {
      await h.viewport(width, 900, true);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await shot('rhyme-'+width);
    }
    await h.click('.pc-rhyme-characters button');
    await waitFor(() => h.evaluate("location.hash.startsWith('#dictionary?') && !!document.querySelector('.pc-dictionary__result')"));
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
  });
  assert.deepEqual(result.errors, []);
} catch (error) { result.failure = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { result.calls = calls; await h.stop(); writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2)+'\n'); }
