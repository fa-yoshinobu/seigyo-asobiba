const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

(async()=>{
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:/,r=>r.abort());
    await page.addInitScript(()=>{
      window.requestAnimationFrame=fn=>{window.nextFrame=fn;return 1;};
      window.clock=performance.now();
      window.advance=seconds=>{for(let i=0;i<seconds*60;i++){window.clock+=1000/60;window.nextFrame(window.clock);}};
    });
    const url=pathToFileURL(path.resolve(__dirname,'../apps/relay-elevator.html')).href;
    await page.goto(url);
    await page.evaluate(()=>advance(.1));
    assert.equal(await page.locator('#lad').getAttribute('viewBox'),'0 142 640 58');
    await page.locator('[data-f="1"]').dispatchEvent('click');
    await page.evaluate(()=>advance(1));
    let s=await page.evaluate(()=>window.__S);
    assert.equal(s.C[1],1);assert.equal(s.MCU,1);assert.equal(s.MCD,0);
    const before=s.car;
    await page.locator('#pause').dispatchEvent('click');
    await page.evaluate(()=>advance(2));
    assert.equal((await page.evaluate(()=>window.__S)).car,before);
    await page.locator('#pause').dispatchEvent('click');
    const phases=await page.evaluate(()=>{
      const seen={low:false,open:false,cleared:false};
      for(let i=0;i<180;i++){
        advance(.1);const s=window.__S;
        seen.low ||= !!s.L;seen.open ||= s.car===1&&s.door>.8;
        seen.cleared ||= s.car===1&&s.door>.8&&!s.C[1];
        if(s.MCU&&s.MCD)throw Error('Opposing contactors');
        if(s.door>.02&&(s.MCU||s.MCD))throw Error('Travel with open door');
      }return seen;
    });
    assert.deepEqual(phases,{low:true,open:true,cleared:true});
    for(const topic of ['direction','safety','travel','door','call']){
      await page.locator(`[data-topic="${topic}"]`).dispatchEvent('click');
      assert.ok(await page.locator('#guide').textContent());
      await page.locator('#guide').locator('..').screenshot({path:path.join(process.env.TEMP,`seigyo-navigation-check/elevator-${topic}.png`)});
      assert.equal(await page.locator(`[data-topic="${topic}"]`).getAttribute('aria-pressed'),'true');
    }
    await page.selectOption('#diagramMode','all');
    assert.equal(await page.locator('#lad').getAttribute('viewBox'),'0 0 640 820');
    assert.deepEqual(await page.locator('#diagramMode option').evaluateAll(options=>options.map(o=>o.value)),['focus','all']);
    assert.equal(await page.locator('#wir').count(),0);
    await page.locator('[data-topic="call"]').dispatchEvent('click');
    await page.screenshot({path:path.join(process.env.TEMP,'seigyo-navigation-check/elevator-1440.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(process.env.TEMP,'seigyo-navigation-check/elevator-390.png'),fullPage:true});
    await page.goto(url);await page.evaluate(()=>advance(.1));
    await page.locator('[data-f="2"]').dispatchEvent('click');
    await page.evaluate(()=>advance(1));
    await page.locator('[data-f="0"]').dispatchEvent('click');
    const stops=await page.evaluate(()=>{
      const floors=[];
      for(let i=0;i<400;i++){advance(.1);const s=window.__S;if(s.door>.8&&floors.at(-1)!==s.car)floors.push(s.car);}
      return floors;
    });
    assert.deepEqual(stops,[2,0]);
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    assert.equal(await page.locator('.cards>a').count(),3);
    assert.equal(await page.locator('a[href="apps/relay-elevator.html"]').count(),1);
    assert.deepEqual(errors,[]);
    console.log('PASS elevator: calls, slowdown, arrival, doors, direction order, pause, diagram modes, mobile layout, menu');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
