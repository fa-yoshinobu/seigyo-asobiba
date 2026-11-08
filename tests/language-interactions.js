const {chromium} = require('playwright');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const missing = new Set(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      requestAnimationFrame = fn => {window.frame = fn; return 1;};
      window.t = performance.now();
      window.advance = () => {
        for (let i = 0; i < 120; i++) {t += 16.667; frame(t);}
      };
      window.labels = new Set();
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        labels.add(String(text));
        return fill.call(this, text, ...args);
      };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../apps/device-playground.html')).href + '?lang=en');
    const scan = async () => {
      await page.evaluate(() => advance());
      await page.waitForTimeout(25);
      const texts = await page.evaluate(() => {
        const out = [...labels];
        labels.clear();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
          if (!node.parentElement.closest('script,style')) out.push(node.data.trim());
        }
        return out.filter(text => /[\u3041-\u3096\u30a1-\u30fa\u4e00-\u9faf\u3005]/u.test(text));
      });
      for (const text of texts) missing.add(text);
    };
    for (let room = 0; room < 9; room++) {
      await page.locator('#rooms button').nth(room).evaluate(el => el.click());
      await scan();
      for (let pass = 0; pass < 2; pass++) {
        const count = await page.locator('#ctl button').count();
        for (let i = 0; i < count; i++) {
          const button = page.locator('#ctl button').nth(i);
          if (await button.count()) {
            await button.evaluate(el => el.click());
            await scan();
          }
        }
      }
    }
    assert.deepEqual([...missing], [], 'Japanese remains after an equipment control operation');
    assert.deepEqual(errors, []);
    console.log('PASS English equipment interactions: controls in all 9 rooms, dynamic explanations and canvas labels');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
