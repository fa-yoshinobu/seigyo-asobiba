// Run with the same Playwright installation as smoke.js.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route(/^https?:/, route => route.abort());
    // Isolate label layout from animation and physics.
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    const check = async (id, labels) => {
      const measurements = [];
      for (const label of labels) {
        await page.locator('#' + id).evaluate((button, text) => {
          button.textContent = window.lessonLanguage.text(text);
        }, label);
        measurements.push(await page.locator('#' + id).evaluate(button => {
          const parent = button.parentElement, base = parent.getBoundingClientRect();
          return [...parent.children].filter(e => e.getClientRects().length).map(e => {
            const r = e.getBoundingClientRect();
            return [r.x-base.x, r.y-base.y, r.width, r.height].map(v => Math.round(v*100)/100);
          });
        }));
      }
      for (const result of measurements) assert.deepEqual(result, measurements[0], id + ': label changes move controls');
      assert.ok(await page.locator('#'+id).evaluate(e => e.scrollWidth <= e.clientWidth+1), id+': clipped text');
    };
    for (const width of [1440, 390, 320]) for (const lang of ['ja','en']) {
      await page.setViewportSize({width, height:1000});
      const open = file => page.goto(pathToFileURL(path.resolve(__dirname,'..',file)).href+'?lang='+lang);
      const room = i => page.locator('#rooms button').nth(i).evaluate(e => e.click());
      await open('apps/device-playground.html');
      await check('lid',['ふたを開ける','ふたを閉める']);
      await check('drain',['水を抜く','排水を止める']);
      await page.locator('#outDev [data-v="ssr"]').evaluate(e=>e.click());
      await check('hs',['放熱板を外す','放熱板を付ける']);
      await room(1);
      await check('brk',['ブレーカーを切る','ブレーカーを入れる']);
      await page.locator('#meth [data-v="sd"]').evaluate(e=>e.click());
      await check('ilk',['インターロックを外す','インターロックを戻す']);
      await room(2);
      await check('measBreaker',['ブレーカーを切る','ブレーカーを入れる']);
      await check('flt',['故障探しをONにする','故障探しをOFFにする']);
      await room(3);
      await check('r250',['250Ωを外す','250Ωをつける']);
      await room(4);
      await check('run',['入','切']);
      await check('touch',['人が外箱にさわる','手を離す']);
      await room(8);
      await check('wirePower',['切る','入れる']);
      await check('cam',['カメラで見る','カメラを外す']);
      await open('apps/click-relay.html');
      await check('snd',['音 ON','音 OFF']);
      await check('reset',['お手本に戻す','配線直しをやり直す','盤の配線をすべて外す']);
      await page.locator('#partFull').evaluate(e=>e.click());
      await page.locator('#partPause').waitFor({state:'visible'});
      await check('partPause',['一時停止','自動再生']);
      console.log('Stable button layout: '+width+'px / '+lang);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
