import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness, waitFor, sleep, revision} from '../../docs/design/moonlit-ui/harness.mjs';
const baseline=process.argv.includes('--baseline');
const out=resolve('artifacts/continuous-improvement/section-loading');
mkdirSync(out,{recursive:true});
const app=buildApp({readingAssistant:{apiKey:''}});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const results={revision:revision(),mode:'real-production-local-cold-cache',checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',e=>results.errors.push(e.exceptionDetails.text));
const check=async(name,fn)=>{await fn();results.checks.push(name);console.log('[PASS]',name);};
const resources=()=>h.evaluate("performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.endsWith('.js')).map(e=>({url:new URL(e.name).pathname,bytes:e.decodedBodySize,transfer:e.transferSize}))");
const fill=(selector,value)=>h.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
try{
  await h.cdp.send('Network.enable');
  await h.cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await h.load({path:'#checker',reduce:true,clear:false});
  await sleep(400);
  results.initialScripts=await resources();
  results.initialDecodedBytes=results.initialScripts.reduce((n,r)=>n+r.bytes,0);
  console.log('Initial JS bytes:',results.initialDecodedBytes);
  if(!baseline){
    await check('initial-checker-defers-unvisited-sections',async()=>{
      assert(!results.initialScripts.some(r=>/LibraryContainer|DictionaryContainer/u.test(r.url)));
      assert.equal(await h.evaluate("document.querySelector('#library-space').childElementCount"),0);
      assert.equal(await h.evaluate("document.querySelector('#dictionary-space').childElementCount"),0);
    });
    await check('visit-library-and-keep-filter-and-poem-on-return',async()=>{
      await h.click('[aria-controls="library-space"]');
      await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
      await fill('[aria-label="检索诗库"]','题名:静夜思');
      await waitFor(()=>h.evaluate("document.querySelectorAll('.pc-library-title').length===1"));
      await h.click('.pc-library-title');
      await h.click('[aria-controls="checker-space"]');
      await h.click('[aria-controls="library-space"]');
      assert.equal(await h.evaluate("document.querySelector('[aria-label=\"检索诗库\"]').value"),'题名:静夜思');
      assert.equal(await h.evaluate("document.querySelector('.pc-library-reading > h2').textContent"),'静夜思');
      results.afterLibraryScripts=await resources();
      assert(results.afterLibraryScripts.some(r=>/LibraryContainer/u.test(r.url)));
      assert(!results.afterLibraryScripts.some(r=>/DictionaryContainer/u.test(r.url)));
    });
    await check('dictionary-direct-link-loads-and-checker-input-survives-navigation',async()=>{
      await h.click('[aria-controls="checker-space"]');
      await h.setText('夜雨寄北');
      await h.evaluate("location.hash='dictionary?char=月&book=pingshui'");
      await waitFor(()=>h.evaluate("!!document.querySelector('#dictionary-space .pc-dictionary')"));
      await waitFor(()=>h.evaluate("document.querySelector('#dictionary-space')?.textContent.includes('月')"));
      await h.click('[aria-controls="checker-space"]');
      assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),'夜雨寄北');
      results.allScripts=await resources();
      assert(results.allScripts.some(r=>/DictionaryContainer/u.test(r.url)));
    });
    assert.deepEqual(results.errors,[]);
    await check('failed-section-does-not-blank-checker-and-refresh-recovers',async()=>{
      await h.evaluate("location.hash='checker'");
      await h.cdp.send('Network.setBlockedURLs',{urls:['*LibraryContainer*.js']});
      await h.cdp.send('Page.reload');
      await waitFor(()=>h.evaluate("document.querySelector('.pc-workspace')?.dataset.place==='checker'"));
      await h.setText('模块断网时，这首草稿仍保留。');
      await h.click('[aria-controls="library-space"]');
      await waitFor(()=>h.evaluate("document.querySelector('#library-space [role=alert]')?.textContent.includes('暂时未能打开')"));
      await h.click('[aria-controls="checker-space"]');
      assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),'模块断网时，这首草稿仍保留。');
      results.controlledChunkFailureExceptions=results.errors.splice(0);
      await h.cdp.send('Network.setBlockedURLs',{urls:[]});
      await h.evaluate("location.hash='library'");
      await h.cdp.send('Page.reload');
      await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
      assert.deepEqual(results.errors,[]);
    });
  }
}catch(error){results.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await h.stop();writeFileSync(join(out,baseline?'before.json':'after.json'),JSON.stringify(results,null,2));}
