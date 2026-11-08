const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const files = ['index.html', 'apps/click-relay.html', 'apps/device-playground.html',
    'apps/relay-elevator.html', 'apps/relay-pinball.html', 'apps/relay-crane.html'];
  const checkShare = async (page, language) => {
    const url = new URL(await page.locator('.share-link').getAttribute('href'));
    assert.equal(url.origin + url.pathname, 'https://x.com/intent/tweet');
    assert.equal(url.searchParams.get('url'), 'https://learn.fa-labo.com/');
    assert.equal(url.searchParams.get('text'), language === 'en'
      ? 'Learn Controls and Electricity Through Play | FA Labo'
      : '遊んで学ぶ 制御と電気 | FA Labo');
  };
  try {
    for (const locale of ['en-US', 'en-GB', 'ja-JP']) {
      const context = await browser.newContext({locale});
      const page = await context.newPage();
      await page.route(/^https?:/, route => route.abort());
      for (const file of files) {
        await page.goto(pathToFileURL(path.resolve(__dirname, '..', file)).href);
        const expected = locale.startsWith('en') ? 'en' : 'ja';
        await page.waitForFunction(lang => window.lessonLanguage?.current === lang, expected);
        assert.equal(await page.locator('html').getAttribute('lang'), expected);
        assert.equal(await page.locator('[data-language]:visible').inputValue(), expected);
        if (file === 'index.html') await checkShare(page, expected);
      }
      await context.close();
    }
    for (const locale of ['en-US', 'ja-JP']) {
      const context = await browser.newContext({locale});
      const page = await context.newPage();
      await page.route(/^https?:/, route => route.abort());
      const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
      await page.goto(url);
      const selected = locale === 'en-US' ? 'ja' : 'en';
      await page.locator('[data-language]:visible').selectOption(selected);
      await checkShare(page, selected);
      await page.goto(url);
      assert.equal(await page.locator('html').getAttribute('lang'), selected, 'Saved choice overrides browser');
      await checkShare(page, selected);
      const override = selected === 'ja' ? 'en' : 'ja';
      await page.goto(url + '?lang=' + override);
      assert.equal(await page.locator('html').getAttribute('lang'), override, 'URL overrides saved choice');
      await checkShare(page, override);
      await page.goto(url + '?lang=invalid');
      assert.equal(await page.locator('html').getAttribute('lang'), selected, 'Invalid URL language does not override saved choice');
      await context.close();
    }
    console.log('PASS language default: all 6 pages in en-US/en-GB/ja-JP, saved choice and URL precedence');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
