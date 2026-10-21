import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { startHarness, waitFor, sleep, revision } from '../../docs/design/moonlit-ui/harness.mjs';
import { parseLibraryImport } from '../../apps/web/src/app/library.ts';
import { POEMS } from '../integration/e2e/d3-acceptance-api.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/three-round-polish');
mkdirSync(out, {recursive:true});
const h = await startHarness({production:true});
const result = {revision:revision(), checks:[], errors:[]};
h.cdp.on('Runtime.exceptionThrown', e => result.errors.push(e.exceptionDetails.exception?.description ?? e.exceptionDetails.text));
const check = async (name, run) => { await run(); result.checks.push(name); console.log('[PASS]',name); };
const shot = async name => writeFileSync(join(out,name+'.png'), Buffer.from((await h.cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const go = async place => { await h.evaluate('location.hash='+JSON.stringify(place)); await waitFor(()=>h.evaluate(`document.querySelector('.pc-workspace').dataset.place===${JSON.stringify(place)} && !document.documentElement.dataset.journey`)); };
const fill = async (selector,value) => h.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const clickText = async (scope,label) => { await h.evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope)})].find(el=>el.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)}); b.click();})()`); };
const upload = async path => {const {root}=await h.cdp.send('DOM.getDocument');const {nodeId}=await h.cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.pc-library input[type=file]'});await h.cdp.send('DOM.setFileInputFiles',{nodeId,files:[path]});};
const key = async (key,code,windowsVirtualKeyCode,modifiers=0) => {for(const type of ['keyDown','keyUp'])await h.cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});};
try {
  await h.load({reduce:true});
  await check('r1-live-manuscript-measure-and-dictionary-keyboard-slips', async()=>{
    await h.setText('白日依山尽，黄河入海流。');
    assert.equal(await h.evaluate("document.querySelector('.pc-input__measure').textContent.includes('10 字 · 2 句')"),true);
    await shot('r1-checker');
    await go('dictionary');
    await h.evaluate("document.querySelector('.pc-dictionary__examples button').focus()");
    await key('ArrowRight','ArrowRight',39);
    assert.equal(await h.evaluate("document.activeElement===document.querySelectorAll('.pc-dictionary__examples button')[1]"),true);
    await fill('.pc-dictionary__input','月');
    await h.click('[aria-label="清空查字"]');
    assert.equal(await h.evaluate("document.activeElement===document.querySelector('.pc-dictionary__input') && document.activeElement.value===''"),true);
    await shot('r1-dictionary');
  });
  await check('r1-library-ime-enter-does-not-submit-and-empty-reset', async()=>{
    await go('library');
    await clickText('.pc-library-search [role=tab]','诗境');
    await fill('[aria-label="检索诗库"]','雨夜');
    let calls=0;
    const request=e=>{if(e.request.url.includes('/poetry'))calls++;};
    h.cdp.on('Network.requestWillBeSent',request);
    await h.evaluate("(()=>{const el=document.querySelector('[aria-label=\"检索诗库\"]');el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));})()");
    await key('Enter','Enter',13);
    await sleep(250);
    assert.equal(calls,0);
    await h.evaluate("document.querySelector('[aria-label=\"检索诗库\"]').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));true");
    await clickText('.pc-library-search [role=tab]','题名 / 原句');
    await fill('[aria-label="检索诗库"]','没有此标题123');
    await clickText('.pc-studio-empty button','清除筛选，重寻一卷');
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"检索诗库\"]').value"),'');
    await h.click('.pc-library-discover button');
    assert.equal(await h.evaluate("!!document.querySelector('[aria-label=\"原诗阅读\"]')"),true);
    await shot('r1-library');
  });
  await check('r1-last-favorite-on-page-two-clamps-page-and-restores-scroll',async()=>{
    const data=Array.from({length:21},(_,i)=>({title:'临时测试卷'+i,author:'浏览器测试',paragraphs:['白日依山尽，黄河入海流。'],source:'合成浏览器场景，非真实诗库'}));
    const raw=JSON.stringify(data), path=join(out,'temporary-library.json');writeFileSync(path,raw);
    const works=await parseLibraryImport(raw,'temporary-library.json');
    await upload(path);
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading').textContent.includes('24首入藏')"));
    await h.evaluate(`localStorage.setItem('poetry-library-favorites-v1',${JSON.stringify(JSON.stringify(works.map(w=>w.id)))});true`);
    await h.cdp.send('Page.reload');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading')?.textContent.includes('21首收藏')"));
    await h.click('.pc-library-filters input[type=checkbox]');
    await h.click('.pc-library-pagination [aria-label="下一页"]');
    await h.click('.pc-library-row .pc-studio-icon');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-pagination span').textContent.trim()==='1 / 1'"));
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-library-row').length"),20);
    assert.equal(await h.evaluate("document.querySelector('.pc-library-list').scrollTop"),0);
  });
  await check('r2-delayed-clipboard-feedback-cannot-label-a-new-character',async()=>{
    await go('dictionary');
    await h.click('[aria-label="查「月」字"]');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-dictionary__glyph')?.textContent==='月'"));
    await h.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>{window.__copyResolve=resolve;})}});true");
    await clickText('.pc-dictionary__actions button','复制条目');
    await waitFor(()=>h.evaluate("typeof window.__copyResolve==='function'"));
    await h.click('[aria-label="查下一个字"]');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-dictionary__glyph')?.textContent==='江'"));
    await h.evaluate("window.__copyResolve();true");
    await sleep(50);
    assert.equal(await h.evaluate("document.querySelector('.pc-dictionary__result').textContent.includes('已复制')"),false);
    await shot('r2-dictionary');
  });
  await check('r2-escape-and-hidden-region-cancel-hover-before-tooltip-opens',async()=>{
    await go('checker');
    await h.setText(POEMS.find(p=>p.id==='huanghelou').text);
    await h.analyze();
    await waitFor(()=>h.evaluate("!!document.querySelector('.pc-cell__reference')"));
    await h.evaluate("document.querySelector('.pc-cell__reference').scrollIntoView({block:'center',behavior:'instant'})");
    await sleep(80);
    const p=await h.evaluate("(()=>{const r=document.querySelector('.pc-cell__reference').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await h.mouse('mouseMoved',p.x,p.y);
    await sleep(200);
    await key('Escape','Escape',27);
    await sleep(850);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-reference__note').length"),0);
    await h.mouse('mouseMoved',1,1);
    await h.mouse('mouseMoved',p.x,p.y);
    await go('library');
    await sleep(850);
    assert.equal(await h.evaluate("document.querySelectorAll('.pc-reference__note').length"),0);
  });
  await check('r2-excerpt-carries-its-author-and-title',async()=>{
    await h.click('.pc-library-discover button');
    await h.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});true");
    await h.click('[aria-label="摘录第1段诗句"]');
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-copy-feedback').textContent.includes('此句已摘录')"));
    assert.equal(await h.evaluate("window.__copied.includes('——') && window.__copied.includes(document.querySelector('[aria-label=\"原诗阅读\"] h2').textContent)"),true);
    await shot('r2-library');
  });
  await check('r3-passage-composition-does-not-publish-intermediate-characters',async()=>{
    await go('dictionary');
    await h.click('.pc-dictionary__passage summary');
    await fill('.pc-dictionary__passage textarea','明月');
    await h.evaluate("(()=>{const el=document.querySelector('.pc-dictionary__passage textarea');el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));})()");
    await fill('.pc-dictionary__passage textarea','明月山');
    await sleep(500);
    assert.equal(await h.evaluate("document.querySelector('.pc-dictionary__character-list').textContent.includes('山')"),false);
    await h.evaluate("document.querySelector('.pc-dictionary__passage textarea').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));true");
    await waitFor(()=>h.evaluate("document.querySelector('.pc-dictionary__character-list').textContent.includes('山')"));
  });
  await check('r3-reading-light-and-page-bookmark-work-in-every-region',async()=>{
    await h.click('.pc-reading-light');
    assert.equal(await h.evaluate("document.querySelector('.pc-reading-light').getAttribute('aria-pressed')"),'true');
    assert.equal(await h.evaluate("getComputedStyle(document.querySelector('.pc-reading-shade')).opacity"),'0.32');
    for(const place of ['checker','dictionary','library']) {
      await go(place);
      for(const width of [320,375,768,1024,1440]) {
        await h.viewport(width,700,width<800);
        assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,place+' '+width);
      }
      await h.viewport(375,700,true);
      await h.evaluate("scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})");
      await waitFor(()=>h.evaluate("!document.querySelector('.pc-page-return').hidden"));
      await h.click('.pc-page-return');
      await waitFor(()=>h.evaluate('scrollY===0'));
      await shot('r3-'+place+'-mobile');
    }
    await h.click('.pc-reading-light');
    await h.viewport(1440,900);
    await shot('r3-library-desktop');
  });
  await check('r3-no-op-resize-does-not-reseed-the-weather',async()=>{
    const calls=await h.evaluate("(()=>{const old=Math.random;let calls=0;Math.random=()=>{calls++;return old();};try{window.dispatchEvent(new Event('resize'));return calls;}finally{Math.random=old;}})()");
    assert.equal(calls,0);
  });
  await check('r3-long-poem-keeps-reading-and-explains-ai-limit-on-mobile',async()=>{
    await go('library');
    const path=join(out,'long-library.json');
    writeFileSync(path,JSON.stringify([{title:'长篇排版边界样本',author:'浏览器测试',paragraphs:Array.from({length:110},()=> '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。'),source:'合成排版测试，不是真实作品'}]));
    await upload(path);
    await waitFor(()=>h.evaluate("document.querySelector('.pc-library-heading').textContent.includes('25首入藏')"));
    if(await h.evaluate("document.querySelector('.pc-library-filters input[type=checkbox]').checked"))await h.click('.pc-library-filters input[type=checkbox]');
    await fill('[aria-label="检索诗库"]','长篇排版边界样本');
    await h.click('.pc-library-title');
    await h.viewport(320,700,true);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    assert.equal(await h.evaluate("[...document.querySelectorAll('[aria-label=\"原诗阅读\"] button')].find(el=>el.textContent.trim()==='研读此诗').disabled"),true);
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"原诗阅读\"]').textContent.includes('超过2000字')"),true);
    await clickText('[aria-label="原诗阅读"] button','加入对读');
    assert.equal(await h.evaluate("document.querySelector('.pc-compare-submit').disabled"),true);
    assert.equal(await h.evaluate("document.querySelector('.pc-compare-guidance').textContent.includes('2000')"),true);
    assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
  });
  assert.deepEqual(result.errors,[]);
} catch(error) {result.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
finally {await h.stop();writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
