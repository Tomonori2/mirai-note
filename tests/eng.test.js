// ホームの「🇬🇧 きょうの英語」（毎日10分 英会話とつなぐ）のテスト
// テスト用の英会話アプリ（fixtures/eigo-kaiwa.html）には6文：p0 Sorry? / p1 Could you say that again? / p2 I'm Ken. /
// p3 Nice to meet you. / p4 That's "great"! / p5 I'll call someone who speaks English.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, stopBrowser, openApp } = require('./helpers');

before(startBrowser);
after(stopBrowser);

const user = { welcomed: true, seenNews: 3 };
// 英会話アプリの文が読みこまれて、カードに英語が出るまで待つ
const english = async page => { await page.waitForSelector('#homeEng [lang="en"]'); return page.textContent('#homeEng [lang="en"]'); };

test('英会話アプリをまだ使っていない人：一覧の最初の文から出し、日本語はたたんでおく', async () => {
  const { page, errors, close } = await openApp(user);
  assert.equal(await english(page), 'Sorry?');
  const box = await page.textContent('#homeEng');
  assert.match(box, /まだクリアしていない文から/);
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
// 文の中に " や \ があっても押せるように、前に \ を付ける（例：That's "great"!）
const click = (page, text) => page.click(`#homeEng button:text-is("${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`);
async function sayTiles(page, words){ for (const w of words) await click(page, w); }

test('チャレンジ：3つとも1回目で正解すると⭐3つ。コレクションに入り、きょうはクリアになる', async () => {
  const { page, errors, close } = await openApp(user, due('p1'));   // Could you say that again?
  await english(page);
  await page.click('#homeEng button:has-text("チャレンジ")');
  assert.match(await page.textContent('#homeEng'), /① 意味クイズ/);
  await click(page, 'もう一度言ってもらえますか？');
  assert.match(await page.textContent('#homeEng'), /② ならべかえ.*⭐ 正解！/);
  await sayTiles(page, ['could', 'you', 'say', 'that', 'again']);
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
  await click(page, 'again');
  assert.match(await page.textContent('#homeEng'), /ちがいます/);
  await sayTiles(page, ['could', 'you', 'say', 'that', 'again']);
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
  await sayTiles(page, ['nice', 'to', 'meet', 'you']);
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
  await sayTiles(page, ['could', 'you', 'say', 'that', 'again']);
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

// ---------- 毎日ちがう文・もう1文・おさらい・場面 ----------
// いま出ているゲーム（①意味クイズ → ②ならべかえ か 聞き取り → ③言えた）を、全部1回目で正解して終える
async function playGame(page){
  const g = await page.evaluate(() => ({ jp: engGame.p.jp, en: engGame.en, listen: engGame.listen, tiles: engWords(engGame.en).map((w, i, a) => engTile(a, i)) }));
  await click(page, g.jp);
  if (g.listen) await click(page, g.en); else await sayTiles(page, g.tiles);
  await click(page, '🙋 言えた');
}

test('クリアした文は出さず、つぎの文へ進む（最初の5文をくり返さない）', async () => {
  // p0〜p4 をクリア済み → 6つ目の p5 が出る
  const got = { p0: '2026-09-27', p1: '2026-09-28', p2: '2026-09-29', p3: '2026-09-30', p4: '2026-10-01' };
  const a = await openApp({ ...user, eng: { days: { '2026-10-01': { id: 'p4', stars: 3 } }, got } });
  assert.equal(await english(a.page), "I'll call someone who speaks English.");
  assert.match(await a.page.textContent('#homeEng'), /まだクリアしていない文から/);
  await a.close();
  // ぜんぶクリアしたら、おさらいの文を出す
  const b = await openApp({ ...user, eng: { days: { '2026-10-01': { id: 'p5', stars: 3 } }, got: { ...got, p5: '2026-10-01' } } });
  await english(b.page);
  assert.match(await b.page.textContent('#homeEng'), /ぜんぶクリアしました！おさらいの文です/);
  // 英会話アプリで習った文のうち、まだクリアしていない文を先に出す
  const c = await openApp({ ...user, eng: { days: {}, got: { p1: '2026-09-30' } } }, { prog: { p1: { lv: 1, due: '2026-10-09' }, p3: { lv: 1, due: '2026-10-09' } } });
  assert.equal(await english(c.page), 'Nice to meet you.');
  assert.deepEqual([...a.errors, ...b.errors, ...c.errors], []);
  await b.close(); await c.close();
});

test('もう1文：クリアしたあと続けて遊べる。⭐が足され、同じ文は出ない。1日4文まで', async () => {
  const { page, errors, close } = await openApp(user, due('p1'));   // きょうの1文は Could you say that again?
  await english(page);
  await page.click('#homeEng button:has-text("この文でチャレンジ")');
  await playGame(page);
  assert.match(await page.textContent('#homeEng'), /もう1文チャレンジ（きょう あと4文）/);
  await page.click('#homeEng button:has-text("もう1文チャレンジ")');
  assert.match(await page.textContent('#homeEng'), /🎮 もう1文：① 意味クイズ/);
  assert.equal(await page.evaluate(() => engGame.id), 'p0');        // まだクリアしていない文の先頭（きょうの p1 は出さない）
  await playGame(page);
  assert.deepEqual(await page.evaluate(() => data.eng.days[todayYmd()]), { id: 'p1', stars: 3, more: [{ id: 'p0', stars: 3 }] });
  const box = await page.textContent('#homeEng');
  assert.match(box, /⭐6/);
  assert.match(box, /英語コレクションを見る（2文）/);
  assert.match(box, /もう1文チャレンジ（きょう あと3文）/);
  assert.deepEqual(await page.evaluate(() => dayTags(todayYmd())), ['🇬🇧⭐⭐⭐＋1文']);
  // あと3文で上限。ボタンが消えて「また明日！」になる
  for (let i = 0; i < 3; i++) { await page.click('#homeEng button:has-text("もう1文チャレンジ")'); await playGame(page); }
  assert.equal(await page.evaluate(() => data.eng.days[todayYmd()].more.length), 4);
  assert.equal(await page.isVisible('#homeEng button:has-text("もう1文チャレンジ")'), false);
  assert.match(await page.textContent('#homeEng'), /きょうはクリアしました。また明日！/);
  // 開き直しても記録は残る
  await page.reload(); await english(page);
  assert.equal(await page.evaluate(() => engStats().stars), 15);
  assert.deepEqual(errors, []);
  await close();
});

test('おさらいクイズ：集めた文から出す。⭐は増えず、回数だけ数える', async () => {
  const eng = { days: { '2026-10-01': { id: 'p1', stars: 3 } }, got: { p0: '2026-09-30', p1: '2026-10-01' } };
  const { page, errors, close } = await openApp({ ...user, eng });
  await english(page);
  await page.click('#homeEng button:has-text("おさらいクイズ")');
  assert.match(await page.textContent('#homeEng'), /📖 おさらい中：① 意味クイズ/);
  assert.ok(['p0', 'p1'].includes(await page.evaluate(() => engGame.id)));
  await playGame(page);
  assert.match(await page.textContent('#homeEng'), /⭐は増えません.*これまでに 1回 おさらいしました/);
  assert.equal(await page.evaluate(() => engStats().stars), 3);
  assert.equal(await page.evaluate(() => data.eng.rev), 1);
  assert.equal(await page.evaluate(() => data.eng.days[todayYmd()]), undefined);   // きょうの1文は、まだクリアしていないまま
  assert.deepEqual(errors, []);
  await close();
});

test('きょうクリアした文があれば、えらんだ文の記録がなくても、その文を出す（控えから戻した直後など）', async () => {
  // きょう p3 をクリア済み。えらんだ文の記録（engToday）は無い
  const { page, errors, close } = await openApp({ ...user, eng: { days: { '2026-10-02': { id: 'p3', stars: 2 } }, got: { p3: '2026-10-02' } } });
  assert.equal(await english(page), 'Nice to meet you.');
  assert.match(await page.textContent('#homeEng'), /⭐⭐☆ きょうはクリアしました/);
  assert.deepEqual(errors, []);
  await close();
});

test('集めた文が1つまでのときは、おさらいクイズを出さない', async () => {
  const { page, errors, close } = await openApp({ ...user, eng: { days: {}, got: { p0: '2026-09-30' } } });
  await english(page);
  assert.equal(await page.isVisible('#homeEng button:has-text("おさらいクイズ")'), false);
  assert.deepEqual(errors, []);
  await close();
});

test('場面をえらぶ：その場面の文から出す。クリア前ならきょうの1文も入れかわる', async () => {
  const { page, errors, close } = await openApp(user);
  assert.equal(await english(page), 'Sorry?');
  // テスト用の英会話アプリには4つの場面（help 2文・greet 2文・chat 1文・guide 1文）
  assert.deepEqual(await page.$$eval('#engScene option', os => os.map(o => o.value)), ['', 'help', 'greet', 'chat', 'guide']);
  await page.selectOption('#engScene', 'greet');
  assert.equal(await english(page), "I'm Ken.");
  assert.match(await page.textContent('#homeEng'), /場面「あいさつ・自己紹介」の、まだクリアしていない文から/);
  assert.match(await page.textContent('#engScene'), /あいさつ・自己紹介（0\/2）/);
  // クリアしたあとに場面を変えても、きょうの1文はそのまま。「もう1文」は新しい場面から出る
  await page.click('#homeEng button:has-text("この文でチャレンジ")');
  await playGame(page);
  // クリアしたあとは、場面の欄は「そのほか」の中にたたまれている
  assert.equal(await page.isVisible('#engScene'), false);
  await page.click('#engMore > summary');
  await page.selectOption('#engScene', 'guide');
  assert.equal(await english(page), "I'm Ken.");
  assert.equal(await page.isVisible('#engScene'), true);          // 場面を変えても、「そのほか」は開いたまま
  await page.click('#homeEng button:has-text("もう1文チャレンジ")');
  assert.equal(await page.evaluate(() => engGame.id), 'p5');
  // 開き直しても、えらんだ場面は残る
  await page.reload(); await english(page);
  assert.equal(await page.$eval('#engScene', e => e.value), 'guide');
  assert.deepEqual(errors, []);
  await close();
});

test('ならべかえの札：文の頭の大文字と前後の記号を外す。I や English は大文字のまま', async () => {
  const { page, errors, close } = await openApp(user);
  await english(page);
  const tiles = en => page.evaluate(en => engWords(en).map((w, i, a) => engTile(a, i)), en);
  assert.deepEqual(await tiles('Could you say that again?'), ['could', 'you', 'say', 'that', 'again']);
  assert.deepEqual(await tiles("I'll call someone who speaks English."), ["I'll", 'call', 'someone', 'who', 'speaks', 'English']);
  assert.deepEqual(await tiles("I'm fine. And you?"), ["I'm", 'fine', 'and', 'you']);   // 2つ目の文の頭も小文字に
  assert.deepEqual(await tiles('That\'s "great"!'), ["that's", 'great']);
  assert.deepEqual(errors, []);
  await close();
});

test('マイクで聞き取り中に「やめる」を押しても、あとから届いた結果でエラーにならない', async () => {
  const { page, errors, close } = await openApp(user, due('p3'));   // Nice to meet you.
  await english(page);
  await page.evaluate(() => { window.SpeechRecognition = class { start(){ window.__rec = this; } }; });
  await page.click('#homeEng button:has-text("この文でチャレンジ")');
  await click(page, 'はじめまして。');
  await sayTiles(page, ['nice', 'to', 'meet', 'you']);
  await page.click('#homeEng button:has-text("言ってみる")');
  assert.match(await page.textContent('#homeEng'), /どうぞ、英語で言ってください/);
  await page.click('#homeEng button:has-text("やめる")');
  await page.evaluate(() => { window.__rec.onerror(); window.__rec.onresult({ results: [[{ transcript: 'Nice to meet you' }]] }); });
  assert.equal(await page.evaluate(() => engGame), null);
  assert.equal(await page.evaluate(() => data.eng.days[todayYmd()]), undefined);   // クリアにはならない
  assert.deepEqual(errors, []);
  await close();
});

test('控えから戻す：「もう1文」とおさらいの回数も残る。形のおかしいものは読まない', async () => {
  const { page, errors, close } = await openApp(user);
  await english(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => applyBackup(JSON.stringify({ app: 'taishoku-note', data: { ...data, engScene: 'greet',
    eng: { days: { '2026-10-01': { id: 'p3', stars: 2, more: [{ id: 'p1', stars: 3 }, { id: 5, stars: 3 }, { id: 'p2', stars: 7 }] } }, got: { p3: '2026-10-01' }, rev: 4 } } })));
  assert.deepEqual(await page.evaluate(() => data.eng), { days: { '2026-10-01': { id: 'p3', stars: 2, more: [{ id: 'p1', stars: 3 }] } }, got: { p3: '2026-10-01' }, rev: 4 });
  assert.equal(await page.evaluate(() => data.engScene), 'greet');
  await page.evaluate(() => applyBackup(JSON.stringify({ app: 'taishoku-note', data: { ...data, engScene: '<b>x</b>', eng: { days: {}, got: {}, rev: -3 } } })));
  assert.deepEqual(await page.evaluate(() => [data.engScene, data.eng]), ['', { days: {}, got: {} }]);
  assert.deepEqual(errors, []);
  await close();
});
