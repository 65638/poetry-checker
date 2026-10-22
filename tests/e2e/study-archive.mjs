import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2] ?? 'artifacts/continuous-improvement/study-archive');
mkdirSync(out,{recursive:true});
let modelCalls=0;
const app=buildApp({readingAssistant:{apiKey:'controlled-test-key',fetcher:async(_url,init)=>{
  modelCalls++;
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  const output=input.task==='critique'
    ? {overview:'受控研读收藏示例。',strengths:['原文和评议同存。'],revisions:[{startTokenId:'l1c1',endTokenId:'l1c1',original:'白',replacement:'晓',reason:'仅验证改稿后分享的原文归属。',tradeoff:'清晨与日暮不同，非真实改字建议。'}]}
    : input.task==='compare' ? {overview:'受控两诗对读。',aspects:[{name:'意象',left:'受控左诗。',right:'受控右诗。'}]}
    : {suggestions:input.targets.map(t=>({tokenId:t.tokenId,candidateId:t.candidates[0]?.id??null,pronunciation:null,reason:'受控选择。'}))};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
}}});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const results={revision:revision(),mode:'controlled-model-real-browser-storage',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',e=>results.errors.push(e.exceptionDetails.text));
const poem='白日依山尽，黄河入海流。欲穷千里目，更上一层楼。';
const check=async(name,fn)=>{await fn();results.checks.push(name);console.log('[PASS]',name);};
async function clickText(scope,label){
  await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-study-test','yes');})()`);
  try{await h.click('[data-study-test]');}finally{await h.evaluate("document.querySelector('[data-study-test]')?.removeAttribute('data-study-test')");}
}
try{
  await h.load({path:'#checker',reduce:true});
  await h.cdp.send('Browser.grantPermissions',{origin:new URL(h.url).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  await h.setText(poem);await h.analyze();
  await waitFor(()=>h.evaluate("document.querySelector('.pc-poetry-review')?.textContent.includes('受控研读收藏示例')"));
  await check('adopting-edit-does-not-relabel-the-original-analysis-when-saving-or-sharing',async()=>{
    await clickText('.pc-poetry-edit button','采纳');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-input__text').value.startsWith('晓')"));
    await clickText('.pc-poetry-review .pc-study-result-actions button','收藏评议');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-study-result-actions').textContent.includes('已收入本机')"));
    assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries[0].input.text"),poem);
    await clickText('.pc-poetry-review .pc-study-result-actions button','复制评议');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-study-result-actions').textContent.includes('已复制')"));
    const copied=await h.evaluate('navigator.clipboard.readText()');
    assert(copied.includes(poem)&&copied.includes('原因：')&&copied.includes('取舍：'));
    assert(!/inputHash|l1c1|pingshui|"task"/.test(copied));
    await clickText('.pc-poetry-review .pc-study-result-actions button','收藏评议');
    assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.length"),1);
  });
  await check('storage-failure-keeps-the-existing-archive-and-leaves-copy-available',async()=>{
    await h.evaluate("window.__studySetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='poetry-study-archive-v1')throw new DOMException('controlled quota','QuotaExceededError');return window.__studySetItem.call(this,k,v)}");
    // Remove with a failed write must preserve the already saved snapshot.
    await h.click('.pc-study-archive summary');await h.click('.pc-study-archive__list button');
    await clickText('.pc-study-archive__reader button','移除这份研读');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-study-archive').textContent.includes('空间不足')"));
    assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.length"),1);
    await h.evaluate('Storage.prototype.setItem=window.__studySetItem;delete window.__studySetItem');
  });
  await check('refresh-keeps-readable-study-without-another-model-call-and-supports-search-remove-undo',async()=>{
    const before=modelCalls;
    await h.cdp.send('Page.reload');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-study-archive summary')?.textContent.includes('1 份')"));
    await h.click('.pc-study-archive summary');
    await h.click('.pc-study-archive__list button');
    assert.equal(await h.evaluate("document.querySelector('.pc-study-archive__reader pre').textContent.includes('受控研读收藏示例')"),true);
    assert.equal(modelCalls,before);
    await h.evaluate("(()=>{const e=document.querySelector('[aria-label=\"查找研读收藏\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'不会出现的词');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await waitFor(()=>h.evaluate("document.querySelector('.pc-study-archive').textContent.includes('没有找到')"));
    await h.evaluate("(()=>{const e=document.querySelector('[aria-label=\"查找研读收藏\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await clickText('.pc-study-archive__reader button','移除这份研读');
    assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.length"),0);
    await clickText('.pc-study-archive button','撤销移除');
    assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-study-archive-v1')).entries.length"),1);
  });
  await check('download-is-readable-and-full-backup-includes-study-snapshot',async()=>{
    const downloads=[];
    h.cdp.on('Browser.downloadWillBegin',e=>downloads.push(e));
    await h.cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out,eventsEnabled:true});
    await h.click('.pc-study-archive__list button');
    await clickText('.pc-study-archive__reader button','下载这份研读');
    await waitFor(()=>downloads.length===1&&existsSync(join(out,downloads[0].suggestedFilename)));
    const text=readFileSync(join(out,downloads[0].suggestedFilename),'utf8');
    assert(text.includes(poem)&&text.includes('受控研读收藏示例'));
    await h.click('.pc-backup-panel summary');
    await clickText('.pc-backup-panel button','导出完整备份');
    await waitFor(()=>downloads.length===2&&existsSync(join(out,downloads[1].suggestedFilename)));
    const backup=JSON.parse(readFileSync(join(out,downloads[1].suggestedFilename),'utf8'));
    assert.equal(JSON.parse(backup.local['poetry-study-archive-v1']).entries[0].input.text,poem);
    await h.viewport(320,900,true);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await h.evaluate("document.querySelector('.pc-study-archive__reader').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate("(()=>{const el=document.querySelector('.pc-study-archive__reader h3'),r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})()"),true,'saved study is above the background scenery');
    writeFileSync(join(out,'study-320.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  });
  assert.deepEqual(results.errors,[]);
}catch(error){results.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));}
