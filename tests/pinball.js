const assert=require('node:assert/strict');
const path=require('node:path');
const {readFile}=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());
  await page.addInitScript(()=>{
   let seed=42;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
   window.requestAnimationFrame=fn=>{window.nextFrame=fn;return 1;};window.clock=performance.now();
   window.advance=seconds=>{for(let i=0;i<seconds*60;i++){window.clock+=1000/60;window.nextFrame(window.clock);}};
   window.canvasLabels=new Set();const fill=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(t,...args){window.canvasLabels.add(String(t));return fill.call(this,t,...args);};
  });
  const url=pathToFileURL(path.resolve(__dirname,'../apps/relay-pinball.html')).href;
  await page.goto(url);await page.evaluate(()=>advance(.1));assert.deepEqual(errors,[]);
  await page.locator('#start').dispatchEvent('click');await page.evaluate(()=>advance(.3));assert.equal(await page.evaluate(()=>__P.R.Q.on),1,'No start without credit');assert.equal(await page.evaluate(()=>Object.hasOwn(__P.R,'H')),false);
  await page.locator('#coin').dispatchEvent('click');await page.evaluate(()=>advance(.2));assert.equal(await page.evaluate(()=>__P.credit),1);
  await page.locator('#start').dispatchEvent('click');await page.evaluate(()=>advance(4));
  assert.equal(await page.evaluate(()=>__P.BC),1);assert.equal(await page.evaluate(()=>__P.credit),0);
  async function hold(id,seconds){const l=page.locator('#'+id);await l.evaluate(e=>e.scrollIntoView({block:'center'}));const box=await l.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.evaluate(seconds=>advance(seconds),seconds);}
  await hold('flipperL',.2);assert.equal(await page.evaluate(()=>__P.flip[0].eos),false);await page.mouse.up();
  await hold('launch',.7);await page.mouse.up();await page.evaluate(()=>advance(.4));
  assert.ok(await page.evaluate(()=>__P.ball.y<700));
  await page.locator('#pause').dispatchEvent('click');const paused=await page.evaluate(()=>JSON.stringify(__P.ball));await page.evaluate(()=>advance(1));assert.equal(await page.evaluate(()=>JSON.stringify(__P.ball)),paused);
  await page.locator('#pause').dispatchEvent('click');
  await page.locator('#auto').dispatchEvent('click');
  await page.evaluate(()=>advance(120));
  assert.ok(await page.locator('#notes .got').count()>=3,'Autoplay must earn observations');
  await page.locator('#reset').dispatchEvent('click');await page.evaluate(()=>advance(.1));
  await page.locator('#coin').dispatchEvent('click');await page.evaluate(()=>advance(.2));await page.locator('#start').dispatchEvent('click');await page.evaluate(()=>advance(4));
  for(let i=0;i<4;i++)await page.locator('#nudge').dispatchEvent('click');await page.evaluate(()=>advance(.05));
  assert.equal(await page.evaluate(()=>__P.R.TL.on),1);assert.equal(await page.evaluate(()=>!!__P.flip[0].on),false);
  await page.selectOption('[data-language]','en');await page.evaluate(()=>{canvasLabels.clear();advance(.1);});
  const missing=new Set();
  async function checkEnglish(){await page.waitForTimeout(20);for(const t of await page.evaluate(()=>{let a=[],n;const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(n=w.nextNode())if(!n.parentElement.closest('script,style,[translate="no"]')&&/[ぁ-ゖァ-ヺ一-龯々]/u.test(n.data))a.push(n.data.trim());return [...a,...[...canvasLabels].filter(x=>/[ぁ-ゖァ-ヺ一-龯々]/u.test(x))];}))missing.add(t);}
  for(let i=0;i<7;i++){await page.selectOption('#circuitGroup',String(i));await checkEnglish();}
  await page.locator('[data-v="mech"]').dispatchEvent('click');await page.evaluate(()=>advance(.1));await checkEnglish();
  await page.locator('#reset').dispatchEvent('click');await page.locator('#auto').dispatchEvent('click');
  for(let i=0;i<60;i++){await page.evaluate(()=>advance(1));await checkEnglish();}
  assert.deepEqual([...missing],[]);
  assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  const download=page.waitForEvent('download');await page.locator('#noteExport').dispatchEvent('click');
  const backup=JSON.parse(await readFile(await(await download).path(),'utf8'));assert.equal(backup.pinball.length,5);assert.ok(Array.isArray(backup.elevator));
  page.once('dialog',d=>d.dismiss());await page.locator('#noteClear').dispatchEvent('click');assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  page.once('dialog',d=>d.accept());await page.locator('#noteClear').dispatchEvent('click');await page.evaluate(()=>advance(.5));assert.equal(await page.locator('#cnt').textContent(),'0 / 5');
  const load=data=>page.locator('#noteFile').setInputFiles({name:'notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await load(backup);await page.waitForFunction(()=>document.getElementById('cnt').textContent==='5 / 5',null,{polling:50});
  await load({format:'seigyo-asobiba.notes',version:1,relay:[],device:[],elevator:[]});await page.waitForTimeout(50);assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  await load({...backup,pinball:'invalid'});await page.waitForTimeout(50);assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  await page.locator('#reset').dispatchEvent('click');
  await page.locator('#coin').dispatchEvent('click');await page.evaluate(()=>advance(.2));
  await page.locator('#start').dispatchEvent('click');await page.evaluate(()=>advance(4));
  // Put each served ball in the outhole; the actual return and game-over logic runs.
  assert.equal(await page.locator('#balls').count(),0);
  assert.equal(await page.evaluate(()=>['MA','F','prev','laneLit','N'].some(k=>Object.hasOwn(__P,k)||Object.hasOwn(__P.R,k))),false);
  for(let n=1;n<=5;n++){assert.equal(await page.evaluate(()=>__P.R.Q.on),0,'Game continues through ball five');assert.equal(await page.evaluate(()=>__P.BC),n);await page.evaluate(()=>{__P.ball.st='out';advance(4);});}
  assert.equal(await page.evaluate(()=>__P.R.Q.on),1,'Last ball must end the game');
  await hold('flipperL',.2);assert.equal(await page.evaluate(()=>!!__P.flip[0].on),false);await page.mouse.up();
  await page.locator('#coin').dispatchEvent('click');await page.evaluate(()=>advance(.2));
  await page.locator('#start').dispatchEvent('click');await page.evaluate(()=>advance(8));
  assert.equal(await page.evaluate(()=>__P.R.Q.on),0,'A new credit must allow restart');
  assert.equal(await page.evaluate(()=>__P.BC),1);
  assert.deepEqual(await page.evaluate(()=>__P.reel),[0,0,0]);
  await page.locator('#pause').dispatchEvent('click');await page.evaluate(()=>advance(.1));
  await page.screenshot({path:path.join(process.env.TEMP,'seigyo-navigation-check/pinball-en.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(process.env.TEMP,'seigyo-navigation-check/pinball-en-390.png'),fullPage:true});
  await page.selectOption('[data-language]','ja');await page.evaluate(()=>advance(.1));
  await page.locator('[data-v="lad"]').dispatchEvent('click');await page.selectOption('#circuitGroup','0');
  await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:path.join(process.env.TEMP,'seigyo-navigation-check/pinball-ja.png'),fullPage:true});
  await page.reload();await page.evaluate(()=>advance(.1));assert.equal(await page.locator('#cnt').textContent(),'5 / 5');
  assert.deepEqual(errors,[]);console.log('PASS pinball: start, launch, flippers, pause, autoplay, tilt, 5 discoveries, export/import/clear, legacy file, reload, English HTML/SVG/canvas, mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
