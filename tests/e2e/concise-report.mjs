import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';
import { POEMS } from '../integration/e2e/d3-acceptance-api.mjs';
import { assertSummaryExport } from './export-checks.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/concise-report');
mkdirSync(out, { recursive: true });
let latestReport;
let analysisCalls = 0;
let modelCalls = 0;
const app = buildApp({ readingAssistant: { apiKey: 'controlled-ui-test', fetcher: async (_url, init) => {
  modelCalls++;
  const data = JSON.parse(JSON.parse(init.body).messages[1].content);
  const suggestions = data.targets.map(t => ({ tokenId: t.tokenId, candidateId: t.candidates[0].id, pronunciation: null, reason: 'Controlled choice for presentation verification only.' }));
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ suggestions }) } }] }));
} } });
app.addHook('preHandler', async (request) => {
  if (request.url === '/api/v1/analyze') analysisCalls++;
});
const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
// Observe a clone of the actual response, including the final NDJSON report.
// Fastify's onSend payload is now a stream, not a serialized report object.
await h.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await original(...args);
    if (String(args[0]).endsWith('/api/v1/analyze') && response.ok) {
      void response.clone().text().then(raw => {
        const report = response.headers.get('content-type')?.includes('application/x-ndjson')
          ? raw.trim().split('\\n').map(line => JSON.parse(line)).find(event => event.type === 'result')?.report
          : JSON.parse(raw);
        if (report) { window.__finalReport = report; window.__reportCount = (window.__reportCount ?? 0) + 1; }
      });
    }
    return response;
  };
})()` });
const analyze = h.analyze;
h.analyze = async () => {
  const before = await h.evaluate('window.__reportCount ?? 0');
  await analyze();
  await waitFor(() => h.evaluate(`(window.__reportCount ?? 0) > ${before}`));
  latestReport = await h.evaluate('window.__finalReport');
};
const result = { revision: revision(), mode: 'real-api-controlled-model-for-ui-only', realModelAccuracyTested: false, checks: [], errors: [] };
h.cdp.on('Runtime.exceptionThrown', event => result.errors.push(event.exceptionDetails.text));
const check = async (name, run) => { await run(); result.checks.push({ name, status: 'pass' }); console.log('[PASS]', name); };
const shot = async name => writeFileSync(join(out, name + '.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
try {
  await check('resolved-readings-explain-template-pending-without-missing-data-or-human-review', async () => {
    await h.load({ reduce: true });
    await h.setText('灯前夜半键声轻，一局未终天欲明。错落音符随指下，参差节拍搅心旌。');
    await h.analyze();
    assert.equal(latestReport.summary.status, 'needs_review');
    assert.notEqual(latestReport.genre.applicability, 'applicable');
    const railCounts = await h.evaluate("document.querySelector('.pc-rail__counts').textContent");
    assert(railCounts.includes('参考不符') && !railCounts.includes('违规'), 'reading rail must preserve the same conditional scope as the report');
    assert.equal(latestReport.prosody.selectedTemplateId, null);
    assert.equal(latestReport.prosody.format.start.value, 'ping');
    assert.equal(latestReport.prosody.format.start.tokenId, 'l1c2');
    assert(latestReport.poem.tokens.every(t => t.readingStatus === 'resolved' && t.toneStatus === 'resolved'));
    const summary = await h.evaluate("document.querySelector('.pc-status').innerText");
    assert(summary.includes('参考分析：七绝形制 · 平起'));
    assert(!summary.includes('平起／仄起'));
    assert(!/待复核|下一步|点击带|缺字|缺录/.test(summary));
    const pending = await h.evaluate("(() => {const el=Array.from(document.querySelectorAll('[data-finding-id]')).find(el=>el.dataset.findingId.endsWith(':template'));return {text:el.innerText,compare:!!el.querySelector('dl'),locate:!!el.querySelector('button')};})()");
    assert(pending.text.includes('整诗参考格式未唯一确定'));
    assert.equal(pending.compare, false);
    assert.equal(pending.locate, false);
    await h.evaluate("document.querySelector('.pc-status').scrollIntoView({block:'start',behavior:'instant'}); true");
    await shot('template-1440');
  });
  await check('first-rhyme-difference-keeps-start-known-and-rhyme-independent', async () => {
    await h.setText('灯前夜半键声秋，一局未终天欲明。错落音符随指下，参差节拍搅心旌。');
    await h.analyze();
    assert.equal(latestReport.prosody.format.start.value, 'ping');
    assert.equal(latestReport.prosody.format.firstLineRhyme.value, 'uncertain');
    assert.equal(latestReport.prosody.format.firstLineRhyme.observed, 'different');
    const format = await h.evaluate("document.querySelector('.pc-format').innerText");
    assert(format.includes('第二字「前」为平声'));
    assert(format.includes('首句用韵\n待确认'));
  });
  await check('local-reference-switch-locates-conditional-issues-without-analysis-or-reading-changes', async () => {
    await h.setText('灯前夜半键声轻，一局未终天欲明。错落音符随指下，参差节拍搅心旌。');
    await h.analyze();
    const block = latestReport.prosody.conditionalChecks.find(b => b.checks.some(c => b.conditionalFindingIds.includes(c.id) && c.status === 'fail' && c.locations.length && c.resolvedBy === null));
    assert(block);
    const finding = block.checks.find(c => bIncludes(block, c) && c.status === 'fail' && c.locations.length && c.resolvedBy === null);
    const analysisBefore = analysisCalls, modelBefore = modelCalls;
    const snapshot = JSON.stringify(latestReport);
    const choose = async value => h.evaluate(`(() => {const s=document.querySelector('[aria-label="参考格式"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    await choose(block.templateId);
    await waitFor(() => h.evaluate("!!document.querySelector('section.pc-conditional')"));
    assert((await h.evaluate("document.querySelector('section.pc-conditional').innerText")).includes('条件批注'));
    const selector = `[data-finding-id=${JSON.stringify(finding.id)}] .pc-finding__locate`;
    await h.click(selector);
    await waitFor(() => h.evaluate(`document.activeElement.dataset.tokenId === ${JSON.stringify(finding.locations[0].tokenId)}`));
    assert.equal(await h.evaluate("!!document.querySelector('.pc-reference--conditional')"), true);
    const trigger = `.pc-cell__reference[aria-label*=${JSON.stringify('：若按')} ]`;
    await h.click(trigger);
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-reference__note')"));
    assert((await h.evaluate("document.querySelector('.pc-reference__note').innerText")).includes('若按'));
    await h.key('Escape');
    for (const width of [1440, 768, 375, 320]) {
      await h.viewport(width, 900, width < 600);
      await h.evaluate("document.querySelector('.pc-format').scrollIntoView({block:'start',behavior:'instant'}); true");
      await sleep(150);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await h.evaluate("Array.from(document.querySelectorAll('.pc-format dd,.pc-format p,.pc-format-reference select')).every(e=>e.scrollWidth<=e.clientWidth+1)"), true);
      await shot('format-' + width);
    }
    await choose('');
    await waitFor(() => h.evaluate("!document.querySelector('.pc-reference--conditional')"));
    await sleep(1800);
    assert.equal(analysisCalls, analysisBefore);
    assert.equal(modelCalls, modelBefore);
    assert.equal(JSON.stringify(latestReport), snapshot);
    await h.viewport(1440, 900);
  });
  await check('shared-summary-is-readable-chinese-and-explains-ze-endings-without-debug-fields', async () => {
    const poem = '空山不见人，但闻人语响。返景入深林，复照青苔上。';
    await h.setText(poem);
    await h.analyze();
    await h.evaluate("navigator.clipboard.writeText = async text => { window.__sharedText = text; }; true");
    await h.click('.pc-status__actions button');
    await waitFor(() => h.evaluate("typeof window.__sharedText === 'string'"));
    const text = await h.evaluate('window.__sharedText');
    assert(text.includes(poem));
    assert(text.includes('依据：平水韵'));
    assert(text.includes('偶数句均仄收'));
    assert(text.includes('仅作逐字平仄参考'));
    assert(!/发现\d+项问题|此处失对|应为平，实际为仄/.test(text));
    assert(!/needs_review|undetermined|uncertain|historical|pingshui|METER\.|请求快照|规则版本|原文摘要/.test(text));
    assert(!text.includes(latestReport.inputHash));
    assertSummaryExport(text, latestReport, { text: poem });
    writeFileSync(join(out, '鹿柴-分享摘要.txt'), text + '\n');
  });
  await check('sources-show-groups-with-technical-records-preserved-under-details', async () => {
    await h.setText(POEMS[0].text);
    await h.analyze();
    await h.click('[data-token-id=l4c1]');
    await waitFor(() => h.evaluate("!!document.querySelector('.pc-ev__details')"));
    const visible = await h.evaluate("document.querySelector('.pc-evlist').innerText");
    assert(visible.includes('八庚'));
    assert(visible.includes('二十四敬'));
    assert(visible.includes('原始来源'));
    assert(!/data\/|提交 |MIT|待核实|许可：|审核记录：|批次为裁定|仅覆盖候选/.test(visible), visible);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-ev__details[open]').length"), 0);
    const evId = latestReport.poem.tokens.find(t => t.tokenId === 'l4c1').candidates[0].evidenceIds[0];
    const ev = latestReport.provenance.evidence.find(e => e.id === evId);
    assert.equal(ev.reviewStatus, 'unverified');
    await h.evaluate("document.querySelector('.pc-evlist').scrollIntoView({block:'start',behavior:'instant'}); true");
    await shot('sources-1440');
    await h.click('.pc-ev__details summary');
    const expanded = await h.evaluate("document.querySelector('.pc-evlist').innerText");
    assert(expanded.includes(ev.assertion));
    assert(expanded.includes(ev.locator));
    assert(expanded.includes('尚未经人工核验'));
    assert(expanded.includes('许可：'));
    await shot('source-details-1440');
  });
  await check('details-support-keyboard-and-dialog-focus-trap', async () => {
    await h.evaluate("document.querySelectorAll('.pc-ev__details').forEach(el=>el.open=false); document.querySelector('.pc-evidence__header button').focus(); true");
    await h.key('Tab', 'Tab', 9, 8);
    assert.equal(await h.evaluate("document.activeElement.matches('.pc-ev__details summary')"), true);
    await h.key('Enter', 'Enter', 13, 0, '\r');
    assert.equal(await h.evaluate('document.activeElement.parentElement.open'), true);
    await h.key('Tab');
    assert.equal(await h.evaluate("document.activeElement.matches('.pc-evidence__header button')"), true);
    let returned = false;
    for (let i = 0; i < 60; i++) {
      await h.key('Tab');
      assert.equal(await h.evaluate("!!document.activeElement.closest('[role=dialog]')"), true);
      returned = await h.evaluate("document.activeElement.matches('.pc-evidence__header button')");
      if (returned) break;
    }
    assert(returned);
    await h.key('Escape');
    await waitFor(() => h.evaluate("!document.querySelector('[role=dialog]')"));
    assert.equal(await h.evaluate("document.activeElement.dataset.tokenId"), 'l4c1');
  });
  await check('compact-source-and-summary-fit-mobile-at-375-and-320', async () => {
    for (const width of [375, 320]) {
      await h.viewport(width, 812, true);
      await h.click('[data-token-id=l4c1]');
      await h.evaluate("document.querySelector('.pc-evlist').scrollIntoView({block:'start',behavior:'instant'}); true");
      await sleep(150);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await h.evaluate("(() => {const el=document.querySelector('.pc-evidence__body');return el.scrollWidth<=el.clientWidth;})()"), true);
      await shot('sources-' + width);
      await h.click('.pc-ev__details summary');
      assert.equal(await h.evaluate("(() => {const el=document.querySelector('.pc-evidence__body');return el.scrollWidth<=el.clientWidth;})()"), true);
      await shot('source-details-' + width);
      await h.key('Escape');
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

function bIncludes(block, check) { return block.conditionalFindingIds.includes(check.id); }
