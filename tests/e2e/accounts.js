// End-to-end: accounts, persistence, memories, photos, voice, places, threads, archives, import, export, deletion, isolation, mobile, errors.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const B = 'http://localhost:3100';
const OUT = __dirname + '/out/accounts';
fs.mkdirSync(OUT, { recursive: true });
const FIX = {
  lisbon: [{ lat: '38.7077', lon: '-9.1365', name: 'Lisbon', display_name: 'Lisbon, Portugal', address: { city: 'Lisbon', state: 'Lisbon', country: 'Portugal' } }],
  taipei: [{ lat: '25.0330', lon: '121.5654', name: 'Taipei', display_name: 'Taipei, Taiwan', address: { city: 'Taipei', country: 'Taiwan' } }],
};
async function mock(ctx) {
  await ctx.route('https://nominatim.openstreetmap.org/**', (r) => {
    const q = (new URL(r.request().url()).searchParams.get('q') || '').toLowerCase();
    return r.fulfill({ json: FIX[Object.keys(FIX).find((k) => q.includes(k))] || [] });
  });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
}
const T = [];
const ok = (n, v, d = '') => {
  T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
};
const EMAIL = 'liz@example.com';
const PW = 'quiet-garden-27';

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'], acceptDownloads: true });
  await mock(c);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|Failed to fetch RSC payload/.test(m.text()) && errs.push('console: ' + m.text()));

  // a photograph to upload, made in the browser
  await p.goto(B + '/welcome');
  const jpg = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2400; c.height = 1600;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 2400, 1600);
    g.addColorStop(0, '#efd6d8'); g.addColorStop(1, '#77736e');
    x.fillStyle = g; x.fillRect(0, 0, 2400, 1600);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(1200, 800, 300, 0, 7); x.fill();
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  const PHOTO = OUT + '/photo.jpg';
  fs.writeFileSync(PHOTO, Buffer.from(jpg, 'base64'));

  // 1. sign up and sign in
  await p.goto(B + '/');
  ok('signed-out visitor is sent to /welcome', /\/welcome/.test(p.url()));
  await p.click('text=Begin a garden');
  await p.fill('input[type=email]', EMAIL);
  await p.fill('input[type=password]', 'short');
  await p.click('button[type=submit]');
  ok('short password refused with a clear message', /at least 8/.test(await p.textContent('.welcome-error')));
  await p.fill('input[type=password]', PW);
  await p.screenshot({ path: OUT + '/welcome.png' });
  await p.click('button[type=submit]');
  await p.waitForURL(/\/begin/); await p.click('text=Skip for now'); await p.waitForURL(B + '/');
  ok('sign up lands in an empty garden', await p.isVisible('text=Your garden is waiting.'));
  const cookies = await c.cookies();
  const sc = cookies.find((x) => x.name === 'ws_session');
  ok('session cookie is httpOnly + SameSite=Lax', !!sc && sc.httpOnly && sc.sameSite === 'Lax');
  await p.screenshot({ path: OUT + '/garden-empty.png' });

  // 2. create a memory by hand, with validation
  await p.click('text=Plant by hand');
  await p.waitForSelector('.add');
  await p.click('.add button:has-text("Continue")');
  ok('required fields explained (moment, then place)', /a line about it/.test(await p.textContent('.add .field-err')));
  await p.fill('.add textarea >> nth=0', 'Steam off the dumplings, my sister laughing');
  await p.click('.add button:has-text("Continue")');
  await p.click('.add button:has-text("Continue")');
  ok('…and the place', /Where was it/.test(await p.textContent('.add .field-err')));
  await p.fill('.add label:has-text("Where") input', 'Taipei');
  await p.fill('.add label:has-text("When, in your words") input', 'Winter 2018');
  await p.click('.add button:has-text("Continue")');
  await p.fill('.add label:has-text("Mood") input', 'held');
  await p.click('.add .rv-weight label:has-text("White")');
  await p.screenshot({ path: OUT + '/plant-by-hand.png' });
  await p.click('.add button:has-text("Save it now")');
  await p.waitForSelector('.card');
  // 3. appears in the garden
  ok('memory appears on the tree', (await p.$$('.blossom')).length === 1);
  ok('card opens with it', /Steam off the dumplings/.test(await p.textContent('.card')));

  // 4a. edit
  await p.click('.card >> text=Edit');
  await p.fill('.mem-ed textarea', 'Steam off the dumplings at Raohe, my sister laughing');
  await p.click('.mem-ed button[type=submit]');
  await p.waitForTimeout(400);
  ok('edit shows at once', /at Raohe/.test(await p.textContent('.card')));
  await p.reload();
  await p.waitForSelector('.blossom');
  await p.focus('.blossom'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('edit persists after refresh', /at Raohe/.test(await p.textContent('.card')) && /Winter 2018/.test(await p.textContent('.card')));

  // 7. photograph on the memory
  await p.setInputFiles('.card input[type=file][accept="image/*"]', PHOTO);
  await p.waitForSelector('.card .shelf-photos img', { timeout: 10000 });
  await p.waitForFunction(() => { const i = document.querySelector('.card .shelf-photos img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
  const nw = await p.$eval('.card .shelf-photos img', (i) => i.naturalWidth);
  ok('photo uploaded, resized (≤2000px) and served back', nw > 0 && nw <= 2000, String(nw));
  await p.click('.card .shelf-photos button');
  ok('photo opens large', await p.isVisible('.lightbox img'));
  await p.screenshot({ path: OUT + '/lightbox.png' });
  await p.keyboard.press('Escape');

  // voice note
  await p.click('.card >> text=Record a voice note');
  ok('explains the microphone before asking', /microphone/.test(await p.textContent('.rec-ask')));
  await p.click('text=Start recording');
  await p.waitForSelector('.rec-on');
  await p.waitForTimeout(2200);
  await p.click('text=Stop and keep');
  await p.waitForSelector('.card .shelf-voices audio', { timeout: 10000 });
  ok('voice note recorded and kept', (await p.$$('.card .shelf-voices audio')).length === 1);
  const dur = await p.evaluate(async () => {
    const a = document.querySelector('.card .shelf-voices audio');
    const r = await fetch(a.src);
    return { status: r.status, type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength };
  });
  ok('recording plays back from the server', dur.status === 200 && /^audio\//.test(dur.type) && dur.size > 1000, JSON.stringify(dur));
  await p.screenshot({ path: OUT + '/card-media.png' });

  // 8. location (search, mocked OSM)
  await p.click('.card >> text=Add a place');
  await p.fill('#locQ', 'Taipei');
  await p.waitForSelector('.loc-hits button');
  await p.click('.loc-hits button');
  await p.click('text=Save place');
  await p.waitForTimeout(500);
  ok('place shown on the card', /Taipei, Taiwan/.test(await p.textContent('.card-loc')));

  // the agent plants a second memory
  const say = async (t) => {
    await p.fill('#say', t);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    await p.waitForFunction(() => !document.querySelector('.garden.listening'), null, { timeout: 20000 });
    await p.waitForTimeout(1500);
  };
  await say('We went to Lisbon last spring.');
  await say('On the tram up to Alfama in Lisbon the bells were ringing and my mom held my hand.');
  ok('the agent drafts, and nothing is planted before review', (await p.$$('.blossom')).length === 1 && (await p.$$('.bud-draft')).length === 1);
  await p.click('.review-go');
  await p.waitForSelector('.review');
  await p.click('.rv-foot .welcome-go');
  await p.waitForSelector('.rv-item.saved', { timeout: 10000 });
  await p.click('.review button:has-text("Done")');
  await p.waitForTimeout(1200);
  ok('after review, the memory is planted into the account', (await p.$$('.blossom')).length === 2);
  ok('the new memory opens by itself', /bells were ringing/.test(await p.textContent('.card')));
  await p.click('.card >> text=/Add a place|Edit place/');
  await p.fill('.loc-fields label:nth-child(1) input', 'Tram 28');
  await p.fill('#locQ', 'Lisbon');
  await p.waitForSelector('.loc-hits button');
  await p.click('.loc-hits button');
  await p.fill('.loc-fields label:nth-child(1) input', 'Tram 28');
  await p.click('text=Save place');
  await p.waitForTimeout(500);

  // 12. red thread, with a reason, then edited
  await p.click('.card >> text=Tie a red thread…');
  await p.click('.tie-list button >> text=dumplings');
  await p.fill('.tie-note input', 'Both with family');
  await p.click('text=Tie the thread');
  await p.waitForTimeout(600);
  ok('thread drawn on the tree', (await p.$$('.tree .thread')).length === 1);
  await p.click('.card-thread >> text=why');
  await p.fill('.thread-note input', 'Both with my family');
  await p.click('.thread-note >> text=save');
  await p.waitForTimeout(500);
  ok('thread reason edited', /Both with my family/.test(await p.textContent('.card')));

  // 9. Places
  await p.click('.rooms >> text=Places');
  await p.waitForURL('**/places');
  await p.waitForTimeout(1200);
  ok('both places on the map', (await p.$$('.a-mark')).length === 2);
  ok('red arc between Taiwan and Portugal', (await p.$$('.a-thread')).length === 1);
  await p.goto(B + '/places?p=taipei--taiwan');
  await p.waitForSelector('.pl-page');
  ok('place page shows its photograph', (await p.$$('.pl-page .shelf-photos img')).length === 1);
  ok('place page shows the edited reason', /Both with my family/.test(await p.textContent('.pl-page')));
  await p.screenshot({ path: OUT + '/place-page.png', fullPage: true });

  // 5/6. the Archives
  await p.click('.rooms >> text=The Archives');
  await p.waitForURL('**/archives');
  await p.click('text=Preserve a moment…');
  ok('a blank page asks for words before media', await p.isVisible('.page-media-wait'));
  await p.fill('#page', 'The light in the stairwell at my grandmother’s flat. Dust, and the radio.');
  await p.waitForSelector('.saved.s-saved', { timeout: 8000 });
  ok('quiet save indicator says Saved', (await p.textContent('.saved')) === 'Saved');
  await p.setInputFiles('.page-media input[type=file][accept="image/*"]', PHOTO);
  await p.waitForSelector('.page-media .shelf-photos img', { timeout: 10000 });
  // change the page's date
  await p.click('button.page-date');
  await p.fill('.page-date input[type=date]', '2019-07-14');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/archive-page.png' });
  await p.click('text=← The Archives');
  await p.waitForTimeout(600);
  await p.reload();
  await p.waitForSelector('.leaf');
  ok('page persists after refresh', /stairwell/.test(await p.textContent('.pages')));
  ok('its new date persists', /July 2019/.test(await p.textContent('.pages')));
  await p.fill('.search input', 'radio');
  ok('search finds it', (await p.$$('.pages mark')).length === 1);
  await p.screenshot({ path: OUT + '/archives.png' });
  await p.fill('.search input', '');
  // a second page, closed by leaving the tab quickly (beacon)
  await p.click('text=Preserve a moment…');
  await p.fill('#page', 'A fragment, kept on the way out.');
  await p.goto(B + '/archives');
  await p.waitForTimeout(800);
  await p.reload();
  await p.waitForSelector('.leaf');
  ok('a page written just before leaving is kept', /on the way out/.test(await p.textContent('.pages')));

  // 4b. delete a memory
  await p.goto(B + '/');
  await p.waitForSelector('.blossom');
  await p.focus('.blossom[aria-label^="Lisbon"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.click('.card >> text=Delete');
  await p.click('.confirm-yes');
  await p.waitForTimeout(800);
  ok('memory let go: one blossom left', (await p.$$('.blossom')).length === 1);
  ok('its thread went with it', (await p.$$('.tree .thread')).length === 0);
  await p.reload();
  await p.waitForSelector('.blossom');
  ok('deletion persists after refresh', (await p.$$('.blossom')).length === 1);
  ok('conversation persists after refresh', await p.isVisible('text=Conversation'));

  // error case: offline
  await c.setOffline(true);
  await p.click('text=Plant by hand');
  await p.fill('.add textarea >> nth=0', 'Offline memory');
  await p.click('.add button:has-text("Continue")');
  await p.fill('.add label:has-text("Where") input', 'Nowhere');
  await p.click('.add button:has-text("Save it now")');
  await p.waitForSelector('.toast.error');
  ok('offline: says so, and nothing is planted', /offline/.test(await p.textContent('.toast.error')) && (await p.$$('.blossom')).length === 1);
  await c.setOffline(false);
  await p.click('.add-head button:has-text("Close")');
  await p.click('.confirm-no');

  // 14. export
  await p.goto(B + '/account');
  await p.waitForSelector('.you-counts');
  const counts = (await p.$$eval('.you-counts li', (x) => x.map((li) => li.textContent.trim()))).join(',');
  ok('account counts are real', counts === '1Memories,2Journal entries,1Places saved,0People remembered,0Collections,2Photographs,1Voice notes,0Red threads,0Letters', counts);
  await p.screenshot({ path: OUT + '/account.png', fullPage: true });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Download everything (.zip)')]);
  const zp = OUT + '/export.zip';
  await dl.saveAs(zp);
  const list = execSync(`cd ${OUT} && rm -rf ex && mkdir ex && cd ex && unzip -o -q ../export.zip && find . -type f | sort`).toString();
  const doc = JSON.parse(fs.readFileSync(OUT + '/ex/what-stayed.json', 'utf8'));
  ok('export zip: json + every file', /what-stayed.json/.test(list) && (list.match(/media\//g) || []).length === doc.media.length && doc.media.length === 3, list + ' media=' + doc.media.length);
  ok('export json has memories, pages, places, threads, conversation', doc.memories.length === 1 && doc.entries.length === 2 && Object.keys(doc.locations).length === 1 && Array.isArray(doc.conversations) && doc.conversations.some((t) => t.messages.length > 0));
  const mem0 = doc.memories[0].id;
  const photoId = doc.media.find((m) => m.kind === 'photo').id;

  // 15. sign out, 16. sign back in, data intact
  await p.click('text=Sign out');
  await p.waitForURL(/\/welcome/);
  await p.goto(B + '/archives');
  ok('signed out: rooms are closed', /\/welcome/.test(p.url()));
  const r401 = await p.evaluate(async () => (await fetch('/api/state')).status);
  ok('signed out: API refuses', r401 === 401);
  await p.fill('input[type=email]', EMAIL);
  await p.fill('input[type=password]', 'wrong-password');
  await p.click('button[type=submit]');
  await p.waitForFunction(() => document.querySelector('.welcome-error')?.textContent);
  ok('wrong password refused', /don’t match/.test(await p.textContent('.welcome-error')));
  await p.fill('input[type=password]', PW);
  await p.click('button[type=submit]');
  await p.waitForURL(B + '/');
  await p.waitForSelector('.blossom');
  ok('signed back in: memory intact', (await p.$$('.blossom')).length === 1);
  await p.focus('.blossom'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('signed back in: photo, voice and place intact', (await p.$$('.card .shelf-photos img')).length === 1 && (await p.$$('.card audio')).length === 1 && /Taipei/.test(await p.textContent('.card-loc')));
  await p.goto(B + '/archives');
  ok('signed back in: pages intact', (await p.$$('.leaf')).length === 2);

  // isolation: someone else
  const c2 = await b.newContext();
  await mock(c2);
  const q = await c2.newPage();
  q.on('pageerror', (e) => errs.push('B: ' + e.message));
  await q.goto(B + '/welcome');
  await q.click('text=Begin a garden');
  await q.fill('input[type=email]', 'other@example.com');
  await q.fill('input[type=password]', 'another-garden-1');
  await q.click('button[type=submit]');
  await q.waitForURL(/\/begin/); await q.click('text=Skip for now'); await q.waitForURL(B + '/');
  ok('another person sees an empty garden', (await q.$$('.blossom')).length === 0);
  const iso = await q.evaluate(async ({ mem0, photoId }) => {
    const a = (await fetch('/api/media/' + photoId)).status;
    const b = (await fetch('/api/memories/' + mem0, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ place: 'x', moment: 'stolen', feeling: 'x', weight: 'light' }) })).status;
    const c = (await fetch('/api/memories/' + mem0, { method: 'DELETE' })).status;
    const d = (await fetch('/api/media', { method: 'POST', body: (() => { const f = new FormData(); f.set('file', new Blob(['x'], { type: 'image/jpeg' })); f.set('ownerType', 'memory'); f.set('ownerId', mem0); f.set('kind', 'photo'); return f; })() })).status;
    const s = await (await fetch('/api/state')).json();
    return { a, b, c, d, n: s.memories.length + s.entries.length + s.media.length };
  }, { mem0, photoId });
  ok('cannot read, edit, delete or attach to another person’s things', iso.a === 404 && iso.b === 404 && iso.c === 404 && iso.d === 404 && iso.n === 0, JSON.stringify(iso));
  await p.reload();
  await p.goto(B + '/');
  await p.waitForSelector('.blossom');
  await p.focus('.blossom'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('first person’s memory untouched', /at Raohe/.test(await p.textContent('.card')));

  // import from an earlier, browser-only version
  const c3 = await b.newContext();
  await mock(c3);
  await c3.addInitScript(() => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('whatstayed:v1', JSON.stringify([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Kyoto in the rain' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'tool-plantMemory', toolCallId: 'old1', state: 'output-available', input: { place: 'Kyoto', moment: 'Rain on the temple roof', feeling: 'still', weight: 'tender' }, output: { planted: true } }, { type: 'text', text: 'Kept.' }] },
    ]));
    localStorage.setItem('whatstayed:archives:v1', JSON.stringify([{ id: 'old-page-1', body: 'An old page from before accounts.', createdAt: 1600000000000, updatedAt: 1600000000000 }]));
    localStorage.setItem('whatstayed:places:v1', JSON.stringify({ v: 1, locations: { old1: { name: 'Kyoto', city: 'Kyoto', country: 'Japan', lat: 35.0, lng: 135.76, source: 'manual', updatedAt: 1 } }, threads: [], dismissed: [] }));
  });
  const r = await c3.newPage();
  r.on('pageerror', (e) => errs.push('C: ' + e.message));
  await r.goto(B + '/welcome');
  await r.click('text=Begin a garden');
  await r.fill('input[type=email]', 'early@example.com');
  await r.fill('input[type=password]', 'early-garden-1');
  await r.click('button[type=submit]');
  await r.waitForURL(/\/begin/); await r.click('text=Skip for now'); await r.waitForURL(B + '/');
  await r.waitForSelector('.import-sheet, .loc-ed');
  ok('offers to bring in old browser data (nothing moved yet)', /1 memory and 1 page/.test(await r.textContent('.loc-ed')) && (await r.$$('.blossom')).length === 0);
  await r.screenshot({ path: OUT + '/import.png' });
  await r.click('button:has-text("Bring them in")');
  await r.waitForTimeout(3000);
  await r.screenshot({ path: OUT + '/import-after.png' });
  console.log('TOASTS', await r.$$eval('.toast', (x) => x.map((t) => t.textContent)));
  await r.waitForSelector('.blossom', { timeout: 10000 });
  ok('import: memory planted', (await r.$$('.blossom')).length === 1);
  const after = await r.evaluate(async () => ({ s: await (await fetch('/api/state')).json(), ls: localStorage.getItem('whatstayed:v1') }));
  ok('import: page and place came too; browser copy cleared', after.s.entries.length === 1 && Object.keys(after.s.locations).length === 1 && after.ls === null);
  await r.reload();
  await r.waitForSelector('.blossom');
  ok('import offer not repeated', !(await r.isVisible('text=Something is still kept')));

  // mobile
  const m = await b.newContext({ ...devices['iPhone 13'] });
  await mock(m);
  await m.addCookies([{ ...sc, value: (await c.cookies()).find((x) => x.name === 'ws_session').value }]);
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errs.push('M: ' + e.message));
  for (const [u, name] of [['/', 'garden'], ['/archives', 'archives'], ['/places', 'places'], ['/account', 'account']]) {
    await mp.goto(B + u);
    await mp.waitForTimeout(1200);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`mobile ${name}: no sideways scroll`, over <= 0, String(over));
    await mp.screenshot({ path: OUT + `/m-${name}.png` });
  }
  await mp.goto(B + '/');
  await mp.waitForSelector('.blossom');
  await mp.focus('.blossom'); await mp.keyboard.press('Enter'); await mp.waitForTimeout(300);
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: OUT + '/m-card.png' });
  await mp.click('text=Plant by hand');
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: OUT + '/m-plant.png' });

  // delete the account
  await p.goto(B + '/account');
  await p.click('text=Delete my account and everything in it…');
  await p.fill('.acc-delete input', 'nope-nope');
  await p.click('text=Delete everything');
  await p.waitForTimeout(500);
  ok('account deletion needs the right password', /isn’t right/.test(await p.textContent('.acc-delete')));
  await p.fill('.acc-delete input', PW);
  await p.click('text=Delete everything');
  await p.waitForURL(/\/welcome/);
  const gone = await p.evaluate(async ({ e, pw }) => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: pw }) })).status, { e: EMAIL, pw: PW });
  ok('account and everything in it are gone', gone === 401);
  const other = await q.evaluate(async () => (await fetch('/api/state')).status);
  ok('other people unaffected', other === 200);

  ok('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  console.log(T.join('\n'));
  console.log(`\n${T.filter((x) => x.startsWith('PASS')).length}/${T.length} passed`);
  await b.close();
})().catch((e) => {
  console.log(T.join('\n'));
  console.error('CRASH', e);
  process.exit(1);
});
