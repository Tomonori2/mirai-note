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
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 3 });
  assert.equal(await page.isVisible('#newsCard'), false);
  assert.deepEqual(errors, []);
  await close();
});

test('前から使っている人には「新しくなりました」が出て、筋トレの記録の画面へ飛べる', async () => {
  // 前のお知らせ（2＝運動）まで見た人にも、新しいお知らせ（3）は出る
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 2 });
  assert.ok(await page.isVisible('#newsCard'));
  assert.match(await page.textContent('#newsCard'), /筋トレの記録.*きょうの英語/);
  await page.click('#newsGo');
  assert.ok(await page.isVisible('[data-bp="menu"]'));
  assert.equal(await page.isVisible('#newsCard'), false);
  // 1回見たら、開き直しても出ない
  await page.reload();
  assert.equal(await page.isVisible('#newsCard'), false);
  assert.deepEqual(errors, []);
  await close();
});

// ---------- ホーム：その日に済んだものは、小さくたたむ ----------
test('ホーム：ならし運転をぜんぶ押すと、一覧が1行にたたまれる。「ひらく」で元にもどる', async () => {
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 3, day: [{ id: 1, text: '散歩' }, { id: 2, text: '読書' }] });
  await page.click('#habitList button.hb:has-text("散歩")');
  assert.equal(await page.isVisible('#habitDone'), false);                 // まだ1つ残っている
  await page.click('#habitList button.hb:has-text("読書")');
  assert.match(await page.textContent('#habitDone'), /きょうは 2件ぜんぶできました/);
  assert.equal(await page.locator('#habitList button.hb').count(), 0);
  assert.equal(await page.isVisible('#tiredBtn'), false);
  await page.click('#habitDone button');
  assert.equal(await page.locator('#habitList button.hb').count(), 2);
  // 1つ外すと、たたまない
  await page.click('#habitList button.hb:has-text("読書")');
  assert.equal(await page.isVisible('#habitDone'), false);
  assert.deepEqual(await page.evaluate(() => data.log[todayYmd()]), [1]);
  assert.deepEqual(errors, []);
  await close();
});

test('ホーム：ひとことは、気分を押しただけではたたまず、「保存」でたたむ。「書き直す」で入力欄がもどる', async () => {
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 3 });
  await page.click('#moodPick button >> nth=0');                            // 😄 とてもいい
  assert.ok(await page.isVisible('#diaryText'));                           // 続けて文を書けるように、開いたまま
  await page.fill('#diaryText', '朝さんぽ');
  await page.click('#diarySave');
  assert.match(await page.textContent('#diaryDone'), /😄 朝さんぽ/);
  assert.equal(await page.isVisible('#diaryText'), false);
  // 開き直しても、たたんだまま
  await page.reload();
  assert.match(await page.textContent('#diaryDone'), /😄 朝さんぽ/);
  assert.equal(await page.isVisible('#diaryText'), false);
  await page.click('#diaryDone button');
  assert.equal(await page.inputValue('#diaryText'), '朝さんぽ');
  assert.ok(await page.isVisible('#diaryText'));
  assert.deepEqual(errors, []);
  await close();
});

test('ホーム：「筋トレを記録」から、筋トレの記録の画面へ行ける', async () => {
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 3, body: { trained: { '2026-10-01': 'home' } } });
  await page.click('#homeBody button:has-text("筋トレを記録")');
  assert.ok(await page.isVisible('[data-bp="menu"]'));
  assert.ok(await page.isVisible('#liftEx'));
  assert.deepEqual(errors, []);
  await close();
});
