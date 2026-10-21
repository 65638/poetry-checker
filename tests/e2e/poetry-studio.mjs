import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/poetry-studio');
mkdirSync(out, { recursive: true });
const calls = [];
const rhymeInputs = [];
let emptyRhyme = false;
let slowPages = false;
let rhymeLookups = 0;
const fetcher = async (_url, init) => {
  const data = JSON.parse(JSON.parse(init.body).messages[1].content);
  calls.push(data.task ?? 'reading');
  let output;
  if (!data.task) output = { suggestions: data.targets.map((target) => ({ tokenId: target.tokenId, candidateId: target.candidates[0].id, pronunciation: null, reason: '受控浏览器测试，不是语言学判定。' })) };
  if (data.task === 'critique') output = { overview: '受控全诗评议：结合全文讨论山水。', strengths: ['受控优点说明。'], revisions: data.mode === 'writing' && data.text === '山高水远。' ? [
    { startTokenId: 'l1c1', endTokenId: 'l1c1', original: '山', replacement: '群山', reason: '受控长度变化场景。', tradeoff: '受控取舍说明。' },
    { startTokenId: 'l1c4', endTokenId: 'l1c4', original: '远', replacement: '长', reason: '受控改字场景。', tradeoff: '受控取舍说明。' },
  ] : [] };
  if (data.task === 'search') { const poem = data.poems.find((p) => p.title === '夜雨寄北'); assert(poem, '夜雨寄北 must be recalled for this scene'); output = { matches: [{ id: poem.id, quote: poem.paragraphs[0].slice(0, 5), reason: '受控意境排序，非真实推理。' }] }; }
  if (data.task === 'compare') output = { overview: '受控对读总评。', aspects: [{ name: '意象', left: '受控左诗分析。', right: '受控右诗分析。' }] };
  if (data.task === 'rhyme') { rhymeInputs.push(data); output = { matches: emptyRhyme ? [] : [{ id: data.candidates[0].id, reason: '受控同韵语义推荐。' }] }; }
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }));
};
const app = buildApp({ readingAssistant: { provider: 'deepseek', apiKey: 'controlled-test-key', fetcher } });
let analyses = 0;
app.addHook('preHandler', async request => {
  if (request.url === '/api/v1/analyze') analyses++;
  if (request.url === '/api/v1/rhyme-words') { rhymeLookups++; if (slowPages) await sleep(650); }
});
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
    assert.equal(await h.evaluate("document.querySelector('.pc-compare-submit').disabled"), true, 'Completed pair must not flash a duplicate request');
    await h.evaluate("document.querySelector('.pc-library-comparison-notes').scrollIntoView({block:'center',behavior:'instant'})");
    await shot('compare-notes-1440');
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
  await check('compare-guidance-keyboard-paired-reading-and-responsive-leaves', async () => {
    const savedRight = await h.evaluate("document.querySelectorAll('.pc-compare-picker select')[1].value");
    await h.evaluate("(() => { const [left,right]=document.querySelectorAll('.pc-compare-picker select'); right.value=left.value; right.dispatchEvent(new Event('change',{bubbles:true})); })()");
    await waitFor(() => h.evaluate("document.querySelector('.pc-compare-guidance').textContent.includes('同一首诗')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-compare-submit').disabled"), true);
    await h.evaluate(`(() => { const right=document.querySelectorAll('.pc-compare-picker select')[1]; right.value=${JSON.stringify(savedRight)}; right.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await waitFor(() => h.evaluate("!document.querySelector('.pc-compare-submit').disabled"));
    await h.evaluate("document.querySelector('.pc-compare-line').focus()");
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-compare-line[data-active=true]').length"), 2);
    await h.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await h.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert.equal(await h.evaluate("document.activeElement===document.querySelectorAll('.pc-compare-line')[1]"), true);
    await h.evaluate("document.activeElement.blur()");
    for (const width of [320,375,768,1024,1440]) {
      await h.viewport(width, 1000, width < 800);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), true, `${width}px overflow`);
      assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-compare-picker select')].every(el => {const a=el.getBoundingClientRect(),b=el.closest('.pc-library-poem').getBoundingClientRect();return a.left>=b.left && a.right<=b.right;})"), true);
    }
    await h.evaluate("document.querySelector('.pc-library-comparison').scrollIntoView({block:'start',behavior:'instant'})");
    await shot('compare-desk-1440');
  });
  await check('library-study-opens-checker-in-reading-mode', async () => {
    await clickText('.pc-library > [role="tablist"] [role="tab"]', '诗库');
    await clickText('.pc-library-reading button', '研读此诗');
    await waitFor(() => h.evaluate("location.hash==='#checker' && !!document.querySelector('.pc-report')"));
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('受控全诗评议')"));
    assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-poetry-critique [role=tab]')].find(el=>el.textContent==='原诗赏读').getAttribute('aria-selected')"), 'true');
  });
  await check('batch-adoptions-undo-redo-keep-advice-and-analyze-once', async () => {
    await h.setText('山高水远。');
    await clickText('.pc-poetry-critique [role="tab"]', '写作推敲');
    await h.analyze();
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-poetry-edit ins')"));
    const before = analyses;
    const critiques = calls.filter(task => task === 'critique').length;
    await clickText('.pc-poetry-edit:nth-of-type(1) button', '采纳');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '群山高水远。');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-poetry-edit').length"), 2);
    await clickText('.pc-poetry-edit:nth-of-type(2) button', '采纳');
    await sleep(1900);
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '群山高水长。');
    assert.equal(analyses, before);
    assert.equal(calls.filter(task => task === 'critique').length, critiques);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report--stale')"), true);
    await h.click('[aria-label="撤销上次修改"]');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '群山高水远。');
    await h.click('[aria-label="重做修改"]');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '群山高水长。');
    await sleep(1800);
    assert.equal(analyses, before);
    await clickText('.pc-poetry-desk > [role="tablist"] [role="tab"]', '同韵寻字');
    await waitFor(() => h.evaluate("[...document.querySelectorAll('.pc-poetry-desk button')].some(el=>el.textContent.trim()==='结合全诗荐字' && !el.disabled)"));
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-edit')?.textContent.includes('受控同韵语义推荐')"));
    assert.equal(rhymeInputs.at(-1).text, '群山高水长。');
    assert.equal(rhymeInputs.at(-1).targetToken.tokenId, 'l1c5');
    assert.equal(rhymeInputs.at(-1).targetToken.text, '长');
    assert.equal(analyses, before, 'Current-draft rhyme requests must not reanalyze the poem');
    await clickText('.pc-poetry-desk > [role="tablist"] [role="tab"]', '全诗评议');
    await h.evaluate("document.querySelector('.pc-poetry-desk').scrollIntoView({block:'start',behavior:'instant'}); true");
    await shot('batch-edits-1440');
    for (const width of [375, 320]) {
      await h.viewport(width, 812, true);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
      const heading = await h.evaluate("(() => {const e=document.querySelector('.pc-poetry-desk-heading');const title=e.querySelector('h2').getBoundingClientRect();const controls=e.querySelector('.pc-studio-actions').getBoundingClientRect();return {overlap:title.right>controls.left && title.bottom>controls.top && controls.bottom>title.top};})()");
      assert.equal(heading.overlap, false);
      assert.equal(await h.evaluate("document.querySelector('.pc-poetry-desk-heading h2').getBoundingClientRect().height <= 45"), true);
      await h.evaluate("document.querySelector('.pc-poetry-desk').scrollIntoView({block:'start',behavior:'instant'}); true");
      await shot('batch-edits-' + width);
    }
    await h.viewport(1440, 1000);
    await clickText('.pc-poetry-desk-heading button', '分析修改');
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-report:not(.pc-report--stale)') && !document.querySelector('.pc-root--busy')"));
    assert.equal(analyses, before + 1);
    await sleep(1800);
    assert.equal(analyses, before + 1);
    await clickText('.pc-poetry-desk > [role="tablist"] [role="tab"]', '推敲笺');
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-notebook-entry').length>=4"));
    const saved = await h.evaluate("JSON.parse(localStorage.getItem('poetry-notebook-v1')).entries");
    assert(saved.some((entry) => entry.note.includes('AI炼字') && entry.before.text==='群山高水远。' && entry.after.text==='群山高水长。'));
    await h.click('.pc-notebook-entry:nth-of-type(2) button');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '群山高水远。');
    await h.cdp.send('Page.reload');
    await waitFor(() => h.evaluate("document.querySelector('.pc-input__text')?.value==='群山高水远。'"));
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
    const beforeTrial = analyses;
    const beforeText = await h.evaluate("document.querySelector('.pc-input__text').value");
    await clickText('.pc-poetry-edit button', '试用');
    await sleep(1900);
    assert.equal(analyses, beforeTrial);
    assert.notEqual(await h.evaluate("document.querySelector('.pc-input__text').value"), beforeText);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-poetry-edit')"), true);
    const afterTrial = await h.evaluate("document.querySelector('.pc-input__text').value");
    await waitFor(() => h.evaluate("[...document.querySelectorAll('.pc-poetry-desk button')].some(el=>el.textContent.trim()==='结合全诗荐字' && !el.disabled)"));
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-edit')?.textContent.includes('受控同韵语义推荐') && !document.querySelector('.pc-poetry-desk [role=progressbar]')"));
    assert.equal(rhymeInputs.at(-1).text, afterTrial);
    assert.equal(analyses, beforeTrial);
    await h.click('[aria-label="撤销上次修改"]');
    await sleep(1800);
    assert.equal(analyses, beforeTrial);
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), beforeText);
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
  await check('manual-edit-after-undo-invalidates-old-redo-branch', async () => {
    await h.evaluate("location.hash='checker'");
    await waitFor(() => h.evaluate("document.querySelector('.pc-workspace').dataset.place==='checker' && !document.documentElement.dataset.journey"));
    await clickText('.pc-poetry-edit button', '试用');
    await h.idle();
    await waitFor(() => h.evaluate("!document.querySelector('[aria-label=\"撤销上次修改\"]').disabled"));
    await h.click('[aria-label="撤销上次修改"]');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"重做修改\"]').disabled"), false);
    await h.setText('手动新写的一首诗。');
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"重做修改\"]').disabled"), true);
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '手动新写的一首诗。');
  });
  await check('delayed-rhyme-pagination-retains-grid-height-cache-and-recommendations', async () => {
    await h.setText('白日依山尽，黄河入海流。欲穷千里目，更上一层楼。');
    await h.analyze();
    await waitFor(() => h.evaluate("[...document.querySelectorAll('.pc-poetry-desk button')].some(el=>el.textContent.trim()==='结合全诗荐字' && !el.disabled)"));
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-edit')?.textContent.includes('受控同韵语义推荐')"));
    const modelCalls = calls.length;
    slowPages = true;
    for (const width of [1440, 375]) {
      await h.viewport(width, 1000, width < 800);
      const baseline = await h.evaluate("(() => { const g=document.querySelector('.pc-rhyme-characters'); window.rhymeGrid=g; return {height:g.getBoundingClientRect().height,count:g.querySelectorAll('button').length}; })()");
      assert.equal(baseline.count, 80);
      await h.click('[aria-label="下一页韵字"]');
      await sleep(100);
      assert.equal(await h.evaluate("document.querySelector('.pc-rhyme-characters')===window.rhymeGrid"), true);
      assert.equal(await h.evaluate("document.querySelectorAll('.pc-rhyme-characters button').length"), 80);
      await waitFor(() => h.evaluate("document.querySelector('.pc-rhyme-characters').getAttribute('aria-busy')==='false' && document.querySelector('.pc-library-pagination span').textContent.trim().startsWith('2 /')"));
      assert.equal(await h.evaluate("document.querySelector('.pc-rhyme-characters').getBoundingClientRect().height"), baseline.height);
      assert.equal(await h.evaluate("!!document.querySelector('.pc-poetry-edit')"), true);
      await shot('rhyme-page2-' + width);
      // Visit the final page, whose spare cells must preserve the same footprint.
      while (await h.evaluate("!document.querySelector('[aria-label=\"下一页韵字\"]').disabled")) {
        await h.click('[aria-label="下一页韵字"]');
        await waitFor(() => h.evaluate("document.querySelector('.pc-rhyme-characters').getAttribute('aria-busy')==='false'"));
      }
      assert.equal(await h.evaluate("document.querySelector('.pc-rhyme-characters').getBoundingClientRect().height"), baseline.height);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      const lookups = rhymeLookups;
      while (await h.evaluate("!document.querySelector('[aria-label=\"上一页韵字\"]').disabled")) {
        await h.click('[aria-label="上一页韵字"]');
        await h.idle();
      }
      assert.equal(rhymeLookups, lookups, 'Cached pages must not refetch');
    }
    assert.equal(calls.length, modelCalls, 'Pagination must not make model requests');
    slowPages = false;
  });
  await check('empty-rhyme-recommendations-have-visible-feedback', async () => {
    emptyRhyme = true;
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-desk').textContent.includes('本页未找到值得替换的字')"));
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-poetry-edit').length"), 0);
    await shot('rhyme-empty-375');
  });
  assert.deepEqual(result.errors, []);
} catch (error) { result.failure = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { result.calls = calls; await h.stop(); writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2)+'\n'); }
