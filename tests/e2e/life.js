// Phase 2: people, links, red threads to pages, timeline, revisits, collections + export, letters, search, isolation, mobile.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const B = 'http://localhost:3100';
const OUT = __dirname + '/out/life';
fs.mkdirSync(OUT, { recursive: true });
const T = [];
const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
async function mock(ctx) {
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ json: [] }));
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const threeYearsAgo = iso(new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()));
const PW = 'quiet-garden-27';

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await mock(c);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push('console: ' + m.text()));
  const open = async (sel) => { await p.focus(sel); await p.keyboard.press('Enter'); await p.waitForTimeout(350); };
  const st = () => p.evaluate(async () => (await fetch('/api/state')).json());

  // photo
  await p.goto(B + '/welcome');
  const jpg = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 700; const x = c.getContext('2d'); x.fillStyle = '#c9b8a8'; x.fillRect(0, 0, 900, 700); x.fillStyle = '#fff'; x.fillRect(300, 200, 300, 300); return c.toDataURL('image/jpeg', .9).split(',')[1]; });
  const PHOTO = OUT + '/p.jpg';
  fs.writeFileSync(PHOTO, Buffer.from(jpg, 'base64'));

  // sign up
  await p.click('text=Begin a garden');
  await p.fill('input[type=email]', 'liz2@example.com');
  await p.fill('input[type=password]', PW);
  await p.click('button[type=submit]');
  await p.waitForURL(B + '/');
  await p.screenshot({ path: OUT + '/masthead.png' });

  // two memories by hand, one dated three years ago today
  const plant = async (moment, place, feeling, date) => {
    await p.click('text=Plant by hand');
    await p.fill('.mem-ed textarea', moment);
    await p.fill('#place', place);
    await p.fill('#feeling', feeling);
    if (date) await p.fill('.mem-ed input[type=date]', date);
    await p.click('.mem-ed button[type=submit]');
    await p.waitForTimeout(700);
  };
  await plant('She braided my hair on the last morning', 'Jiangmen', 'held', threeYearsAgo);
  await plant('Crêpes on the Seine, rain on the bridge', 'Paris', 'free', '2025-06-02');
  ok('two memories planted, one with a date', (await st()).memories.filter((m) => m.date === threeYearsAgo).length === 1 && (await p.$$('.blossom')).length === 2);

  // revisit on the garden
  await p.reload();
  await p.waitForSelector('.revisits', { timeout: 5000 }).catch(() => {});
  const rv = (await p.textContent('.revisits').catch(() => '')) || '';
  ok('garden brings back “3 years ago today”', /3 years ago today/i.test(rv) && /braided/.test(rv), rv);
  await p.click('.revisits button');
  ok('revisit opens that memory', /braided my hair/.test(await p.textContent('.card')));
  await p.screenshot({ path: OUT + '/revisit.png' });

  // 10. create a person
  await p.click('.rooms >> text=People');
  await p.waitForURL('**/people');
  ok('people: inviting empty state', /No one is here yet/.test(await p.textContent('main')));
  await p.click('text=Add the first person…');
  await p.click('.loc-ed button[type=submit]');
  ok('person needs a name', /A name/.test(await p.textContent('.loc-ed')));
  await p.fill('.loc-ed input[placeholder="Nai Nai"]', 'Nai Nai');
  await p.fill('.loc-ed input[placeholder="My grandmother"]', 'My grandmother');
  await p.fill('.loc-ed textarea', 'She hummed while she cooked.');
  await p.click('.loc-ed button[type=submit]');
  await p.waitForSelector('.person h1');
  ok('person profile made and opened', (await p.textContent('.person h1')) === 'Nai Nai' && /My grandmother/.test(await p.textContent('.person-head')));
  await p.setInputFiles('.person input[type=file][accept="image/*"]', PHOTO);
  await p.waitForSelector('.person .shelf-photos img', { timeout: 10000 });
  await p.fill('#pnotes', 'Her kitchen smelled of ginger.');
  await p.click('text=Save notes');
  await p.waitForSelector('.person .saved:has-text("Saved")');
  // 11. connect a memory to that person (from their page)
  await p.click('text=Add a shared memory…');
  await p.click('.pick-list button:has-text("braided")');
  await p.click('.loc-ed >> text=Done');
  ok('memory connected to the person', /braided my hair/.test(await p.textContent('.person')));
  await p.reload();
  await p.waitForSelector('.person h1');
  ok('person, photo, notes and link persist', (await p.inputValue('#pnotes')) === 'Her kitchen smelled of ginger.' && (await p.$$('.person .shelf-photos img')).length === 1 && /braided/.test(await p.textContent('.person')));
  await p.screenshot({ path: OUT + '/person.png', fullPage: true });

  // from the garden card: who was there, add someone new inline
  await p.goto(B + '/');
  await open('.blossom[aria-label^="Paris"]');
  await p.click('.card >> text=Who was there?');
  await p.fill('.pick-new input', 'Leia');
  await p.click('.pick-new button');
  await p.waitForTimeout(500);
  await p.click('.loc-ed >> text=Done');
  ok('card shows who was there', /With Leia/.test(await p.textContent('.card-with')));
  await open('.blossom[aria-label^="Jiangmen"]');
  ok('card links to the person', /With Nai Nai/.test(await p.textContent('.card-with')));

  // Archives: page with place, person, and a red thread to a memory
  await p.goto(B + '/archives');
  await p.click('text=Write something…');
  await p.fill('#page', 'Dreamt of the courtyard again, and her radio.');
  await p.waitForSelector('.saved.s-saved', { timeout: 8000 });
  await p.click('.page-ties >> text=Add a place');
  await p.fill('.loc-fields label:nth-child(1) input', 'The courtyard');
  await p.fill('.loc-fields label:nth-child(3) input', 'Jiangmen');
  await p.fill('.loc-fields label:nth-child(4) input', 'China');
  await p.click('text=Save place');
  await p.waitForTimeout(400);
  ok('page has a place', /The courtyard, Jiangmen, China/.test(await p.textContent('.page-ties')));
  await p.click('.page-ties >> text=Add someone');
  await p.click('.pick-list button:has-text("Nai Nai")');
  await p.click('.loc-ed >> text=Done');
  await p.click('text=Tie to a memory…');
  await p.click('.pick-list button:has-text("braided")');
  await p.click('.loc-ed >> text=Done');
  await p.click('.page-threads >> text=add why');
  await p.fill('.thread-note input', 'The same courtyard');
  await p.click('.thread-note >> text=save');
  await p.waitForTimeout(500);
  const ties = await p.textContent('.page-ties');
  ok('page tied to a person and (with a reason) a memory', /Nai Nai/.test(ties) && /braided/.test(ties) && /The same courtyard/.test(ties), ties);
  await p.screenshot({ path: OUT + '/page-ties.png', fullPage: true });
  await p.click('text=← The Archives');
  await p.waitForTimeout(500);
  await p.selectOption('.arc-filter select >> nth=1', { label: 'With Nai Nai' });
  ok('archives filter by person', (await p.$$('.leaf')).length === 1);
  await p.selectOption('.arc-filter select >> nth=1', '');
  await p.selectOption('.arc-filter select >> nth=0', 'photo');
  ok('archives filter: with photographs (none yet)', (await p.$$('.leaf')).length === 0);
  await p.selectOption('.arc-filter select >> nth=0', '');
  // memory card shows the page
  await p.goto(B + '/');
  await open('.blossom[aria-label^="Jiangmen"]');
  ok('memory card shows the page written about it', /Written about: Dreamt of the courtyard/.test(await p.textContent('.card')));
  await p.click('.card-thread >> a');
  await p.waitForSelector('#page');
  ok('…and opens it', /courtyard again/.test(await p.inputValue('#page')));

  // place page lists the page written there
  await p.goto(B + '/places?p=jiangmen--china');
  await p.waitForTimeout(800);
  // memory also needs a place for the group to exist
  // (the page alone isn't a memory place; add the memory's place too)
  await p.goto(B + '/');
  await open('.blossom[aria-label^="Jiangmen"]');
  await p.click('.card >> text=Add a place');
  await p.fill('.loc-fields label:nth-child(3) input', 'Jiangmen');
  await p.fill('.loc-fields label:nth-child(4) input', 'China');
  await p.click('text=Save place');
  await p.waitForTimeout(400);
  await p.goto(B + '/places?p=jiangmen--china');
  await p.waitForSelector('.pl-page');
  ok('place page lists pages written there', /Pages written here[\s\S]*Dreamt of the courtyard/.test(await p.textContent('.pl-page')));

  // Timeline
  await p.click('.rooms >> text=Timeline');
  await p.waitForURL('**/timeline');
  await p.click('text=Add a date');
  await p.fill('.loc-ed input[placeholder="Moved to New York"]', 'Moved to New York');
  await p.fill('.loc-ed input[type=date]', '2023-08-15');
  await p.click('.loc-ed button[type=submit]');
  await p.waitForTimeout(500);
  const tl = await p.textContent('.tl');
  ok('timeline: memories, page, important day, in order', /Moved to New York/.test(tl) && /braided/.test(tl) && /Crêpes/.test(tl) && /Dreamt/.test(tl));
  const years = await p.$$eval('.tl-y', (x) => x.map((e) => +e.textContent));
  ok('years run newest first', years.every((y, i) => !i || y < years[i - 1]), years.join(','));
  ok('timeline: on this day', /3 years ago today/i.test(await p.textContent('.tl-today').catch(() => '')));
  await p.selectOption('.tl-tools select >> nth=0', '2023');
  ok('filter by year', (await p.$$('.tl-item')).length >= 1 && (await p.$$eval('.tl-y', (x) => x.map((e) => e.textContent))).every((y) => y === '2023'));
  await p.selectOption('.tl-tools select >> nth=0', '');
  await p.selectOption('.tl-tools select >> nth=3', { label: 'With Nai Nai' });
  ok('filter by person', (await p.$$('.tl-item')).length === 2);
  await p.selectOption('.tl-tools select >> nth=3', '');
  await p.selectOption('.tl-tools select >> nth=2', 'milestone');
  ok('filter by kind', (await p.$$('.tl-item')).length === 1);
  await p.click('text=Clear');
  await p.screenshot({ path: OUT + '/timeline.png', fullPage: true });

  // Collections
  await p.click('.rooms >> text=Collections');
  await p.waitForURL('**/collections');
  await p.click('text=Start the first collection…');
  await p.fill('.loc-ed input[placeholder="Summers in Jiangmen"]', 'Jiangmen');
  await p.fill('.loc-ed input >> nth=1', 'Where she lived.');
  await p.click('.loc-ed button[type=submit]');
  await p.waitForSelector('.coll h1');
  await p.click('text=Add memories or pages');
  await p.click('.pick-list button:has-text("braided")');
  await p.click('.pick-tabs >> text=Pages');
  await p.click('.pick-list button:has-text("Dreamt")');
  await p.click('.loc-ed >> text=Done');
  ok('collection holds a memory and a page', (await p.$$('.coll-items li')).length === 2);
  // give the memory a photo, then choose it as the cover
  await p.goto(B + '/');
  await open('.blossom[aria-label^="Jiangmen"]');
  await p.setInputFiles('.card input[type=file][accept="image/*"]', PHOTO);
  await p.waitForSelector('.card .shelf-photos img', { timeout: 10000 });
  await p.goto(B + '/collections');
  ok('cover falls back to the first photograph', (await p.$$('.cover-frame img')).length === 1);
  await p.click('.cover');
  await p.click('.coll >> text=Edit');
  await p.click('.cover-pick label >> nth=1');
  await p.click('.loc-ed button[type=submit]');
  await p.waitForTimeout(500);
  ok('cover chosen and saved', !!(await st()).collections[0].cover);
  // 14. export the collection
  await p.click('text=Open the printed edition');
  await p.waitForSelector('.print-doc');
  const doc = await p.textContent('.print-doc');
  ok('printed edition has the memory, the page, people, place and the thread', /braided my hair/.test(doc) && /courtyard again/.test(doc) && /Nai Nai/.test(doc) && /Jiangmen/.test(doc) && /Tied to Jiangmen: The same courtyard/.test(doc), doc.slice(0, 300));
  await p.screenshot({ path: OUT + '/print.png', fullPage: true });
  await p.emulateMedia({ media: 'print' });
  ok('print hides the controls', !(await p.isVisible('.print-bar')));
  await p.pdf({ path: OUT + '/collection.pdf', format: 'A4' });
  await p.emulateMedia({ media: 'screen' });
  const pdfPages = (fs.readFileSync(OUT + '/collection.pdf', 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok('PDF renders: cover + one page per piece + end', pdfPages >= 4, String(pdfPages));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Download as a web page')]);
  await dl.saveAs(OUT + '/collection.html');
  const html = fs.readFileSync(OUT + '/collection.html', 'utf8');
  ok('web page export is self-contained (photos inside, no app links)', /data:image\/jpeg;base64/.test(html) && !/\/api\/media\//.test(html) && /braided my hair/.test(html), String(html.length));
  const v = await b.newContext();
  const vp = await v.newPage();
  await vp.goto('file://' + OUT + '/collection.html');
  ok('exported page opens on its own, signed out', /Jiangmen/.test(await vp.textContent('h1')) && (await vp.$$eval('img', (x) => x.every((i) => i.naturalWidth > 0))));
  await vp.screenshot({ path: OUT + '/exported.png' });
  await v.close();

  // Letters
  await p.goto(B + '/letters');
  await p.click('text=Seal it');
  ok('letter needs words', /Write a little first/.test(await p.textContent('.letter-desk')));
  const tomorrow = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  await p.fill('#letter', 'Dear me, did you go back to Jiangmen?');
  await p.fill('.letter-when input[type=date]', tomorrow);
  await p.click('text=Seal it');
  await p.waitForSelector('.envelope');
  const s1 = await st();
  ok('sealed letter: words never sent to the browser', s1.letters.length === 1 && s1.letters[0].sealed && s1.letters[0].body === undefined && !JSON.stringify(s1).includes('did you go back'));
  const past = await p.evaluate(async () => (await fetch('/api/letters', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'x', openOn: '2020-01-01' }) })).status);
  ok('a letter can’t be dated in the past', past === 400);
  await p.screenshot({ path: OUT + '/letters.png', fullPage: true });
  // the day arrives (shift the person's clock forward a day and a bit)
  await c.addCookies([{ name: 'ws_tz', value: '-1500', url: B }]);
  await p.addInitScript(() => { Object.defineProperty(Date.prototype, 'getTimezoneOffset', { value: () => -1500 }); });
  await p.goto(B + '/');
  await p.waitForTimeout(800);
  ok('on its day, the garden says a letter has arrived', /A letter is ready/.test((await p.textContent('.revisits').catch(() => '')) || ''));
  await p.click('.revisits >> text=Read it');
  await p.waitForURL('**/letters**');
  await p.waitForSelector('.letter-body');
  ok('…and it opens, with its words', /did you go back to Jiangmen/.test(await p.textContent('.letter-body')));
  await c.addCookies([{ name: 'ws_tz', value: String(now.getTimezoneOffset()), url: B }]);
  // a second letter, opened early
  const p2 = await c.newPage();
  await p2.goto(B + '/letters');
  await p2.fill('#letter', 'Open me in ten years.');
  await p2.click('text=in 10 years');
  await p2.click('text=Seal it');
  await p2.waitForSelector('.envelope');
  p2.once('dialog', (d) => d.accept());
  await p2.click('.envelope >> text=Open early');
  await p2.waitForTimeout(600);
  ok('a letter can be opened early, on purpose', /Open me in ten years/.test(await p2.textContent('main')));
  await p2.close();

  // 13. search
  await p.goto(B + '/search');
  await p.fill('#everything', 'jiangmen');
  await p.waitForTimeout(400);
  const groups = await p.$$eval('.result-group h2', (x) => x.map((h) => h.textContent));
  ok('search finds memories, pages, places, collections, letters', ['Memories', 'Pages', 'Places', 'Collections', 'Letters'].every((g) => groups.some((x) => x.startsWith(g))), groups.join(' | '));
  await p.fill('#everything', 'ginger');
  await p.waitForTimeout(400);
  ok('search finds people by their notes', /Nai Nai/.test(await p.textContent('.results')));
  await p.fill('#everything', 'crêpes');
  await p.waitForTimeout(400);
  await p.click('.results a');
  await p.waitForURL(B + '/');
  await p.waitForSelector('.card');
  ok('a result opens the old memory', /Crêpes on the Seine/.test(await p.textContent('.card')));
  await p.goto(B + '/search?q=zzzz');
  await p.waitForTimeout(500);
  ok('search: honest empty state', /No results for/.test(await p.textContent('main')));

  // remove a person: memories stay
  await p.goto(B + '/people');
  await p.click('.face:has-text("Leia")');
  await p.waitForSelector('.person h1');
  p.once('dialog', (d) => d.accept());
  await p.click('.person-head >> text=Remove');
  await p.waitForURL('**/people');
  const s2 = await st();
  ok('person removed; their memory stays, link gone', s2.people.length === 1 && s2.memories.length === 2 && !s2.links.some((l) => l.b && !s2.people.some((pp) => pp.id === l.b) && l.kind !== 'entry-memory'));

  // isolation
  const c2 = await b.newContext();
  await mock(c2);
  await c2.request.post(B + '/api/auth/signup', { data: { email: 'stranger@example.com', password: 'stranger-pass-1' }, headers: { origin: B } });
  const q = await c2.newPage();
  await q.goto(B + '/people');
  const mem = s2.memories[0].id, per = s2.people[0].id, col = s2.collections[0].id;
  const iso2 = await q.evaluate(async ({ mem, per, col }) => {
    const j = (u, m, b) => fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b && JSON.stringify(b) }).then((r) => r.status);
    return [
      await j('/api/links', 'POST', { kind: 'memory-person', a: mem, b: per }),
      await j('/api/people/' + per, 'PATCH', { name: 'x' }),
      await j('/api/collections/' + col + '/items', 'POST', { kind: 'memory', id: mem }),
      await j('/api/collections/' + col, 'PATCH', { name: 'x' }),
    ];
  }, { mem, per, col });
  const sq = await q.evaluate(async () => (await fetch('/api/state')).json());
  ok('another person can’t touch people, links or collections', iso2.every((x) => x === 404) && sq.people.length + sq.collections.length + sq.letters.length === 0, iso2.join(','));

  // export includes the new things
  await p.goto(B + '/account');
  const [z] = await Promise.all([p.waitForEvent('download'), p.click('text=Download everything (.zip)')]);
  await z.saveAs(OUT + '/all.zip');
  execSync(`cd ${OUT} && rm -rf ex && mkdir ex && cd ex && unzip -q ../all.zip`);
  const all = JSON.parse(fs.readFileSync(OUT + '/ex/what-stayed.json', 'utf8'));
  ok('full export includes people, links, collections, letters, days', all.people.length === 1 && all.links.length >= 3 && all.collections.length === 1 && all.letters.length === 2 && all.milestones.length === 1);

  // 15/16 sign out and back in
  await p.click('text=Sign out');
  await p.waitForURL('**/welcome');
  await p.fill('input[type=email]', 'liz2@example.com');
  await p.fill('input[type=password]', PW);
  await p.click('button[type=submit]');
  await p.waitForURL(B + '/');
  const s3 = await st();
  ok('after signing back in, everything is intact', s3.memories.length === 2 && s3.people.length === 1 && s3.collections.length === 1 && s3.collectionItems.length === 2 && s3.letters.length === 2 && s3.milestones.length === 1 && s3.entries[0].location?.city === 'Jiangmen');

  // mobile
  const m = await b.newContext({ ...devices['iPhone 13'] });
  await mock(m);
  await m.addCookies((await c.cookies()).filter((x) => x.name === 'ws_session'));
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errs.push('M: ' + e.message));
  for (const [u, name] of [['/', 'garden'], ['/people', 'people'], ['/people?p=' + per, 'person'], ['/timeline', 'timeline'], ['/collections', 'collections'], ['/collections?c=' + col, 'collection'], ['/print?c=' + col, 'print'], ['/letters', 'letters'], ['/search?q=jiangmen', 'search'], ['/archives', 'archives']]) {
    await mp.goto(B + u);
    await mp.waitForTimeout(900);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`mobile ${name}: no sideways scroll`, over <= 0, String(over));
    await mp.screenshot({ path: OUT + `/m-${name}.png` });
  }
  // tablet
  const t = await b.newContext({ ...devices['iPad Mini'] });
  await mock(t);
  await t.addCookies((await c.cookies()).filter((x) => x.name === 'ws_session'));
  const tp = await t.newPage();
  for (const u of ['/', '/timeline', '/people']) {
    await tp.goto(B + u);
    await tp.waitForTimeout(700);
    ok(`tablet ${u}: no sideways scroll`, (await tp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  }
  await tp.screenshot({ path: OUT + '/t-people.png' });

  // keyboard: every room's nav reachable, buttons have names
  await p.goto(B + '/timeline');
  const unnamed = await p.$$eval('button, a, input, select, textarea', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); if (!r.width) return false; const n = (e.getAttribute('aria-label') || e.textContent || '').trim() || (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label') || e.getAttribute('placeholder'); return !n; }).map((e) => e.outerHTML.slice(0, 80)));
  ok('timeline: every control has a name', unnamed.length === 0, unnamed.join(' | '));

  ok('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  console.log(T.join('\n'));
  console.log(`\n${T.filter((x) => x.startsWith('PASS')).length}/${T.length} passed`);
  await b.close();
})().catch((e) => {
  console.log(T.join('\n'));
  console.error('CRASH', e.message.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
