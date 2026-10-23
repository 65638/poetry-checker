import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/comparison-questions');mkdirSync(out,{recursive:true});
const requests=[];let behavior='ok';
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled',fetcher:async(_url,init)=>{
 const input=JSON.parse(JSON.parse(init.body).messages[1].content);
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({overview:'受控对读：'+(input.question??'通篇对读'),aspects:[{name:'意境',left:'受控左诗说明',right:'受控右诗说明'}]})}}]}));
}}});
app.addHook('preHandler',async(request,reply)=>{if(request.url!=='/api/v1/poetry-assistant')return;requests.push(structuredClone(request.body));if(behavior==='slow')await sleep(2500);if(behavior==='fail')return reply.code(503).send({error:{message:'受控失败，请重试。'}});});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const catalog=(await app.inject({method:'GET',url:'/api/v1/library'})).json().works;
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'real-public-corpus-controlled-model-browser',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push({name,status:'pass'});console.log('[PASS]',name);};
const shot=async name=>writeFileSync(join(out,name+'.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const fill=async value=>h.evaluate(`(()=>{const e=document.querySelector('[aria-label="两诗对读问题"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
async function clickText(scope,label){await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-comparison-test','yes');})()`);try{await h.click('[data-comparison-test]');}finally{await h.evaluate("document.querySelector('[data-comparison-test]')?.removeAttribute('data-comparison-test')");}}
const answer=question=>waitFor(()=>h.evaluate(`document.querySelector('.pc-compare-overview')?.textContent===${JSON.stringify('受控对读：'+question)}`));
async function ask(question){await fill(question);await h.click('.pc-comparison-questions button[type=submit]');await answer(question);}
try{
 await h.load({path:'#library',reduce:true});await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
 await h.cdp.send('Browser.grantPermissions',{origin:new URL(h.url).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await clickText('.pc-library > [role=tablist] button','对读');
 await check('editable-question-sends-only-on-submit-and-binds-both-actual-poems',async()=>{
   await h.click('.pc-comparison-questions summary');await h.click('.pc-comparison-questions .pc-study-question__examples button');await sleep(300);assert.equal(requests.length,0);
   await ask('两首诗的结尾怎样回应前文？');
   const ids=await h.evaluate("[...document.querySelectorAll('.pc-compare-picker select')].map(e=>e.value)");
   assert.equal(requests[0].left,catalog.find(w=>w.id===ids[0]).paragraphs.join('\n'));
   assert.equal(requests[0].right,catalog.find(w=>w.id===ids[1]).paragraphs.join('\n'));
   assert.equal(requests[0].question,'两首诗的结尾怎样回应前文？');
   await waitFor(()=>h.evaluate("document.activeElement?.matches('.pc-compare-notes-heading h2')"));
   await shot('comparison-question-1440');
 });
 await check('failed-question-keeps-visible-answer-and-retry-keeps-request-snapshot',async()=>{
   behavior='fail';await fill('两首诗的空间有什么不同？');await h.click('.pc-comparison-questions button[type=submit]');
   await waitFor(()=>h.evaluate("!!document.querySelector('.pc-compare-task .pc-studio-error')"));
   await answer('两首诗的结尾怎样回应前文？');
   assert.equal(await h.evaluate("document.querySelector('.pc-library-comparison-notes .pc-study-question-asked').textContent"),'这份回答的问题：两首诗的结尾怎样回应前文？');
   await clickText('.pc-library-comparison-notes button','收藏评议');
   await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')??'{\"entries\":[]}').entries.length===1"));
   assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries[0].input.question"),'两首诗的结尾怎样回应前文？');
   const failed=structuredClone(requests.at(-1));await fill('这段草稿尚未发送');behavior='ok';await clickText('.pc-compare-task button','重试本次研读');await answer(failed.question);
   assert.deepEqual(requests.at(-1),failed);assert.equal(await h.evaluate("document.querySelector('[aria-label=两诗对读问题]').value"),'这段草稿尚未发送');
 });
 await check('history-restores-without-model-call-and-explicit-rerun-uses-displayed-question',async()=>{
   const count=requests.length;await h.click('.pc-comparison-questions .pc-study-history summary');
   await clickText('.pc-comparison-questions .pc-study-history button','两首诗的结尾怎样回应前文？');await answer('两首诗的结尾怎样回应前文？');assert.equal(requests.length,count);
   await h.click('.pc-compare-submit');await waitFor(()=>requests.length===count+1);await answer('两首诗的结尾怎样回应前文？');assert.deepEqual(requests.at(-1),requests[0]);
   await clickText('.pc-library-comparison-notes button','复制评议');
   await waitFor(()=>h.evaluate("document.querySelector('.pc-library-comparison-notes').textContent.includes('原诗与评议已复制')"));
   const share=(await h.evaluate('navigator.clipboard.readText()')).replaceAll('\r\n','\n');
   assert(share.includes('对读问题\n两首诗的结尾怎样回应前文？'));assert(share.includes(requests[0].left));assert(share.includes(requests[0].right));assert(!share.includes('这段草稿尚未发送'));
 });
 await check('reading-during-pending-question-keeps-old-answer-and-does-not-steal-focus',async()=>{
   behavior='slow';await fill('两个结尾的情绪差异？');await h.click('.pc-comparison-questions button[type=submit]');
   await waitFor(()=>h.evaluate("!!document.querySelector('.pc-compare-task .pc-studio-status')"));await answer('两首诗的结尾怎样回应前文？');
   assert.equal(await h.evaluate("document.querySelector('.pc-compare-task .pc-task-request-preview').textContent.includes('本次提问：两个结尾的情绪差异？')"),true);
   await h.evaluate("document.querySelector('[aria-label=两诗对读问题]').focus()");await fill('下一次问题的草稿');await answer('两个结尾的情绪差异？');
   assert.equal(await h.evaluate("document.activeElement?.getAttribute('aria-label')"),'两诗对读问题');behavior='ok';
 });
 await check('swapping-sources-cancels-pending-answer-clears-history-and-question',async()=>{
   behavior='slow';await fill('交换前的未完成问题');await h.click('.pc-comparison-questions button[type=submit]');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-compare-task .pc-studio-status')"));
   const count=requests.length;await h.click('[aria-label="交换左右诗作"]');await sleep(2800);behavior='ok';
   assert.equal(requests.length,count);assert.equal(await h.evaluate("!!document.querySelector('.pc-library-comparison-notes')"),false);
   assert.equal(await h.evaluate("!!document.querySelector('.pc-comparison-questions .pc-study-history')"),false);assert.equal(await h.evaluate("document.querySelector('[aria-label=两诗对读问题]').value"),'');
 });
 await check('narrow-screen-targeted-comparison-remains-usable',async()=>{
   await h.viewport(320,900,true);await h.click('.pc-comparison-questions summary');await ask('景物与情绪的关系？');
   assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await shot('comparison-question-320');
 });
 assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
