// Run with the same Playwright installation as smoke.js.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => route.abort()); // the published cache also works offline
    const local = file => pathToFileURL(path.resolve(__dirname,'..',file)).href;
    const choose = lang => page.locator('[data-language]:visible').selectOption(lang);
    const checkPicker = async () => assert.deepEqual(
      await page.locator('[data-language]:visible option').allTextContents(), ['Japanese','English']);
    await page.goto(local('index.html'));
    await checkPicker();
    await choose('en');
    assert.match(await page.locator('h2').first().innerText(),/Click! Relay/);
    await page.locator('a.card').first().click();
    await page.waitForFunction(() => document.title === 'Click! Relay');
    await checkPicker();
    assert.equal(await page.title(),'Click! Relay');
    assert.equal(await page.locator('.wrap h1').getAttribute('aria-label'),'Click! Relay');
    assert.deepEqual(await page.locator('.wrap h1 svg text').allTextContents(),['Click!','Relay']);
    const leftovers = [];
    const inspect = async selector => {
      const untranslated = await page.locator(selector).evaluateAll(els =>
        els.map(el => el.textContent.trim()).filter(text => /[ぁ-ゖァ-ヺ一-龯々]/u.test(text)));
      leftovers.push(...untranslated);
    };
    for (const tab of await page.locator('#tabs button').all()) {
      await tab.evaluate(el => el.click());
      await inspect('#panel text, #diag text, #stName, #stSub, #say, #repairStatus');
    }
    assert.match(await page.locator('#stName').textContent(),/20.*seal-in/i);
    const term = page.locator('#panel .term');
    await term.first().dispatchEvent('pointerdown');
    await term.last().dispatchEvent('pointerdown');
    assert.equal(await page.locator('#panel .wire').count(),1);
    await choose('ja');
    assert.equal(await page.title(),'カチッとリレー');
    assert.match(await page.locator('#stName').textContent(),/^20\. ゼロから/);
    assert.equal(await page.locator('#panel .wire').count(),1);
    await choose('en');
    await page.locator('#partFull').click();
    await page.waitForFunction(() => document.title === 'Inside the Components | Click! Relay');
    await checkPicker();
    assert.equal(await page.locator('#panel').count(),0);
    assert.equal(await page.title(),'Inside the Components | Click! Relay');
    const chips = await page.locator('#pchips button').all();
    assert.equal(chips.length,16);
    for (const chip of chips) {
      await chip.evaluate(el => el.click());
      await inspect('#pstruct text, #pname, #pstate, #ptext p, #pchips button');
      const clipped = await page.locator('#pstruct').evaluate(svg => {
        const view = svg.viewBox.baseVal;
        return [...svg.querySelectorAll('text')].filter(label => {
          const b = label.getBBox();
          return b.width && (b.x < view.x-1 || b.x+b.width > view.x+view.width+1);
        }).map(label => label.textContent);
      });
      assert.deepEqual(clipped,[], 'Component labels extend past the edge of the drawing');
      assert.equal(await page.locator('#ptext p').count(),3);
      if (await page.locator('#partNext').isVisible()) {
        await page.locator('#partNext').evaluate(el => el.click());
        await inspect('#pstate');
      }
    }
    await page.locator('[data-kind="relay"]').click();
    assert.match(await page.locator('#ptext').innerText(), /13–14 and 23–24 are normally open/);
    assert.ok((await page.locator('#pstruct text').allTextContents()).includes('Moving contact'));
    await choose('ja');
    assert.match(await page.locator('#ptext').innerText(), /コイルの端子/);
    await page.goto(local('apps/device-playground.html')+'?lang=en');
    await checkPicker();
    for (const room of await page.locator('#rooms button').all()) {
      await room.evaluate(el => el.click());
      await inspect('#scene text, #say, #cTitle, #notes li, #ctl button, #ctl .lbl, #prin p, #legend, .heater-reading, #normalValues');
      if (await page.locator('#measBreaker').count()) {
        await page.locator('#measBreaker').click();
        await page.locator('#dial [data-m="a"]').click();
        await inspect('#measBreaker, #say, #prin p, #normalValues');
        await page.locator('#flt').click();
        await inspect('#flt, #fltS, #guess, #say');
        await page.locator('#flt').click();
        await inspect('#flt, #fltS, #say');
      }
    }
    assert.deepEqual([...new Set(leftovers)],[], 'Japanese still displayed in English mode');
    assert.deepEqual(errors,[]);
    console.log('English verified offline: menu, panel and circuit diagrams in 20 stages, 16 component views and 9 equipment rooms.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode=1;});
