// 「からだ → 運動」（動いたカロリー・食べられるもの・週のカロリー）のテスト
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, stopBrowser, openApp, openKcal } = require('./helpers');

before(startBrowser);
after(stopBrowser);

// 体重62kgの人が、すでに使っている状態
const user = (body = {}) => ({ welcomed: true, seenNews: 3, body: { kcalWt: 62, ...body } });

test('カロリーの計算式：（メッツ−1）×体重×時間×1.05', async () => {
  const { page, errors, close } = await openApp(user());
  assert.equal(await page.evaluate(() => moveKcal(3.0, 30, 62)), 65);    // 散歩30分
  assert.equal(await page.evaluate(() => moveKcal(7.0, 60, 60)), 378);   // ジョギング60分
  assert.deepEqual(errors, []);
  await close();
});

test('体重が無いと記録できず、お知らせが出る', async () => {
  const { page, errors, close } = await openApp({ welcomed: true, seenNews: 3 });
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

test('「運動」で筋トレを記録すると、筋トレをした日の印もつく', async () => {
  const { page, errors, close } = await openApp(user());
  await openKcal(page);
  await page.selectOption('#mvAct', 'muscle2');
  await page.fill('#mvMin', '45');
  await page.click('#mvAdd');
  assert.match(await page.textContent('#mvMsg'), /筋トレをした日の印も、きょうにつけました/);
  assert.ok(await page.evaluate(() => !!data.body.trained[todayYmd()]));
  // もう印がついている日に、もう1回入れても、お知らせは出ない
  await page.selectOption('#mvAct', 'muscle');
  await page.fill('#mvMin', '15');
  await page.click('#mvAdd');
  assert.doesNotMatch(await page.textContent('#mvMsg'), /印も/);
  // 散歩では印はつかない
  await page.fill('#mvDate', '2026-10-01');
  await page.selectOption('#mvAct', 'walk');
  await page.fill('#mvMin', '30');
  await page.click('#mvAdd');
  assert.equal(await page.evaluate(() => !!data.body.trained['2026-10-01']), false);
  assert.deepEqual(errors, []);
  await close();
});

// ---------- 筋トレの記録：種目・回数・セット数から、カロリーの目安を出す ----------
// 入力欄に入れる（種目・重さ・1セットの回数・セット数・休みの分）
async function fillLift(page, ex, kg, reps, sets, rest){
  await page.selectOption('#liftEx', ex);
  if (kg !== null) await page.fill('#liftKg', String(kg));
  await page.fill('#liftReps', String(reps));
  await page.fill('#liftSets', String(sets));
  if (rest) await page.selectOption('#liftRest', String(rest));
}
const openLift = async saved => { const r = await openApp(saved); await r.page.click('nav button[data-tab="body"]'); return r; };

test('筋トレのカロリーの式：動かした分（重さ×距離×回数）＋休みの分', async () => {
  const { page, errors, close } = await openApp(user());
  // ベンチプレス 100kg×5回×5セット・休み3分・体重65kg：動かした分 15.6 ＋ 休み 17.1
  assert.deepEqual(await page.evaluate(() => liftKcal(EX_BY.bench, 100, 5, 5, 3, 65)), { kcal: 33, min: 17, work: 16, rest: 17 });
  // 腕立て伏せ（体重の65%を30cm）20回×3セット・休み1分
  assert.equal(await page.evaluate(() => liftKcal(EX_BY.pushup, 0, 20, 3, 1, 65).kcal), 15);
  // プランク（秒で入れる）60秒×2セット・休み1分
  assert.equal(await page.evaluate(() => liftKcal(EX_BY.plank, 0, 60, 2, 1, 65).kcal), 9);
  // スクワットは、体重の分に、かついだ重さを足す
  assert.ok(await page.evaluate(() => liftKcal(EX_BY.squat, 80, 8, 3, 2, 65).kcal > liftKcal(EX_BY.squat, 0, 8, 3, 2, 65).kcal));
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：メニューは無く、種目と回数を入れるとカロリーの目安が出て「運動」にも入る', async () => {
  const { page, errors, close } = await openLift(user());   // 体重62kg
  assert.equal(await page.isVisible('#courseSel'), false);
  assert.match(await page.textContent('[data-bp="menu"] h2'), /筋トレの記録/);
  await fillLift(page, 'bench', 100, 5, 5, 3);
  assert.match(await page.textContent('#liftEst'), /この内容で 約32kcal（動かした分 16＋休みの分 16・およそ17分）/);
  await page.click('#liftAdd');
  const B = await page.evaluate(() => data.body);
  const l = B.lifts[0], m = B.moves[0];
  assert.deepEqual([l.name, l.ex, l.kg, l.reps, l.sets, l.rest, l.kcal], ['ベンチプレス', 'bench', 100, 5, 5, 3, 32]);
  assert.deepEqual([m.act, m.min, m.kcal, m.ref === l.id], ['lift', 17, 32, true]);   // 「運動」の記録とつながっている
  assert.ok(B.trained['2026-10-02']);                                                  // 筋トレをした日の印も付く
  assert.match(await page.textContent('#liftMsg'), /これが最初の自己ベストです。.*＋32kcal/);
  assert.match(await page.textContent('#trainToday'), /きょうの筋トレ：1種目・5セット・約32kcal/);
  assert.match(await page.textContent('#trainKcalSum'), /今週 32kcal（17分）・これまで 32kcal（1日）/);
  // 「運動」の合計にも入っている
  assert.equal(await page.evaluate(() => kcalOn(todayYmd())), 32);
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：自重の種目は重さなしで入れられる。プランクは秒で入れる', async () => {
  const { page, errors, close } = await openLift(user());
  await fillLift(page, 'pushup', null, 20, 3, 1);
  assert.equal(await page.getAttribute('#liftKg', 'placeholder'), '加重');
  await page.click('#liftAdd');
  assert.deepEqual(await page.evaluate(() => { const l = data.body.lifts[0]; return [l.name, l.kg, l.reps, l.sets, l.kcal]; }), ['腕立て伏せ', 0, 20, 3, 15]);
  // 重さの無い種目は、1セットでいちばん多くできた回数を出す。のびしろ予測（重さの伸び）は出さない
  assert.match(await page.textContent('#liftView'), /1セットでいちばん多くできた記録20回/);
  assert.equal(await page.isVisible('#growCard'), false);
  // プランク：重さの欄が消え、単位が「秒」になる
  await page.selectOption('#liftEx', 'plank');
  assert.equal(await page.isVisible('#liftKg'), false);
  assert.equal(await page.textContent('#liftRepsUnit'), '秒');
  await page.fill('#liftReps', '60'); await page.fill('#liftSets', '2');
  await page.click('#liftAdd');
  assert.deepEqual(await page.evaluate(() => { const l = data.body.lifts[1]; return [l.name, l.reps, l.sets, l.kcal]; }), ['プランク', 60, 2, 8]);
  assert.match(await page.textContent('#trainToday'), /2種目・5セット・約23kcal.*プランク60秒 × 2セット/);
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：記録を消すと、「運動」に入れたカロリーも一緒に消える', async () => {
  const { page, errors, close } = await openLift(user());
  page.on('dialog', d => d.accept());
  await fillLift(page, 'bench', 100, 5, 5, 3);
  await page.click('#liftAdd');
  await fillLift(page, 'pushup', '', 20, 3, 1);
  await page.click('#liftAdd');
  assert.equal(await page.evaluate(() => data.body.moves.length), 2);
  await page.click('#trainToday .row:has-text("ベンチプレス") button.x');
  assert.deepEqual(await page.evaluate(() => [data.body.lifts.length, data.body.moves.length, data.body.lifts[0].name, kcalOn(todayYmd())]), [1, 1, '腕立て伏せ', 15]);
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：前の版の記録（種目の番号・セット数なし）もそのまま読める。自己ベストは続きから', async () => {
  const lifts = [{ date: '2026-09-25', name: 'ベンチプレス', kg: 100, reps: 2 }, { date: '2026-09-28', name: 'サイドレイズ', kg: 8, reps: 12 }];
  const { page, errors, close } = await openLift(user({ course: 'gym2', lifts, trained: { '2026-09-25': 'gym2' }, pbs: 0 }));
  // 最後に記録した種目（一覧に無い名前）が、「ほか」として入っている
  assert.equal(await page.inputValue('#liftEx'), 'other');
  assert.equal(await page.inputValue('#liftName'), 'サイドレイズ');
  await page.click('#liftView button:has-text("ベンチプレス")');
  assert.equal(await page.inputValue('#liftEx'), 'bench');
  assert.match(await page.textContent('#liftPrev'), /前回：2026年9月25日　100kg × 2回（自己ベストの目安 106.7kg）/);
  await page.fill('#liftKg', '90'); await page.fill('#liftReps', '8'); await page.fill('#liftSets', '3');
  await page.click('#liftAdd');
  assert.match(await page.textContent('#liftMsg'), /自己ベスト更新！ ベンチプレスの目安が 106.7kg → 114kg/);
  assert.equal(await page.evaluate(() => data.body.pbs), 1);
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：体重が無いときは、その場で体重を入れられる。入れるまでは記録しない', async () => {
  const { page, errors, close } = await openLift({ welcomed: true, seenNews: 3 });
  assert.match(await page.textContent('#liftWtBox'), /カロリーの目安には体重を使います/);
  await fillLift(page, 'bench', 60, 10, 3, 2);
  assert.equal(await page.textContent('#liftEst'), '');            // 体重が無いので、目安はまだ出ない
  await page.click('#liftAdd');
  assert.match(await page.textContent('#liftMsg'), /先に体重を入れてください/);
  assert.equal(await page.evaluate(() => data.body.lifts.length), 0);
  await page.fill('#liftWtIn', '62');
  await page.dispatchEvent('#liftWtIn', 'change');
  assert.equal(await page.evaluate(() => data.body.kcalWt), 62);
  assert.equal(await page.textContent('#liftWtBox'), '');
  assert.match(await page.textContent('#liftEst'), /この内容で 約/);
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：入れまちがいには案内が出て、記録しない', async () => {
  const { page, errors, close } = await openLift(user());
  const tryAdd = async () => { await page.click('#liftAdd'); return page.textContent('#liftMsg'); };
  await page.selectOption('#liftEx', 'bench');
  await page.fill('#liftReps', '5');
  assert.match(await tryAdd(), /重さを入れてください/);               // バーベルの種目は重さが要る
  await page.fill('#liftKg', '100'); await page.fill('#liftReps', '0');
  assert.match(await tryAdd(), /回数を入れてください（1〜100回）/);
  await page.fill('#liftReps', '5'); await page.fill('#liftSets', '30');
  assert.match(await tryAdd(), /セット数は 1〜20 の間で/);
  await page.fill('#liftSets', '3'); await page.fill('#liftDate', '2026-10-03');
  assert.match(await tryAdd(), /先の日は入れられません/);
  await page.fill('#liftDate', '2026-10-02'); await page.selectOption('#liftEx', 'other');
  assert.match(await tryAdd(), /種目の名前を入れてください/);
  assert.equal(await page.evaluate(() => data.body.lifts.length), 0);
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：この1週間の日付を押すと、印だけ付けたり外したりできる', async () => {
  const { page, errors, close } = await openLift(user());
  assert.match(await page.textContent('#trainDone'), /この1週間（今週 0回）/);
  await page.click('#trainWeek button[aria-label^="2026年10月1日"]');
  assert.ok(await page.evaluate(() => !!data.body.trained['2026-10-01']));
  assert.match(await page.textContent('#trainDone'), /この1週間（今週 1回）/);
  await page.click('#trainWeek button[aria-label^="2026年10月1日"]');
  assert.equal(await page.evaluate(() => !!data.body.trained['2026-10-01']), false);
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：控えから戻しても記録が残る。形のおかしい記録は読まない', async () => {
  const { page, errors, close } = await openLift(user());
  page.on('dialog', d => d.accept());
  await fillLift(page, 'squat', 80, 8, 3, 2);
  await page.click('#liftAdd');
  const before = await page.evaluate(() => [data.body.lifts, data.body.moves]);
  await page.evaluate(() => applyBackup(backupText()));
  assert.deepEqual(await page.evaluate(() => [data.body.lifts, data.body.moves]), before);
  await page.evaluate(() => { const b = JSON.parse(backupText());
    b.data.body.lifts = [{ date: '2026-10-01', name: 'A', kg: -5, reps: 5 }, { date: '2026-10-01', name: 'B', kg: 0, reps: 20, sets: 99, ex: 'nope', kcal: 'x', id: 'abc' }, { date: 'x', name: 'C', kg: 10, reps: 5 }];
    b.data.body.moves = [{ date: '2026-10-01', act: 'lift', min: 5, steps: '', kcal: 10, ref: 'zzz' }]; b.data.body.liftRest = 7;
    applyBackup(JSON.stringify(b)); });
  assert.deepEqual(await page.evaluate(() => [data.body.lifts, data.body.moves, data.body.liftRest]),
    [[{ date: '2026-10-01', name: 'B', kg: 0, reps: 20 }], [{ date: '2026-10-01', act: 'lift', min: 5, steps: '', kcal: 10 }], 2]);
  assert.deepEqual(errors, []);
  await close();
});

test('運動の「最近の記録」：筋トレは種目の名前と中身で出る。そこで消すと、筋トレの記録は残り、カロリーだけ外れる', async () => {
  const { page, errors, close } = await openLift(user());
  page.on('dialog', d => d.accept());
  await fillLift(page, 'bench', 100, 5, 5, 3);
  await page.click('#liftAdd');
  await page.click('#bodyTabs button[data-bt="kcal"]');
  assert.match(await page.textContent('#kcalList'), /🏋️ ベンチプレス 100kg × 5回 × 5セット32kcal/);
  // 名前が長くても、画面の横にはみ出さない（幅390）
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await page.click('#kcalList .row:has-text("ベンチプレス") button');
  assert.deepEqual(await page.evaluate(() => [data.body.moves.length, data.body.lifts.length, 'kcal' in data.body.lifts[0], kcalOn(todayYmd())]), [0, 1, false, 0]);
  await page.click('#bodyTabs button[data-bt="menu"]');
  assert.match(await page.textContent('#trainToday'), /きょうの筋トレ：1種目・5セットベンチプレス/);   // カロリーの表示は消える
  assert.deepEqual(errors, []);
  await close();
});

// ---------- 前回と同じ・運動の一覧のまとめ ----------
// 9/30 に、ベンチプレスと腕立て伏せを記録した人
const lastDay = () => user({
  lifts: [{ id: 11, date: '2026-09-30', name: 'ベンチプレス', ex: 'bench', kg: 100, reps: 5, sets: 5, rest: 3, kcal: 32 },
          { id: 12, date: '2026-09-30', name: '腕立て伏せ', ex: 'pushup', kg: 0, reps: 20, sets: 3, rest: 1, kcal: 15 }],
  moves: [{ date: '2026-09-30', act: 'lift', min: 17, steps: '', kcal: 32, ref: 11 }, { date: '2026-09-30', act: 'lift', min: 7, steps: '', kcal: 15, ref: 12 }],
  trained: { '2026-09-30': 'home' },
});

test('筋トレ：「前回と同じ」で、前の日の種目をまとめてきょうの記録に入れられる', async () => {
  const { page, errors, close } = await openLift(lastDay());
  assert.match(await page.textContent('#liftRepeat'), /前回（9\/30）と同じ 2件を、きょうの記録に入れる/);
  await page.click('#liftRepeat');
  const today = await page.evaluate(() => data.body.lifts.filter(x => x.date === todayYmd()).map(x => [x.name, x.kg, x.reps, x.sets, x.rest, x.kcal]));
  assert.deepEqual(today, [['ベンチプレス', 100, 5, 5, 3, 32], ['腕立て伏せ', 0, 20, 3, 1, 15]]);
  assert.match(await page.textContent('#liftMsg'), /9\/30と同じ 2件を、きょうの記録に入れました（約47kcal）/);
  assert.equal(await page.evaluate(() => kcalOn(todayYmd())), 47);                       // 「運動」の合計にも入る
  assert.ok(await page.evaluate(() => !!data.body.trained[todayYmd()]));
  assert.equal(await page.isVisible('#liftRepeat'), false);                              // きょうの記録があれば、もう出さない
  assert.deepEqual(errors, []);
  await close();
});

test('筋トレ：種目をえらぶと、前回と同じ内容を入力欄に入れられる。前回が無い種目には出さない', async () => {
  const { page, errors, close } = await openLift(lastDay());
  await page.selectOption('#liftEx', 'squat');
  assert.equal(await page.isVisible('#liftSame'), false);
  await page.selectOption('#liftEx', 'bench');
  await page.click('#liftSame');
  assert.deepEqual([await page.inputValue('#liftKg'), await page.inputValue('#liftReps'), await page.inputValue('#liftSets'), await page.inputValue('#liftRest')], ['100', '5', '5', '3']);
  assert.match(await page.textContent('#liftEst'), /この内容で 約32kcal/);
  // はじめての人には、どちらも出ない
  const b = await openLift(user());
  assert.equal(await b.page.isVisible('#liftRepeat'), false);
  assert.equal(await b.page.isVisible('#liftSame'), false);
  assert.deepEqual([...errors, ...b.errors], []);
  await b.close(); await close();
});

test('運動の「最近の記録」：同じ日の筋トレは1行にまとめ、押すと種目ごとにひらく', async () => {
  const { page, errors, close } = await openLift(lastDay());
  page.on('dialog', d => d.accept());
  await page.click('#bodyTabs button[data-bt="kcal"]');
  assert.equal(await page.locator('#kcalList details.kcalGroup').count(), 1);
  assert.match(await page.textContent('#kcalList details.kcalGroup summary'), /9\/30　🏋️ 筋トレ 2種目・8セット.*47kcal/);
  assert.equal(await page.isVisible('#kcalList details.kcalGroup div.row'), false);     // 押すまで、種目ごとの行は出ない
  await page.click('#kcalList details.kcalGroup summary');
  assert.match(await page.textContent('#kcalList details.kcalGroup'), /ベンチプレス 100kg × 5回 × 5セット32kcal.*腕立て伏せ 20回 × 3セット15kcal/);
  // 1つ消すと残りは1件なので、まとめるのをやめて、ふつうの1行にもどる
  await page.click('#kcalList details.kcalGroup div.row:has-text("ベンチプレス") button');
  assert.equal(await page.locator('#kcalList details.kcalGroup').count(), 0);
  assert.match(await page.textContent('#kcalList'), /9\/30　🏋️ 腕立て伏せ 20回 × 3セット15kcal/);
  assert.deepEqual(errors, []);
  await close();
});
