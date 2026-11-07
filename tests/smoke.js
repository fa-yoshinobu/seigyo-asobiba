// 全面・全部屋を開いて、JavaScriptのエラーが出ないか確かめるテスト
// 使い方: npm i playwright && npx playwright install chromium && node tests/smoke.js
const path = require('path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const url = f => pathToFileURL(path.join(root, f)).href;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`${page.url().split('/').pop()}: ${e.message}`));
  const tap = async k => { await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); };

  // メニュー
  await page.goto(url('index.html'));
  await page.waitForTimeout(300);
  console.log('メニュー: カード', await page.locator('a.card').count(), '枚');

  // カチッとリレー:全面を開き、起動(キー1)を押す
  await page.goto(url('apps/click-relay.html'));
  await page.waitForTimeout(400);
  const [diagram, board, notes] = await Promise.all(
    ['.circuit-card', '.board-column', '.notebook-card'].map(selector => page.locator(selector).boundingBox())
  );
  assert.ok(diagram.x + diagram.width <= board.x && Math.abs(diagram.y - board.y) < 1,
    '展開接続図と制御盤が左・右に並ぶ');
  assert.ok(Math.abs(diagram.width - board.width) <= 1, '両方に同じ表示幅を確保する');
  assert.ok(notes.y >= Math.max(diagram.y + diagram.height, board.y + board.height), '発見ノートは両方の下');
  const panelWidth = () => page.locator('#panel').evaluate(svg => svg.clientWidth);
  const originalPanelWidth = await panelWidth();
  for (const [button, scale] of [['Out', 0.75], ['Out', 0.5], ['In', 0.75], ['In', 1]]) {
    await page.locator('#diagramZoom' + button).click();
    const freedWidth = diagram.width * (1 - scale);
    assert.ok(Math.abs(await panelWidth() - originalPanelWidth - freedWidth) <= 1,
      '展開接続図を縮小した幅だけ制御盤の表示が広がる');
  }
  const tabs = page.locator('nav.stages button');
  const nStage = await tabs.count();
  for (let i = 0; i < nStage; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(500);
    await tap('1');
    await page.waitForTimeout(600);
    const chips = page.locator('#pchips button');
    for (let j = 0; j < await chips.count(); j++) await chips.nth(j).click();
  }
  console.log('カチッとリレー:', nStage, '面を確認');

  // 機器あそび場:全部屋を開き、主なボタンを押す
  await page.goto(url('apps/device-playground.html'));
  await page.waitForTimeout(400);
  const rooms = page.locator('#rooms button:not([disabled])');
  const nRoom = await rooms.count();
  for (let i = 0; i < nRoom; i++) {
    await rooms.nth(i).click();
    await page.waitForTimeout(400);
    for (const id of ['#start', '#solA', '#st', '#run']) {
      if (await page.locator(id).count()) { await page.click(id).catch(() => {}); await page.waitForTimeout(800); }
    }
    await page.waitForTimeout(800);
  }
  console.log('機器あそび場:', nRoom, '部屋を確認');

  await browser.close();
  if (errors.length) { console.log('エラーあり:'); errors.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('エラーなし');
})();
