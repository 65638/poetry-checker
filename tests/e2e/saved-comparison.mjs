import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildApp} from '../../apps/api/src/server.ts';
import {PoetryAssistantRequestSchema} from '@poetry/contracts';
import {createStudyEntry,studyArchive,parseStudyArchive} from '../../apps/web/src/app/studyArchive.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/saved-comparison');mkdirSync(out,{recursive:true});
let behavior='ok';const requests=[];
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled',fetcher:async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({overview:'受控收藏比较：'+input.question,aspects:[{name:'表达',left:'受控左卷说明',right:'受控右卷说明'}]})}}]}));}}});
app.addHook('preHandler',async(request,reply)=>{if(request.url!=='/api/v1/poetry-assistant')return;requests.push(structuredClone(request.body));if(behavior==='slow')await sleep(2500);if(behavior==='fail'){await sleep(220);return reply.code(503).send({error:{message:'受控失败，请重试。'}});}});
const entryFor=(payload,title)=>{const input=PoetryAssistantRequestSchema.parse(payload);return createStudyEntry(input,{task:'compare',provider:'zhipu',model:'controlled-old-model',notice:'受控收藏',inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),result:{overview:'已保存的受控比较',aspects:[{name:'表达',left:'原左卷',right:'原右卷'}]}},title,'2026-10-23T10:00:00Z');};
const saved=entryFor({task:'compare',left:'山高水远。',right:'白日依山尽，黄河入海流。',question:'原有问题',scope:{left:{title:'受控选段作品',part:2,parts:3},right:{title:'登鹳雀楼片句',part:1,parts:1}}},'保存的选段对读');
const version=entryFor({task:'compare',left:'山高水远。',right:'山高水长。',revision:{beforeLabel:'初稿',afterLabel:'二稿',intention:'强调水路绵延'}},'保存的两版稿件');
const draft='此处是当前诗稿，不属于收藏。';
const baseUrl=await app.listen({host:'127.0.0.1',port:0});const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'controlled-archive-snapshots-real-api-browser',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push({name,status:'pass'});console.log('[PASS]',name);};
const shot=async name=>writeFileSync(join(out,name+'.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
async function clickText(scope,label){await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-saved-pair','yes');})()`);try{await h.click('[data-saved-pair]');}finally{await h.evaluate("document.querySelector('[data-saved-pair]')?.removeAttribute('data-saved-pair')");}}
async function choose(title){await h.evaluate(`(()=>{const e=[...document.querySelectorAll('.pc-study-archive__list button')].find(e=>e.querySelector('strong').textContent===${JSON.stringify(title)});e.click();})()`);await waitFor(()=>h.evaluate(`document.querySelector('.pc-study-archive__reader > h3')?.textContent===${JSON.stringify(title)}`));}
async function fill(question){await h.evaluate(`(()=>{document.querySelector('.pc-saved-comparison .pc-study-question').open=true;const e=document.querySelector('.pc-saved-comparison textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(question)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
const answer=question=>waitFor(()=>h.evaluate(`document.querySelector('.pc-saved-comparison .pc-study-prose')?.textContent===${JSON.stringify('受控收藏比较：'+question)}`));
async function ask(question,wait=true){await fill(question);await h.click('.pc-saved-comparison button[type=submit]');if(wait)await answer(question);}
try{
 await h.load({path:'#checker',reduce:true});await h.evaluate(`localStorage.setItem('poetry-study-archive-v1',${JSON.stringify(JSON.stringify(studyArchive([saved,version])))})`);await h.cdp.send('Page.reload');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-study-archive')"));await h.setText(draft);await h.click('.pc-study-archive > summary');await choose(saved.title);
 await check('saved-comparison-asks-from-archived-sources-and-scope-without-touching-editor',async()=>{
   assert.equal(requests.length,0);await fill('比较画面');await sleep(250);assert.equal(requests.length,0);
   await ask('景物与情绪怎样相连？');assert.deepEqual(requests[0],{...saved.input,question:'景物与情绪怎样相连？'});
   assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),draft);
   assert.deepEqual(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries"),[saved,version]);
   await waitFor(()=>h.evaluate("document.activeElement?.matches('.pc-saved-comparison .pc-saved-discussion__answer')"));
   assert.equal(await h.evaluate("document.querySelector('.pc-saved-comparison .pc-saved-discussion__answer').textContent.includes('DeepSeek')"),true);
 });
 await check('failure-keeps-previous-answer-and-retries-snapshot-not-unsent-question',async()=>{
   behavior='fail';await ask('请再比较语气。',false);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-saved-comparison .pc-studio-error')"));await answer('景物与情绪怎样相连？');
   assert.equal(await h.evaluate("!!document.querySelector('.pc-saved-comparison .pc-studio-status')"),false,'Failure must replace the settling spinner so retry does not move');
   const failed=structuredClone(requests.at(-1));await fill('尚未发送的草稿');behavior='ok';await clickText('.pc-saved-comparison button','重试本次研读');await answer(failed.question);assert.deepEqual(requests.at(-1),failed);
   assert.equal(await h.evaluate("document.querySelector('.pc-saved-comparison textarea').value"),'尚未发送的草稿');
 });
 await check('restore-history-without-ai-and-save-new-answer-independently',async()=>{
   const count=requests.length;await h.click('.pc-saved-comparison .pc-study-history summary');await clickText('.pc-saved-comparison .pc-study-history button','景物与情绪怎样相连？');await answer('景物与情绪怎样相连？');assert.equal(requests.length,count);
   await clickText('.pc-saved-comparison button','收藏评议');await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.length===3"));
   const stored=parseStudyArchive(await h.evaluate("localStorage.getItem('poetry-study-archive-v1')"));assert.deepEqual(stored.slice(0,2),[saved,version]);assert.deepEqual(stored[2].input,{...saved.input,question:'景物与情绪怎样相连？'});
   await h.cdp.send('Page.reload');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-study-archive')"));await h.setText(draft);await h.click('.pc-study-archive > summary');await h.click('.pc-study-archive__list button');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-saved-comparison')"));await ask('刷新后继续比较。');assert.deepEqual(requests.at(-1).scope,saved.input.scope);
 });
 await check('switching-archive-cancels-late-answer-and-revision-questions-preserve-version-intent',async()=>{
   behavior='slow';await ask('旧收藏迟到的问题',false);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-saved-comparison .pc-studio-status')"));await choose(version.title);await sleep(2800);behavior='ok';
   assert.equal(await h.evaluate("!!document.querySelector('.pc-saved-comparison .pc-saved-discussion__answer')"),false);
   assert.equal(await h.evaluate("!!document.querySelector('[aria-label=改稿对照问题]')"),true);
   assert.equal(await h.evaluate("document.querySelector('.pc-saved-comparison').textContent.includes('两首诗')"),false);
   await ask('改动是否服务于原意？');assert.deepEqual(requests.at(-1),{...version.input,question:'改动是否服务于原意？'});
   assert.equal(await h.evaluate("document.querySelector('.pc-saved-comparison .pc-saved-discussion__answer').textContent.includes('强调水路绵延')"),true);
   assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),draft);
 });
 await check('saved-comparison-controls-fit-at-320px',async()=>{
   await h.viewport(320,900,true);await h.evaluate("document.querySelector('.pc-saved-comparison').scrollIntoView({block:'start',behavior:'instant'})");assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await shot('saved-comparison-320');
 });
 assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
