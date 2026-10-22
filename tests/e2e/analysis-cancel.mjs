import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness, waitFor, revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2] ?? 'artifacts/continuous-improvement/analysis-cancel');
mkdirSync(out,{recursive:true});
let hold=true, modelCalls=0, modelAborts=0;
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled-test-key',fetcher:async(_url,init)=>{
  modelCalls++;
  if(hold) await new Promise((resolve,reject)=>{
    const stop=()=>{modelAborts++;reject(new DOMException('Test request aborted','AbortError'));};
    if(init.signal.aborted) stop(); else init.signal.addEventListener('abort',stop,{once:true});
  });
  const payload=JSON.parse(JSON.parse(init.body).messages[1].content);
  const output=payload.task==='critique' ? {overview:'受控浏览器验证，非文学判断。',strengths:[],revisions:[]} : {suggestions:payload.targets.map(t=>({tokenId:t.tokenId,candidateId:t.candidates[0]?.id ?? null,pronunciation:null,reason:'受控候选归属验证。'}))};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
}}});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const results={revision:revision(),mode:'controlled-slow-model-real-http-browser',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',e=>results.errors.push(e.exceptionDetails.text));
const poem='白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。';
const check=async(name,fn)=>{await fn();results.checks.push(name);console.log('[PASS]',name);};
try{
  await h.load({path:'#checker',reduce:true});
  await check('waiting-keeps-current-poem-readable-and-fits-mobile',async()=>{
    await h.setText(poem);
    await h.click('.pc-input__submit');
    await waitFor(()=>modelCalls>0);
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-analysis-wait')"));
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-preliminary-readings')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-preliminary-readings').textContent.includes('AI 仍在结合全诗核对')"),true);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report')"),false);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-preliminary-readings__poem > p > span').length"),20);
    await h.click('.pc-analysis-wait summary');
    assert.equal(await h.evaluate("document.querySelector('.pc-analysis-wait blockquote').textContent"),poem);
    await h.click('.pc-analysis-wait summary');
    await h.viewport(320,900,true);
    await h.evaluate("document.querySelector('.pc-analysis-wait').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    writeFileSync(join(out,'waiting-320.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  });
  await check('stop-propagates-upstream-and-restores-controls-without-losing-poem',async()=>{
    await h.click('.pc-analysis-wait button');
    await waitFor(()=>h.evaluate("!document.querySelector('.pc-analysis-wait') && !document.querySelector('.pc-input__submit').disabled"));
    await waitFor(()=>modelAborts>0);
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),poem);
    assert.equal(await h.evaluate("document.body.textContent.includes('已停止本次分析')"),true);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-report')"),false);
    assert.equal(await h.evaluate("!!document.querySelector('.pc-preliminary-readings')"),false);
  });
  await check('retry-finishes-and-cancelling-rerun-preserves-completed-report',async()=>{
    hold=false;
    await h.viewport(1440,1000);
    await h.analyze();
    await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('受控浏览器验证')"));
    const text=await h.evaluate("document.querySelector('.pc-report').textContent");
    hold=true;
    await h.click('.pc-input__submit');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-analysis-wait')"));
    await h.click('.pc-analysis-wait button');
    await waitFor(()=>modelAborts>=2);
    assert.equal(await h.evaluate("document.querySelector('.pc-report').textContent"),text);
    assert.equal(await h.evaluate("document.body.textContent.includes('上次结果未更新')"),true);
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),poem);
  });
  assert.deepEqual(results.errors,[]);
}catch(error){results.failure=error.stack;console.error(error);process.exitCode=1;}
finally{results.modelCalls=modelCalls;results.modelAborts=modelAborts;await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));}
