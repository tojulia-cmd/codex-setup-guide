import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('@playwright/test');
} catch {
  playwright = require('../../my-first-app/node_modules/@playwright/test');
}
const root = resolve(import.meta.dirname, '..');
const artifacts = resolve(root, '.test-artifacts');
await mkdir(artifacts, { recursive: true });
const types = { '/': ['index.html', 'text/html; charset=utf-8'], '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
const server = createServer(async (request, response) => {
  const asset = types[new URL(request.url, 'http://localhost').pathname];
  if (!asset) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': asset[1] });
  response.end(await readFile(resolve(root, asset[0])));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'ru-RU', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const key = 'codex-setup-guide-progress-v1';
const check = async (name, work) => { await work(); console.log(`PASS ${name}`); };
try {
  await page.goto(url);
  await check('Ten complete chapters, unique checks and valid internal links', async () => {
    assert.equal(await page.locator('.chapter').count(), 10);
    assert.equal(await page.locator('input[data-check]').count(), 25);
    const issues = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      const checks = [...document.querySelectorAll('[data-check]')].map(element => element.dataset.check);
      return {
        duplicates: ids.filter((id, i) => ids.indexOf(id) !== i),
        duplicateChecks: checks.filter((id, i) => checks.indexOf(id) !== i),
        missing: [...document.querySelectorAll('a[href^="#"]')].filter(link => !document.getElementById(link.hash.slice(1))).map(link => link.hash),
      };
    });
    assert.deepEqual(issues, { duplicates: [], duplicateChecks: [], missing: [] });
    assert.equal(await page.locator('#count').textContent(), '0 из 25');
  });
  await check('Progress survives reload and reset requires confirmation', async () => {
    await page.locator('[data-check="editor-folder"]').check();
    await page.reload();
    assert.equal(await page.locator('[data-check="editor-folder"]').isChecked(), true);
    assert.equal(await page.locator('#count').textContent(), '1 из 25');
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#reset').click();
    assert.equal(await page.locator('#count').textContent(), '1 из 25');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#reset').click();
    await page.reload();
    assert.equal(await page.locator('#count').textContent(), '0 из 25');
  });
  await check('Copy gives exact prompt, fallback selects text', async () => {
    const snippet = page.locator('.snippet').first();
    const expected = await snippet.locator('code').textContent();
    await snippet.locator('button').click();
    await page.waitForFunction(() => document.querySelector('#message').textContent.startsWith('Скопировано'));
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Test clipboard denied'); }; });
    await snippet.locator('button').click();
    await page.waitForFunction(() => document.querySelector('#message').textContent.includes('Ctrl+C'));
    assert.equal(await page.evaluate(() => getSelection().toString()), expected);
  });
  await check('Desktop and mobile have no horizontal page overflow', async () => {
    await page.goto(url);
    await page.screenshot({ path: resolve(artifacts, 'desktop.png'), fullPage: false });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.screenshot({ path: resolve(artifacts, 'mobile.png'), fullPage: false });
    await page.locator('.toc > summary').click();
    await page.getByRole('link', { name: '09 Telegram и голос' }).click();
    assert.equal(new URL(page.url()).hash, '#telegram');
    await page.locator('.toc > summary').click();
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByRole('link', { name: '01 Редактор и Codex' }).waitFor({ state: 'visible' });
  });
  await check('Unavailable storage and malformed saved data are handled', async () => {
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Test storage denied'); }; });
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(url);
    await blockedPage.locator('[data-check="editor-folder"]').check();
    assert.match(await blockedPage.locator('#storage-note').textContent(), /Хранилище недоступно/);
    assert.equal(await blockedPage.locator('#count').textContent(), '1 из 25');
    await blocked.close();
    await page.evaluate(key => localStorage.setItem(key, '{bad json'), key);
    await page.reload();
    assert.match(await page.locator('#storage-note').textContent(), /Не удалось прочитать/);
    await page.locator('[data-check="editor-folder"]').check();
    await page.reload();
    assert.equal(await page.locator('[data-check="editor-folder"]').isChecked(), true);
  });
  await check('Entire guide is readable without JavaScript and in print', async () => {
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const plain = await noJs.newPage();
    await plain.goto(url);
    assert.equal(await plain.locator('.chapter').count(), 10);
    assert.equal(await plain.locator('#telegram-title').textContent(), 'Telegram и голосовые');
    await noJs.close();
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.rail').isVisible(), false);
    assert.equal(await page.locator('#sources-title').isVisible(), true);
  });
  assert.deepEqual(errors, []);
  console.log('PASS no JavaScript errors; isolated Edge contexts only');
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
