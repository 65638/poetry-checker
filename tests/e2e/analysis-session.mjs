import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildApp } from '../../apps/api/src/server.ts';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2] ?? 'artifacts/continuous-improvement/analysis-session');
mkdirSync(out,{recursive:true});
let modelCalls=0, analyses=0, forcedSession='';
const app=buildApp({readingAssistant:{apiKey:'controlled-test-key',fetcher:async(_url,init)=>{
  modelCalls++;
  const data=JSON.parse(JSON.parse(init.body).messages[1].content);
  const output=data.task==='critique'?{overview:'受控恢复测试的评议。',strengths:[],revisions:[]}:{suggestions:data.targets.map(t=>({tokenId:t.tokenId,candidateId:t.candidates[0].id,pronunciation:null,reason:'受控字位选择，不作语言学判断。'}))};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
}}});
app.addHook('preHandler',async request=>{if(request.url==='/api/v1/analyze') analyses++;});
app.addHook('onSend',async(request,reply,payload)=>{if(forcedSession && ['/readyz','/api/v1/analyze'].includes(request.url)) reply.header('X-Poetry-Analysis-Session',forcedSession);return payload;});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'controlled-model-real-api-stream-browser-sessionStorage',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',e=>result.errors.push(e.exceptionDetails.text));
const poem='白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。';
const key='poetry-analysis-session-v1';
let saved;
const check=async(name,run)=>{await run();result.checks.push(name);console.log('[PASS]',name);};
const reload=async()=>{await h.cdp.send('Page.reload');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-input__text')"));};
try{
  await h.load({path:'#checker',reduce:true});
  await check('completed-stream-saves-and-refresh-restores-without-any-model-call',async()=>{
    await h.setText(poem);await h.analyze();
    await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('受控恢复测试')"));
    saved=await h.evaluate(`sessionStorage.getItem(${JSON.stringify(key)})`);
    assert(saved);
    const requests=analyses, calls=modelCalls;
    await reload();
    await waitFor(()=>h.evaluate("document.body.textContent.includes('已恢复此标签页上次完成的分析') && !!document.querySelector('.pc-report')"));
    await sleep(1600);
    assert.equal(analyses,requests);assert.equal(modelCalls,calls);
    assert.equal(await h.evaluate(`sessionStorage.getItem(${JSON.stringify(key)})`),saved,'Restoration must not renew the lifetime');
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),poem);
    await h.viewport(320,900,true);
    await h.evaluate("document.querySelector('.pc-report').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    writeFileSync(join(out,'restored-320.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await h.viewport(1440,1000);
  });
  await check('explicit-analysis-still-refreshes-and-runs-automatic-critique',async()=>{
    const before=analyses,calls=modelCalls;
    await h.analyze();
    await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('受控恢复测试')"));
    assert.equal(analyses,before+1);assert(modelCalls>calls);
    assert.equal(await h.evaluate("document.body.textContent.includes('已恢复此标签页上次完成的分析')"),false);
    saved=await h.evaluate(`sessionStorage.getItem(${JSON.stringify(key)})`);
  });
  await check('changed-draft-and-damaged-cache-never-display-an-old-report',async()=>{
    await h.setText('床前明月光，疑是地上霜。');
    await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('pc-poem-draft-v1')).text==='床前明月光，疑是地上霜。'"));
    const before=analyses;
    await reload();await sleep(1000);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report')"),false);assert.equal(analyses,before);
    await h.setText(poem);
    await h.evaluate(`(() => {const saved=JSON.parse(${JSON.stringify(saved)});saved.report.inputHash='a'.repeat(64);sessionStorage.setItem(${JSON.stringify(key)},JSON.stringify(saved));})()`);
    await reload();await sleep(1000);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report')"),false);
  });
  await check('changed-service-instance-refuses-old-cache-without-clearing-draft',async()=>{
    forcedSession='99999999-1234-4234-8234-123456789abc';
    await h.evaluate(`sessionStorage.setItem(${JSON.stringify(key)},${JSON.stringify(saved)})`);
    await reload();await sleep(1000);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report')"),false);
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),poem);
  });
  await check('unavailable-session-storage-does-not-break-new-analysis',async()=>{
    await h.evaluate(`(() => {const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===${JSON.stringify(key)})throw new DOMException('controlled quota','QuotaExceededError');return set.call(this,k,v);};})()`);
    await h.analyze();
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report')"),true);
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),poem);
  });
  assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;console.error(error);process.exitCode=1;}
finally{result.analyses=analyses;result.modelCalls=modelCalls;await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2));}
