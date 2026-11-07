// node tests/part-diagrams.js（smoke.js と同じ Playwright 環境で実行）
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const url = pathToFileURL(path.resolve(__dirname, '../apps/click-relay.html')).href;
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      const chip = name => page.locator('#pchips').getByRole('button', { name, exact: true });
      const state = page.locator('#pstate');
      await chip('ブレーカー').click();
      // 手動送りで2種類の遮断と手動復帰を順番に比較できる。
      for (const label of ['通常（通電）', '過負荷で遮断', '手動復帰・再投入', '短絡で遮断']) {
        assert.equal(await state.textContent(), label);
        await page.locator('#partNext').click();
      }
      assert.equal(await state.textContent(), '通常（通電）');
      // 部品を変えても停止設定を保ち、静止図には操作ボタンを出さない。
      await chip('端子台').click();
      assert.equal(await page.locator('#partNext').isVisible(), false);
      await chip('リレー').click();
      assert.equal(await page.locator('#partPause').textContent(), '自動再生');
      await page.evaluate(() => document.fonts.ready);
      for (let i = 0; i < 2; i++) {
        const clear = await page.locator('#pstruct').evaluate(svg => {
          const label = value => [...svg.querySelectorAll('text')].find(t => t.textContent === value).getBoundingClientRect();
          const arm = label('接極子'), iron = label('（鉄片）');
          const spring = svg.querySelector('.return-spring').getBoundingClientRect();
          return arm.bottom <= iron.top && Math.max(arm.right, iron.right) < spring.left;
        });
        assert.ok(clear, width + 'pxのリレー図で接極子の注記とばねが重なる');
        await page.locator('#partNext').click();
      }
      await page.locator('#partPause').click();
      await page.waitForFunction(() => document.querySelector('#pstruct').dataset.state === '1');
      await page.locator('#partPause').click();
      assert.equal(await page.locator('#partPause').textContent(), '自動再生');

      // 6面のオフディレイを、そのまま同じHTMLの専用画面で開く。
      await page.locator('#tabs button').nth(5).click();
      await chip('タイマー').click();
      const drawing = () => page.locator('#pstruct').innerHTML();
      const offDelay = await drawing();
      await page.locator('#partFull').click();
      assert.equal(await page.locator('#panel').count(), 0);
      assert.equal(await page.locator('#partDelay').inputValue(), 'off');
      assert.equal(await drawing(), offDelay);
      await page.locator('#partDelay').selectOption('on');
      assert.notEqual(await drawing(), offDelay);
      await page.reload();
      assert.equal(await page.locator('#partDelay').inputValue(), 'on');
      await page.getByRole('link', { name: '← メニューに戻る' }).click();
      await page.getByRole('link', { name: /部品のしくみだけを見る/ }).click();
      const choices = page.locator('#pchips button');
      const names = await choices.allTextContents();
      assert.equal(names.length, 16);
      for (const name of names) {
        await chip(name).click();
        assert.equal(await page.locator('#pname').innerText(), name);
        assert.equal(await chip(name).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#ptext p').count(), 3);
        assert.ok((await drawing()).includes('<text'));
        if (await page.locator('#partNext').isVisible()) {
          await page.locator('#partNext').click();
          assert.equal(await page.locator('#pstruct').getAttribute('data-state'), '1');
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.reload();
      assert.equal(await page.locator('#pname').innerText(), names.at(-1));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('2画面幅で通常の盤、専用画面の全16部品、タイマー2種類、メニューとの往復を確認');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
