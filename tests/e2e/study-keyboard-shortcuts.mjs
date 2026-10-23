import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/study-keyboard-shortcuts');mkdirSync(out,{recursive:true});
const requests=[];let slow=false;
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled',fetcher:async(_url,init)=>{
 const input=JSON.parse(JSON.parse(init.body).messages[1].content);
 const output=input.task==='compare'?{overview:'受控快捷键对读：'+input.question,aspects:[{name:'意象',left:'受控左卷',right:'受控右卷'}]}:{overview:'受控快捷键回答：'+input.question,strengths:[],revisions:[]};
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
}}});
app.addHook('preHandler',async request=>{if(request.url!=='/api/v1/poetry-assistant')return;requests.push(structuredClone(request.body));if(slow)await sleep(2000);});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'controlled-model-real-browser-keyboard',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push({name,status:'pass'});console.log('[PASS]',name);};
const fill=async(selector,value)=>h.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.closest('details').open=true;e.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
async function key(modifiers=0,repeat=false){await h.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers,autoRepeat:repeat,text:modifiers?'':'\r'});await h.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers});}
async function clickText(scope,label){await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-keyboard-study','yes');})()`);try{await h.click('[data-keyboard-study]');}finally{await h.evaluate("document.querySelector('[data-keyboard-study]')?.removeAttribute('data-keyboard-study')");}}
try{
 await h.load({path:'#library',reduce:true});await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));await h.click('.pc-library-title');await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-questions textarea')"));
 await check('plain-enter-keeps-multiline-question-and-ctrl-enter-sends-once',async()=>{
   await fill('.pc-library-questions textarea','先谈景物');await h.evaluate("const e=document.querySelector('.pc-library-questions textarea');e.setSelectionRange(e.value.length,e.value.length)");await key();
   assert.equal(requests.length,0);assert.equal(await h.evaluate("document.querySelector('.pc-library-questions textarea').value"),'先谈景物\n');
   await fill('.pc-library-questions textarea','先谈景物\n再谈情绪');await key(2);await waitFor(()=>requests.length===1);await waitFor(()=>h.evaluate("document.querySelector('.pc-library-literary .pc-study-prose')?.textContent.includes('先谈景物')"));
   assert.equal(requests[0].question,'先谈景物\n再谈情绪');await waitFor(()=>h.evaluate("document.activeElement?.matches('.pc-library-literary')"));
 });
 await check('ime-composition-empty-and-held-shortcut-do-not-send',async()=>{
   const count=requests.length;await fill('.pc-library-questions textarea','');await key(2);assert.equal(requests.length,count);
   await fill('.pc-library-questions textarea','输入中的问题');await h.cdp.send('Input.imeSetComposition',{text:'问',selectionStart:1,selectionEnd:1});await key(2);await sleep(150);assert.equal(requests.length,count,'IME confirmation must not submit');
   await h.cdp.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});await fill('.pc-library-questions textarea','按住快捷键');await key(2,true);await sleep(150);assert.equal(requests.length,count);
 });
 await check('follow-up-shortcut-keeps-original-context-and-busy-state-prevents-another-request',async()=>{
   const count=requests.length;await fill('.pc-library-literary [aria-label=围绕回答追问]','请具体解释刚才的景物分析。');slow=true;await key(2);await waitFor(()=>requests.length===count+1);
   await fill('.pc-library-literary [aria-label=围绕回答追问]','下一题还未发送');await key(2);await sleep(250);assert.equal(requests.length,count+1);
   await waitFor(()=>h.evaluate("document.querySelector('.pc-library-literary .pc-study-prose')?.textContent.includes('请具体解释刚才')"));slow=false;
   assert.equal(requests.at(-1).text,requests[0].text);assert.equal(requests.at(-1).followUp.turns[0].question,requests[0].question);
 });
 await check('command-enter-also-submits-explicit-comparison-question',async()=>{
   await clickText('.pc-library > [role=tablist] button','对读');const count=requests.length;await fill('.pc-comparison-questions textarea','比较两首诗的情绪。');await key(4);
   await waitFor(()=>requests.length===count+1);await waitFor(()=>h.evaluate("document.querySelector('.pc-compare-overview')?.textContent.includes('受控快捷键对读')"));assert.equal(requests.at(-1).question,'比较两首诗的情绪。');
 });
 assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
