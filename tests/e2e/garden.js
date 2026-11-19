// The garden: a conversation drafts memories as buds; review turns them into blossoms; the transcript; clearing; phone.
const { chromium, devices } = require('playwright');
const B = 'http://localhost:3100/';
(async () => {
  const b = await chromium.launch();
  const T = [];
  const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
  const A = require('./auth.js');
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await c.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await c.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ json: [] }));
  await A.signup(c);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B);
  await p.waitForTimeout(2600);
  await p.screenshot({ path: 'ws-empty.png' });
  const say = async (t) => {
    await p.fill('#say', t);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    await p.waitForFunction(() => !document.querySelector('.garden.listening'), null, { timeout: 15000 });
    await p.waitForTimeout(1400);
  };
  const lines = [
    'We went to Lisbon last spring.',
    'On the tram up to Alfama in Lisbon the bells were ringing and my mom held my hand.',
    'Then we drove to the coast.',
    'At sunset in Sintra we ate grilled sardines and laughed until we cried.',
    'My grandmother’s village.',
    'The last morning in Jiangmen she braided my hair and I knew I might not see her again.',
  ];
  for (const l of lines) await say(l);
  ok('three moments drafted as buds; no blossoms before review', (await p.$$('.bud-draft')).length === 3 && (await p.$$('.blossom')).length === 0);
  ok('the agent says it drafted, never that it saved', /Drafted/.test(await p.textContent('.voice-line')) && !/saved|planted/i.test(await p.textContent('.voice-line')), await p.textContent('.voice-line'));
  await p.screenshot({ path: 'ws-buds.png' });
  await p.click('.review-go');
  await p.waitForSelector('.review');
  await p.waitForTimeout(600);
  ok('review shows the three drafts with their places', (await p.$$('.rv-item')).length === 3 && /Lisbon/.test(await p.textContent('.review')) && /Jiangmen/.test(await p.textContent('.review')));
  await p.click('.rv-foot .welcome-go');
  await p.waitForSelector('.rv-item.saved', { timeout: 10000 });
  await p.click('.review button:has-text("Done")');
  await p.waitForTimeout(1500);
  const n = await p.$$eval('.blossom', (x) => x.length);
  ok('3 blossoms after saving', n === 3, String(n));
  ok('the newest saved memory opens itself', await p.isVisible('.card') && /braided/.test(await p.textContent('.card')));
  await p.screenshot({ path: 'ws-card.png' });
  await p.reload();
  await p.waitForTimeout(2500);
  ok('persists after reload', (await p.$$eval('.blossom', (x) => x.length)) === 3);
  await p.click('text=The conversation');
  await p.waitForTimeout(500);
  ok('transcript opens', await p.isVisible('.log'));
  await p.screenshot({ path: 'ws-log.png' });
  await p.click('text=Hide the conversation');
  await p.click('text=Conversations');
  await p.click('text=Clear the whole garden…');
  await p.click('.confirm-yes');
  await p.waitForTimeout(1500);
  ok('clearing the garden empties it', (await p.$$eval('.blossom', (x) => x.length)) === 0 && /Your garden is waiting/.test(await p.textContent('.voice')));
  ok('no errors', errs.length === 0, JSON.stringify(errs));
  const m = await b.newContext({ ...devices['iPhone 13'] });
  await A.share(c, m);
  const q = await m.newPage();
  await q.goto(B);
  await q.waitForTimeout(2400);
  await q.screenshot({ path: 'ws-m.png' });
  ok('phone no sideways scroll', (await q.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  console.log(T.join('\n'));
  await b.close();
})();
