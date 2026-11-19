// The White Garden: phone tab bar, how white each screen really is, no stray pinks, the tree growing finer, reduced motion.
const { chromium, devices } = require('playwright');
const A = require('./auth.js');
const B = 'http://localhost:3100';
const T = [];
const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
const fontsOff = (c) => c.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
const post = (ctx, u, data) => ctx.request.post(B + u, { data, headers: { origin: B } });

/** share of the visible page that is near-white (luminance > 0.88), sampled from a screenshot */
async function whiteness(page) {
  const png = await page.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let w = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      n++; if (l > 0.88) w++;
    }
    return w / n;
  }, png.toString('base64'));
}

(async () => {
  const b = await chromium.launch();
  const errs = [];

  // desktop
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await fontsOff(c);
  await A.signup(c);
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/');
  await p.waitForTimeout(3500);
  ok('desktop: room links in the masthead, no tab bar', (await p.isVisible('.top .rooms')) && !(await p.isVisible('.tabbar')));
  const grown0 = await p.$$eval('.twiglet.grown', (x) => x.length);
  ok('an empty garden shows no extra twiglets yet', grown0 === 0, String(grown0));

  for (const [place, moment, weight] of [['Kyoto', 'Rain on the temple roof', 'tender'], ['Lisbon', 'Bells on the tram', 'light'], ['Jiangmen', 'She braided my hair', 'heavy'], ['Paris', 'Crêpes in the rain', 'light'], ['Oslo', 'The fjord was still', 'tender'], ['Taipei', 'Steam off the dumplings', 'light']]) {
    await post(c, '/api/memories', { place, moment, feeling: 'held', weight });
  }
  await p.reload();
  await p.waitForTimeout(4000);
  const grown6 = await p.$$eval('.twiglet.grown', (x) => x.length);
  ok('the crown grows finer as memories are added', grown6 > 10, String(grown6));
  ok('blossoms are white; only the meaningful one carries the red', (await p.$$('.blossom.w-heavy')).length === 1 && (await p.$$eval('.blossom .petal', (ps) => ps.every((x) => /url\(#p(White|Mist|Meaning)\)/.test(x.getAttribute('fill'))))));

  // how white is each room?
  for (const [u, name] of [['/', 'garden'], ['/archives', 'archives'], ['/places', 'places'], ['/people', 'people'], ['/timeline', 'timeline'], ['/collections', 'collections'], ['/letters', 'letters'], ['/you', 'you'], ['/today', 'today']]) {
    await p.goto(B + u);
    await p.waitForTimeout(u === '/' ? 3500 : 1400);
    const w = await whiteness(p);
    ok(`${name}: predominantly white (${Math.round(w * 100)}%)`, w >= 0.85, String(w));
  }

  // no stray pinks anywhere in the styles of these rooms (the muted red #874d50 is allowed)
  const pinks = await p.evaluate(() => {
    const bad = new Set();
    const pink = (str) => {
      for (const m of str.matchAll(/rgba?\((\d+), (\d+), (\d+)/g)) {
        const [r, g, b2] = [+m[1], +m[2], +m[3]];
        const mx = Math.max(r, g, b2), mn = Math.min(r, g, b2);
        const s = mx ? (mx - mn) / mx : 0;
        const isRed = r === 135 && g === 77 && b2 === 80;
        if (!isRed && r > g + 18 && r > b2 + 8 && s > 0.16) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      for (const k of ['color', 'backgroundColor', 'borderTopColor', 'fill', 'stroke']) if (pink(cs[k])) bad.add(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className);
    }
    return [...bad].slice(0, 6);
  });
  ok('no pink left in the interface', pinks.length === 0, pinks.join(', '));

  // phone
  const m = await b.newContext({ ...devices['iPhone 13'] });
  await fontsOff(m);
  await A.share(c, m);
  const q = await m.newPage();
  q.on('pageerror', (e) => errs.push('M: ' + e.message));
  await q.goto(B + '/');
  await q.waitForTimeout(2500);
  ok('phone: a tab bar instead of the row of rooms', (await q.isVisible('.tabbar')) && !(await q.isVisible('.top .rooms')));
  ok('phone: five tabs, Garden marked', (await q.$$('.tabbar .tab')).length === 5 && (await q.getAttribute('.tabbar a[href="/"]', 'aria-current')) === 'page');
  const bar = await q.$eval('.tabbar', (e) => { const r = e.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: innerHeight }; });
  ok('phone: the bar floats just above the bottom edge', bar.h - bar.bottom >= 0 && bar.h - bar.bottom <= 24, JSON.stringify(bar));
  const input = await q.$eval('#say', (e) => e.getBoundingClientRect().bottom);
  const barTop = await q.$eval('.tabbar', (e) => e.getBoundingClientRect().top);
  ok('phone: the garden’s input is above the bar, not under it', input <= barTop, `${input} vs ${barTop}`);
  await q.click('.tabbar a[href="/you"]');
  await q.waitForURL('**/you');
  ok('phone: You holds the other rooms', await q.isVisible('.you-explore >> text=Timeline'));
  await q.click('.you-explore >> text=Timeline');
  await q.waitForURL('**/timeline');
  await q.waitForTimeout(800);
  ok('phone: You is marked while in one of its rooms', (await q.getAttribute('.tabbar a[href="/you"]', 'aria-current')) === 'page');
  await q.click('.tabbar a[href="/places"]');
  await q.waitForURL('**/places');
  ok('phone: tabs navigate', (await q.getAttribute('.tabbar a[href="/places"]', 'aria-current')) === 'page');
  const over = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('phone: no sideways scroll', over <= 0, String(over));
  await q.goto(B + '/');
  await q.waitForSelector('.blossom');
  await q.focus('.blossom'); await q.keyboard.press('Enter'); await q.waitForTimeout(700);
  const cardBottom = await q.$eval('.card', (e) => e.getBoundingClientRect().bottom);
  const tb = await q.$eval('.tabbar', (e) => e.getBoundingClientRect().top);
  ok('phone: an open memory sits above the tab bar', cardBottom <= tb + 1, `${cardBottom} vs ${tb}`);

  // reduced motion
  const r = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await fontsOff(r);
  await A.share(c, r);
  const rp = await r.newPage();
  await rp.goto(B + '/');
  await rp.waitForTimeout(1500);
  const still = await rp.evaluate(() => [...document.querySelectorAll('.limb, .leaf, .petal')].every((e) => getComputedStyle(e).animationName === 'none'));
  ok('reduced motion: branches, leaves and petals hold still', still);

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(T.join('\n'));
  console.log(`\n${T.filter((x) => x.startsWith('PASS')).length}/${T.length} passed`);
  await b.close();
})().catch((e) => { console.log(T.join('\n')); console.error('CRASH', e); process.exit(1); });
