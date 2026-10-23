import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
import {relatedReadings} from '../../apps/web/src/app/relatedReadings.ts';
import {uniqueLibrary} from '../../apps/web/src/app/library.ts';
const out=resolve(process.argv[2]??'artifacts/related-reading');mkdirSync(out,{recursive:true});
const requests=[];
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled-test',fetcher:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({overview:'受控对读，非真实文学评价。',aspects:[{name:'意象',left:'受控左诗。',right:'受控右诗。'}]})}}]}))}});
app.addHook('preHandler',async request=>{if(['/api/v1/poetry-assistant','/api/v1/analyze'].includes(request.url))requests.push(structuredClone(request.body));});
const works=(await app.inject({method:'GET',url:'/api/v1/library'})).json().works;
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'real-corpus-real-api-browser-controlled-comparison',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push({name,status:'pass'});console.log('[PASS]',name);};
const shot=async name=>writeFileSync(join(out,name+'.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const fill=(selector,value)=>h.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
async function clickText(scope,label){await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-related-test','yes');})()`);try{await h.click('[data-related-test]');}finally{await h.evaluate("document.querySelector('[data-related-test]')?.removeAttribute('data-related-test')");}}
const openRelated=async()=>{await h.click('.pc-related-reading > summary');await waitFor(()=>h.evaluate("document.querySelectorAll('.pc-related-reading__list > li').length>0"));};
const first=()=>h.evaluate("(()=>{const e=document.querySelector('.pc-related-reading__list > li');return {id:e.dataset.workId,title:e.querySelector('h4').textContent,quote:e.querySelector('blockquote').textContent};})()");
try{
  await h.load({path:'#library',reduce:true});
  await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
  await fill('[aria-label="检索诗库"]','题名:鹿柴');await waitFor(()=>h.evaluate("document.querySelector('.pc-library-title')?.textContent==='鹿柴'"));
  await h.click('.pc-library-title');await openRelated();
  const source=works.find(work=>work.title==='鹿柴');assert(source);
  await check('local-recommendations-have-verbatim-evidence-and-no-model-call',async()=>{
    const rows=await h.evaluate("[...document.querySelectorAll('.pc-related-reading__list > li')].map(e=>({id:e.dataset.workId,quote:e.querySelector('blockquote').textContent,reason:e.querySelector('.pc-related-reading__reason').textContent}))");
    assert(rows.length>0&&rows.length<=6);
    for(const row of rows){const work=works.find(work=>work.id===row.id);assert(work);assert.notEqual(work.id,source.id);assert(work.paragraphs.some(paragraph=>paragraph.includes(row.quote)));for(const term of row.reason.matchAll(/“([^”]+)”/g)){assert(source.paragraphs.join('\n').includes(term[1]));assert(work.paragraphs.join('\n').includes(term[1]));}}
    assert.equal(requests.length,0);
    const unique=uniqueLibrary(works).works;const samples=[];for(const work of unique.slice(0,30)){const start=performance.now();relatedReadings(work,unique,'words');samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);result.localPerformance={corpus:unique.length,samples:samples.length,p95ms:Math.round(samples[Math.ceil(samples.length*.95)-1]*100)/100,maxms:Math.round(samples.at(-1)*100)/100};
  });
  await check('favorites-filter-paging-and-author-mode-stay-local',async()=>{
    const chosen=await first();await h.click('.pc-related-reading__list > li:first-child button[aria-pressed]');
    await h.click('.pc-related-reading__controls input[type=checkbox]');
    await waitFor(()=>h.evaluate("document.querySelectorAll('.pc-related-reading__list > li').length===1"));assert.equal((await first()).id,chosen.id);
    assert((await h.evaluate("JSON.parse(localStorage.getItem('poetry-library-favorites-v1'))")).includes(chosen.id));
    await h.click('.pc-related-reading__controls input[type=checkbox]');
    const initial=await h.evaluate("[...document.querySelectorAll('.pc-related-reading__list > li')].map(e=>e.dataset.workId)");
    await clickText('.pc-related-reading__pages button','下一组');
    const next=await h.evaluate("[...document.querySelectorAll('.pc-related-reading__list > li')].map(e=>e.dataset.workId)");assert(next.every(id=>!initial.includes(id)));
    await h.evaluate("(()=>{const e=document.querySelector('[aria-label=串读线索]');e.value='author';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    const ids=await h.evaluate("[...document.querySelectorAll('.pc-related-reading__list > li')].map(e=>e.dataset.workId)");assert(ids.length>0);for(const id of ids)assert.equal(works.find(work=>work.id===id).author,source.author);
    assert.equal(requests.length,0);
  });
  await check('read-related-original-and-return-to-source-with-keyboard-focus',async()=>{
    const chosen=await first();await clickText('.pc-related-reading__list > li:first-child button','读原诗');
    await waitFor(()=>h.evaluate(`document.querySelector('.pc-library-reading > h2')?.textContent===${JSON.stringify(chosen.title)}`));
    await waitFor(()=>h.evaluate("document.activeElement.getAttribute('aria-label')==='原诗阅读'"));
    assert.equal(await h.evaluate("document.querySelector('.pc-related-return').textContent"),'返回上一首《鹿柴》');
    await h.click('.pc-related-return');await waitFor(()=>h.evaluate("document.querySelector('.pc-library-reading > h2')?.textContent==='鹿柴'"));
    assert.equal(requests.length,0);await openRelated();
  });
  await check('320px-layout-and-comparison-uses-the-two-selected-originals-only-on-explicit-request',async()=>{
    await h.viewport(320,900,true);await h.evaluate("document.querySelector('.pc-related-reading').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await shot('related-320');
    await h.viewport(1440,1000);const chosen=await first();const target=works.find(work=>work.id===chosen.id);
    await clickText('.pc-related-reading__list > li:first-child button','与本诗对读');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-comparison')"));
    await waitFor(()=>h.evaluate("document.activeElement.getAttribute('aria-label')==='对读'"));
    assert.deepEqual(await h.evaluate("[...document.querySelectorAll('.pc-compare-title h2')].map(e=>e.textContent)"),['鹿柴',target.title]);
    await sleep(250);assert.equal(requests.length,0);
    await h.click('.pc-compare-submit');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-comparison-notes')"));
    assert.equal(requests.length,1);assert.equal(requests[0].left,source.paragraphs.join('\n'));assert.equal(requests[0].right,target.paragraphs.join('\n'));
  });
  assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
