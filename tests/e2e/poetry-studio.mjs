import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/poetry-studio');
const rhymeOnly = process.argv.includes('--rhyme-only');
const focusedChecks = new Set(['rhyme-note-copy-download-and-adoption-keep-completed-snapshot', 'all-rhyme-characters-load-once-and-filter-without-ai', 'one-click-ai-covers-every-reading-candidate-including-last-batch', 'failed-later-batch-keeps-old-answer-and-retries-only-unfinished', 'cancelled-batch-ignores-late-answer-and-starts-no-more-batches', 'changing-rhyme-target-cancels-pending-batch-and-discards-late-result', 'empty-rhyme-recommendations-have-visible-feedback']);
mkdirSync(out, { recursive: true });
const calls = [];
const critiqueInputs = [];
const rhymeInputs = [];
let emptyRhyme = false;
let slowPages = false;
let rhymeLookups = 0;
const rhymePages = [];
let failRhymeAt = null;
let blockRhymeAt = null;
let releaseRhyme = null;
let recommendationTag = '受控同韵语义推荐。';
const fetcher = async (_url, init) => {
  const data = JSON.parse(JSON.parse(init.body).messages[1].content);
  calls.push(data.task ?? 'reading');
  let output;
  if (!data.task) output = { suggestions: data.targets.map((target) => ({ tokenId: target.tokenId, candidateId: target.candidates[0].id, pronunciation: null, reason: '受控浏览器测试，不是语言学判定。' })) };
  if (data.task === 'critique') { critiqueInputs.push(data); assert(data.prosodyContext && Array.isArray(data.prosodyContext.issues), 'critique must receive formal prosody context'); output = { overview: data.question ? '受控定向回答：' + data.question : '受控全诗评议：结合全文讨论山水。', strengths: ['受控优点说明。'], revisions: data.mode === 'writing' && data.text === '山高水远。' ? [
    { startTokenId: 'l1c1', endTokenId: 'l1c1', original: '山', replacement: '群山', reason: '受控长度变化场景。', tradeoff: '受控取舍说明。' },
    { startTokenId: 'l1c4', endTokenId: 'l1c4', original: '远', replacement: '长', reason: '受控改字场景。', tradeoff: '受控取舍说明。' },
  ] : [] }; }
  if (data.task === 'search') { const poem = data.poems.find((p) => p.title === '夜雨寄北'); assert(poem, '夜雨寄北 must be recalled for this scene'); output = { matches: [{ id: poem.id, quote: poem.paragraphs[0].slice(0, 5), reason: '受控意境排序，非真实推理。' }] }; }
  if (data.task === 'compare') output = { overview: '受控对读总评。', aspects: [{ name: '意象', left: '受控左诗分析。', right: '受控右诗分析。' }] };
  if (data.task === 'rhyme') {
    rhymeInputs.push(data);
    const call = rhymeInputs.length;
    const reason = recommendationTag;
    if (call === blockRhymeAt) await new Promise(resolve => { releaseRhyme = resolve; });
    output = call === failRhymeAt ? { matches: 'controlled-malformed-batch' } : { matches: emptyRhyme ? [] : [{ id: data.candidates[0].id, reason }] };
  }
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }));
};
const app = buildApp({ readingAssistant: { provider: 'deepseek', apiKey: 'controlled-test-key', fetcher } });
let analyses = 0;
app.addHook('preHandler', async request => {
  if (request.url === '/api/v1/analyze') analyses++;
  if (request.url === '/api/v1/rhyme-words') { rhymeLookups++; if (slowPages) await sleep(650); }
});
app.addHook('onSend', async (request, _reply, payload) => {
  if (request.url === '/api/v1/rhyme-words') {
    const value = JSON.parse(String(payload));
    if (value.lookup) rhymePages.push(value);
  }
  return payload;
});
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = { revision: revision(), mode: 'controlled-upstream-real-api-lexicon-browser-indexeddb', realModelInference: false, checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', (event) => result.errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text));
const check = async (name, run) => { if (rhymeOnly && !focusedChecks.has(name)) return; await run(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
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
  if (rhymeOnly) {
    await h.load({ path: '#checker', reduce: true });
    await clickText('.pc-poetry-desk > [role="tablist"] [role="tab"]', '同韵寻字');
  }
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
    const completedCalls = calls.filter(task => task === 'compare').length;
    assert.equal(await h.evaluate("document.querySelector('.pc-compare-submit').disabled"), false, 'Explicit rerun is available');
    assert.equal(await h.evaluate("document.querySelector('.pc-compare-submit').textContent.trim()"), '重新对读');
    await sleep(300);
    assert.equal(calls.filter(task => task === 'compare').length, completedCalls, 'Completed pair must not automatically repeat a request');
    await clickText('.pc-library-comparison-notes .pc-study-result-actions button', '收藏评议');
    await waitFor(() => h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1') ?? '{\"entries\":[]}').entries.length===1"));
    const savedStudy=await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries[0]");
    assert.equal(savedStudy.input.task,'compare');
    assert.equal(savedStudy.response.result.overview,'受控对读总评。');
    assert(savedStudy.input.left.length && savedStudy.input.right.length);
    await h.evaluate("document.querySelector('.pc-library-comparison-notes').scrollIntoView({block:'center',behavior:'instant'})");
    await shot('compare-notes-1440');
    const before = await h.evaluate("document.querySelectorAll('.pc-library-poem h2')[0].textContent");
    await h.click('[aria-label="交换左右诗作"]');
    await waitFor(() => h.evaluate("!document.querySelector('.pc-library-comparison-notes')"));
    assert.notEqual(await h.evaluate("document.querySelectorAll('.pc-library-poem h2')[0].textContent"), before);
    assert.deepEqual(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries[0]"),savedStudy);
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
  await check('compare-pickers-search-independently-without-changing-poems-or-calling-ai', async () => {
    const before=calls.filter(task=>task==='compare').length;
    const initial=await h.evaluate("[...document.querySelectorAll('.pc-compare-picker select')].map(el=>el.value)");
    assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-compare-picker select')].every(el=>el.options.length<=86)"),true);
    await fill('[aria-label="检索左卷诗作"]','题名:静夜思');
    assert.deepEqual(await h.evaluate("[...document.querySelectorAll('.pc-compare-picker select')].map(el=>el.value)"),initial,'Typing only filters options');
    await h.evaluate("(() => {const e=document.querySelector('[aria-label=\"选择左卷诗作\"]');const option=[...e.options].find(row=>row.textContent.startsWith('静夜思 ·'));if(!option)throw new Error('Missing matching poem');e.value=option.value;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-poem h2')?.textContent==='静夜思'"));
    const selected=await h.evaluate("document.querySelector('[aria-label=\"选择左卷诗作\"]').value");
    await fill('[aria-label="检索左卷诗作"]','完全没有这种诗题');
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"选择左卷诗作\"]').value"),selected);
    assert.equal(await h.evaluate("document.querySelector('.pc-compare-match-count').textContent.includes('当前所选仍保留')"),true);
    await fill('[aria-label="检索右卷诗作"]','');
    await h.click('.pc-library-poem:nth-child(2) .pc-compare-favorites input');
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"选择右卷诗作\"]').value"),initial[1]);
    assert.equal(await h.evaluate("document.querySelectorAll('[aria-label=\"选择右卷诗作\"] > option').length"),1,'Only the previously starred poem appears as a match');
    assert.equal(calls.filter(task=>task==='compare').length,before);
    await h.viewport(320,900,true);
    await h.evaluate("document.querySelector('.pc-compare-picker').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await shot('compare-search-320');
    await h.viewport(1440,1000);
  });
  await check('library-study-opens-checker-in-reading-mode', async () => {
    await clickText('.pc-library > [role="tablist"] [role="tab"]', '诗库');
    await clickText('.pc-library-reading button', '研读此诗');
    await waitFor(() => h.evaluate("location.hash==='#checker' && !!document.querySelector('.pc-report')"));
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('受控全诗评议')"));
    assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-poetry-critique [role=tab]')].find(el=>el.textContent==='原诗赏读').getAttribute('aria-selected')"), 'true');
  });
  await check('focused-question-sends-only-on-submit-and-saves-exact-question', async () => {
    const count=critiqueInputs.length, before=analyses;
    await clickText('.pc-study-question > summary','带着问题读诗');
    await clickText('.pc-study-question__examples button','哪些字最能体现这首诗的意境？');
    await fill('[aria-label="本诗研读问题"]','转折和结尾是否自然？');
    await sleep(1400);
    assert.equal(critiqueInputs.length,count);
    await clickText('.pc-study-question button','就此提问');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('受控定向回答：转折和结尾是否自然？')"));
    assert.equal(critiqueInputs.length,count+1);
    assert.equal(critiqueInputs.at(-1).question,'转折和结尾是否自然？');
    assert.equal(critiqueInputs.at(-1).mode,'reading');
    assert.equal(analyses,before);
    await fill('[aria-label="本诗研读问题"]','尚未发送的另一个问题');
    assert.equal(await h.evaluate("document.querySelector('.pc-study-question-asked').textContent"),'这份回答的问题：转折和结尾是否自然？');
    await clickText('.pc-poetry-review .pc-study-result-actions button','收藏评议');
    await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.some(e=>e.input.question==='转折和结尾是否自然？')"));
    await h.viewport(320,900,true);
    await h.evaluate("document.querySelector('.pc-study-question').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await shot('focused-question-320');
    await h.viewport(1440,1000);
  });
  await check('batch-adoptions-undo-redo-keep-advice-and-analyze-once', async () => {
    await h.setText('山高水远。');
    await clickText('.pc-poetry-critique [role="tab"]', '写作推敲');
    await h.analyze();
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-poetry-edit ins')"));
    const before = analyses;
    const critiques = calls.filter(task => task === 'critique').length;
    await clickText('.pc-poetry-edit:nth-of-type(1) .pc-revision-preview > summary', '试读整句');
    assert.deepEqual(await h.evaluate("[...document.querySelectorAll('.pc-poetry-edit:nth-of-type(1) .pc-revision-preview dd')].map(el=>el.textContent)"), ['山高水远','群山高水远']);
    await clickText('.pc-poetry-edit:nth-of-type(1) .pc-revision-preview details summary', '展开整首试稿');
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-edit:nth-of-type(1) .pc-revision-preview blockquote').textContent"), '群山高水远。');
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '山高水远。');
    assert.equal(analyses, before);
    assert.equal(calls.filter(task => task === 'critique').length, critiques);
    await h.viewport(320, 900, true);
    await h.evaluate("document.querySelector('.pc-revision-preview').scrollIntoView({block:'center',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), true);
    await shot('revision-preview-320');
    await h.viewport(1440, 1000);
    await clickText('.pc-poetry-edit:nth-of-type(1) button', '采纳');
    await h.idle();
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"), '群山高水远。');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-poetry-edit').length"), 2);
    await clickText('.pc-poetry-edit:nth-of-type(2) .pc-revision-preview > summary', '试读整句');
    assert.deepEqual(await h.evaluate("[...document.querySelectorAll('.pc-poetry-edit:nth-of-type(2) .pc-revision-preview dd')].map(el=>el.textContent)"), ['群山高水远','群山高水长']);
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
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-edit')?.textContent.includes('受控同韵语义推荐') && [...document.querySelectorAll('.pc-poetry-desk button')].some(el=>el.textContent.trim()==='结合全诗荐字' && !el.disabled)"));
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
    await waitFor(() => h.evaluate("[...document.querySelectorAll('.pc-poetry-edit')].some(el=>el.textContent.includes('受控同韵语义推荐')) && [...document.querySelectorAll('.pc-poetry-desk button')].some(el=>el.textContent.trim()==='结合全诗荐字' && !el.disabled)"));
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
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-edit')?.textContent.includes('受控同韵语义推荐') && [...document.querySelectorAll('.pc-poetry-desk button')].some(el=>el.textContent.trim()==='结合全诗荐字' && !el.disabled) && !document.querySelector('.pc-poetry-desk [role=progressbar]')"));
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
  let completePeers = [];
  const firstIntention = '保留山水意象，更自然地衔接末句。';
  const submittedIntention = '保留昂扬语气，避免艰涩用字。';
  const nextIntention = '尚未提交的另一种方向。';
  const displayedIntention = () => h.evaluate("[...document.querySelectorAll('.pc-poetry-desk p')].find(e=>e.textContent.startsWith('这份荐字的意图：'))?.textContent ?? null");
  const recommendationIdle = () => waitFor(() => h.evaluate("[...document.querySelectorAll('.pc-poetry-desk button')].some(el=>el.textContent.trim()==='结合全诗荐字' && !el.disabled)"));
  await check('all-rhyme-characters-load-once-and-filter-without-ai', async () => {
    await h.viewport(1440, 1000);
    const pageStart = rhymePages.length;
    const modelStart = rhymeInputs.length;
    slowPages = true;
    await h.setText('白日依山尽，黄河入海流。欲穷千里目，更上一层楼。');
    await h.analyze();
    await recommendationIdle();
    slowPages = false;
    const reading = await h.evaluate("document.querySelector('[aria-label=\"选择韵脚读音\"]').value");
    const pages = rhymePages.slice(pageStart).filter(p => p.readingId === reading);
    assert(pages.length >= 2, 'Real rhyme group must exercise multiple transport pages');
    const total = pages[0].total;
    const entries = pages.flatMap(p => p.lookup.entries);
    assert(total > 120, 'Fixture must exceed one transport page');
    assert.equal(entries.length, total);
    assert.equal(new Set(entries.map(e => e.character)).size, total);
    completePeers = entries.flatMap(e => e.candidates).map(c => c.id);
    assert.equal(new Set(completePeers).size, completePeers.length);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-rhyme-characters button').length"), total);
    assert.equal(await h.evaluate("document.querySelectorAll('[aria-label=\"上一页韵字\"], [aria-label=\"下一页韵字\"]').length"), 0);
    assert.equal(rhymeInputs.length, modelStart, 'Loading all characters must not call AI');
    const target = entries.at(-1).character;
    const lookups = rhymeLookups;
    await fill('[aria-label="筛选同韵字"]', target);
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-rhyme-characters button').length===1"));
    assert.equal(await h.evaluate("document.querySelector('.pc-rhyme-characters button').textContent"), target);
    await fill('[aria-label="筛选同韵字"]', '不存在的筛选词');
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-rhyme-characters button').length===0"));
    await fill('[aria-label="筛选同韵字"]', '');
    await waitFor(() => h.evaluate(`document.querySelectorAll('.pc-rhyme-characters button').length===${total}`));
    for (const width of [1440, 375, 320]) {
      await h.viewport(width, 1000, width < 800);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await h.evaluate("document.querySelector('.pc-rhyme-characters').scrollIntoView({block:'start',behavior:'instant'})");
      await shot('rhyme-all-' + width);
    }
    assert.equal(rhymeLookups, lookups, 'Filter and resize must reuse complete candidate list');
    assert.equal(rhymeInputs.length, modelStart, 'Filter and resize must not call AI');
  });
  await check('one-click-ai-covers-every-reading-candidate-including-last-batch', async () => {
    const before = rhymeInputs.length;
    await fill('[aria-label="荐字意图"]', firstIntention);
    await sleep(250);
    assert.equal(rhymeInputs.length, before, 'Editing an intention must not call AI');
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"荐字意图\"]').maxLength"), 240);
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await recommendationIdle();
    const batches = rhymeInputs.slice(before);
    assert(batches.length >= 2);
    assert(batches.every(b => b.candidates.length > 0 && b.candidates.length <= 120));
    assert(batches.every(b => b.intention === firstIntention), 'Every batch must keep the submitted intention');
    assert.equal(await displayedIntention(), '这份荐字的意图：' + firstIntention);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
    await h.evaluate("document.querySelector('[aria-label=\"荐字意图\"]').scrollIntoView({block:'start',behavior:'instant'})");
    await shot('rhyme-intention-320');
    const sent = batches.flatMap(b => b.candidates.map(c => c.id));
    assert.deepEqual(sent, completePeers, 'Every candidate must reach the model exactly once in catalogue order');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-poetry-edit').length"), batches.length);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-rhyme-characters button').length"), new Set(batches.flatMap(b => b.candidates.map(c => c.character))).size);
  });
  await check('rhyme-note-copy-download-and-adoption-keep-completed-snapshot', async () => {
    const originalText = await h.evaluate("document.querySelector('.pc-input__text').value");
    const modelCount = rhymeInputs.length;
    const analysisCount = analyses;
    const matches = rhymeInputs.slice(-Math.ceil(completePeers.length / 120)).map(b => b.candidates[0]);
    await h.evaluate(`(() => {
      window.noteClipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.noteCopied=text;}}});
      window.noteOriginalCreate=URL.createObjectURL;
      window.noteOriginalClick=HTMLAnchorElement.prototype.click;
      window.noteBlobs=new Map();
      URL.createObjectURL=function(blob){const url=window.noteOriginalCreate.call(URL,blob);window.noteBlobs.set(url,blob);return url;};
      HTMLAnchorElement.prototype.click=function(){if(this.download==='同韵推敲笺.txt'){window.noteDownloadName=this.download;window.noteDownloaded=window.noteBlobs.get(this.href).text();return;}return window.noteOriginalClick.call(this);};
    })()`);
    try {
      await fill('[aria-label="荐字意图"]', nextIntention);
      await clickText('[aria-label="分享荐字"] button', '复制荐字笺');
      await waitFor(() => h.evaluate("typeof window.noteCopied==='string'"));
      const copied = await h.evaluate('window.noteCopied');
      assert(copied.includes('原诗：\n' + originalText));
      assert(copied.includes('推敲意图：' + firstIntention));
      assert(!copied.includes(nextIntention));
      assert(copied.includes(`本次已遍历 ${completePeers.length} 个同韵读音候选。`));
      matches.forEach((c, index) => assert(copied.includes(`${index + 1}. ${c.character}`), 'Every completed batch recommendation belongs in the export'));
      assert.equal((copied.match(/受控同韵语义推荐。/gu) ?? []).length, matches.length);
      await clickText('[aria-label="分享荐字"] button', '下载荐字笺');
      const downloaded = await h.evaluate('window.noteDownloaded');
      assert.equal(downloaded, copied, 'TXT and clipboard contain the same completed snapshot');
      assert.equal(await h.evaluate('window.noteDownloadName'), '同韵推敲笺.txt');
      await clickText('.pc-poetry-edit button', '试用');
      await waitFor(() => h.evaluate(`document.querySelector('.pc-input__text').value!==${JSON.stringify(originalText)}`));
      await h.evaluate('window.noteCopied=null');
      await waitFor(() => h.evaluate("!!document.querySelector('[aria-label=\"分享荐字\"] button')"));
      await clickText('[aria-label="分享荐字"] button', '复制荐字笺');
      await waitFor(() => h.evaluate("typeof window.noteCopied==='string'"));
      assert.equal(await h.evaluate('window.noteCopied'), copied, 'Adopting an edit must not replace the exported original poem');
      assert.equal(rhymeInputs.length, modelCount, 'Sharing and adoption must not implicitly call AI');
      assert.equal(analyses, analysisCount, 'Sharing and adoption must not reanalyze');
      await h.click('[aria-label="撤销上次修改"]');
      await waitFor(() => h.evaluate(`document.querySelector('.pc-input__text').value===${JSON.stringify(originalText)}`));
      await recommendationIdle();
      await h.evaluate("document.querySelector('[aria-label=\"分享荐字\"]').scrollIntoView({block:'center',behavior:'instant'})");
      assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await shot('rhyme-note-320');
    } finally {
      await h.evaluate(`(() => {
        if(window.noteClipboardDescriptor)Object.defineProperty(navigator,'clipboard',window.noteClipboardDescriptor);else delete navigator.clipboard;
        URL.createObjectURL=window.noteOriginalCreate;
        HTMLAnchorElement.prototype.click=window.noteOriginalClick;
        delete window.noteBlobs;
      })()`);
    }
  });
  await check('failed-later-batch-keeps-old-answer-and-retries-only-unfinished', async () => {
    const before = rhymeInputs.length;
    const oldAnswer = await h.evaluate("[...document.querySelectorAll('.pc-poetry-edit')].map(e=>e.textContent)");
    recommendationTag = '受控重试后新推荐。';
    failRhymeAt = before + 2;
    blockRhymeAt = before + 2;
    await fill('[aria-label="荐字意图"]', submittedIntention);
    assert.equal(await displayedIntention(), '这份荐字的意图：' + firstIntention, 'Draft edits must not relabel the displayed answer');
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => Boolean(releaseRhyme));
    await fill('[aria-label="荐字意图"]', nextIntention);
    assert.equal(await displayedIntention(), '这份荐字的意图：' + firstIntention, 'Pending result retains the old answer intention');
    assert.equal(rhymeInputs.length, before + 2, 'Typing while waiting must neither submit nor cancel the snapshot');
    releaseRhyme();
    releaseRhyme = null;
    blockRhymeAt = null;
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-poetry-desk [role=alert]')"));
    assert.equal(rhymeInputs.length, before + 2);
    assert.deepEqual(await h.evaluate("[...document.querySelectorAll('.pc-poetry-edit')].map(e=>e.textContent)"), oldAnswer);
    const first = rhymeInputs[before].candidates.map(c => c.id);
    failRhymeAt = null;
    const retryStart = rhymeInputs.length;
    await clickText('.pc-poetry-desk button', '重试本次研读');
    await recommendationIdle();
    const retry = rhymeInputs.slice(retryStart).flatMap(b => b.candidates.map(c => c.id));
    assert.deepEqual([...first, ...retry], completePeers, 'Retry must reuse the completed first batch without resending it');
    assert(rhymeInputs.slice(before).every(b => b.intention === submittedIntention), 'Retry must use submitted intention, not the next question draft');
    assert.equal(await displayedIntention(), '这份荐字的意图：' + submittedIntention);
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"荐字意图\"]').value"), nextIntention, 'Waiting-period edits remain available after success');
    assert(await h.evaluate("[...document.querySelectorAll('.pc-poetry-edit')].every(e=>e.textContent.includes('受控重试后新推荐'))"));
    recommendationTag = '受控同韵语义推荐。';
  });
  await check('cancelled-batch-ignores-late-answer-and-starts-no-more-batches', async () => {
    const before = rhymeInputs.length;
    const oldAnswer = await h.evaluate("[...document.querySelectorAll('.pc-poetry-edit')].map(e=>e.textContent)");
    recommendationTag = '不应显示的迟到推荐。';
    blockRhymeAt = before + 2;
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => Boolean(releaseRhyme));
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-poetry-desk [aria-label=\"取消请求\"]:not(:disabled)')"));
    await h.click('.pc-poetry-desk [aria-label="取消请求"]');
    releaseRhyme();
    releaseRhyme = null;
    blockRhymeAt = null;
    await sleep(600);
    assert.equal(rhymeInputs.length, before + 2, 'Cancellation must prevent the next batch');
    assert.deepEqual(await h.evaluate("[...document.querySelectorAll('.pc-poetry-edit')].map(e=>e.textContent)"), oldAnswer);
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-desk').textContent.includes('不应显示的迟到推荐')"), false);
    recommendationTag = '受控同韵语义推荐。';
  });
  await check('changing-rhyme-target-cancels-pending-batch-and-discards-late-result', async () => {
    const original = await h.evaluate("document.querySelector('[aria-label=\"选择句末字\"]').value");
    const before = rhymeInputs.length;
    recommendationTag = '旧韵脚迟到推荐不得显示。';
    blockRhymeAt = before + 1;
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => Boolean(releaseRhyme));
    await h.evaluate(`(() => { const el=document.querySelector('[aria-label="选择句末字"]'); const target=[...el.options].find(o=>o.value!==el.value); if(!target)throw new Error('No second rhyme target'); el.value=target.value;el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await recommendationIdle();
    releaseRhyme();
    releaseRhyme = null;
    blockRhymeAt = null;
    await sleep(600);
    assert.equal(rhymeInputs.length, before + 1);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-poetry-edit').length"), 0);
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-desk').textContent.includes('旧韵脚迟到推荐')"), false);
    recommendationTag = '受控同韵语义推荐。';
    await h.evaluate(`(() => { const el=document.querySelector('[aria-label="选择句末字"]'); el.value=${JSON.stringify(original)};el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await recommendationIdle();
  });
  await check('empty-rhyme-recommendations-have-visible-feedback', async () => {
    emptyRhyme = true;
    await fill('[aria-label="荐字意图"]', '');
    const before = rhymeInputs.length;
    await waitFor(() => h.evaluate("[...document.querySelectorAll('.pc-poetry-desk button')].some(el=>el.textContent.trim()==='结合全诗荐字' && !el.disabled)"));
    await clickText('.pc-poetry-desk button', '结合全诗荐字');
    await waitFor(() => h.evaluate("document.querySelector('.pc-poetry-desk').textContent.includes('本次未找到值得替换的字')"));
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-poetry-edit').length"), 0);
    assert(rhymeInputs.slice(before).every(b => !Object.hasOwn(b, 'intention')), 'Empty intention preserves the existing request shape');
    assert.equal(await displayedIntention(), '这份荐字的意图：结合全诗，未指定额外侧重');
    await shot('rhyme-empty-375');
  });
  assert.deepEqual(result.errors, []);
} catch (error) { result.failure = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { releaseRhyme?.(); result.calls = calls; await h.stop(); writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2)+'\n'); }
