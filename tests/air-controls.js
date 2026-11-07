const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(path.resolve(__dirname,'../apps/device-playground.html')).href);
    await page.locator('#rooms button').nth(6).click();
    const singleState = on => page.waitForFunction(on =>
      document.querySelector('#solA').textContent === (on?'SOL ON':'SOL OFF') &&
      document.querySelector('#solA').getAttribute('aria-pressed') === String(on) &&
      document.querySelector('#airSolALamp').getAttribute('fill') === (on?'#ff3b2b':'#552'), on);
    await page.locator('#auto').click();
    await singleState(true);
    await singleState(false);
    await singleState(true);
    // A manual click during automatic extension switches the energized coil OFF.
    await page.locator('#solA').click();
    await singleState(false);
    assert.equal(await page.evaluate(() => window.__dbg().auto), false);

    await page.locator('#valve [data-v="double"]').click();
    const switched = await page.evaluate(async () => {
      document.querySelector('#solA').click();
      document.querySelector('#valve [data-v="single"]').click();
      document.querySelector('#solA').click();
      await new Promise(resolve => setTimeout(resolve,450));
      return window.__dbg().solA;
    });
    assert.equal(switched,true,'The old double-solenoid pulse must not switch the single solenoid OFF');
    await singleState(true);
    await page.locator('#pwr').click();
    await singleState(false);
    await page.locator('#pwr').click();
    await singleState(false);

    await page.locator('#valve [data-v="double"]').click();
    const repeated = await page.evaluate(async () => {
      document.querySelector('#solA').click();
      await new Promise(resolve => setTimeout(resolve,200));
      document.querySelector('#solB').click();
      await new Promise(resolve => setTimeout(resolve,150));
      return {a:window.__dbg().solA,b:window.__dbg().solB};
    });
    assert.deepEqual(repeated,{a:false,b:true},'An earlier pulse cannot end the newer pulse');
    await page.waitForFunction(() => !window.__dbg().solB);
    assert.deepEqual(errors,[]);
    console.log('Air controls: single auto/manual, rapid valve change, A/B pulses, power outage and restoration passed.');
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
