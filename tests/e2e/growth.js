// Seed to willow: the tree, the growth widget, the journey and the archive totals, all from saved data.
const { chromium, devices } = require('playwright');
const A = require('./auth.js');
const B = 'http://localhost:3100';
const H = { origin: B };
const T = [];
const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
const PL = ['Paris', 'Lisbon', 'Kyoto', 'Paris', 'Oslo', 'Rome', 'Seoul', 'Lima', 'Hanoi', 'Cairo'];

(async () => {
  const b = await chromium.launch();
  let errs = [];
  try {
    const c = await b.newContext({ ...devices['iPhone 13'] });
    await A.signup(c);
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(p.url() + ' ' + e.message.slice(0, 80)));
    let n = 0;
    const ids = [];
    const add = async (to) => {
      while (n < to) {
        const r = await c.request.post(B + '/api/memories', { data: { place: PL[n % PL.length], moment: 'Moment ' + n, weight: ['light', 'tender', 'heavy'][n % 3], feeling: '' }, headers: H });
        ids.push((await r.json()).memory.id);
        n++;
      }
    };
    const look = async () => {
      await p.goto(B + '/');
      await p.waitForSelector('.willow');
      await p.waitForTimeout(600);
      return p.evaluate(() => ({
        stage: document.querySelector('.willow')?.getAttribute('data-stage'),
        florets: document.querySelectorAll('.willow .floret').length,
        strands: document.querySelectorAll('.willow .strand').length,
        limbs: document.querySelectorAll('.willow .limb-arc').length,
        blossoms: document.querySelectorAll('.willow .blossom').length,
        scale: (document.querySelector('#willow-crown')?.getAttribute('style') || '').match(/scale\(([\d.]+)\)/)?.[1],
      }));
    };

    // a seed, before anything is kept
    const s0 = await look();
    ok('0 memories: a seed, nothing in flower', s0.stage === 'seed' && s0.florets === 0 && s0.blossoms === 0, JSON.stringify(s0));

    // a draft (an unconfirmed suggestion) changes nothing
    await c.request.post(B + '/api/drafts', { data: { id: 'd1', origin: 'by-hand', data: { step: 0, weight: 'light', moment: 'Not saved yet' } }, headers: H }).catch(() => {});
    const sd = await look();
    ok('a draft does not grow the tree', sd.stage === 'seed' && sd.blossoms === 0, JSON.stringify(sd));

    await add(1);
    const s1 = await look();
    ok('1 memory: a sprout with one blossom', s1.stage === 'sprout' && s1.blossoms === 1, JSON.stringify(s1));
    await add(2);
    const s2 = await look();
    ok('2 memories: still a sprout, two blossoms', s2.stage === 'sprout' && s2.blossoms === 2, JSON.stringify(s2));
    await add(3);
    const s3 = await look();
    ok('3 memories: a young willow, small, with a few limbs', s3.stage === 'tree' && s3.limbs <= 5 && +s3.scale < 0.4 && s3.blossoms === 3, JSON.stringify(s3));
    await add(8);
    const s8 = await look();
    await add(20);
    const s20 = await look();
    await add(50);
    const s50 = await look();
    const grows = [s3, s8, s20, s50];
    const rising = (k) => grows.every((x, i) => i === 0 || +x[k] >= +grows[i - 1][k]);
    ok('it only grows: size, limbs, strands and florets rise with every stage', rising('scale') && rising('limbs') && rising('strands') && rising('florets') && +s50.scale > +s3.scale, grows.map((x) => `${x.scale}/${x.limbs}/${x.strands}/${x.florets}`).join(' → '));
    ok('50 memories: a full canopy, every memory a blossom', s50.limbs === 10 && s50.strands >= 100 && s50.blossoms === 50, JSON.stringify(s50));

    // the widget reads the real archive: 50 memories, 9 distinct places, 1 thread + 1 person link
    await c.request.post(B + '/api/threads', { data: { a: ids[0], b: ids[3], note: 'Both in Paris', origin: 'you' }, headers: H });
    const person = (await (await c.request.post(B + '/api/people', { data: { name: 'Ama' }, headers: H })).json()).person;
    await c.request.post(B + '/api/links', { data: { kind: 'memory-person', a: ids[1], b: person.id }, headers: H });
    await p.goto(B + '/today');
    await p.waitForSelector('.growth');
    const nums = await p.$$eval('.growth-nums strong', (x) => x.map((y) => y.textContent.trim()));
    ok('widget: memories gathered is the real count', nums[0] === '50', nums.join(','));
    ok('widget: growth points = 3×memories + 2×places + connections (150 + 18 + 2)', nums[1] === '170', nums.join(','));
    ok('widget: the stage is named, and no decay or streak is mentioned', /A perennial willow/.test(await p.textContent('.growth')) && !/streak|lose|decay/i.test(await p.textContent('.growth')));
    await p.click('.growth-open');
    await p.waitForSelector('.growth-journey');
    const j = await p.$$eval('.growth-journey li span', (x) => x.map((y) => y.textContent));
    ok('journey: planted, first memory, stages and the first thread, from saved dates', /seed was planted/.test(j[0]) && j.some((t) => /first memory: Paris/.test(t)) && j.some((t) => /A perennial willow, with memory number 50/.test(t)) && j.some((t) => /first red thread/.test(t)), j.join(' | '));
    await p.keyboard.press('Escape');

    await p.goto(B + '/archives');
    await p.waitForSelector('.arc-counts');
    ok('archives: totals without the widget', /50 memories · 9 places · 2 connections/.test(await p.textContent('.arc-counts')) && !(await p.isVisible('.growth')), await p.textContent('.arc-counts'));

    // the garden's caption and journey
    await p.goto(B + '/');
    await p.waitForSelector('.growth-fig');
    ok('garden: the plate is captioned with its stage', /Fig\. 50 · A perennial willow/.test(await p.textContent('.growth-fig')));

    // deleting a memory: the tree is drawn from what is still kept
    await c.request.delete(B + '/api/memories/' + ids[49], { headers: H });
    const sx = await look();
    ok('a deleted memory is no longer a blossom', sx.blossoms === 49, JSON.stringify(sx));

    // a smaller phone, no overflow
    const se = await b.newContext({ ...devices['iPhone SE'] });
    await A.share(c, se);
    const q = await se.newPage();
    await q.goto(B + '/today');
    await q.waitForSelector('.growth');
    ok('iPhone SE: the widget fits', await q.evaluate(() => document.querySelector('.growth').getBoundingClientRect().right <= innerWidth && document.documentElement.scrollWidth <= innerWidth));

    { const h418 = errs.filter((e) => /React error #418/.test(String(e))); errs = errs.filter((e) => !/React error #418/.test(String(e))); if (h418.length) T.push('NOTE recoverable hydration warnings (#418, known issue): ' + h418.length); }
    ok('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) {
    T.push('CRASH ' + (e.stack || e.message));
  }
  await b.close();
  console.log(T.join('\n'));
})();
