// node tests/notebook.js（smoke.js と同じ Playwright 環境で実行）
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const site = 'http://notebook.test/seigyo-asobiba/';
const relay = site + 'apps/click-relay.html';
const device = site + 'apps/device-playground.html';

async function openNotebook(browser) {
  const context = await browser.newContext();
  await context.route(site + '**', route => {
    const file = route.request().url().slice(site.length);
    return route.fulfill({ path: path.join(root, file) });
  });
  await context.route(/fonts\.google/, route => route.abort());
  return context.newPage();
}

async function exportNotes(page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '記録を書き出す' }).click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}

async function importNotes(page, data, message) {
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '記録を読み込む' }).click();
  await (await picker).setFiles({
    name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.locator('#noteStatus').getByText(message).waitFor();
  await page.waitForFunction(() => document.getElementById('noteFile').files.length === 0);
}

async function signalRoom(page) {
  await page.getByRole('button', { name: /信号の部屋/ }).click();
}

async function clearNotes(page, scope, accept) {
  const dialog = page.waitForEvent('dialog');
  const click = page.getByRole('button', { name: '記録をクリア' }).click();
  const popup = await dialog;
  const message = popup.message();
  if (accept) await popup.accept(); else await popup.dismiss();
  await click;
  assert.equal(popup.type(), 'confirm');
  assert.match(message, scope);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openNotebook(browser);
    await page.goto(relay);
    assert.equal(await page.locator('#cnt').innerText(), '0 / 29');
    assert.match(await page.locator('#notes li:not(.got)').first().innerText(), /1面/);
    assert.equal(await page.locator('.notebook-card input[type=checkbox]').count(), 0);
    await page.keyboard.down('1');
    await page.locator('#notes li.got').first().waitFor();
    await page.keyboard.up('1');
    await page.reload();
    assert.equal(await page.locator('#cnt').textContent(), '1 / 29');
    await page.locator('#backMenu').click();
    await page.locator('a[href="apps/device-playground.html"]').click();
    await signalRoom(page);
    assert.equal(await page.locator('.notes-card input[type=checkbox]').count(), 0);
    assert.equal(await page.locator('#notes li:not(.got)').filter({ hasText: '水位0%でも4mA' }).isVisible(), true);
    await page.locator('#lvl').press('Home');
    await page.locator('#notes li.got').filter({ hasText: '水位0%でも4mA' }).waitFor();
    const backup = await exportNotes(page);
    assert.deepEqual(backup.relay, ['start']);
    assert.ok(backup.device.includes('ma4'));

    // 新しいブラウザープロファイルに移し、先に獲得した別の発見も残ることを確認。
    const other = await openNotebook(browser);
    await other.goto(device);
    await signalRoom(other);
    await other.locator('#lvl').press('End');
    await other.waitForFunction(() => [...document.querySelectorAll('#notes li.got')].some(li => li.textContent.includes('20mA')));
    const previous = await exportNotes(other);
    assert.ok(previous.device.includes('ma20'));
    const relayTab = await other.context().newPage();
    await relayTab.goto(relay);
    await importNotes(other, backup, /まとめました/);
    await relayTab.locator('#notes li.got').waitFor();
    const merged = await exportNotes(relayTab);
    assert.deepEqual(merged.device, [...new Set([...previous.device, ...backup.device])].sort());
    assert.deepEqual(merged.relay, ['start']);

    await importNotes(other, backup, /まとめました/);
    await importNotes(other, { ...backup, relay: ['and'], device: '壊れたデータ' }, /読み込めません/);
    await other.reload();
    assert.deepEqual(await exportNotes(other), merged);

    await relayTab.evaluate(() => localStorage.setItem('unrelated', 'keep'));
    await clearNotes(relayTab, /カチッとリレー/, false);
    assert.deepEqual(await exportNotes(relayTab), merged);
    await clearNotes(relayTab, /カチッとリレー/, true);
    await other.waitForFunction(() => localStorage.getItem('seigyo-asobiba.note.v1.relay.start') === null);
    assert.deepEqual(await exportNotes(other), { ...merged, relay: [] });
    await relayTab.reload();
    assert.equal(await relayTab.locator('#cnt').textContent(), '0 / 29');
    assert.equal(await relayTab.evaluate(() => localStorage.getItem('unrelated')), 'keep');
    await importNotes(relayTab, merged, /まとめました/);
    await signalRoom(other);
    await other.locator('#lvl').press('Home');
    const activeDevice = await other.context().newPage();
    await activeDevice.goto(device);
    await signalRoom(activeDevice);
    await activeDevice.locator('#lvl').press('Home');
    await clearNotes(other, /機器あそび場.*全9部屋/, false);
    assert.deepEqual(await exportNotes(other), merged);
    await clearNotes(other, /機器あそび場.*全9部屋/, true);
    assert.equal(await other.locator('#notes li.got').count(), 0);
    await activeDevice.waitForFunction(() => !document.querySelector('#notes li.got'));
    assert.deepEqual(await exportNotes(activeDevice), { ...merged, device: [] });
    assert.deepEqual(await exportNotes(relayTab), { ...merged, device: [] });
    assert.deepEqual(await exportNotes(other), { ...merged, device: [] });
    await other.locator('#lvl').press('End');
    await other.locator('#notes li.got').filter({ hasText: '20mA' }).waitFor();

    const local = await openNotebook(browser);
    await local.goto(pathToFileURL(path.join(root, 'apps/click-relay.html')).href);
    await importNotes(local, merged, /まとめました/);
    await local.reload();
    assert.deepEqual(await exportNotes(local), merged);

    const blocked = await openNotebook(browser);
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('保存が無効です', 'SecurityError'); },
      });
    });
    await blocked.goto(relay);
    assert.match(await blocked.locator('#noteSaveInfo').innerText(), /自動保存できません/);
    await importNotes(blocked, merged, /まとめました/);
    assert.deepEqual(await exportNotes(blocked), merged);
    console.log('再読み込み・両教材の移行・別タブ・重複と不正ファイル・ローカルHTML・保存無効時の書き出しを確認');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
