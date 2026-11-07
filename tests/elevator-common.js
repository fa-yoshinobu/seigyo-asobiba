const assert=require('node:assert/strict');
const path=require('node:path');
const {readFile}=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext();
  const page=await context.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());
  await page.addInitScript(()=>{
   window.requestAnimationFrame=fn=>{window.nextFrame=fn;return 1;};
   window.clock=performance.now();
   window.advance=seconds=>{for(let i=0;i<seconds*60;i++){window.clock+=1000/60;window.nextFrame(window.clock);}};
  });
  const url=pathToFileURL(path.resolve(__dirname,'../apps/relay-elevator.html')).href;
  await page.goto(url);await page.evaluate(()=>advance(.1));
  assert.equal(await page.locator('#cnt').textContent(),'0 / 5');
  await page.locator('[data-f="1"]').dispatchEvent('click');
  await page.locator('[data-f="2"]').dispatchEvent('click');
  await page.evaluate(()=>advance(1));
  await page.locator('[data-f="0"]').dispatchEvent('click');
  await page.evaluate(()=>advance(40));
  assert.equal(await page.locator('#cnt').textContent(),'5 / 5','All observations must be achievable through normal operation');
  await page.reload();await page.evaluate(()=>advance(.1));
  assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  const download=page.waitForEvent('download');await page.locator('#noteExport').click();
  const backup=JSON.parse(await readFile(await(await download).path(),'utf8'));
  assert.equal(backup.elevator.length,5);assert.ok(Array.isArray(backup.relay)&&Array.isArray(backup.device));
  page.once('dialog',d=>d.dismiss());await page.locator('#noteClear').click();
  assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  page.once('dialog',d=>d.accept());await page.locator('#noteClear').click();
  await page.evaluate(()=>advance(5));assert.equal(await page.locator('#cnt').textContent(),'0 / 5');
  const load=data=>page.locator('#noteFile').setInputFiles({name:'notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await load(backup);await page.waitForFunction(()=>document.getElementById('cnt').textContent==='5 / 5');
  await load({format:'seigyo-asobiba.notes',version:1,relay:[],device:[]});
  await page.waitForFunction(()=>document.getElementById('noteStatus').textContent.includes('まとめました'));
  assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  await load({...backup,elevator:['<script>']});
  await page.waitForFunction(()=>document.getElementById('noteStatus').textContent.includes('読み込めません'));
  assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  await page.locator('#diagramZoomIn').click();assert.equal(await page.locator('#diagramZoom').textContent(),'110%');
  await page.locator('#diagramZoomOut').click();assert.equal(await page.locator('#diagramZoom').textContent(),'100%');
  await page.locator('#diagramGrow').click();assert.equal(await page.locator('#circuitDiagram').evaluate(e=>e.style.maxHeight),'none');
  await page.locator('#diagramShrink').click();assert.equal(await page.locator('#circuitDiagram').evaluate(e=>e.style.maxHeight),'300px');
  await page.locator('[data-f="2"]').dispatchEvent('click');await page.evaluate(()=>advance(1));
  await page.locator('#reset').click();
  assert.equal(await page.evaluate(()=>__S.car),0);assert.deepEqual(await page.evaluate(()=>__S.C),[0,0,0]);
  assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  await page.selectOption('[data-language]','en');await page.evaluate(()=>advance(.1));
  const checkEnglish=async()=>{
   await page.waitForTimeout(30);
   const missing=await page.evaluate(()=>{
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const out=[];let n;
    while(n=w.nextNode())if(!n.parentElement.closest('script,style,[translate="no"]')&&/[ぁ-ゖァ-ヺ一-龯々]/u.test(n.data))out.push(n.data.trim());
    return out;
   });assert.deepEqual(missing,[]);
  };
  for(const topic of ['call','direction','safety','travel','door']){await page.locator(`[data-topic="${topic}"]`).click();await checkEnglish();}
  await page.locator('[data-f="2"]').dispatchEvent('click');await page.evaluate(()=>advance(1));
  await page.locator('[data-f="0"]').dispatchEvent('click');
  for(let i=0;i<80;i++){await page.evaluate(()=>advance(.5));await checkEnglish();}
  await page.locator('#reset').click();await page.evaluate(()=>advance(.1));await checkEnglish();
  const state=await page.evaluate(()=>JSON.stringify(__S));
  await page.selectOption('[data-language]','ja');
  await page.evaluate(()=>advance(.1));assert.equal(await page.locator('#pause').textContent(),'一時停止');
  await page.selectOption('[data-language]','en');await page.evaluate(()=>advance(.1));
  assert.equal(await page.evaluate(()=>JSON.stringify(__S)),state);
  await page.screenshot({path:path.join(process.env.TEMP,'seigyo-navigation-check/elevator-common-en.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await checkEnglish();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(process.env.TEMP,'seigyo-navigation-check/elevator-common-en-390.png'),fullPage:true});
  await page.locator('a[href*="../index.html"]').click();
  await page.waitForFunction(()=>window.lessonLanguage?.current==='en',null,{polling:50});
  assert.ok(page.url().includes('lang=en'));assert.equal(await page.locator('[data-language]').inputValue(),'en');
  await page.locator('a[href*="apps/relay-elevator.html"]').click();
  await page.waitForLoadState('load');
  await page.waitForFunction(()=>typeof window.nextFrame==='function'&&window.__S&&window.lessonLanguage?.current==='en',null,{polling:50});
  await page.evaluate(()=>advance(.1));
  assert.equal(await page.locator('[data-language]').inputValue(),'en');await checkEnglish();
  assert.deepEqual(errors,[]);
  console.log('PASS elevator common: all 5 discoveries, persistence, export/import, legacy files, clear confirmation, reset, zoom, height, English runtime, language round-trip, mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
