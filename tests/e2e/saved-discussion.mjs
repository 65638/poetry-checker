import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildApp} from '../../apps/api/src/server.ts';
import {PoetryAssistantRequestSchema} from '@poetry/contracts';
import {createStudyEntry,studyArchive} from '../../apps/web/src/app/studyArchive.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/saved-discussion');mkdirSync(out,{recursive:true});
let behavior='success';const requests=[];
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled-test',fetcher:async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({overview:'受控收藏续问：'+input.question,strengths:[],revisions:[]})}}]}));}}});
app.addHook('preHandler',async(request,reply)=>{if(request.url!=='/api/v1/poetry-assistant')return;requests.push(structuredClone(request.body));if(behavior==='slow')await sleep(2500);if(behavior==='fail')return reply.code(503).send({error:{message:'受控失败，请重试。'}});});
const original='空山不见人，但闻人语响。\n返景入深林，复照青苔上。';
const draft='白日依山尽，黄河入海流。';
const entryFor=(text,title)=>{const input=PoetryAssistantRequestSchema.parse({task:'critique',text,rhymeBook:'pingshui',direction:'imagery',mode:'reading',question:'诗中的画面如何？'});return createStudyEntry(input,{task:'critique',provider:'deepseek',model:'controlled',notice:'受控初始收藏',inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),result:{overview:'原始收藏的受控回答。',strengths:[],revisions:[]}},title,'2026-10-23T10:00:00Z');};
const saved=entryFor(original,'鹿柴收藏');const other=entryFor('床前明月光，疑是地上霜。','静夜思收藏');
const baseUrl=await app.listen({host:'127.0.0.1',port:0});const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'controlled-model-real-api-browser-storage',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push({name,status:'pass'});console.log('[PASS]',name);};
const shot=async name=>writeFileSync(join(out,name+'.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
async function clickText(scope,label){await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-saved-test','yes');})()`);try{await h.click('[data-saved-test]');}finally{await h.evaluate("document.querySelector('[data-saved-test]')?.removeAttribute('data-saved-test')");}}
async function choose(title){await h.evaluate(`(()=>{const e=[...document.querySelectorAll('.pc-study-archive__list button')].find(e=>e.querySelector('strong').textContent===${JSON.stringify(title)});e.click();})()`);await waitFor(()=>h.evaluate(`document.querySelector('.pc-study-archive__reader > h3')?.textContent===${JSON.stringify(title)}`));}
async function ask(question,wait=true){await h.evaluate(`(()=>{document.querySelector('.pc-saved-discussion .pc-study-follow-up').open=true;const e=document.querySelector('.pc-saved-discussion textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(question)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await h.click('.pc-saved-discussion button[type=submit]');if(wait)await waitFor(()=>h.evaluate(`document.querySelector('.pc-saved-discussion__answer .pc-study-prose')?.textContent===${JSON.stringify('受控收藏续问：'+question)}`));}
try{
 await h.load({path:'#checker',reduce:true});await h.evaluate(`localStorage.setItem('poetry-study-archive-v1',${JSON.stringify(JSON.stringify(studyArchive([saved,other])))})`);await h.cdp.send('Page.reload');await sleep(300);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-study-archive')"));await h.setText(draft);await h.click('.pc-study-archive > summary');await choose(saved.title);
 await check('resume-saved-discussion-uses-archived-poem-and-does-not-change-the-editor',async()=>{
   assert.equal(requests.length,0);await ask('请继续解释声音与光。');assert.equal(requests.length,1);assert.equal(requests[0].text,original);assert.equal(requests[0].mode,'reading');assert.deepEqual(requests[0].followUp.turns,[{question:saved.input.question,answer:saved.response.result.overview}]);
   assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),draft);
   assert.deepEqual(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries"),[saved,other]);
 });
 await check('new-answer-saves-separately-and-can-resume-after-refresh',async()=>{
   await clickText('.pc-saved-discussion button','收藏评议');await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.length===3"));
   const stored=await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries");assert.deepEqual(stored[0],saved);assert.equal(stored[2].input.question,'请继续解释声音与光。');
   await h.cdp.send('Page.reload');await sleep(300);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-study-archive')"));await h.setText(draft);await h.click('.pc-study-archive > summary');await h.click('.pc-study-archive__list button');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-saved-discussion')"));
   await ask('接着说说结尾。');assert.equal(requests.at(-1).followUp.turns.length,2);assert.equal(requests.at(-1).followUp.turns[1].question,'请继续解释声音与光。');
   assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),draft);
 });
 await check('failure-keeps-last-answer-and-retry-uses-the-exact-snapshot',async()=>{
   behavior='fail';await ask('重试时别串诗。',false);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-saved-discussion .pc-studio-error')"));const failed=requests.at(-1);
   assert.equal(await h.evaluate("document.querySelector('.pc-saved-discussion__answer .pc-study-prose').textContent"),'受控收藏续问：接着说说结尾。');
   behavior='success';await clickText('.pc-saved-discussion button','重试本次研读');await waitFor(()=>h.evaluate("document.querySelector('.pc-saved-discussion__answer .pc-study-prose')?.textContent==='受控收藏续问：重试时别串诗。'"));assert.deepEqual(requests.at(-1),failed);
 });
 await check('selecting-another-saved-poem-cancels-pending-answer',async()=>{
   behavior='slow';const count=requests.length;await ask('不能覆盖另一份收藏。',false);await waitFor(()=>requests.length===count+1);await choose(other.title);await sleep(2800);
   assert.equal(await h.evaluate("!!document.querySelector('.pc-saved-discussion__answer')"),false);behavior='success';await ask('这次使用哪首诗？');assert.equal(requests.at(-1).text,other.input.text);assert.equal(requests.at(-1).followUp.turns.length,1);
 });
 await check('archive-continuation-fits-320px-and-keeps-answers-readable',async()=>{
   await h.viewport(320,900,true);await h.evaluate("document.querySelector('.pc-saved-discussion').scrollIntoView({block:'start',behavior:'instant'})");assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await shot('saved-discussion-320');
 });
 await check('organize-saved-answers-with-filters-and-reversible-concurrency-safe-titles',async()=>{
   await h.viewport(1440,1000);const count=requests.length;
   await h.evaluate("(()=>{const e=document.querySelector('[aria-label=研读类型]');e.value='compare';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
   assert.equal(await h.evaluate("document.querySelectorAll('.pc-study-archive__list li').length"),0);
   await h.evaluate("(()=>{const e=document.querySelector('[aria-label=研读类型]');e.value='reading';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
   assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-study-archive__question')].some(e=>e.textContent.includes('请继续解释声音与光。'))"),true);
   await clickText('.pc-study-archive__actions > button','改标题');
   await h.evaluate("(()=>{const e=document.querySelector('[aria-label=收藏标题]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'月下的提问');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
   await clickText('.pc-study-archive__rename button','保存标题');await waitFor(()=>h.evaluate("document.querySelector('.pc-study-archive__reader > h3')?.textContent==='月下的提问'"));
   const renamed=await h.evaluate(`JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.find(entry=>entry.id===${JSON.stringify(other.id)})`);assert.deepEqual(renamed,{...other,title:'月下的提问'});
   await clickText('.pc-study-archive > button','撤销改标题');await waitFor(()=>h.evaluate("document.querySelector('.pc-study-archive__reader > h3')?.textContent==='静夜思收藏'"));
   await clickText('.pc-study-archive__actions > button','改标题');
   await h.evaluate(`(()=>{const v=JSON.parse(localStorage.getItem('poetry-study-archive-v1'));v.entries.find(entry=>entry.id===${JSON.stringify(other.id)}).title='别处的新标题';localStorage.setItem('poetry-study-archive-v1',JSON.stringify(v));})()`);
   await clickText('.pc-study-archive__rename button','保存标题');await waitFor(()=>h.evaluate("document.querySelector('.pc-study-archive > [role=status]')?.textContent.includes('另一处更新')"));
   assert.equal(await h.evaluate(`JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.find(entry=>entry.id===${JSON.stringify(other.id)}).title`),'别处的新标题');
   assert.equal(requests.length,count);
 });
 assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
