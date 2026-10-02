// 「からだ → 運動」（動いたカロリー・食べられるもの・週のカロリー）のテスト
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, stopBrowser, openApp, openKcal } = require('./helpers');

before(startBrowser);
after(stopBrowser);

// 体重62kgの人が、すでに使っている状態
const user = (body = {}) => ({ welcomed: true, seenNews: 2, body: { kcalWt: 62, ...body } });

test('カロリーの計算式：（メッツ−1）×体重×時間×1.05', async () => {
  const { page, errors, close } = await openApp(user());
  assert.equal(await page.evaluate(() => moveKcal(3.0, 30, 62)), 65);    // 散歩30分
  assert.equal(await page.evaluate(() => moveKcal(7.0, 60, 60)), 378);   // ジョギング60分
  assert.deepEqual(errors, []);
  await close();
});

test('体重が無いと記録できず、お知らせが出る', async () => {
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 2 });
  await openKcal(page);
  await page.fill('#mvMin', '30');
  await page.click('#mvAdd');
  assert.match(await page.textContent('#mvMsg'), /先に体重を入れてください/);
  assert.equal(await page.evaluate(() => data.body.moves.length), 0);
  assert.deepEqual(errors, []);
  await close();
});

test('時間で記録すると、きょうの合計と図鑑が増える', async () => {
  const { page, errors, close } = await openApp(user());
  await openKcal(page);
  await page.selectOption('#mvAct', 'walk');
  await page.fill('#mvMin', '30');
  await page.click('#mvAdd');
  const msg = await page.textContent('#mvMsg');
  assert.match(msg, /＋65kcal/);
  assert.match(msg, /図鑑に新しく見つかりました：🍊みかん・🍪クッキー/);
  assert.equal(await page.evaluate(() => kcalOn(todayYmd())), 65);
  assert.deepEqual(errors, []);
  await close();
});

test('同じ日に歩数を2回入れると、足さずに書きかえる（二重に数えない）', async () => {
  const { page, errors, close } = await openApp(user());
  await openKcal(page);
  await page.click('#mvModeSeg button[data-mv="steps"]');
  await page.fill('#mvSteps', '3000');
  await page.click('#mvAdd');
  await page.fill('#mvSteps', '8000');
  await page.click('#mvAdd');
  const moves = await page.evaluate(() => data.body.moves);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].steps, 8000);
  assert.equal(moves[0].kcal, 174);
  assert.match(await page.textContent('#mvMsg'), /3,000歩 → 8,000歩 に書きかえました/);
  assert.match(await page.textContent('#mvStepsNote'), /8,000歩 と記録しています/);
  assert.deepEqual(errors, []);
  await close();
});

test('歩数でも、ちがう日なら別々に数える。散歩と歩数は同じ日でも両方数える', async () => {
  const { page, errors, close } = await openApp(user());
  await openKcal(page);
  await page.click('#mvModeSeg button[data-mv="steps"]');
  await page.fill('#mvSteps', '5000');
  await page.click('#mvAdd');
  await page.fill('#mvDate', '2026-10-01');
  await page.fill('#mvSteps', '5000');
  await page.click('#mvAdd');
  await page.click('#mvModeSeg button[data-mv="time"]');
  await page.fill('#mvDate', '2026-10-02');
  await page.fill('#mvMin', '30');
  await page.click('#mvAdd');
  assert.equal(await page.evaluate(() => data.body.moves.length), 3);
  assert.deepEqual(errors, []);
  await close();
});

test('前の版で同じ日に入っていた歩数は、多いほうだけ残す', async () => {
  const { page, errors, close } = await openApp(user({ moves: [
    { date: '2026-10-01', act: 'steps', min: 30, steps: 3000, kcal: 65 },
    { date: '2026-10-01', act: 'steps', min: 80, steps: 8000, kcal: 174 },
    { date: '2026-10-01', act: 'walk', min: 30, steps: '', kcal: 65 },
  ] }));
  const moves = await page.evaluate(() => data.body.moves);
  assert.equal(moves.length, 2);
  assert.ok(moves.some(x => x.act === 'steps' && x.steps === 8000));
  assert.ok(!moves.some(x => x.steps === 3000));
  assert.deepEqual(errors, []);
  await close();
});

test('形のおかしい記録は読みこまない', async () => {
  const { page, errors, close } = await openApp(user({ moves: [
    { date: 'きのう', act: 'walk', min: 30, kcal: 65 },        // 日付がおかしい
    { date: '2026-10-01', act: 'fly', min: 30, kcal: 65 },     // ない種類
    { date: '2026-10-01', act: 'walk', min: 9999, kcal: 65 },  // 時間が長すぎる
    { date: '2026-10-01', act: 'walk', min: 30, kcal: 65 },    // これだけ正しい
  ], kcalGoal: -5 }));
  assert.equal(await page.evaluate(() => data.body.moves.length), 1);
  assert.equal(await page.evaluate(() => data.body.kcalGoal), '');
  assert.deepEqual(errors, []);
  await close();
});

test('カロリー貯金：食べ物と交換すると引かれ、とりけすと戻る', async () => {
  const { page, errors, close } = await openApp(user({ moves: [{ date: '2026-10-02', act: 'walk', min: 60, steps: '', kcal: 200 }] }));
  await openKcal(page);
  await page.click('#kcalViewSeg button[data-kv="bank"]');
  await page.click('#kcalFoods button:has-text("−180")');            // おにぎりと交換
  assert.equal(await page.evaluate(() => kcalStats().bank), 20);
  assert.match(await page.textContent('#kcalFoods'), /おにぎりと交換しました/);
  await page.click('#kcalFoods button:has-text("とりけす")');
  assert.equal(await page.evaluate(() => kcalStats().bank), 200);
  assert.deepEqual(errors, []);
  await close();
});

test('お酒なしを数えている人には、ビールを出さない', async () => {
  const { page, errors, close } = await openApp(user({ soberOn: true, soberStart: '2026-09-01' }));
  await openKcal(page);
  assert.doesNotMatch(await page.textContent('#kcalFoods'), /ビール/);
  assert.deepEqual(errors, []);
  await close();
});

test('週のカロリー：月曜からの合計・先週とのちがい・目標まであと何kcal', async () => {
  // きょうは 2026-10-02（金）。今週は 9/28（月）〜10/4（日）
  const { page, errors, close } = await openApp(user({ kcalGoal: 500, moves: [
    { date: '2026-09-27', act: 'walk', min: 60, steps: '', kcal: 200 },  // 先週の日曜
    { date: '2026-09-28', act: 'walk', min: 30, steps: '', kcal: 100 },  // 今週の月曜
    { date: '2026-10-02', act: 'walk', min: 15, steps: '', kcal: 50 },   // きょう
  ] }));
  await openKcal(page);
  const box = await page.textContent('#kcalWeekly');
  assert.match(box, /今週（9\/28〜10\/4）150kcal/);
  assert.match(box, /先週は 200kcal（−50kcal）/);
  assert.match(box, /あと 350kcal（30%）/);
  assert.match(box, /のこり3日なので、1日 117kcal ずつ/);   // 金・土・日の3日
  assert.deepEqual(errors, []);
  await close();
});

test('週の目標に届くと、お祝いとカードが出る', async () => {
  const { page, errors, close } = await openApp(user({ kcalGoal: 500, moves: [
    { date: '2026-09-29', act: 'jog', min: 60, steps: '', kcal: 400 },
    { date: '2026-10-01', act: 'jog', min: 30, steps: '', kcal: 200 },
  ] }));
  await openKcal(page);
  assert.match(await page.textContent('#kcalWeekly'), /今週の目標 500kcal に届きました/);
  assert.ok(await page.evaluate(() => !!data.cards.c22));
  assert.deepEqual(errors, []);
  await close();
});

test('サーフィン：選ぶと入れ方の説明が出て、2時間で260kcal（体重62kg・3メッツ）', async () => {
  const { page, errors, close } = await openApp(user());
  await openKcal(page);
  assert.equal(await page.isVisible('#mvActNote'), false);
  await page.selectOption('#mvAct', 'surf');
  assert.match(await page.textContent('#mvActNote'), /波待ちもふくむ/);
  await page.fill('#mvMin', '120');
  await page.click('#mvAdd');
  assert.match(await page.textContent('#mvMsg'), /＋260kcal/);
  assert.match(await page.textContent('#kcalList'), /🏄 サーフィン（のんびり） 120分/);
  // たくさん波に乗る日は5メッツ：60分で 4×62×1×1.05 = 260kcal
  await page.selectOption('#mvAct', 'surf2');
  await page.fill('#mvMin', '60');
  await page.click('#mvAdd');
  assert.equal(await page.evaluate(() => kcalOn(todayYmd())), 520);
  // ほかの種類にもどすと、説明は消える
  await page.selectOption('#mvAct', 'walk');
  assert.equal(await page.isVisible('#mvActNote'), false);
  assert.deepEqual(errors, []);
  await close();
});

test('ランニング（速め）：選ぶと説明が出て、30分で286kcal（体重62kg・9.8メッツ）', async () => {
  const { page, errors, close } = await openApp(user());
  await openKcal(page);
  await page.selectOption('#mvAct', 'run');
  assert.match(await page.textContent('#mvActNote'), /1kmを6分くらい/);
  await page.fill('#mvMin', '30');
  await page.click('#mvAdd');
  assert.match(await page.textContent('#mvMsg'), /＋286kcal/);
  assert.deepEqual(errors, []);
  await close();
});

test('「運動」で筋トレを記録すると、筋トレの「きょうやった」にも印がつく', async () => {
  const { page, errors, close } = await openApp(user());
  await openKcal(page);
  await page.selectOption('#mvAct', 'muscle2');
  await page.fill('#mvMin', '45');
  await page.click('#mvAdd');
  assert.match(await page.textContent('#mvMsg'), /筋トレの「きょうやった」にも印をつけました/);
  assert.ok(await page.evaluate(() => !!data.body.trained[todayYmd()]));
  // もう印がついている日に、もう1回入れても、お知らせは出ない
  await page.selectOption('#mvAct', 'muscle');
  await page.fill('#mvMin', '15');
  await page.click('#mvAdd');
  assert.doesNotMatch(await page.textContent('#mvMsg'), /印をつけました/);
  // 散歩では印はつかない
  await page.fill('#mvDate', '2026-10-01');
  await page.selectOption('#mvAct', 'walk');
  await page.fill('#mvMin', '30');
  await page.click('#mvAdd');
  assert.equal(await page.evaluate(() => !!data.body.trained['2026-10-01']), false);
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレの「きょうやった」を押すと、何分かを1タップで「運動」にも記録できる', async () => {
  const { page, errors, close } = await openApp(user());   // コースは「家で・道具なし」
  await page.click('nav button[data-tab="body"]');
  // 押す前は、カロリーのボタンは出ない
  assert.doesNotMatch(await page.textContent('#trainDone'), /カロリーも記録しますか/);
  await page.click('#trainDone button.hb');
  assert.match(await page.textContent('#trainDone'), /カロリーも記録しますか？.*筋トレ（軽め・家で）/);
  await page.click('#trainDone button:has-text("30分")');
  const moves = await page.evaluate(() => data.body.moves);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].act, 'muscle');
  assert.equal(moves[0].kcal, 81);                           // 2.5×62×0.5×1.05
  const box = await page.textContent('#trainDone');
  assert.match(box, /＋81kcal/);
  assert.match(box, /きょうの筋トレ 30分・81kcal/);
  assert.doesNotMatch(box, /カロリーも記録しますか/);        // 2回入れないように、ボタンは消える
  assert.deepEqual(errors, []);
  await close();
});

test('ジムのコースなら「しっかり」で記録する。体重が無いと案内が出る', async () => {
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 2, body: { course: 'gym1' } });
  await page.click('nav button[data-tab="body"]');
  await page.click('#trainDone button.hb');
  assert.match(await page.textContent('#trainDone'), /筋トレ（しっかり・ジムで）/);
  await page.click('#trainDone button:has-text("45分")');
  assert.match(await page.textContent('#trainDone'), /先に体重を入れてください/);
  assert.equal(await page.evaluate(() => data.body.moves.length), 0);
  assert.deepEqual(errors, []);
  await close();
});
