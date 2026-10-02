// ホームの「🇬🇧 きょうの英語」（毎日10分 英会話とつなぐ）のテスト
// テスト用の英会話アプリ（fixtures/eigo-kaiwa.html）には6文：p0 Sorry? / p1 Could you say that again? / p2 I'm Ken. /
// p3 Nice to meet you. / p4 That's "great"! / p5 I'll call someone who speaks English.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, stopBrowser, openApp } = require('./helpers');

before(startBrowser);
after(stopBrowser);

const user = { welcomed: true, seenNews: 2 };
// 英会話アプリの文が読みこまれて、カードに英語が出るまで待つ
const english = async page => { await page.waitForSelector('#homeEng [lang="en"]'); return page.textContent('#homeEng [lang="en"]'); };

test('英会話アプリをまだ使っていない人：最初に習う文から1つ出し、日本語はたたんでおく', async () => {
  const { page, errors, close } = await openApp(user);
  const en = await english(page);
  assert.ok(['Sorry?', 'Could you say that again?', "I'm Ken.", 'Nice to meet you.', 'That\'s "great"!'].includes(en), en);
  const box = await page.textContent('#homeEng');
  assert.match(box, /英会話アプリで最初に習う文から/);
  assert.match(box, /英会話アプリで練習すると、つづけた日数/);
  assert.equal(await page.isVisible('#homeEng details > div'), false);   // 日本語は押すまで見えない
  await page.click('#homeEng summary');
  assert.equal(await page.isVisible('#homeEng details > div'), true);
  assert.deepEqual(errors, []);
  await close();
});

test('復習の日が来た文があれば、その中から出す。つづけた日数・復習・覚えた数も出る', async () => {
  // きょうは 2026-10-02。p1 は復習の日が来ている、p3 はまだ先（覚えた＝レベル3以上）
  const { page, errors, close } = await openApp(user, {
    prog: { p1: { lv: 2, due: '2026-10-01' }, p3: { lv: 4, due: '2026-10-20' } },
    study: { last: '2026-10-01', streak: 4, days: 10 },
  });
  assert.equal(await english(page), 'Could you say that again?');
  const box = await page.textContent('#homeEng');
  assert.match(box, /きょうの復習の文から/);
  assert.match(box, /きょうの英会話はまだです/);
  assert.match(box, /🔥 4日つづけて/);
  assert.match(box, /復習 1文/);
  assert.match(box, /覚えた 1\/6文/);
  assert.deepEqual(errors, []);
  await close();
});

test('2日以上あいていたら、つづけた日数は出さない。きょうやっていれば「やりました」', async () => {
  const a = await openApp(user, { prog: { p0: { lv: 1, due: '2026-10-05' } }, study: { last: '2026-09-29', streak: 7 } });
  await english(a.page);
  assert.doesNotMatch(await a.page.textContent('#homeEng'), /つづけて/);
  assert.match(await a.page.textContent('#homeEng'), /これまでに習った文から/);
  await a.close();
  const b = await openApp(user, { prog: { p0: { lv: 1, due: '2026-10-05' } }, study: { last: '2026-10-02', streak: 8 } });
  await english(b.page);
  assert.match(await b.page.textContent('#homeEng'), /✓ きょうの英会話はやりました.*🔥 8日つづけて/);
  assert.deepEqual([...a.errors, ...b.errors], []);
  await b.close();
});

test('英会話アプリで決めた名前に置きかえる。記号の入った文も正しく読める', async () => {
  const a = await openApp(user, { prog: { p2: { lv: 1, due: '2026-10-01' } }, settings: { name: 'Tomo' } });
  assert.equal(await english(a.page), "I'm Tomo.");
  await a.close();
  const b = await openApp(user, { prog: { p4: { lv: 1, due: '2026-10-01' } } });
  assert.equal(await english(b.page), 'That\'s "great"!');
  await b.page.click('#homeEng summary');
  assert.match(await b.page.textContent('#homeEng details'), /それはすごい！.*💡 気持ちをこめて。/);
  assert.deepEqual([...a.errors, ...b.errors], []);
  await b.close();
});

test('1日の中では同じ文のまま（英会話アプリで復習を進めても変わらない）', async () => {
  const { page, errors, close } = await openApp(user, { prog: { p1: { lv: 2, due: '2026-10-01' }, p5: { lv: 2, due: '2026-10-01' } } });
  const first = await english(page);
  // 英会話アプリで2つとも復習した（次は先の日に）
  await page.evaluate(() => localStorage.setItem('ek_prog', JSON.stringify({ p1: { lv: 3, due: '2026-10-09' }, p5: { lv: 3, due: '2026-10-09' }, p0: { lv: 1, due: '2026-10-02' } })));
  await page.reload();
  assert.equal(await english(page), first);
  assert.deepEqual(errors, []);
  await close();
});

test('「聞く」「ゆっくり」で英語を読み上げる（英会話アプリで決めた速さで）', async () => {
  const { page, errors, close } = await openApp(user, { prog: { p3: { lv: 1, due: '2026-10-01' } }, settings: { rate: 1.0 } });
  await english(page);
  await page.evaluate(() => { window.__said = []; speechSynthesis.speak = u => window.__said.push([u.text, u.lang, u.rate]); });
  await page.click('#homeEng button:has-text("聞く")');
  await page.click('#homeEng button:has-text("ゆっくり")');
  const said = await page.evaluate(() => window.__said);
  assert.deepEqual(said.map(x => [x[0], x[1]]), [['Nice to meet you.', 'en-US'], ['Nice to meet you.', 'en-US']]);
  assert.ok(Math.abs(said[0][2] - 1.0) < 1e-6 && Math.abs(said[1][2] - 0.7) < 1e-6, JSON.stringify(said));
  assert.deepEqual(errors, []);
  await close();
});

test('英会話アプリの記録は読むだけで、書きかえない', async () => {
  const prog = { p1: { lv: 2, due: '2026-10-01' } }, study = { last: '2026-10-01', streak: 4, days: 10 };
  const { page, errors, close } = await openApp(user, { prog, study });
  await english(page);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ek_prog'))), prog);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ek_study'))), study);
  assert.deepEqual(errors, []);
  await close();
});

test('英会話アプリが開けないとき：控えがあれば控えから出し、無ければ案内を出す', async () => {
  const a = await openApp(user, null, { noEk: true });
  await a.page.waitForFunction(() => /読みこめませんでした/.test(document.querySelector('#homeEng').textContent));
  assert.match(await a.page.textContent('#homeEng'), /英会話アプリで練習 ›/);
  await a.close();
  const cache = JSON.stringify([{ id: 'p0', en: 'Sorry?', jp: 'え、なんて？', n: '' }]);
  const b = await openApp(user, null, { noEk: true, storage: { 'mirai-note-ek': cache } });
  assert.equal(await english(b.page), 'Sorry?');
  assert.deepEqual([...a.errors, ...b.errors], []);
  await b.close();
});
