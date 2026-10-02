// テストの共通部品：ブラウザでアプリを開く
const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const KEY = 'taishoku-note';                 // アプリが記録を保存している場所の名前
const TODAY = '2026-10-02T10:00:00';         // テストの「きょう」は金曜日に固定（曜日や週の計算が毎回同じになるように）

let browser;
async function startBrowser(){ browser = await chromium.launch(); }
async function stopBrowser(){ await browser?.close(); }

// アプリを開く。saved を渡すと、その記録が入った状態で開く
// 返す errors には、画面で起きたエラーがたまる（最後に空かどうかを確かめる）
async function openApp(saved){
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.setFixedTime(new Date(TODAY));
  // 最初に開くときだけ入れる（開き直したときに、アプリが保存した記録を上書きしないように）
  if (saved) await page.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, [KEY, JSON.stringify(saved)]);
  await page.goto(APP);
  return { page, errors, close: () => context.close() };
}
// からだタブ → 運動 を開く
async function openKcal(page){
  await page.click('nav button[data-tab="body"]');
  await page.click('#bodyTabs button[data-bt="kcal"]');
}

module.exports = { startBrowser, stopBrowser, openApp, openKcal };
