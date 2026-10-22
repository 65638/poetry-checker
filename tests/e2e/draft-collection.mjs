import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness, waitFor, sleep, revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2] ?? 'artifacts/continuous-improvement/draft-collection');
mkdirSync(out,{recursive:true});
const app=buildApp({readingAssistant:{apiKey:''}});
let analysisRequests=0;
app.addHook('onRequest',async(request)=>{if(request.url.includes('/analyze') || request.url.includes('/poetry-assistant')) analysisRequests++;});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const results={revision:revision(),mode:'real-local-app-no-model',checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',e=>results.errors.push(e.exceptionDetails.text));
const check=async(name,fn)=>{await fn();results.checks.push(name);console.log('[PASS]',name);};
async function clickText(scope,label){
  await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing button '+${JSON.stringify(label)});e.dataset.draftTarget='yes';})()`);
  try{await h.click('[data-draft-target="yes"]');}finally{await h.evaluate("document.querySelector('[data-draft-target]')?.removeAttribute('data-draft-target')");}
}
const fill=(selector,value)=>h.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const stored=()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-draft-collection-v1')).entries");
const poemA='空山不见人，但闻人语响。\n返景入深林，复照青苔上。';
const poemB='白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。';
try{
  await h.load({path:'#checker',reduce:true});
  await h.click('.pc-draft-collection > summary');
  await check('save-deduplicate-and-persist-named-poem',async()=>{
    await h.setText(poemA);
    await fill('[aria-label="诗稿标题"]','山居稿');
    await clickText('.pc-draft-collection button','保存当前诗稿');
    assert.equal((await stored())[0].title,'山居稿');
    await clickText('.pc-draft-collection button','保存当前诗稿');
    assert.equal((await stored()).length,1);
    await h.cdp.send('Page.reload');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-draft-collection > summary')?.textContent.includes('1篇')"));
    await h.click('.pc-draft-collection > summary');
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),poemA);
  });
  await check('opening-another-poem-retains-current-input-without-inference',async()=>{
    await h.setText(poemB);
    await clickText('.pc-draft-collection article button','打开诗稿');
    await waitFor(()=>h.evaluate(`document.querySelector('.pc-input__text').value===${JSON.stringify(poemA)}`));
    const entries=await stored();
    assert.equal(entries.length,2);
    assert(entries.some(e=>e.draft.text===poemB));
    await sleep(1200);
    assert.equal(analysisRequests,0,'draft switches must not call analysis');
  });
  await check('quota-failure-preserves-input-and-archive',async()=>{
    const before=await stored();
    await h.setText('临时的新诗，不可丢失。');
    await h.evaluate("window.originalDraftSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='poetry-draft-collection-v1')throw new DOMException('quota','QuotaExceededError');return window.originalDraftSetItem.call(this,k,v);}");
    try{
      await clickText('.pc-draft-collection article button','打开诗稿');
      assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),'临时的新诗，不可丢失。');
      assert.deepEqual(await stored(),before);
      assert.equal(await h.evaluate("document.querySelector('.pc-draft-collection [role=alert]').textContent.includes('尚未保存')"),true);
    }finally{await h.evaluate('Storage.prototype.setItem=window.originalDraftSetItem;delete window.originalDraftSetItem;');}
  });
  await check('search-remove-undo-and-mobile-fit',async()=>{
    await fill('[aria-label="查找诗稿"]','山居');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-draft-collection article').length"),1);
    await clickText('.pc-draft-collection article button','移除');
    assert.equal((await stored()).length,1);
    await clickText('.pc-draft-collection button','撤销移除');
    assert.equal((await stored()).length,2);
    await h.viewport(320,900,true);
    await h.evaluate("document.querySelector('.pc-draft-collection').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    writeFileSync(join(out,'draft-collection-320.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  });
  assert.deepEqual(results.errors,[]);
}catch(error){results.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));}
