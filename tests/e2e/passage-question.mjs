import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/passage-question');mkdirSync(out,{recursive:true});
const requests=[];let slow=false;
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled',fetcher:async(_url,init)=>{
 const input=JSON.parse(JSON.parse(init.body).messages[1].content);
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({overview:'受控段落回答：'+input.question,strengths:[],revisions:[]})}}]}));
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
async function open(title){
 await fill('[aria-label=检索诗库]','题名:'+title);
 await waitFor(()=>h.evaluate(`[...document.querySelectorAll('.pc-library-title')].some(e=>e.textContent===${JSON.stringify(title)})`));
 await h.evaluate(`(()=>{const e=[...document.querySelectorAll('.pc-library-title')].find(e=>e.textContent===${JSON.stringify(title)});e.setAttribute('data-passage-target','yes');})()`);
 await h.click('[data-passage-target]');await h.evaluate("document.querySelector('[data-passage-target]')?.removeAttribute('data-passage-target')");
 await waitFor(()=>h.evaluate(`document.querySelector('.pc-library-reading > h2')?.textContent===${JSON.stringify(title)}`));
}
try{
 await h.load({path:'#library',reduce:true});await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
 await check('paragraph-button-prepares-editable-question-with-full-short-poem-and-no-automatic-model-call',async()=>{
   const work=catalog.find(w=>w.title==='鹿柴');assert(work);await open(work.title);
   await h.click('[aria-label="询问第2段诗句"]');
   await waitFor(()=>h.evaluate("document.activeElement?.getAttribute('aria-label')==='本诗研读问题'"));
   const question=await h.evaluate("document.querySelector('.pc-library-questions textarea').value");
   assert(question.includes(work.paragraphs[1].replaceAll('\n','')));assert(question.includes('全诗'));assert.equal(requests.length,0);
   await fill('.pc-library-questions textarea',question+'请尽量具体。');
   await h.click('.pc-library-questions button[type=submit]');await waitFor(()=>h.evaluate("document.querySelector('.pc-library-literary .pc-study-prose')?.textContent.includes('受控段落回答')"));
   assert.equal(requests[0].text,work.paragraphs.join('\n'));assert.equal(requests[0].question,question+'请尽量具体。');
   assert.equal(requests[0].mode,'reading');assert.equal(await h.evaluate("document.activeElement?.matches('.pc-library-literary')"),true);
 });
 await check('long-poem-paragraph-selects-its-own-later-context-and-keeps-original-readable',async()=>{
   const work=catalog.find(w=>w.title==='长恨歌');assert(work);await open(work.title);const count=requests.length;
   await h.click(`[aria-label="询问第${work.paragraphs.length}段诗句"]`);
   await waitFor(()=>h.evaluate("Number(document.querySelector('[aria-label=研读选段]').value)>0"));
   const question=await h.evaluate("document.querySelector('.pc-library-questions textarea').value");assert(question.includes('当前选段'));
   assert(question.includes(work.paragraphs.at(-1).replaceAll('\n','')));assert.equal(requests.length,count);
   await h.click('.pc-library-questions button[type=submit]');await waitFor(()=>h.evaluate(`document.querySelector('.pc-library-literary .pc-study-prose')?.textContent===${JSON.stringify('受控段落回答：'+question)}`));
   assert(requests.at(-1).text.includes(work.paragraphs.at(-1).split('，')[0]));assert(requests.at(-1).text.length<=2000);
   assert.notEqual(requests.at(-1).text,work.paragraphs.join('\n'));
   assert.equal(await h.evaluate("document.querySelectorAll('.pc-library-character').length"),[...work.paragraphs.join('')].filter(c=>/\p{Script=Han}/u.test(c)).length);
 });
 await check('reselecting-a-paragraph-refills-question-and-busy-buttons-stay-disabled',async()=>{
   await fill('.pc-library-questions textarea','尚未发送的草稿');await h.click('[aria-label="询问第1段诗句"]');
   await waitFor(()=>h.evaluate("document.querySelector('.pc-library-questions textarea').value.includes('第1段')"));
   slow=true;await h.click('.pc-library-questions button[type=submit]');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-reading .pc-studio-status')"));
   assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-verse-ask')].every(e=>e.disabled)"),true);
   await h.click('.pc-library-reading button[aria-label=取消请求]');await sleep(2800);slow=false;
   assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-verse-ask')].every(e=>!e.disabled)"),true);
 });
 await check('changing-work-clears-seeded-question-and-mobile-controls-fit',async()=>{
   const count=requests.length;await open('静夜思');
   assert.equal(await h.evaluate("document.querySelector('.pc-library-questions textarea').value"),'');assert.equal(requests.length,count);
   await h.viewport(320,900,true);await h.click('[aria-label="询问第1段诗句"]');
   assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
   await shot('passage-question-320');
 });
 assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
