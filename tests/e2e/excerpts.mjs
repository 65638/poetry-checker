import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness, waitFor, revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2] ?? 'artifacts/continuous-improvement/excerpts');
mkdirSync(out,{recursive:true});
const app=buildApp({readingAssistant:{apiKey:''}});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const results={revision:revision(),mode:'real-local-corpus-no-model',checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',e=>results.errors.push(e.exceptionDetails.text));
const check=async(name,fn)=>{await fn();results.checks.push(name);console.log('[PASS]',name);};
async function clickText(scope,label){
  await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing button');e.dataset.excerptTarget='yes';})()`);
  try{await h.click('[data-excerpt-target="yes"]');}
  finally{await h.evaluate("document.querySelector('[data-excerpt-target]')?.removeAttribute('data-excerpt-target')");}
}
const fill=(selector,value,tag='HTMLInputElement')=>h.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const stored=()=>h.evaluate("JSON.parse(localStorage.getItem('poetry-excerpts-v1')).entries");
let entry;
try{
  await h.load({path:'#library',reduce:true});
  await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-title')"));
  await h.cdp.send('Browser.grantPermissions',{origin:new URL(h.url).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  await check('collect-exact-paragraph-and-deduplicate',async()=>{
    await h.click('.pc-library-title');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-reading')"));
    await clickText('.pc-library-reading button','摘句');
    await waitFor(async()=> (await stored()).length===1);
    entry=(await stored())[0];
    assert(entry.text.length>0 && entry.title.length>0);
    await waitFor(()=>h.evaluate("[...document.querySelectorAll('.pc-library-reading button')].some(e=>e.textContent.trim()==='已摘')"));
    await clickText('.pc-library-reading button','已摘');
    assert.equal((await stored()).length,1);
    await clickText('[role=tab]','摘句');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-excerpt-entry')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-excerpt-entry blockquote').textContent"),entry.text);
  });
  await check('save-note-reload-search-and-private-sharing',async()=>{
    await fill('.pc-excerpt-entry textarea','我的私人随手记','HTMLTextAreaElement');
    await clickText('[role=tab]','诗库');
    await clickText('[role=tab]','摘句');
    assert.equal(await h.evaluate("document.querySelector('.pc-excerpt-entry textarea').value"),'我的私人随手记');
    await clickText('.pc-excerpt-entry button','保存随手记');
    assert.equal((await stored())[0].note,'我的私人随手记');
    await h.cdp.send('Page.reload');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-title')"));
    await clickText('[role=tab]','摘句');
    assert.equal(await h.evaluate("document.querySelector('.pc-excerpt-entry textarea').value"),'我的私人随手记');
    await fill('[aria-label="查找摘句"]','私人');
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-excerpt-entry').length"),1);
    await clickText('.pc-excerpt-entry button','复制诗句');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-excerpt-notebook').textContent.includes('诗句已复制')"));
    const copied=await h.evaluate('navigator.clipboard.readText()');
    assert(copied.includes(entry.text) && copied.includes(entry.title) && !copied.includes('私人'));
  });
  await check('return-to-original-remove-and-undo',async()=>{
    await clickText('.pc-excerpt-entry button','回原诗');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-reading')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-library-reading > h2').textContent"),entry.title);
    await clickText('[role=tab]','摘句');
    await clickText('.pc-excerpt-entry button','移除');
    assert.equal((await stored()).length,0);
    await clickText('.pc-excerpt-notebook button','撤销移除');
    assert.equal((await stored())[0].note,'我的私人随手记');
  });
  await check('missing-edition-retains-text-and-320px-fit',async()=>{
    await h.evaluate("(()=>{const a=JSON.parse(localStorage.getItem('poetry-excerpts-v1'));a.entries[0].workId='missing-edition';localStorage.setItem('poetry-excerpts-v1',JSON.stringify(a));window.dispatchEvent(new StorageEvent('storage',{key:'poetry-excerpts-v1'}));})()");
    await waitFor(()=>h.evaluate("document.querySelector('.pc-excerpt-entry').textContent.includes('没有匹配的原诗版本')"));
    assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-excerpt-entry button')].find(e=>e.textContent==='回原诗').disabled"),true);
    await h.viewport(320,900,true);
    await h.evaluate("document.querySelector('.pc-excerpt-notebook').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    writeFileSync(join(out,'excerpts-320.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  });
  assert.deepEqual(results.errors,[]);
}catch(error){results.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));}
