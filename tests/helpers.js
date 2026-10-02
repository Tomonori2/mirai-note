// テストの共通部品：ブラウザでアプリを開く
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// 本番（tomonori2.github.io）と同じ並びで出す小さなサーバー
//   /mirai-note/…          → このリポジトリのファイル
//   /eigo-kaiwa/index.html → テスト用の英会話アプリ（tests/fixtures/eigo-kaiwa.html）
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
function serve(req, res){
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = null;
  if (url === '/eigo-kaiwa/index.html') file = path.join(__dirname, 'fixtures', 'eigo-kaiwa.html');
  else if (url.startsWith('/mirai-note/')) file = path.join(ROOT, url.slice('/mirai-note/'.length) || 'index.html');
  if (!file || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
let server, APP;
const KEY = 'taishoku-note';                 // アプリが記録を保存している場所の名前
const TODAY = '2026-10-02T10:00:00';         // テストの「きょう」は金曜日に固定（曜日や週の計算が毎回同じになるように）

let browser;
async function startBrowser(){
  server = http.createServer(serve);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  APP = `http://127.0.0.1:${server.address().port}/mirai-note/index.html`;
  browser = await chromium.launch();
}
async function stopBrowser(){ await browser?.close(); await new Promise(r => server ? server.close(r) : r()); }

// アプリを開く。saved を渡すと、その記録が入った状態で開く
// ek を渡すと、英会話アプリの記録（{prog, study, settings, mine}）がこの端末にある状態にする
// opts.noEk：英会話アプリが開けない（404）状態にする。opts.storage：ほかに入れておく記録 {名前: 文字}
// 返す errors には、画面で起きたエラーがたまる（最後に空かどうかを確かめる）
async function openApp(saved, ek, opts = {}){
  // serviceWorkers:'block'：テストのたびに控え（キャッシュ）が残らないように
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // 英会話アプリが無い（404）ことを確かめるテストでは、その読みこみの失敗はエラーに数えない
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.clock.setFixedTime(new Date(TODAY));
  // 最初に開くときだけ入れる（開き直したときに、アプリが保存した記録を上書きしないように）
  if (saved) await page.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, [KEY, JSON.stringify(saved)]);
  if (opts.noEk) await page.route('**/eigo-kaiwa/**', r => r.fulfill({ status: 404, body: 'not found' }));
  if (opts.storage) await page.addInitScript(st => { for (const [k, v] of Object.entries(st)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, opts.storage);
  if (ek) await page.addInitScript(ek => { for (const [k, v] of Object.entries(ek)) if (localStorage.getItem('ek_' + k) === null) localStorage.setItem('ek_' + k, JSON.stringify(v)); }, ek);
  await page.goto(APP);
  return { page, errors, close: () => context.close() };
}
// からだタブ → 運動 を開く
async function openKcal(page){
  await page.click('nav button[data-tab="body"]');
  await page.click('#bodyTabs button[data-bt="kcal"]');
}

module.exports = { startBrowser, stopBrowser, openApp, openKcal };
