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
  assert.match(box, /英会話アプリ：きょうはまだ/);
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
  assert.match(await b.page.textContent('#homeEng'), /英会話アプリ：✓ きょうやりました ・ 🔥 8日つづけて/);
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

// ---------- 英語のチャレンジ（ゲーム） ----------
const due = id => ({ prog: { [id]: { lv: 2, due: '2026-10-01' } } });   // その文を「きょうの1文」にする
const click = (page, text) => page.click(`#homeEng button:text-is("${text}")`);
async function sayTiles(page, words){ for (const w of words) await click(page, w); }

test('チャレンジ：3つとも1回目で正解すると⭐3つ。コレクションに入り、きょうはクリアになる', async () => {
  const { page, errors, close } = await openApp(user, due('p1'));   // Could you say that again?
  await english(page);
  await page.click('#homeEng button:has-text("チャレンジ")');
  assert.match(await page.textContent('#homeEng'), /① 意味クイズ/);
  await click(page, 'もう一度言ってもらえますか？');
  assert.match(await page.textContent('#homeEng'), /② ならべかえ.*⭐ 正解！/);
  await sayTiles(page, ['Could', 'you', 'say', 'that', 'again?']);
  assert.match(await page.textContent('#homeEng'), /③ 言ってみよう/);
  await click(page, '🙋 言えた');
  const box = await page.textContent('#homeEng');
  assert.match(box, /パーフェクト！ ⭐⭐⭐/);
  assert.match(box, /⭐⭐⭐ きょうはクリアしました/);
  assert.match(box, /英語コレクションを見る（1文）/);
  assert.doesNotMatch(box, /この文でチャレンジ/);
  assert.deepEqual(await page.evaluate(() => data.eng.days[todayYmd()]), { id: 'p1', stars: 3 });
  // 開き直してもクリアのまま。その日の記録（日記の横）にも出る
  await page.reload(); await english(page);
  assert.match(await page.textContent('#homeEng'), /⭐⭐⭐ きょうはクリアしました/);
  assert.deepEqual(await page.evaluate(() => dayTags(todayYmd())), ['🇬🇧⭐⭐⭐']);
  assert.deepEqual(errors, []);
  await close();
});

test('まちがえると、そのステップの⭐はなくなるが、正解すれば先へ進める', async () => {
  const { page, errors, close } = await openApp(user, due('p1'));
  await english(page);
  await page.click('#homeEng button:has-text("チャレンジ")');
  // ① まちがった日本語を押す → 押せなくなり、もう一度
  const wrongJp = await page.evaluate(() => engGame.jpChoices.find(x => x !== 'もう一度言ってもらえますか？'));
  await click(page, wrongJp);
  assert.match(await page.textContent('#homeEng'), /ちがいます。もう一度！/);
  assert.ok(await page.isDisabled(`#homeEng button:has-text("✗ ${wrongJp}")`));
  await click(page, 'もう一度言ってもらえますか？');
  assert.match(await page.textContent('#homeEng'), /正解！（つぎは1回目で）/);
  // ② 順番をまちがえる
  await click(page, 'again?');
  assert.match(await page.textContent('#homeEng'), /ちがいます/);
  await sayTiles(page, ['Could', 'you', 'say', 'that', 'again?']);
  await click(page, '🙋 言えた');
  assert.match(await page.textContent('#homeEng'), /クリア！ ⭐☆☆/);
  assert.equal(await page.evaluate(() => data.eng.days[todayYmd()].stars), 1);
  assert.deepEqual(errors, []);
  await close();
});

test('短い文（2語まで）は、ならべかえの代わりに聞き取り', async () => {
  const { page, errors, close } = await openApp(user, due('p0'));   // Sorry?
  await english(page);
  await page.click('#homeEng button:has-text("チャレンジ")');
  await click(page, 'え、なんて？');
  assert.match(await page.textContent('#homeEng'), /② 聞き取り/);
  assert.equal(await page.isVisible('#homeEng [lang="en"]'), false);   // 答えの英語は見せない
  await click(page, 'Sorry?');
  assert.match(await page.textContent('#homeEng'), /③ 言ってみよう/);
  assert.deepEqual(errors, []);
  await close();
});

test('マイクで言う：お手本と7割以上あえば正解。足りなければ、聞こえた文が出てもう一度', async () => {
  const { page, errors, close } = await openApp(user, due('p3'));   // Nice to meet you.
  await english(page);
  // 音声認識のにせもの：window.__heard に入れた文を「聞こえた」ことにする
  await page.evaluate(() => {
    window.SpeechRecognition = class { start(){ setTimeout(() => this.onresult({ results: [[{ transcript: window.__heard }]] }), 10); } };
  });
  await page.click('#homeEng button:has-text("チャレンジ")');
  await click(page, 'はじめまして。');
  await sayTiles(page, ['Nice', 'to', 'meet', 'you.']);
  await page.evaluate(() => { window.__heard = 'nice day'; });
  await page.click('#homeEng button:has-text("言ってみる")');
  await page.waitForFunction(() => /聞こえました/.test(document.querySelector('#homeEng').textContent));
  assert.match(await page.textContent('#homeEng'), /「nice day」と聞こえました（25%）/);
  await page.evaluate(() => { window.__heard = 'Nice to meet you'; });
  await page.click('#homeEng button:has-text("言ってみる")');
  await page.waitForFunction(() => /クリア/.test(document.querySelector('#homeEng').textContent));
  assert.equal(await page.evaluate(() => data.eng.days[todayYmd()].stars), 2);   // ③は1回まちがえたので⭐なし
  assert.deepEqual(errors, []);
  await close();
});

test('つづけた日数・ランクアップ・カード（7日）', async () => {
  // きのうまでの6日で ⭐9つ
  const days = {};
  for (let i = 1; i <= 6; i++) days[`2026-09-${String(30 - i + 1).padStart(2, '0')}`] = { id: 'p0', stars: i <= 3 ? 2 : 1 };
  days['2026-10-01'] = days['2026-09-30']; delete days['2026-09-30'];
  const { page, errors, close } = await openApp({ ...user, eng: { days, got: { p0: '2026-09-25' } } }, due('p1'));
  await english(page);
  assert.match(await page.textContent('#homeEng'), /🥚 たまご　⭐9/);
  await page.click('#homeEng button:has-text("チャレンジ")');
  await click(page, 'もう一度言ってもらえますか？');
  await sayTiles(page, ['Could', 'you', 'say', 'that', 'again?']);
  await click(page, '🙋 言えた');
  const box = await page.textContent('#homeEng');
  assert.match(box, /ランクアップ！「🐣 ひよこ」/);
  assert.match(box, /🐣 ひよこ　⭐12/);
  assert.ok(await page.evaluate(() => !!data.cards.c23));
  assert.deepEqual(errors, []);
  await close();
});

test('控えから戻しても、英語の記録は残る。形のおかしい記録は読まない', async () => {
  const { page, errors, close } = await openApp(user, due('p1'));
  await english(page);
  page.on('dialog', d => d.accept());
  const msg = await page.evaluate(() => applyBackup(JSON.stringify({ app: 'taishoku-note', data: { ...data,
    eng: { days: { '2026-10-01': { id: 'p3', stars: 2 }, 'きのう': { id: 'p1', stars: 3 }, '2026-09-30': { id: 'p2', stars: 9 } }, got: { p3: '2026-10-01', p9: 'へん' } } } })));
  assert.equal(typeof msg, 'string');
  assert.deepEqual(await page.evaluate(() => data.eng), { days: { '2026-10-01': { id: 'p3', stars: 2 } }, got: { p3: '2026-10-01' } });
  assert.deepEqual(errors, []);
  await close();
});
