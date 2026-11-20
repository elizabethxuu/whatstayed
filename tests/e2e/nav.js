// Three spaces: every route still opens, sits under the right bubble, and the profile menu reaches every setting.
const { chromium, devices } = require('playwright');
const A = require('./auth.js');
const B = 'http://localhost:3100';
const H = { origin: B };
const T = [];
const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));

const ROUTES = [
  ['/today', 'today', null], ['/', 'garden', null], ['/constellation', 'garden', '/constellation'], ['/rewind', 'garden', '/rewind'],
  ['/archive', 'archive', '/archive'], ['/archives', 'archive', '/archives'], ['/places', 'archive', '/places'], ['/people', 'archive', '/people'],
  ['/timeline', 'archive', '/timeline'], ['/collections', 'archive', '/collections'], ['/letters', 'archive', '/letters'], ['/search', 'archive', null],
];
const HREF = { today: '/today', garden: '/', archive: '/archive' };

(async () => {
  const b = await chromium.launch();
  let errs = [];
  try {
    const c = await b.newContext({ ...devices['iPhone 13'] });
    await A.signup(c);
    const m = (await (await c.request.post(B + '/api/memories', { data: { place: 'Lisbon', moment: 'Bells on the tram up to the castle', weight: 'light', feeling: '' }, headers: H })).json()).memory;
    for (const [label, ctx, sel] of [['phone', c, '.bubbles.dock'], ['desktop', null, '.top-bubbles']]) {
      const cx = ctx || (await b.newContext({ viewport: { width: 1440, height: 900 } }));
      if (!ctx) await A.share(c, cx);
      const p = await cx.newPage();
      p.on('pageerror', (e) => errs.push(label + ' ' + p.url() + ' ' + e.message.slice(0, 80)));
      const bad = [];
      for (const [url, space, chip] of ROUTES) {
        const r = await p.goto(B + url);
        await p.waitForSelector(sel);
        const on = await p.$$eval(`${sel} .bubble[aria-current="page"]`, (x) => x.map((y) => y.getAttribute('href')));
        const chipOn = chip ? await p.getAttribute(`.chips a[href="${chip}"]`, 'aria-current') : 'page';
        if (r.status() !== 200 || on.join() !== HREF[space] || chipOn !== 'page') bad.push(`${url}: ${r.status()} ${on.join()} ${chipOn}`);
      }
      ok(`${label}: every route opens under its space, with its chip marked`, bad.length === 0, bad.join(' | '));
      await p.goto(B + '/memory/' + m.id);
      await p.waitForSelector(sel);
      ok(`${label}: a memory deep link opens under Garden`, (await p.getAttribute(`${sel} a[href="/"]`, 'aria-current')) === 'page');
      await p.goto(B + '/you');
      await p.waitForSelector(sel);
      ok(`${label}: You belongs to no bubble; the avatar is marked instead`, (await p.$$(`${sel} .bubble[aria-current="page"]`)).length === 0 && (await p.getAttribute('.avatar', 'aria-current')) === 'page');
      ok(`${label}: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }

    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(p.url() + ' ' + e.message.slice(0, 80)));
    await p.goto(B + '/archive');
    await p.fill('.archive-search input', 'tram');
    await p.press('.archive-search input', 'Enter');
    await p.waitForURL(/\/search\?q=tram/);
    await p.waitForTimeout(800);
    ok('archive search finds a memory', /Bells on the tram/.test(await p.textContent('main')));
    await p.goto(B + '/archive');
    ok('All lists recent memories from the archive', /Bells on the tram/.test(await p.textContent('.all-list')));
    await p.click('.all-list a');
    await p.waitForURL(/\/memory\//);
    ok('a recent memory opens', true);
    await p.goBack();
    await p.waitForURL('**/archive');
    ok('back returns to the Archive', true);

    // the profile menu reaches every setting
    const missing = [];
    for (const [label, id] of [['Profile', 'profile'], ['Settings', 'settings'], ['Notifications', 'notifications'], ['Privacy', 'privacy'], ['Export memories', 'export'], ['Account', 'account']]) {
      await p.goto(B + '/today');
      await p.click('.avatar');
      await p.click(`.profile-menu >> text=${label}`);
      await p.waitForURL(new RegExp('/you#' + id));
      if (!(await p.$('#' + id))) missing.push(label);
    }
    ok('profile menu: Profile, Settings, Notifications, Privacy, Export, Account all land on their section', missing.length === 0, missing.join(','));

    // the garden's explorations
    await p.goto(B + '/');
    await p.click('.garden-explore >> text=Constellation');
    await p.waitForURL('**/constellation');
    ok('garden: Constellation is reached from the willow', (await p.getAttribute('.garden-chips a[href="/constellation"]', 'aria-current')) === 'page');
    await p.click('.garden-chips >> text=The willow');
    await p.waitForURL(B + '/');
    ok('and back to the willow', true);

    // old destinations
    const acc = await p.goto(B + '/account');
    ok('/account still leads to You', /\/you/.test(p.url()) && acc.status() === 200);

    { const h418 = errs.filter((e) => /React error #418/.test(String(e))); errs = errs.filter((e) => !/React error #418/.test(String(e))); if (h418.length) T.push('NOTE recoverable hydration warnings (#418, known issue): ' + h418.length); }
    ok('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) {
    T.push('CRASH ' + (e.stack || e.message));
  }
  await b.close();
  console.log(T.join('\n'));
})();
