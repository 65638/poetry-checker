import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {startHarness,waitFor} from '../../docs/design/moonlit-ui/harness.mjs';
const out=resolve(process.argv[2]??'artifacts/ui-print');mkdirSync(out,{recursive:true});
const h=await startHarness({production:true});
const results=[];
const visible=(s)=>h.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(s)});return !!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none';})()`);
async function shot(name){await h.cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>writeFileSync(join(out,name+'.png'),Buffer.from(r.data,'base64')));const r=await h.cdp.send('Page.printToPDF',{preferCSSPageSize:true,printBackground:false});writeFileSync(join(out,name+'.pdf'),Buffer.from(r.data,'base64'));}
async function printMedia(){await h.cdp.send('Emulation.setEmulatedMedia',{media:'print'});}
try{
 await h.load({path:'#library',width:794,height:1123,reduce:true});
 await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
 await h.click('.pc-library-title');
 const text=await h.evaluate("[...document.querySelectorAll('.pc-library-character')].map(e=>e.textContent).join('')");
 await printMedia();assert(await visible('.pc-library-verses'));assert(!await visible('.pc-library-catalogue'));
 assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-library-character')].map(e=>e.textContent).join('')"),text);
 assert(!await visible('.pc-reading-tools'));assert(!await visible('.pc-scene'));
 await shot('poem');results.push({name:'poem',originalCharacters:text.length});
 await h.cdp.send('Emulation.setEmulatedMedia',{media:'screen'});
 await h.evaluate("(()=>{const e=document.querySelector('.pc-library-query input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'长恨歌');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await waitFor(()=>h.evaluate("document.querySelector('.pc-library-title')?.textContent==='长恨歌'"));
 await h.click('.pc-library-title');
 await waitFor(()=>h.evaluate("document.querySelector('.pc-library-reading > h2')?.textContent==='长恨歌'"));
 const longText=await h.evaluate("[...document.querySelectorAll('.pc-library-character')].map(e=>e.textContent).join('')");
 await printMedia();assert.equal(longText.length,840);
 assert.equal(await h.evaluate("[...document.querySelectorAll('.pc-library-character')].map(e=>e.textContent).join('')"),longText);
 await shot('long-poem');results.push({name:'long-poem',originalCharacters:longText.length});
 await h.cdp.send('Emulation.setEmulatedMedia',{media:'screen'});
 await h.evaluate("[...document.querySelectorAll('.pc-library > [role=tablist] button')].find(e=>e.textContent==='对读').click()");
 await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-comparison')"));
 await printMedia();assert(!await visible('.pc-compare-picker'));await shot('compare');results.push({name:'compare',titles:await h.evaluate("[...document.querySelectorAll('.pc-compare-title h2')].map(e=>e.textContent)")});
 await h.load({width:794,height:1123,reduce:true});
 await h.setText('珠水云山毓秀长，甲工星火启南疆。\n博学慎思穷奥理，明辨笃行铸栋梁。\n红砖绿瓦藏经纬，铁骨钢筋写慨慷。\n三区并峙开新局，工科翘楚耀湾区。');
 await h.analyze();
 const reportText=()=>h.evaluate("[...document.querySelectorAll('.pc-cell')].map(e=>e.textContent).join('')");
 const reportBefore=await reportText();
 await printMedia();
 assert(!await visible('.pc-desk'));assert(await visible('.pc-report'));
 assert.equal(await reportText(),reportBefore);
 assert(await h.evaluate("(()=>{const e=document.querySelector('.pc-notes__body');return e.scrollHeight<=e.clientHeight+1;})()"),'Printed annotations must not be clipped by their screen scroll region');
 await shot('report');results.push({name:'report',mountedFindings:await h.evaluate("document.querySelectorAll('.pc-findings > li').length")});
 await h.cdp.send('Emulation.setEmulatedMedia',{media:'screen'});await h.setText('床前明月光，疑是地上霜。');await printMedia();
 assert(await visible('.pc-stale'));assert.equal(await reportText(),reportBefore);
 await shot('stale-report');results.push({name:'stale-report',staleLabelPreserved:true});
 await h.cdp.send('Emulation.setEmulatedMedia',{media:'screen'});
 assert(await visible('.pc-desk'));assert(await visible('.pc-reading-tools'));
 results.push({screenRestored:true});
}finally{await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));

