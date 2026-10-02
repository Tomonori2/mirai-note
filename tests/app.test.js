// アプリ全体のテスト：開ける・お知らせ
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, stopBrowser, openApp } = require('./helpers');

before(startBrowser);
after(stopBrowser);

test('はじめての人：すべてのタブがエラーなしで開ける', async () => {
  const { page, errors, close } = await openApp();
  for (const tab of ['home', 'money', 'todo', 'ai', 'day', 'body', 'set']) {
    await page.evaluate(t => document.querySelector(`nav button[data-tab="${t}"]`).click(), tab);
    assert.ok(await page.isVisible(`section#${tab}`), `${tab} が開かない`);
  }
  for (const bt of ['menu', 'rec', 'sober', 'kcal']) {
    await page.evaluate(() => document.querySelector('nav button[data-tab="body"]').click());
    await page.click(`#bodyTabs button[data-bt="${bt}"]`);
    assert.ok(await page.isVisible(`[data-bp="${bt}"]`), `からだの ${bt} が開かない`);
  }
  assert.deepEqual(errors, []);
  await close();
});

test('はじめての人には「新しくなりました」を出さない', async () => {
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 2 });
  assert.equal(await page.isVisible('#newsCard'), false);
  assert.deepEqual(errors, []);
  await close();
});

test('前から使っている人には「新しくなりました」が出て、運動の画面へ飛べる', async () => {
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 1 });
  assert.ok(await page.isVisible('#newsCard'));
  assert.match(await page.textContent('#newsCard'), /運動/);
  await page.click('#newsGo');
  assert.ok(await page.isVisible('[data-bp="kcal"]'));
  assert.equal(await page.isVisible('#newsCard'), false);
  // 1回見たら、開き直しても出ない
  await page.reload();
  assert.equal(await page.isVisible('#newsCard'), false);
  assert.deepEqual(errors, []);
  await close();
});
