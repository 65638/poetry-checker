import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/draft-comparison');mkdirSync(out,{recursive:true});
let behavior='success'; const requests=[];
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled-test',fetcher:async(_url,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  assert.equal(input.task,'compare');
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({overview:'受控改稿对照：'+(input.revision?.intention??'比较表达'),aspects:[{name:'语气',left:'旧稿转折。',right:'新稿延续。'}]})}}]}));
}}});
app.addHook('preHandler',async(request,reply)=>{if(request.url!=='/api/v1/poetry-assistant')return;requests.push(structuredClone(request.body));if(behavior==='slow')await sleep(2500);if(behavior==='fail')return reply.code(503).send({error:{message:'受控失败，请重试。'}});});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'controlled-model-real-api-browser',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push({name,status:'pass'});console.log('[PASS]',name);};
const shot=async name=>writeFileSync(join(out,name+'.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const oldText='空山不见人，但闻人语响。\n返景入深林，复照青苔上。';
const newText='空山不见人，犹闻人语响。\n返景入深林，复照青苔上。';
const draft=text=>({text,rhymeBook:'pingshui',genreHint:'auto',formHint:'auto'});
const notebook={version:1,entries:[{id:'revision-controlled',at:'2026-10-23T10:00:00Z',before:draft(oldText),after:draft(newText),note:'受控交互测试'}]};
async function clickText(scope,label){
  await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-revision-test','yes');})()`);
  try{await h.click('[data-revision-test]');}finally{await h.evaluate("document.querySelector('[data-revision-test]')?.removeAttribute('data-revision-test')");}
}
const select=async(label,index)=>h.evaluate(`(()=>{const s=document.querySelector('[aria-label="${label}"]');s.value=s.options[${index}].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const intention=async text=>h.evaluate(`(()=>{const e=document.querySelector('[aria-label="改稿意图"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const waitAnswer=()=>waitFor(()=>h.evaluate("!!document.querySelector('.pc-draft-comparison__result')"));
try{
  await h.load({path:'#checker',reduce:true});
  await h.cdp.send('Browser.grantPermissions',{origin:new URL(h.url).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  await h.evaluate(`localStorage.setItem('poetry-notebook-v1',${JSON.stringify(JSON.stringify(notebook))})`);
  await h.cdp.send('Page.reload');await sleep(300);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-root')"));
  await h.setText(newText);
  await clickText('[role=tab]','推敲笺');
  await h.click('.pc-draft-comparison > summary');
  await check('selecting-and-describing-versions-does-not-send-AI-or-edit-the-draft',async()=>{
    await intention('保留回声');await sleep(300);assert.equal(requests.length,0);
    assert.equal(await h.evaluate("document.querySelector('[aria-label=旧稿全文]').textContent"),oldText);
    assert.equal(await h.evaluate("document.querySelector('[aria-label=新稿全文]').textContent"),newText);
    await h.click('.pc-draft-comparison__changes summary');
    assert.equal(await h.evaluate("document.querySelector('.pc-draft-comparison__changes del').textContent.includes('但闻')"),true);
    await h.click('.pc-draft-comparison button[type=submit]');await waitAnswer();
    assert.equal(requests.length,1);assert.equal(requests[0].left,oldText);assert.equal(requests[0].right,newText);assert.equal(requests[0].revision.intention,'保留回声');
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),newText);
  });
  await check('save-and-share-exact-versions-and-fit-320px',async()=>{
    await clickText('.pc-draft-comparison button','收藏评议');
    await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')??'{\"entries\":[]}').entries.length===1"));
    await clickText('.pc-draft-comparison button','复制评议');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-draft-comparison .pc-study-result-actions').textContent.includes('已复制')"));
    const copied=(await h.evaluate('navigator.clipboard.readText()')).replace(/\r\n/g,'\n');
    for(const text of [oldText,newText,'修改意图','保留回声','旧稿：旧稿转折。','不作合律判断'])assert(copied.includes(text),JSON.stringify({missing:text,copied}));
    assert(!copied.includes('inputHash'));
    await h.viewport(320,900,true);await h.evaluate("document.querySelector('.pc-draft-comparison').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await shot('revision-320');
    await h.viewport(1440,1000);
  });
  await check('same-version-disables-request-and-cache-reuses-identical-comparison',async()=>{
    await select('对照旧稿',0);assert.equal(await h.evaluate("document.querySelector('.pc-draft-comparison button[type=submit]').disabled"),true);
    await select('对照旧稿',1);await h.click('.pc-draft-comparison button[type=submit]');await waitAnswer();assert.equal(requests.length,1);
  });
  await check('retry-keeps-the-failed-version-pair-and-intent',async()=>{
    await intention('更突出声音');behavior='fail';await h.click('.pc-draft-comparison button[type=submit]');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-draft-comparison .pc-studio-error')"));
    const failed=requests.at(-1);behavior='success';await clickText('.pc-draft-comparison button','重试本次研读');await waitAnswer();assert.deepEqual(requests.at(-1),failed);
  });
  await check('changing-selection-cancels-pending-review-and-rejects-late-result',async()=>{
    behavior='slow';await intention('不应留下的旧请求');const count=requests.length;await h.click('.pc-draft-comparison button[type=submit]');
    await waitFor(()=>requests.length===count+1);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-draft-comparison .pc-task-request-preview')"));
    await select('对照旧稿',0);await sleep(2800);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-draft-comparison__result')"),false);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-draft-comparison .pc-task-request-preview')"),false);behavior='success';
  });
  await check('saved-revision-remains-readable-after-refresh-without-model-calls',async()=>{
    const count=requests.length;await h.cdp.send('Page.reload');await sleep(300);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-study-archive')"));
    await h.click('.pc-study-archive > summary');await h.click('.pc-study-archive__list button');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-study-archive__reader')"));
    const saved=await h.evaluate("document.querySelector('.pc-study-archive__reader').textContent");
    assert(saved.includes(oldText)&&saved.includes(newText)&&saved.includes('保留回声'));
    assert.equal(requests.length,count);
  });
  assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
