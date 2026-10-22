import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp} from '../../apps/api/src/server.ts';
import {startHarness,waitFor,revision} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/continuous-improvement/local-backup');
mkdirSync(out,{recursive:true});
const app=buildApp({readingAssistant:{apiKey:''}});
const baseUrl=await app.listen({host:'127.0.0.1',port:0});
const h=await startHarness({production:true,api:{baseUrl,stop:()=>app.close()}});
const results={revision:revision(),mode:'real-browser-storage-no-model',checks:[],errors:[]};
h.cdp.on('Runtime.exceptionThrown',e=>results.errors.push(e.exceptionDetails.text));
const draft=text=>({text,rhymeBook:'pingshui',genreHint:'auto',formHint:'auto'});
const oldDraft=draft('白日依山尽，黄河入海流。');
const newDraft=draft('正在写的新诗。');
const poem=id=>({id,title:id,author:'测试',dynasty:'',paragraphs:['月落山空夜未央。'],source:'浏览器受控测试',sourceUrl:null,tags:[]});
const note=id=>({id,at:'2026-10-23T01:00:00Z',before:oldDraft,after:oldDraft,note:id});
const check=async(name,fn)=>{await fn();results.checks.push(name);console.log('[PASS]',name);};
async function clickText(label){
  await h.evaluate(`(()=>{const e=[...document.querySelectorAll('.pc-backup-panel button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('missing button');e.setAttribute('data-backup-test','yes');})()`);
  try{await h.click('[data-backup-test]');}finally{await h.evaluate("document.querySelector('[data-backup-test]')?.removeAttribute('data-backup-test')");}
}
async function seed(text,identity,size){
  await h.setText(text.text);
  await waitFor(()=>h.evaluate(`document.querySelector('.pc-input__text').value===${JSON.stringify(text.text)}`));
  const local={'pc-poem-draft-v1':JSON.stringify(text),'poetry-notebook-v1':JSON.stringify({version:1,entries:[note(identity)]}),'poetry-library-favorites-v1':JSON.stringify([identity]),'poetry-reading-size':size,'unrelated-private-item':'not-part-of-export'};
  await h.evaluate(`(()=>{for(const [k,v] of Object.entries(${JSON.stringify(local)}))localStorage.setItem(k,v);return new Promise((resolve,reject)=>{const r=indexedDB.open('poetry-library',1);r.onupgradeneeded=()=>r.result.createObjectStore('corpus');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('corpus','readwrite');tx.objectStore('corpus').put(${JSON.stringify([poem(identity)])},'works');tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=reject;};r.onerror=reject;});})()`);
  await h.cdp.send('Page.reload');
  await waitFor(()=>h.evaluate(`document.querySelector('.pc-input__text')?.value===${JSON.stringify(text.text)}`));
  await h.click('.pc-backup-panel summary');
}
async function upload(path){
  const {root}=await h.cdp.send('DOM.getDocument');
  const {nodeId}=await h.cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[aria-label="选择完整备份"]'});
  await h.cdp.send('DOM.setFileInputFiles',{nodeId,files:[path]});
}
let file,backup;
try{
  await h.load({path:'#checker',reduce:true});
  await check('export-current-draft-library-favorites-and-notes-without-unrelated-data',async()=>{
    await seed(oldDraft,'backup-work','2');
    const downloads=[];
    h.cdp.on('Browser.downloadWillBegin',e=>downloads.push(e));
    await h.cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out,eventsEnabled:true});
    await clickText('导出完整备份');
    await waitFor(()=>downloads.length>0&&existsSync(join(out,downloads[0].suggestedFilename)));
    file=join(out,downloads[0].suggestedFilename);
    const raw=readFileSync(file,'utf8');backup=JSON.parse(raw);
    assert.equal(backup.works[0].id,'backup-work');
    assert.equal(JSON.parse(backup.local['pc-poem-draft-v1']).text,oldDraft.text);
    assert(!raw.includes('not-part-of-export'));
  });
  await check('preview-and-default-merge-preserve-current-draft-and-existing-records',async()=>{
    await seed(newDraft,'existing-work','0');
    await upload(file);
    await waitFor(()=>h.evaluate("document.querySelector('.pc-backup-panel').textContent.includes('文件校验通过')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-backup-panel input[type=checkbox]').checked"),false);
    await clickText('预览合并');
    await waitFor(()=>h.evaluate("document.querySelector('[aria-label=\"备份合并预览\"]')?.textContent.includes('将新增 1 篇本机诗文、1 条笺记、1 首收藏')"));
    assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-notebook-v1')).entries.length"),1);
    await clickText('确认合并');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-backup-panel').textContent.includes('合并完成')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),newDraft.text);
    assert.equal(await h.evaluate("JSON.parse(localStorage.getItem('poetry-notebook-v1')).entries.length"),2);
    assert.deepEqual(await h.evaluate("JSON.parse(localStorage.getItem('poetry-library-favorites-v1'))"),['existing-work','backup-work']);
    assert.equal(await h.evaluate("document.querySelector('.pc-workspace').dataset.readingSize"),'0');
  });
  await check('opt-in-draft-settings-restore-is-deduplicated-and-undoable',async()=>{
    await upload(file);
    await waitFor(()=>h.evaluate("document.querySelector('.pc-backup-panel').textContent.includes('文件校验通过')"));
    await h.click('.pc-backup-panel input[type=checkbox]');
    await h.click('.pc-backup-panel label:nth-of-type(2) input');
    await clickText('预览合并');
    await waitFor(()=>h.evaluate("document.querySelector('[aria-label=\"备份合并预览\"]')?.textContent.includes('将新增 0 篇本机诗文、0 条笺记、0 首收藏')"));
    await clickText('确认合并');
    await waitFor(()=>h.evaluate(`document.querySelector('.pc-input__text').value===${JSON.stringify(oldDraft.text)} && document.querySelector('.pc-workspace').dataset.readingSize==='2'`));
    await h.click('[aria-label="撤销上次修改"]');
    await waitFor(()=>h.evaluate(`document.querySelector('.pc-input__text').value===${JSON.stringify(newDraft.text)}`));
  });
  await check('tampered-backup-is-rejected-without-changing-the-draft',async()=>{
    const path=join(out,'damaged.json');writeFileSync(path,JSON.stringify({...backup,checksum:'0'.repeat(64)}));
    await upload(path);
    await waitFor(()=>h.evaluate("document.querySelector('.pc-backup-panel [role=alert]')?.textContent.includes('校验不符')"));
    assert.equal(await h.evaluate("document.querySelector('.pc-input__text').value"),newDraft.text);
    await h.viewport(320,900,true);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await h.evaluate("document.querySelector('.pc-backup-panel').scrollIntoView({block:'start',behavior:'instant'})");
    writeFileSync(join(out,'backup-320.png'),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  });
  assert.deepEqual(results.errors,[]);
}catch(error){results.failure=error.stack;process.exitCode=1;}
finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));}
