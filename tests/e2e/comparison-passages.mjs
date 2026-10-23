import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/comparison-passages');mkdirSync(out,{recursive:true});
const requests=[];let slow=false;
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled',fetcher:async(_url,init)=>{
 const input=JSON.parse(JSON.parse(init.body).messages[1].content);
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({overview:'受控选段对读：'+(input.question??'通篇对读'),aspects:[{name:'意境',left:'仅讨论提供的左卷文字',right:'仅讨论提供的右卷文字'}]})}}]}));
}}});
app.addHook('preHandler',async request=>{if(request.url!=='/api/v1/poetry-assistant')return;requests.push(structuredClone(request.body));if(slow)await sleep(2500);});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const catalog=(await app.inject({method:'GET',url:'/api/v1/library'})).json().works;
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'real-public-corpus-controlled-model-browser',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push({name,status:'pass'});console.log('[PASS]',name);};
const shot=async name=>writeFileSync(join(out,name+'.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const fill=async(selector,value)=>h.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const select=async(selector,value)=>h.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
async function clickText(scope,label){await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-passage-test','yes');})()`);try{await h.click('[data-passage-test]');}finally{await h.evaluate("document.querySelector('[data-passage-test]')?.removeAttribute('data-passage-test')");}}
const answer=()=>waitFor(()=>h.evaluate("document.querySelector('.pc-compare-overview')?.textContent.includes('受控选段对读')"));
let long;
try{
 await h.load({path:'#library',reduce:true});await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
 await h.cdp.send('Browser.grantPermissions',{origin:new URL(h.url).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await clickText('.pc-library > [role=tablist] button','对读');
 await check('long-work-requires-explicit-scope-and-keeps-full-original-visible',async()=>{
   const candidate=catalog.find(w=>w.kind!=='prose'&&w.paragraphs.join('\n').length>2000);assert(candidate,'real corpus must contain a long verse work');
   await fill('[aria-label=检索左卷诗作]','题名:'+candidate.title);
   await waitFor(()=>h.evaluate(`document.querySelector('[aria-label=选择左卷诗作]').options.length>1`));
   const ids=await h.evaluate("[...document.querySelector('[aria-label=选择左卷诗作]').options].map(e=>e.value)");
   long=catalog.find(w=>ids.includes(w.id)&&w.paragraphs.join('\n').length>2000);assert(long);
   await select('[aria-label=选择左卷诗作]',long.id);await waitFor(()=>h.evaluate("!!document.querySelector('[aria-label=左卷对读选段]')"));
   assert.equal(await h.evaluate("document.querySelector('[aria-label=左卷对读选段]').value"),'');assert.equal(await h.evaluate("document.querySelector('.pc-compare-submit').disabled"),true);
   assert.deepEqual(await h.evaluate("[...document.querySelectorAll('.pc-library-poem:first-child .pc-compare-line > span')].map(e=>e.textContent)"),long.paragraphs);
   assert.equal(requests.length,0);
 });
 await check('chosen-section-is-exactly-what-is-sent-and-shared-with-explicit-scope',async()=>{
   await select('[aria-label=左卷对读选段]',1);await waitFor(()=>h.evaluate("!document.querySelector('.pc-compare-submit').disabled"));
   const excerpt=await h.evaluate("document.querySelector('[aria-label=左卷本次选段原文]').textContent");
   assert.equal(await h.evaluate("document.querySelector('.pc-comparison-questions .pc-study-question__examples').textContent.includes('两份所选文字')"),true);
   assert(excerpt.length<=2000);assert.notEqual(excerpt,long.paragraphs.join('\n'));assert.equal(requests.length,0);
   await h.click('.pc-comparison-questions .pc-study-question summary');await fill('[aria-label=两诗对读问题]','请比较所选文字中的景与情。');await h.click('.pc-comparison-questions button[type=submit]');await answer();
   assert.equal(requests.at(-1).left,excerpt);assert.equal(requests.at(-1).scope.left.part,2);assert.equal(requests.at(-1).scope.left.title,long.title);assert.equal(requests.at(-1).scope.right.parts,1);
   assert.equal(await h.evaluate("document.querySelector('.pc-library-comparison-notes').textContent.includes('不据选段评定整篇')"),true);
   await clickText('.pc-library-comparison-notes button','收藏评议');await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')??'{\"entries\":[]}').entries.length===1"));
   const saved=await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries[0]");assert.deepEqual(saved.input,requests.at(-1));
   await clickText('.pc-library-comparison-notes button','复制评议');await waitFor(()=>h.evaluate("document.querySelector('.pc-library-comparison-notes').textContent.includes('原诗与评议已复制')"));
   const share=(await h.evaluate('navigator.clipboard.readText()')).replaceAll('\r\n','\n');assert(share.includes(excerpt));assert(share.includes('选段2/'));assert(share.includes('不据选段评定整篇'));assert(!share.includes(long.paragraphs.join('\n')));
 });
 await check('changing-scope-clears-answer-and-draft-without-sending-and-cancels-old-request',async()=>{
   const count=requests.length;await select('[aria-label=左卷对读选段]',0);
   await waitFor(()=>h.evaluate("!document.querySelector('.pc-library-comparison-notes')"));assert.equal(await h.evaluate("document.querySelector('[aria-label=两诗对读问题]').value"),'');assert.equal(requests.length,count);
   slow=true;await h.click('.pc-compare-submit');await waitFor(()=>requests.length===count+1);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-compare-task .pc-task-request-preview')"));
   assert.equal(await h.evaluate("document.querySelector('.pc-compare-task .pc-task-request-preview').textContent.includes('选段1/')"),true);
   await select('[aria-label=左卷对读选段]',1);await sleep(2800);slow=false;
   assert.equal(await h.evaluate("!!document.querySelector('.pc-library-comparison-notes')"),false);assert.equal(requests.length,count+1);
 });
 await check('swapping-carries-the-excerpt-with-its-original-and-mobile-remains-readable',async()=>{
   const original=await h.evaluate("document.querySelector('[aria-label=左卷本次选段原文]').textContent");await h.click('[aria-label=交换左右诗作]');
   await waitFor(()=>h.evaluate("document.querySelector('[aria-label=右卷对读选段]')?.value==='1'"));assert.equal(await h.evaluate("document.querySelector('[aria-label=右卷本次选段原文]').textContent"),original);
   await h.viewport(320,900,true);await h.evaluate("document.querySelector('.pc-comparison-scope').scrollIntoView({block:'start',behavior:'instant'})");
   assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await shot('comparison-scope-320');
   await h.click('.pc-compare-submit');await answer();assert.equal(requests.at(-1).right,original);assert.equal(requests.at(-1).scope.right.part,2);assert.equal(requests.at(-1).scope.left.parts,1);
   await shot('comparison-scope-answer-320');
 });
 assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
