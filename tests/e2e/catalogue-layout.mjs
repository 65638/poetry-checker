import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {startHarness,waitFor,sleep,revision} from '../../docs/design/moonlit-ui/harness.mjs';

const out=resolve(process.argv[2]??'artifacts/catalogue-layout');
mkdirSync(out,{recursive:true});
const h=await startHarness({production:true});
const result={revision:revision(),mode:'real-library-browser',checks:[]};
try {
  for (const [width,height] of [[812,375],[900,600],[1000,600],[1440,900]]) {
    await h.load({path:'#library',width,height,reduce:true});
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')"));
    await h.evaluate("document.querySelector('.pc-library-title').scrollIntoView({block:'center',behavior:'instant'})");
    assert(await h.evaluate(`(()=>{const e=document.querySelector('.pc-library-title'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})()`),`${width}x${height}: catalogue title is not covered by the invitation`);
    await h.click('.pc-library-title');
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-library-reading')"));
    await h.evaluate("document.querySelector('.pc-library-reading button').focus()");
    for(let n=0;n<110;n++) {
      await h.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await h.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await sleep(65);
      const focus=await h.evaluate(`(()=>{const e=document.activeElement;if(e===document.body)return {visible:true};const r=e.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),upper=Math.max(0,r.top),lower=Math.min(innerHeight,r.bottom),top=right>left&&lower>upper?document.elementFromPoint((left+right)/2,(upper+lower)/2):null;return {visible:!!top&&(e.contains(top)||top.contains(e)),name:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,40),cover:top?.className};})()`);
      assert(focus.visible,`${width}x${height} at Tab ${n}: keyboard focus obscured: ${JSON.stringify(focus)}`);
    }
    writeFileSync(join(out,`reading-${width}x${height}.png`),Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    result.checks.push({width,height,keyboardSteps:110,status:'pass'});
    console.log('[PASS]',width,height,'catalogue pointer access and 110 Tab steps');
  }
} catch(error) {
  result.failure=error.stack;
  process.exitCode=1;
  console.error(error);
} finally {
  await h.stop();
  writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2));
}
