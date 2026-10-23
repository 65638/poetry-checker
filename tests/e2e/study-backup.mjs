import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {PoetryAssistantRequestSchema} from '@poetry/contracts';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';
import {createStudyEntry,studyArchive,parseStudyArchive} from '../../apps/web/src/app/studyArchive.ts';
import {buildStudyFollowUp} from '../../apps/web/src/app/followUpRequest.ts';
import {makeLocalBackup,parseLocalBackup} from '../../apps/web/src/app/localBackup.ts';

const out=resolve(process.argv[2]??'artifacts/study-backup');mkdirSync(out,{recursive:true});
const key='poetry-study-archive-v1';
const base=PoetryAssistantRequestSchema.parse({task:'critique',text:'空山不见人，但闻人语响。',rhymeBook:'pingshui',direction:'imagery',mode:'reading'});
const response=(input,overview)=>({task:input.task,provider:'deepseek',model:'controlled',notice:'受控备份测试',inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),result:input.task==='critique'?{overview,strengths:[],revisions:[]}:{overview,aspects:[{name:'语气',left:'原来转折。',right:'现在延续。'}]}});
const previous=createStudyEntry(base,response(base,'受控旧回答。'),'原收藏');
const follow=buildStudyFollowUp(base,response(base,'受控旧回答。'),'请接着解释。');
const conversation=createStudyEntry(follow,response(follow,'受控接续回答。'),'带追问的收藏');
const comparison=PoetryAssistantRequestSchema.parse({task:'compare',left:base.text,right:base.text.replace('但闻','犹闻'),revision:{beforeLabel:'初稿',afterLabel:'二稿',intention:'保留声音的延续'}});
const version=createStudyEntry(comparison,response(comparison,'受控版本比较。'),'两版修改记录');
const records=new Map([[key,JSON.stringify(studyArchive([conversation,version]))]]);
const backup=await makeLocalBackup({storage:{getItem:name=>records.get(name)??null,setItem:()=>{},removeItem:()=>{}},readWorks:async()=>[],writeWorks:async()=>{}});
const file=join(out,'controlled-full-study-backup.json');writeFileSync(file,JSON.stringify(backup));
const requests=[];
const app=buildApp({readingAssistant:{provider:'deepseek',apiKey:'controlled-test',fetcher:async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({overview:'恢复后仍可继续。'+input.question,strengths:[],revisions:[]})}}]}));}}});
app.addHook('preHandler',async request=>{if(request.url==='/api/v1/poetry-assistant')requests.push(structuredClone(request.body));});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const result={revision:revision(),mode:'real-browser-backup-restore-controlled-model',realModelInference:false,checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',event=>result.errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
const check=async(name,run)=>{await run();result.checks.push({name,status:'pass'});console.log('[PASS]',name);};
async function clickText(scope,label){await h.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-backup-study','yes');})()`);try{await h.click('[data-backup-study]');}finally{await h.evaluate("document.querySelector('[data-backup-study]')?.removeAttribute('data-backup-study')");}}
async function upload(path){const {root}=await h.cdp.send('DOM.getDocument');const {nodeId}=await h.cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[aria-label="选择完整备份"]'});await h.cdp.send('DOM.setFileInputFiles',{nodeId,files:[path]});}
async function choose(title){await h.evaluate(`[...document.querySelectorAll('.pc-study-archive__list button')].find(e=>e.querySelector('strong').textContent===${JSON.stringify(title)}).click()`);await waitFor(()=>h.evaluate(`document.querySelector('.pc-study-archive__reader > h3')?.textContent===${JSON.stringify(title)}`));}
try{
 await h.load({path:'#checker',reduce:true});await h.evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(studyArchive([previous])))})`);await h.cdp.send('Page.reload');await sleep(300);await waitFor(()=>h.evaluate("!!document.querySelector('.pc-backup-panel')"));await h.setText('当前编辑草稿，不能被旧收藏替换。');await waitFor(()=>h.evaluate("JSON.parse(localStorage.getItem('pc-poem-draft-v1')??'{}').text==='当前编辑草稿，不能被旧收藏替换。'"));await h.click('.pc-backup-panel > summary');
 await check('data-change-after-preview-invalidates-confirmation-without-overwriting-new-data',async()=>{
   await upload(file);await waitFor(()=>h.evaluate("document.querySelector('.pc-backup-panel').textContent.includes('文件校验通过')"));await clickText('.pc-backup-panel button','预览合并');await waitFor(()=>h.evaluate("!!document.querySelector('[aria-label=备份合并预览]')"));
   await h.evaluate("localStorage.setItem('poetry-reading-size','1')");await clickText('.pc-backup-panel button','确认合并');await waitFor(()=>h.evaluate("document.querySelector('.pc-backup-panel [role=alert]')?.textContent.includes('重新预览')"));
   assert.equal(await h.evaluate("!!document.querySelector('[aria-label=备份合并预览]')"),false);assert.equal(await h.evaluate("localStorage.getItem('poetry-reading-size')"),'1');assert.deepEqual(await h.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).entries`),[previous]);
 });
 await check('full-backup-restores-follow-up-and-revision-snapshots-without-replacing-current-draft',async()=>{
   await upload(file);await waitFor(()=>h.evaluate("document.querySelector('.pc-backup-panel').textContent.includes('文件校验通过')"));await clickText('.pc-backup-panel button','预览合并');await waitFor(()=>h.evaluate("!!document.querySelector('[aria-label=备份合并预览]')"));await clickText('.pc-backup-panel button','确认合并');await waitFor(()=>h.evaluate("document.querySelector('.pc-backup-panel').textContent.includes('合并完成')"));
   const stored=await h.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).entries`);assert.deepEqual(stored,[previous,conversation,version]);assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),'当前编辑草稿，不能被旧收藏替换。');assert.equal(requests.length,0);
   await h.click('.pc-study-archive > summary');await choose(version.title);const text=await h.evaluate("document.querySelector('.pc-study-archive__reader pre').textContent");assert(text.includes(comparison.left)&&text.includes(comparison.right)&&text.includes(comparison.revision.intention));assert.equal(await h.evaluate("!!document.querySelector('.pc-saved-discussion')"),false);
 });
 await check('restored-conversation-resumes-with-its-full-history-and-saves-an-independent-answer',async()=>{
   await choose(conversation.title);await h.click('.pc-saved-discussion .pc-study-follow-up > summary');await h.evaluate("(()=>{const e=document.querySelector('.pc-saved-discussion textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'恢复后请继续。');e.dispatchEvent(new Event('input',{bubbles:true}));})()");await h.click('.pc-saved-discussion button[type=submit]');await waitFor(()=>h.evaluate("document.querySelector('.pc-saved-discussion__answer .pc-study-prose')?.textContent.includes('恢复后仍可继续')"));assert.equal(requests.length,1);assert.equal(requests[0].text,base.text);assert.equal(requests[0].followUp.turns.length,2);assert.equal(requests[0].followUp.turns[1].answer,'受控接续回答。');await clickText('.pc-saved-discussion button','收藏评议');await waitFor(()=>h.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).entries.length===4`));
 });
 await check('export-roundtrip-retains-all-discussions-and-version-labels',async()=>{
   const downloads=[];h.cdp.on('Browser.downloadWillBegin',event=>downloads.push(event));await h.cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out,eventsEnabled:true});await clickText('.pc-backup-panel button','导出完整备份');await waitFor(()=>downloads.length>0&&existsSync(join(out,downloads[0].suggestedFilename)));
   const exported=await parseLocalBackup(readFileSync(join(out,downloads[0].suggestedFilename),'utf8'));const entries=parseStudyArchive(exported.local[key]);assert.equal(entries.length,4);assert.deepEqual(entries[2],version);assert.equal(entries[3].input.followUp.turns.length,2);assert.equal(requests.length,1);
 });
 assert.deepEqual(result.errors,[]);
}catch(error){result.failure=error.stack;result.visible=await h.evaluate("document.querySelector('.pc-backup-panel')?.textContent");process.exitCode=1;}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
