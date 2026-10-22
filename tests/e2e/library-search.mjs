import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness, waitFor, revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2] ?? 'artifacts/continuous-improvement/library-search');
mkdirSync(out,{recursive:true});
const app=buildApp({readingAssistant:{apiKey:''}});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const results={revision:revision(),mode:'real-local-corpus-no-model',checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',e=>results.errors.push(e.exceptionDetails.text));
const fill=q=>h.evaluate(`(()=>{const e=document.querySelector('[aria-label="检索诗库"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(q)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const check=async(name,fn)=>{await fn();results.checks.push(name);console.log('[PASS]',name);};
try{
  await h.load({path:'#library',reduce:true});
  await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
  await check('combined-author-and-poem-keywords',async()=>{
    await fill('作者:李白 明月');
    await waitFor(()=>h.evaluate("document.querySelectorAll('.pc-library-row').length>0 && [...document.querySelectorAll('.pc-library-row')].every(e=>e.querySelector('.pc-studio-meta').textContent.includes('李白'))"));
    assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-library-title')].some(e=>e.textContent.includes('静夜思'))"),true);
  });
  await check('field-exclusion-and-specific-title',async()=>{
    await fill('作者:李白 明月 -题名:静夜思');
    await waitFor(()=>h.evaluate("document.querySelectorAll('.pc-library-title').length>0 && [...document.querySelectorAll('.pc-library-title')].every(e=>!e.textContent.includes('静夜思'))"));
    await fill('题名:静夜思');
    await waitFor(()=>h.evaluate("document.querySelectorAll('.pc-library-title').length===1 && document.querySelector('.pc-library-title').textContent.includes('静夜思')"));
  });
  await check('discoverable-query-example-keyboard-focus-and-mobile-fit',async()=>{
    await h.click('.pc-library-query-help summary');
    await h.click('.pc-library-query-help button');
    await waitFor(()=>h.evaluate("document.querySelector('[aria-label=\"检索诗库\"]').value==='李白 明月'"));
    assert.equal(await h.evaluate("document.activeElement===document.querySelector('[aria-label=\"检索诗库\"]')"),true);
    await h.viewport(320,900,true);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    writeFileSync(join(out,'query-help-320.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  });
  assert.deepEqual(results.errors,[]);
}catch(error){results.failure=error.stack;process.exitCode=1;}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));}
