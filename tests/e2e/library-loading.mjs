import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/library-loading');mkdirSync(out,{recursive:true});
let release;let fail=false;const gate=new Promise(resolve=>{release=resolve;});
const app=buildApp({readingAssistant:{apiKey:''}});
app.addHook('preHandler',async(request,reply)=>{if(request.url!=='/api/v1/library')return;await gate;if(fail)return reply.code(503).send({error:{message:'受控目录失败'}});});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'controlled-catalog-delay-real-local-browser',checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push(name);console.log('[PASS]',name);};
const fill=(value)=>h.evaluate(`(()=>{const e=document.querySelector('[aria-label=检索诗库]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
try{
 await h.load({path:'#library',clear:false,reduce:true});
 await check('slow-initial-catalog-shows-loading-without-clickable-temporary-works',async()=>{
   await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-heading')"));
   assert.equal(await h.evaluate("document.querySelectorAll('.pc-library-title').length"),0);
   assert.equal(await h.evaluate("document.querySelector('.pc-library-list').textContent.includes('载入')"),true);
   await fill('题名:静夜思');
   release();await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading').textContent.includes('2022首入藏')"));
   assert.equal(await h.evaluate("document.querySelector('[aria-label=检索诗库]').value"),'题名:静夜思');
   await waitFor(()=>h.evaluate("document.querySelector('.pc-library-title')?.textContent==='静夜思'"));
   await h.click('.pc-library-title');
   await sleep(200);assert.equal(await h.evaluate("document.querySelector('.pc-library-reading > h2').textContent"),'静夜思');
 });
 await check('catalog-failure-keeps-basic-reading-available-and-retry-loads-real-catalog',async()=>{
   fail=true;await h.cdp.send('Page.reload');
   await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('3首入藏')"));
   await h.click('.pc-library-title');assert.equal(await h.evaluate("!!document.querySelector('.pc-library-reading > h2')"),true);
   const original=await h.evaluate("document.querySelector('.pc-library-verses').textContent");
   fail=false;
   // Explicit retry belongs to the product's existing failure recovery UI.
   await h.evaluate("(()=>{const e=[...document.querySelectorAll('.pc-library button')].find(e=>e.textContent.includes('重新载入诗库'));if(!e)throw Error('missing catalog retry');e.click();})()");
   await waitFor(()=>h.evaluate("Number(document.querySelector('.pc-library-heading')?.textContent.match(/(\\d+)首入藏/)?.[1])>=2022"));
   assert.equal(await h.evaluate("document.querySelector('.pc-library-verses').textContent"),original);
 });
 assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{release();await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
